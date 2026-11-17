import { prisma } from '@/lib/prisma';
import crypto from 'crypto';
import fs from 'fs';
import path from 'path';
import { SendWhatsAppParams, SendResult } from './types';

export class EvolutionApiService {
  private apiUrl: string;
  private apiKey: string;

  constructor() {
    this.apiUrl = (
      process.env.EVOLUTION_API_URL ||
      process.env.SERVER_URL ||
      process.env.NEXT_PUBLIC_EVOLUTION_API_URL ||
      'https://prospeccao-evolution01.pesd8y.easypanel.host'
    )
      .trim()
      .replace(/^["']|["']$/g, '')
      .replace(/\/$/, '');
    this.apiKey = (
      process.env.EVOLUTION_API_KEY ||
      process.env.AUTHENTICATION_API_KEY ||
      process.env.EVOLUTION_KEY ||
      process.env.NEXT_PUBLIC_EVOLUTION_API_KEY ||
      'X9mK2vQ7LpR8aNc4HsT1yWf6BgZe3JuD'
    )
      .trim()
      .replace(/^["']|["']$/g, '');
  }

  isConfigured(): boolean {
    return Boolean(this.apiUrl && this.apiKey);
  }

  /**
   * Higieniza preventivamente a tabela WhatsappInstance contra tipos inconsistentes no SQLite
   */
  async sanitizeTable(force = false) {
    try {
      await prisma.$executeRawUnsafe(`
        DELETE FROM "WhatsappInstance" 
        WHERE "id" = 'id' 
           OR "instanceName" = 'instanceName' 
           OR "isDefault" = 'isDefault'
           OR "id" NOT LIKE 'c%';
      `).catch(() => {});
      await prisma.$executeRawUnsafe(`
        UPDATE "WhatsappInstance" 
        SET "isDefault" = 1 
        WHERE "isDefault" IN (1, '1', 'true', 'TRUE', 't');
      `).catch(() => {});
      await prisma.$executeRawUnsafe(`
        UPDATE "WhatsappInstance" 
        SET "isDefault" = 0 
        WHERE "isDefault" NOT IN (1);
      `).catch(() => {});
    } catch {}
  }

  /**
   * Busca instâncias com fallback imune a dados corrompidos ou inconsistentes no SQLite
   */
  async safeFindManyInstances(tenantId?: string): Promise<any[]> {
    await this.sanitizeTable();
    try {
      return await prisma.whatsappInstance.findMany({
        where: tenantId ? { tenantId } : undefined,
        orderBy: [{ isDefault: 'desc' }, { createdAt: 'desc' }],
      });
    } catch {
      try {
        await this.sanitizeTable(true);
        const query = tenantId
          ? `SELECT id, tenantId, name, instanceName, instanceToken, phone, profileName, profilePicUrl, status, qrcode,
                    CASE WHEN isDefault IN (1, '1', 'true', 'TRUE', 't') THEN 1 ELSE 0 END as isDefault,
                    lastConnectedAt, createdAt, updatedAt
             FROM "WhatsappInstance"
             WHERE tenantId = ?
             ORDER BY isDefault DESC, createdAt DESC`
          : `SELECT id, tenantId, name, instanceName, instanceToken, phone, profileName, profilePicUrl, status, qrcode,
                    CASE WHEN isDefault IN (1, '1', 'true', 'TRUE', 't') THEN 1 ELSE 0 END as isDefault,
                    lastConnectedAt, createdAt, updatedAt
             FROM "WhatsappInstance"
             ORDER BY isDefault DESC, createdAt DESC`;

        const rows: any[] = tenantId
          ? await prisma.$queryRawUnsafe(query, tenantId)
          : await prisma.$queryRawUnsafe(query);

        return rows.map((r) => ({
          ...r,
          isDefault: Boolean(Number(r.isDefault) === 1),
          lastConnectedAt: r.lastConnectedAt ? new Date(r.lastConnectedAt) : null,
          createdAt: r.createdAt ? new Date(r.createdAt) : new Date(),
          updatedAt: r.updatedAt ? new Date(r.updatedAt) : new Date(),
        }));
      } catch {
        return [];
      }
    }
  }

  /**
   * Obtém todas as instâncias do WhatsApp cadastradas para o tenant
   */
  async listAllInstances(tenantId?: string) {
    return this.safeFindManyInstances(tenantId);
  }

  /**
   * Obtém uma instância pelo ID ou instanceName (filtrado por tenantId se fornecido)
   */
  async getInstance(idOrName: string, tenantId?: string) {
    return prisma.whatsappInstance.findFirst({
      where: {
        AND: [
          { OR: [{ id: idOrName }, { instanceName: idOrName }] },
          ...(tenantId ? [{ tenantId }] : []),
        ],
      },
    });
  }

  /**
   * Obtém a instância do WhatsApp vinculada a este Tenant/Expert
   */
  async getTenantInstance(tenantId?: string) {
    if (!tenantId) return null;
    return prisma.whatsappInstance.findFirst({
      where: { tenantId },
      orderBy: [{ isDefault: 'desc' }, { createdAt: 'desc' }],
    });
  }

  /**
   * Obtém um QR Code FRESCO em tempo real direto da Evolution API
   * Se o socket do Baileys estiver travado ou a contagem muito alta, reinicia para garantir leitura imediata
   */
  async getFreshQrCode(instanceName: string): Promise<{ qrcode?: string; state: string; error?: string }> {
    try {
      // 1. Consulta o estado da conexão
      const stateRes = await fetch(
        `${this.apiUrl}/instance/connectionState/${encodeURIComponent(instanceName)}`,
        { headers: { apikey: this.apiKey } }
      );
      const stateData = await stateRes.json().catch(() => ({}));

      // Se a instância NÃO existe na Evolution API, cria automaticamente agora mesmo!
      const isMissing =
        stateRes.status === 404 ||
        stateData?.status === 404 ||
        JSON.stringify(stateData).includes('does not exist');

      if (isMissing) {
        const createRes = await fetch(`${this.apiUrl}/instance/create`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            apikey: this.apiKey,
          },
          body: JSON.stringify({
            instanceName,
            token: crypto.randomUUID(),
            qrcode: true,
            integration: 'WHATSAPP-BAILEYS',
          }),
        });
        const createData = await createRes.json().catch(() => ({}));
        const qr = createData?.qrcode?.base64 || createData?.base64 || null;
        if (qr) {
          return { state: 'connecting', qrcode: qr };
        }
      }

      const state = stateData?.instance?.state || stateData?.state || 'close';

      if (state === 'open') {
        return { state: 'open' };
      }

      // 2. Solicita o QR Code em tempo real
      let connectRes = await fetch(
        `${this.apiUrl}/instance/connect/${encodeURIComponent(instanceName)}`,
        { headers: { apikey: this.apiKey } }
      );
      let connectData = await connectRes.json().catch(() => ({}));

      // Se connect indicar que a instância não existe, provisiona na hora
      if (
        connectRes.status === 404 ||
        connectData?.status === 404 ||
        JSON.stringify(connectData).includes('does not exist')
      ) {
        const createRes = await fetch(`${this.apiUrl}/instance/create`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            apikey: this.apiKey,
          },
          body: JSON.stringify({
            instanceName,
            token: crypto.randomUUID(),
            qrcode: true,
            integration: 'WHATSAPP-BAILEYS',
          }),
        });
        const createData = await createRes.json().catch(() => ({}));
        const qr = createData?.qrcode?.base64 || createData?.base64 || null;
        if (qr) {
          return { state: 'connecting', qrcode: qr };
        }

        // Tenta connect novamente após criação
        connectRes = await fetch(
          `${this.apiUrl}/instance/connect/${encodeURIComponent(instanceName)}`,
          { headers: { apikey: this.apiKey } }
        );
        connectData = await connectRes.json().catch(() => ({}));
      }

      // Se a contagem de tentativas for alta (> 8), reseta o socket para um QR Code zerado
      if (connectData?.count && connectData.count > 8) {
        await fetch(`${this.apiUrl}/instance/restart/${encodeURIComponent(instanceName)}`, {
          method: 'POST',
          headers: { apikey: this.apiKey },
        });
        await new Promise((r) => setTimeout(r, 1200));

        connectRes = await fetch(
          `${this.apiUrl}/instance/connect/${encodeURIComponent(instanceName)}`,
          { headers: { apikey: this.apiKey } }
        );
        connectData = await connectRes.json().catch(() => ({}));
      }

      const qrcode =
        connectData?.base64 ||
        connectData?.qrcode?.base64 ||
        connectData?.code ||
        null;

      return {
        state: connectData?.instance?.state || state,
        qrcode: qrcode || undefined,
      };
    } catch (err: any) {
      return { state: 'error', error: err.message };
    }
  }

  /**
   * Cria ou conecta uma instância do WhatsApp (suporta múltiplos números)
   */
  async getOrCreateConnection(
    paramsOrTenantId?: string | { tenantId?: string; instanceId?: string; name?: string; forceNew?: boolean; isNew?: boolean },
    forceNewLegacy = false
  ): Promise<{
    connected: boolean;
    status: string;
    phone?: string;
    profileName?: string;
    qrcode?: string;
    instanceId?: string;
    instanceName?: string;
    name?: string;
    error?: string;
  }> {
    if (!this.isConfigured()) {
      return {
        connected: false,
        status: 'DISCONNECTED',
        error: 'Evolution API não configurada no servidor (EVOLUTION_API_URL e EVOLUTION_API_KEY)',
      };
    }

    let tenantId: string | undefined;
    let instanceId: string | undefined;
    let name: string | undefined;
    let forceNew = forceNewLegacy;
    let isNew = false;

    if (typeof paramsOrTenantId === 'string') {
      tenantId = paramsOrTenantId;
    } else if (paramsOrTenantId && typeof paramsOrTenantId === 'object') {
      tenantId = paramsOrTenantId.tenantId;
      instanceId = paramsOrTenantId.instanceId;
      name = paramsOrTenantId.name;
      forceNew = !!paramsOrTenantId.forceNew;
      isNew = !!paramsOrTenantId.isNew;
    }

    if (!tenantId) {
      return {
        connected: false,
        status: 'DISCONNECTED',
        error: 'tenantId é obrigatório para conectar ou manipular instâncias do WhatsApp.',
      };
    }

    let instance: any = null;

    if (instanceId) {
      instance = await prisma.whatsappInstance.findFirst({
        where: { id: instanceId, tenantId },
      });
    } else if (!isNew) {
      instance = await this.getTenantInstance(tenantId);
    }

    // Se o usuário pediu para recriar/forçar nova instância específica
    if (forceNew && instance) {
      try {
        await fetch(`${this.apiUrl}/instance/delete/${encodeURIComponent(instance.instanceName)}`, {
          method: 'DELETE',
          headers: { apikey: this.apiKey },
        });
      } catch {}

      await prisma.whatsappInstance.delete({ where: { id: instance.id } });
      instance = null;
    }

    // 1. Se for uma nova instância (ou se nenhuma existir para este tenant)
    if (!instance || isNew) {
      const count = await prisma.whatsappInstance.count({
        where: { tenantId },
      });
      const uniqueSuffix = crypto.randomBytes(4).toString('hex');
      const instanceName = `inst_wa_${uniqueSuffix}`;
      const instanceToken = crypto.randomUUID();
      const friendlyName = name || (count === 0 ? 'WhatsApp Principal' : `WhatsApp Linha ${count + 1}`);

      let createData: any = null;
      let qrcodeBase64: string | null = null;

      try {
        const createRes = await fetch(`${this.apiUrl}/instance/create`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            apikey: this.apiKey,
          },
          body: JSON.stringify({
            instanceName,
            token: instanceToken,
            qrcode: true,
            integration: 'WHATSAPP-BAILEYS',
          }),
        });

        createData = await createRes.json().catch(() => ({}));

        qrcodeBase64 =
          createData?.qrcode?.base64 ||
          createData?.base64 ||
          null;

        let instance: any = null;
        try {
          instance = await prisma.whatsappInstance.create({
            data: {
              tenantId,
              name: friendlyName,
              instanceName,
              instanceToken,
              status: 'CONNECTING',
              qrcode: qrcodeBase64,
              isDefault: count === 0,
            },
          });
        } catch (createErr: any) {
          console.warn('Prisma create falhou, tentando fallback com tenant padrão:', createErr?.message);
          const firstTenant = await prisma.tenant.findFirst({ orderBy: { createdAt: 'asc' } });
          if (firstTenant && firstTenant.id !== tenantId) {
            try {
              instance = await prisma.whatsappInstance.create({
                data: {
                  tenantId: firstTenant.id,
                  name: friendlyName,
                  instanceName,
                  instanceToken,
                  status: 'CONNECTING',
                  qrcode: qrcodeBase64,
                  isDefault: true,
                },
              });
            } catch {}
          }
          if (!instance) {
            instance = {
              id: instanceName,
              instanceName,
              name: friendlyName,
              status: 'CONNECTING',
              qrcode: qrcodeBase64,
            };
          }
        }

        // Se /instance/create ainda não retornou o base64 de imediato, busca via getFreshQrCode!
        if (!qrcodeBase64) {
          await new Promise((r) => setTimeout(r, 600));
          const fresh = await this.getFreshQrCode(instance.instanceName);
          if (fresh.qrcode) {
            qrcodeBase64 = fresh.qrcode;
            try {
              if (instance?.id && instance.id !== instance.instanceName) {
                await prisma.whatsappInstance.update({
                  where: { id: instance.id },
                  data: { qrcode: qrcodeBase64 },
                });
              }
            } catch {}
          }
        }

        return {
          connected: false,
          status: 'CONNECTING',
          qrcode: qrcodeBase64 || undefined,
          instanceId: instance?.id || instanceName,
          instanceName: instance?.instanceName || instanceName,
          name: instance?.name || friendlyName,
        };
      } catch (err: any) {
        // Se a Evolution API já retornou o QR Code, NUNCA bloqueie a exibição por erro de banco!
        const fallbackQr =
          createData?.qrcode?.base64 ||
          createData?.base64 ||
          null;

        if (fallbackQr) {
          return {
            connected: false,
            status: 'CONNECTING',
            qrcode: fallbackQr,
            instanceName,
            name: friendlyName,
          };
        }

        return {
          connected: false,
          status: 'DISCONNECTED',
          error: `Falha ao criar instância: ${err.message}`,
        };
      }
    }

    // 2. A instância já existe: busca um QR Code FRESCO em tempo real
    const fresh = await this.getFreshQrCode(instance.instanceName);

    if (fresh.state === 'open') {
      let phone = instance.phone;
      let profileName = instance.profileName;

      if (!phone) {
        try {
          const infoRes = await fetch(
            `${this.apiUrl}/instance/fetchInstances?instanceName=${encodeURIComponent(instance.instanceName)}`,
            { headers: { apikey: this.apiKey } }
          );
          const infoData = await infoRes.json().catch(() => ([]));
          const target = Array.isArray(infoData)
            ? infoData.find((i: any) => i.name === instance.instanceName)
            : null;
          if (target?.ownerJid) {
            phone = '+' + target.ownerJid.replace(/@.*$/, '');
            profileName = target.profileName || 'WhatsApp Conectado';
          }
        } catch {}
      }

      const updated = await prisma.whatsappInstance.update({
        where: { id: instance.id },
        data: {
          status: 'CONNECTED',
          phone: phone || instance.phone,
          profileName: profileName || instance.profileName,
          lastConnectedAt: new Date(),
          qrcode: null,
        },
      });

      return {
        connected: true,
        status: 'CONNECTED',
        phone: updated.phone || undefined,
        profileName: updated.profileName || undefined,
        instanceId: updated.id,
        instanceName: updated.instanceName,
        name: updated.name || undefined,
      };
    }

    if (fresh.qrcode) {
      await prisma.whatsappInstance.update({
        where: { id: instance.id },
        data: { status: 'CONNECTING', qrcode: fresh.qrcode },
      });

      return {
        connected: false,
        status: 'CONNECTING',
        qrcode: fresh.qrcode,
        instanceId: instance.id,
        instanceName: instance.instanceName,
        name: instance.name || undefined,
      };
    }

    // Se ainda não obteve QR code e não está open, tenta mais uma vez com delay curto
    if (!fresh.qrcode && fresh.state !== 'open') {
      await new Promise((r) => setTimeout(r, 700));
      const retryFresh = await this.getFreshQrCode(instance.instanceName);
      if (retryFresh.qrcode) {
        fresh.qrcode = retryFresh.qrcode;
        await prisma.whatsappInstance.update({
          where: { id: instance.id },
          data: { status: 'CONNECTING', qrcode: fresh.qrcode },
        });
        return {
          connected: false,
          status: 'CONNECTING',
          qrcode: fresh.qrcode,
          instanceId: instance.id,
          instanceName: instance.instanceName,
          name: instance.name || undefined,
        };
      }
    }

    return {
      connected: false,
      status: 'DISCONNECTED',
      instanceId: instance?.id,
      instanceName: instance?.instanceName,
      name: instance?.name || undefined,
      error: fresh.error || 'Aguardando inicialização do QR Code',
    };
  }

  /**
   * Força a sincronização imediata de todas as instâncias existentes na Evolution API
   * para o Tenant especificado, garantindo que números conectados apareçam imediatamente.
   */
  async syncAllFromEvolutionApi(tenantId: string): Promise<{ success: boolean; synced: number; error?: string }> {
    if (!tenantId || !this.isConfigured()) {
      return { success: false, synced: 0, error: 'Configuração ou tenantId ausente' };
    }

    try {
      const res = await fetch(`${this.apiUrl}/instance/fetchInstances`, {
        headers: { apikey: this.apiKey },
        signal: AbortSignal.timeout(10000),
      });

      if (!res.ok) {
        return { success: false, synced: 0, error: `Evolution API retornou status ${res.status}` };
      }

      const evoData = await res.json().catch(() => []);
      if (!Array.isArray(evoData)) {
        return { success: false, synced: 0, error: 'Formato inválido retornado pela Evolution API' };
      }

      let count = 0;
      for (const evo of evoData) {
        const evoName = (evo.name || evo.instanceName || evo.instance?.name || evo.instance?.instanceName || '').trim();
        if (!evoName) continue;

        const evoState = String(
          evo.connectionStatus ||
          evo.state ||
          evo.status ||
          evo.instance?.state ||
          evo.instance?.status ||
          'close'
        ).toLowerCase();

        const isConnected = evoState === 'open' || evoState === 'connected';
        const rawPhone = evo.ownerJid ? evo.ownerJid.replace(/@.*$/, '') : '';
        const phone = rawPhone ? (rawPhone.startsWith('+') ? rawPhone : '+' + rawPhone) : null;
        const profileName = evo.profileName || (phone ? `WhatsApp ${phone}` : 'WhatsApp Conectado');

        const existing = await prisma.whatsappInstance.findFirst({
          where: { instanceName: evoName },
        });

        if (existing) {
          await prisma.whatsappInstance.update({
            where: { id: existing.id },
            data: {
              tenantId,
              status: isConnected ? 'CONNECTED' : (evoState === 'connecting' ? 'CONNECTING' : 'DISCONNECTED'),
              phone: phone || existing.phone,
              profileName: profileName || existing.profileName,
              lastConnectedAt: isConnected ? new Date() : existing.lastConnectedAt,
              qrcode: isConnected ? null : existing.qrcode,
            },
          }).catch(() => {});
          count++;
        } else if (isConnected || evoState === 'connecting') {
          const totalTenantInstances = await prisma.whatsappInstance.count({ where: { tenantId } }).catch(() => 0);
          await prisma.whatsappInstance.create({
            data: {
              tenantId,
              name: profileName + (phone ? ` (${phone})` : ''),
              instanceName: evoName,
              instanceToken: evo.token || crypto.randomUUID(),
              status: isConnected ? 'CONNECTED' : 'CONNECTING',
              phone,
              profileName,
              isDefault: totalTenantInstances === 0,
              lastConnectedAt: isConnected ? new Date() : null,
              qrcode: null,
            },
          }).catch(() => {});
          count++;
        }
      }

      return { success: true, synced: count };
    } catch (err: any) {
      return { success: false, synced: 0, error: err.message };
    }
  }

  /**
   * Consulta o status de uma instância ou de todas as instâncias do tenant autenticado
   * Otimizado em lote: 1 única chamada à Evolution API para sincronizar todas as linhas em tempo recorde
   */
  async getStatus(tenantId?: string, instanceId?: string) {
    if (!tenantId) {
      return {
        hasInstance: false,
        connected: false,
        status: 'DISCONNECTED',
        instances: [],
      };
    }

    let evoData: any[] = [];

    // 1. Consulta todas as instâncias em lote diretamente na Evolution API (1 única chamada rápida)
    if (this.isConfigured()) {
      try {
        const evoRes = await fetch(`${this.apiUrl}/instance/fetchInstances`, {
          headers: { apikey: this.apiKey },
          signal: AbortSignal.timeout(8000),
        });
        if (evoRes.ok) {
          evoData = await evoRes.json().catch(() => ([]));
        }
      } catch (err: any) {
        console.warn('[EvolutionApi] Aviso ao consultar fetchInstances:', err.message);
      }
    }

    // Mapa das instâncias da Evolution API indexado por nome
    const evoMap = new Map<string, any>();
    if (Array.isArray(evoData)) {
      for (const evo of evoData) {
        const name = (evo.name || evo.instanceName || evo.instance?.name || evo.instance?.instanceName || '').trim();
        if (name) {
          evoMap.set(name.toLowerCase(), evo);
        }
      }
    }

    // Se foi especificada uma instância individual
    if (instanceId) {
      const instance = await prisma.whatsappInstance.findFirst({
        where: { id: instanceId, tenantId },
      });
      if (!instance) {
        return { hasInstance: false, connected: false, status: 'DISCONNECTED' };
      }
      return this.syncSingleInstance(instance);
    }

    // 2. Higieniza preventivamente e busca todas as instâncias cadastradas deste tenant no SQLite
    let dbInstances = await this.safeFindManyInstances(tenantId);

    // Se este tenant não tem nenhuma instância no SQLite, adota as instâncias existentes no sistema
    if (dbInstances.length === 0) {
      const anyInst = await this.safeFindManyInstances();

      if (anyInst.length > 0) {
        for (const inst of anyInst) {
          await prisma.whatsappInstance.update({
            where: { id: inst.id },
            data: { tenantId },
          }).catch(() => {});
        }
        dbInstances = await this.safeFindManyInstances(tenantId);
      }
    }

    const syncedInstances: any[] = [];
    const processedNames = new Set<string>();

    // 3. Atualiza as instâncias que já constam no banco com os dados ao vivo da Evolution API
    for (const inst of dbInstances) {
      const evo = evoMap.get(inst.instanceName.toLowerCase());
      let isConnected = inst.status === 'CONNECTED';
      let phone = inst.phone;
      let profileName = inst.profileName;

      if (evo) {
        const evoState = String(
          evo.connectionStatus ||
          evo.state ||
          evo.status ||
          evo.instance?.state ||
          evo.instance?.status ||
          ''
        ).toLowerCase();

        isConnected = evoState === 'open' || evoState === 'connected';

        if (evo.ownerJid) {
          const rawPhone = evo.ownerJid.replace(/@.*$/, '');
          phone = rawPhone ? (rawPhone.startsWith('+') ? rawPhone : '+' + rawPhone) : phone;
        }
        if (evo.profileName) {
          profileName = evo.profileName;
        }

        // Atualiza no banco se mudou
        await prisma.whatsappInstance.update({
          where: { id: inst.id },
          data: {
            status: isConnected ? 'CONNECTED' : (evoState === 'connecting' ? 'CONNECTING' : 'DISCONNECTED'),
            phone: phone || inst.phone,
            profileName: profileName || inst.profileName,
            lastConnectedAt: isConnected ? new Date() : inst.lastConnectedAt,
            qrcode: isConnected ? null : inst.qrcode,
          },
        }).catch(() => {});
      }

      processedNames.add(inst.instanceName.toLowerCase());

      syncedInstances.push({
        id: inst.id,
        name: inst.name || profileName || 'WhatsApp',
        instanceName: inst.instanceName,
        connected: isConnected,
        status: isConnected ? 'CONNECTED' : inst.status,
        phone,
        profileName,
        isDefault: inst.isDefault,
        fixedDelaySeconds: inst.fixedDelaySeconds ?? 30,
        useRandomDelay: inst.useRandomDelay ?? true,
        minDelaySeconds: inst.minDelaySeconds ?? 20,
        maxDelaySeconds: inst.maxDelaySeconds ?? 45,
        lastConnectedAt: inst.lastConnectedAt,
        qrcode: inst.qrcode,
      });
    }

    // 4. Se a Evolution API tiver instâncias que ainda não estão no banco deste tenant,
    // insere no banco e adiciona na lista automaticamente!
    const evoEntries = Array.from(evoMap.entries());
    for (let i = 0; i < evoEntries.length; i++) {
      const [nameLower, evo] = evoEntries[i];
      const evoState = String(
        evo.connectionStatus ||
        evo.state ||
        evo.status ||
        evo.instance?.state ||
        evo.instance?.status ||
        ''
      ).toLowerCase();
      const isOpen = evoState === 'open' || evoState === 'connected';
      const finalStatus = isOpen ? 'CONNECTED' : (evoState === 'connecting' ? 'CONNECTING' : 'DISCONNECTED');

      if (!processedNames.has(nameLower)) {
        const rawPhone = evo.ownerJid ? evo.ownerJid.replace(/@.*$/, '') : '';
        const phone = rawPhone ? (rawPhone.startsWith('+') ? rawPhone : '+' + rawPhone) : null;
        const profileName = evo.profileName || (isOpen ? 'WhatsApp Conectado' : 'WhatsApp');
        const evoRealName = evo.name || evo.instanceName || nameLower;

        let createdInst: any = null;
        try {
          const existing = await prisma.whatsappInstance.findUnique({
            where: { instanceName: evoRealName },
          });

          if (existing) {
            createdInst = await prisma.whatsappInstance.update({
              where: { id: existing.id },
              data: {
                tenantId,
                status: finalStatus,
                phone: phone || existing.phone,
                profileName: profileName || existing.profileName,
                lastConnectedAt: isOpen ? new Date() : existing.lastConnectedAt,
                qrcode: isOpen ? null : existing.qrcode,
              },
            });
          } else {
            createdInst = await prisma.whatsappInstance.create({
              data: {
                tenantId,
                name: profileName + (phone ? ` (${phone})` : ''),
                instanceName: evoRealName,
                instanceToken: evo.token || crypto.randomUUID(),
                status: finalStatus,
                phone,
                profileName,
                isDefault: syncedInstances.length === 0,
                lastConnectedAt: isOpen ? new Date() : null,
                qrcode: null,
              },
            });
          }
        } catch {}

        processedNames.add(nameLower);
        syncedInstances.push({
          id: createdInst?.id || evoRealName,
          name: createdInst?.name || profileName + (phone ? ` (${phone})` : ''),
          instanceName: evoRealName,
          connected: isOpen,
          status: finalStatus,
          phone,
          profileName,
          isDefault: syncedInstances.length === 0,
          fixedDelaySeconds: 30,
          useRandomDelay: true,
          minDelaySeconds: 20,
          maxDelaySeconds: 45,
          lastConnectedAt: isOpen ? new Date() : null,
          qrcode: null,
        });
      }
    }

    if (syncedInstances.length === 0) {
      return {
        hasInstance: false,
        connected: false,
        status: 'DISCONNECTED',
        instances: [],
      };
    }

    const anyConnected = syncedInstances.some((i) => i.connected);
    const primary = syncedInstances.find((i) => i.isDefault) || syncedInstances[0];

    return {
      hasInstance: true,
      connected: anyConnected,
      status: anyConnected ? 'CONNECTED' : primary.status,
      phone: primary.phone,
      profileName: primary.profileName,
      lastConnectedAt: primary.lastConnectedAt,
      qrcode: primary.qrcode,
      instanceId: primary.id,
      instances: syncedInstances,
    };
  }

  /**
   * Sincroniza estado de conexão de uma instância individual com a Evolution API
   */
  private async syncSingleInstance(instance: any) {
    if (!this.isConfigured()) {
      return {
        id: instance.id,
        name: instance.name || 'WhatsApp',
        instanceName: instance.instanceName,
        connected: instance.status === 'CONNECTED',
        status: instance.status,
        phone: instance.phone,
        profileName: instance.profileName,
        isDefault: instance.isDefault,
        lastConnectedAt: instance.lastConnectedAt,
        qrcode: instance.qrcode,
      };
    }

    try {
      const stateRes = await fetch(
        `${this.apiUrl}/instance/connectionState/${encodeURIComponent(instance.instanceName)}`,
        { headers: { apikey: this.apiKey } }
      );
      const stateData = await stateRes.json().catch(() => ({}));
      const state = String(stateData?.instance?.state || stateData?.state || stateData?.status || 'close').toLowerCase();
      const isConnected = state === 'open' || state === 'connected';

      if (isConnected) {
        let phone = instance.phone;
        let profileName = instance.profileName;

        if (!phone) {
          const infoRes = await fetch(
            `${this.apiUrl}/instance/fetchInstances?instanceName=${encodeURIComponent(instance.instanceName)}`,
            { headers: { apikey: this.apiKey } }
          );
          const infoData = await infoRes.json().catch(() => ([]));
          const target = Array.isArray(infoData)
            ? infoData.find((i: any) => i.name === instance.instanceName)
            : null;
          if (target?.ownerJid) {
            phone = '+' + target.ownerJid.replace(/@.*$/, '');
            profileName = target.profileName || 'WhatsApp Conectado';
          }
        }

        const updated = await prisma.whatsappInstance.update({
          where: { id: instance.id },
          data: {
            status: 'CONNECTED',
            phone: phone || instance.phone,
            profileName: profileName || instance.profileName,
            lastConnectedAt: new Date(),
            qrcode: null,
          },
        });

        return {
          id: updated.id,
          name: updated.name || 'WhatsApp',
          instanceName: updated.instanceName,
          connected: true,
          status: 'CONNECTED',
          phone: updated.phone,
          profileName: updated.profileName,
          isDefault: updated.isDefault,
          lastConnectedAt: updated.lastConnectedAt,
          qrcode: null,
        };
      }

      return {
        id: instance.id,
        name: instance.name || 'WhatsApp',
        instanceName: instance.instanceName,
        connected: false,
        status: isConnected ? 'CONNECTED' : instance.status,
        phone: instance.phone,
        profileName: instance.profileName,
        isDefault: instance.isDefault,
        lastConnectedAt: instance.lastConnectedAt,
        qrcode: instance.qrcode,
      };
    } catch {
      return {
        id: instance.id,
        name: instance.name || 'WhatsApp',
        instanceName: instance.instanceName,
        connected: instance.status === 'CONNECTED',
        status: instance.status,
        phone: instance.phone,
        profileName: instance.profileName,
        isDefault: instance.isDefault,
        lastConnectedAt: instance.lastConnectedAt,
        qrcode: instance.qrcode,
      };
    }
  }

  /**
   * Desconecta uma instância específica ou padrão do tenant
   */
  async disconnect(targetId: string, tenantId?: string): Promise<boolean> {
    const instance = await prisma.whatsappInstance.findFirst({
      where: {
        AND: [
          { OR: [{ id: targetId }, { instanceName: targetId }] },
          ...(tenantId ? [{ tenantId }] : []),
        ],
      },
    });

    if (!instance) return true;

    try {
      await fetch(`${this.apiUrl}/instance/logout/${encodeURIComponent(instance.instanceName)}`, {
        method: 'DELETE',
        headers: { apikey: this.apiKey },
      });
    } catch {}

    await prisma.whatsappInstance.update({
      where: { id: instance.id },
      data: {
        status: 'DISCONNECTED',
        qrcode: null,
      },
    });

    return true;
  }

  /**
   * Reinicia uma instância do WhatsApp e gera novo QR Code limpo
   */
  async reconnect(targetId?: string, tenantId?: string) {
    let instance: any = null;
    if (targetId) {
      instance = await prisma.whatsappInstance.findFirst({
        where: {
          AND: [
            { OR: [{ id: targetId }, { instanceName: targetId }] },
            ...(tenantId ? [{ tenantId }] : []),
          ],
        },
      });
    }
    if (!instance && tenantId) {
      instance = await prisma.whatsappInstance.findFirst({
        where: { tenantId },
        orderBy: [{ isDefault: 'desc' }, { createdAt: 'desc' }],
      });
    }
    if (!instance) {
      if (tenantId) {
        return this.getOrCreateConnection({ tenantId, isNew: true });
      }
      return { connected: false, status: 'DISCONNECTED', error: 'Instância não encontrada' };
    }

    try {
      await fetch(`${this.apiUrl}/instance/restart/${encodeURIComponent(instance.instanceName)}`, {
        method: 'POST',
        headers: { apikey: this.apiKey },
      });
    } catch {}

    await new Promise((r) => setTimeout(r, 1500));
    return this.getOrCreateConnection({ tenantId: instance.tenantId, instanceId: instance.id });
  }

  /**
   * Atualiza apelido/nome amigável, cadência de delay anti-bloqueio ou define como número padrão (com isolamento por tenant)
   */
  async updateInstance(instanceId: string, tenantId: string, data: {
    name?: string;
    isDefault?: boolean;
    fixedDelaySeconds?: number;
    useRandomDelay?: boolean;
    minDelaySeconds?: number;
    maxDelaySeconds?: number;
  }) {
    const instance = await prisma.whatsappInstance.findFirst({
      where: { id: instanceId, tenantId },
    });
    if (!instance) {
      throw new Error('Instância do WhatsApp não encontrada para este tenant');
    }

    if (data.isDefault) {
      await prisma.whatsappInstance.updateMany({
        where: { tenantId, id: { not: instanceId } },
        data: { isDefault: false },
      });
    }

    return prisma.whatsappInstance.update({
      where: { id: instanceId },
      data: {
        ...(data.name !== undefined ? { name: data.name } : {}),
        ...(data.isDefault !== undefined ? { isDefault: data.isDefault } : {}),
        ...(data.fixedDelaySeconds !== undefined ? { fixedDelaySeconds: Number(data.fixedDelaySeconds) } : {}),
        ...(data.useRandomDelay !== undefined ? { useRandomDelay: Boolean(data.useRandomDelay) } : {}),
        ...(data.minDelaySeconds !== undefined ? { minDelaySeconds: Number(data.minDelaySeconds) } : {}),
        ...(data.maxDelaySeconds !== undefined ? { maxDelaySeconds: Number(data.maxDelaySeconds) } : {}),
      },
    });
  }

  /**
   * Remove permanentemente uma instância da Evolution API e do banco (com isolamento por tenant)
   */
  async deleteInstance(instanceId: string, tenantId: string) {
    const instance = await prisma.whatsappInstance.findFirst({
      where: { id: instanceId, tenantId },
    });
    if (!instance) return false;

    try {
      await fetch(`${this.apiUrl}/instance/delete/${encodeURIComponent(instance.instanceName)}`, {
        method: 'DELETE',
        headers: { apikey: this.apiKey },
      });
    } catch {}

    await prisma.whatsappInstance.delete({ where: { id: instanceId } });
    return true;
  }

  /**
   * Disparo seguro de mensagens nas automações utilizando a instância selecionada
   * Suporta seleção de número específico e garante isolamento por tenant
   */
  async send(params: SendWhatsAppParams): Promise<SendResult> {
    if (!this.isConfigured()) {
      return {
        success: false,
        messageId: '',
        provider: 'EVOLUTION_API',
        status: 'FAILED',
        error: 'Evolution API não configurada no servidor',
      };
    }

    let instance: any = null;

    // 1. Instância explicitamente configurada no nó do fluxo (filtrando por tenantId)
    if (params.whatsappInstanceId) {
      instance = await prisma.whatsappInstance.findFirst({
        where: {
          id: params.whatsappInstanceId,
          ...(params.tenantId ? { tenantId: params.tenantId } : {}),
        },
      });
    }

    // 2. Busca por número do remetente caso informado (filtrando por tenantId)
    if ((!instance || instance.status !== 'CONNECTED') && params.senderPhone) {
      const cleanSender = params.senderPhone.replace(/\D/g, '');
      instance = await prisma.whatsappInstance.findFirst({
        where: {
          phone: { contains: cleanSender.slice(-8) },
          status: 'CONNECTED',
          ...(params.tenantId ? { tenantId: params.tenantId } : {}),
        },
      });
    }

    // 3. Busca por tenant vinculado (prioriza padrão do tenant)
    if ((!instance || instance.status !== 'CONNECTED') && params.tenantId) {
      instance = await prisma.whatsappInstance.findFirst({
        where: { tenantId: params.tenantId, status: 'CONNECTED' },
        orderBy: [{ isDefault: 'desc' }, { createdAt: 'desc' }],
      });
    }

    if (!instance || instance.status !== 'CONNECTED') {
      const errorMsg = 'Nenhum número de WhatsApp conectado para este Expert/Tenant. Acesse o menu WhatsApp para conectar um número.';
      return {
        success: false,
        messageId: '',
        provider: 'EVOLUTION_API',
        status: 'FAILED',
        error: errorMsg,
      };
    }

    try {
      const isGroup = (params.phone || '').includes('@g.us');
      const cleanPhone = isGroup ? params.phone.trim() : params.phone.replace(/\D/g, '');

      // Substituição de variáveis
      let messageText = params.text || '';
      let formattedCaption = params.caption || '';
      if (params.variables) {
        for (const [key, value] of Object.entries(params.variables)) {
          const regex = new RegExp(`{{${key}}}`, 'g');
          if (messageText) messageText = messageText.replace(regex, value);
          if (formattedCaption) formattedCaption = formattedCaption.replace(regex, value);
        }
      }

      const messageType = params.messageType || (params.mediaUrl ? 'image' : 'text');

      // Se for envio de mídia (imagem, vídeo, áudio ou documento)
      if (messageType !== 'text' && (params.mediaUrl || params.mediaBase64)) {
        // Resolve payload de mídia: Evolution API exige Base64 puro (SEM prefixo data:...;base64,) ou URL pública válida
        let mediaPayload = params.mediaBase64 || params.mediaUrl || '';

        // Se o arquivo for local (/uploads/...), lemos do disco e convertemos para Base64 puro
        if (params.mediaUrl && (params.mediaUrl.startsWith('/uploads/') || params.mediaUrl.startsWith('uploads/'))) {
          try {
            const localRelative = params.mediaUrl.replace(/^\//, '');
            const localPath = path.join(process.cwd(), 'public', localRelative);
            if (fs.existsSync(localPath)) {
              const fileBuf = fs.readFileSync(localPath);
              mediaPayload = fileBuf.toString('base64');
            }
          } catch (readErr) {
            console.error('[EvolutionApi] Erro ao ler arquivo de mídia local do disco:', readErr);
          }
        }

        // Se a string contiver o prefixo data:...;base64,, extrai apenas o Base64 puro
        if (mediaPayload && mediaPayload.includes(';base64,')) {
          mediaPayload = mediaPayload.split(';base64,')[1] || mediaPayload;
        }

        // Determina o mediatype correto conforme especificação da Evolution API
        let mediatype: 'image' | 'video' | 'audio' | 'document' = 'image';
        if (messageType === 'video' || params.mediaMimeType?.startsWith('video/')) {
          mediatype = 'video';
        } else if (messageType === 'audio' || params.mediaMimeType?.startsWith('audio/')) {
          mediatype = 'audio';
        } else if (
          messageType === 'document' ||
          messageType === 'file' ||
          params.mediaMimeType?.startsWith('application/') ||
          params.mediaFileName?.match(/\.(pdf|docx?|xlsx?|pptx?|csv|zip|rar|txt)$/i)
        ) {
          mediatype = 'document';
        } else {
          mediatype = 'image';
        }

        let response: Response;
        let responseData: any = {};
        let logContent = '';

        if (mediatype === 'audio') {
          // Envio de áudio / mensagem de voz
          logContent = `[🎙️ Áudio] ${params.mediaFileName || 'audio'}`;
          const audioUrl = `${this.apiUrl}/message/sendWhatsAppAudio/${encodeURIComponent(instance.instanceName)}`;
          response = await fetch(audioUrl, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              apikey: this.apiKey,
            },
            body: JSON.stringify({
              number: cleanPhone,
              audio: mediaPayload,
              options: {
                delay: 1200,
                presence: 'recording',
                encoding: true,
              },
            }),
          });
          responseData = await response.json().catch(() => ({}));

          // Fallback para sendMedia caso o endpoint de áudio nativo retorne erro
          if (!response.ok) {
            const fallbackUrl = `${this.apiUrl}/message/sendMedia/${encodeURIComponent(instance.instanceName)}`;
            response = await fetch(fallbackUrl, {
              method: 'POST',
              headers: {
                'Content-Type': 'application/json',
                apikey: this.apiKey,
              },
              body: JSON.stringify({
                number: cleanPhone,
                mediatype: 'audio',
                mimetype: params.mediaMimeType || 'audio/mp4',
                media: mediaPayload,
                fileName: params.mediaFileName || 'audio.mp3',
              }),
            });
            responseData = await response.json().catch(() => ({}));
          }
        } else {
          // Envio de Imagem, Vídeo ou Documento via sendMedia
          const defaultMime =
            mediatype === 'video'
              ? 'video/mp4'
              : mediatype === 'document'
              ? 'application/pdf'
              : 'image/jpeg';
          const defaultName =
            mediatype === 'video'
              ? 'video.mp4'
              : mediatype === 'document'
              ? 'documento.pdf'
              : 'imagem.jpg';

          const icon = mediatype === 'video' ? '🎥 Vídeo' : mediatype === 'document' ? '📄 Documento' : '📷 Imagem';
          logContent = `[${icon}] ${formattedCaption ? `Legenda: ${formattedCaption} ` : ''}(${params.mediaFileName || defaultName})`;

          const mediaUrl = `${this.apiUrl}/message/sendMedia/${encodeURIComponent(instance.instanceName)}`;
          response = await fetch(mediaUrl, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              apikey: this.apiKey,
            },
            body: JSON.stringify({
              number: cleanPhone,
              mediatype,
              mimetype: params.mediaMimeType || defaultMime,
              caption: formattedCaption || undefined,
              media: mediaPayload,
              fileName: params.mediaFileName || defaultName,
              options: {
                delay: 1200,
                presence: 'composing',
              },
            }),
          });
          responseData = await response.json().catch(() => ({}));
        }

        const isApiSuccess =
          response.ok &&
          (responseData?.key?.id ||
            responseData?.status === 'PENDING' ||
            responseData?.status === 'SENT' ||
            responseData?.messageId ||
            responseData?.message?.imageMessage ||
            responseData?.message?.videoMessage ||
            responseData?.message?.audioMessage ||
            responseData?.message?.documentMessage ||
            responseData?.message?.conversation ||
            responseData?.message?.extendedTextMessage);

        if (!response.ok || !isApiSuccess || responseData?.status === 400 || responseData?.status === 500) {
          const errorMsg =
            responseData?.response?.message?.[0] ||
            (Array.isArray(responseData?.response?.message) ? responseData.response.message.join(', ') : null) ||
            responseData?.message ||
            responseData?.error ||
            `Falha na confirmação de envio pela Evolution API (HTTP ${response.status})`;

          console.error('[EvolutionApi] Falha confirmada no envio de mídia:', errorMsg);

          try {
            if (params.contactId) {
              const cExists = await prisma.contact.findUnique({ where: { id: params.contactId }, select: { id: true } });
              if (cExists) {
                await prisma.messageLog.create({
                  data: {
                    tenantId: params.tenantId,
                    contactId: params.contactId,
                    channel: 'WHATSAPP',
                    provider: 'EVOLUTION_API',
                    recipient: params.phone,
                    content: logContent,
                    status: 'FAILED',
                    error: String(errorMsg),
                  },
                });
              }
            }
          } catch {}

          return {
            success: false,
            messageId: '',
            provider: 'EVOLUTION_API',
            status: 'FAILED',
            error: String(errorMsg),
          };
        }

        const externalMessageId = responseData?.key?.id || `evo_${Date.now()}`;
        let logId = `msg_${Date.now()}`;
        try {
          if (params.contactId) {
            const cExists = await prisma.contact.findUnique({ where: { id: params.contactId }, select: { id: true } });
            if (cExists) {
              const log = await prisma.messageLog.create({
                data: {
                  tenantId: params.tenantId,
                  contactId: params.contactId,
                  channel: 'WHATSAPP',
                  provider: 'EVOLUTION_API',
                  recipient: params.phone,
                  templateName: params.templateName,
                  content: logContent,
                  status: 'SENT',
                  externalMessageId,
                  costEstimate: 0.0,
                },
              });
              logId = log.id;
            }
          }
        } catch {}

        return {
          success: true,
          messageId: logId,
          provider: 'EVOLUTION_API',
          status: 'SENT',
          costEstimate: 0.0,
        };
      }

      // Envio de Texto padrão
      const finalMessageText = messageText || `Mensagem: ${params.templateName || 'aviso'}`;
      const url = `${this.apiUrl}/message/sendText/${encodeURIComponent(instance.instanceName)}`;

      const response = await fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          apikey: this.apiKey,
        },
        body: JSON.stringify({
          number: cleanPhone,
          text: finalMessageText,
          options: {
            delay: 1200,
            presence: 'composing',
            linkPreview: true,
          },
        }),
      });

      const data = await response.json().catch(() => ({}));

      if (!response.ok) {
        const errorMsg = data?.message || data?.error || `Falha no envio (HTTP ${response.status})`;
        try {
          if (params.contactId) {
            const cExists = await prisma.contact.findUnique({ where: { id: params.contactId }, select: { id: true } });
            if (cExists) {
              await prisma.messageLog.create({
                data: {
                  tenantId: params.tenantId,
                  contactId: params.contactId,
                  channel: 'WHATSAPP',
                  provider: 'EVOLUTION_API',
                  recipient: params.phone,
                  content: finalMessageText,
                  status: 'FAILED',
                  error: String(errorMsg),
                },
              });
            }
          }
        } catch {}

        return {
          success: false,
          messageId: '',
          provider: 'EVOLUTION_API',
          status: 'FAILED',
          error: String(errorMsg),
        };
      }

      const externalMessageId = data?.key?.id || `evo_${Date.now()}`;
      let logId = `msg_${Date.now()}`;
      try {
        if (params.contactId) {
          const cExists = await prisma.contact.findUnique({ where: { id: params.contactId }, select: { id: true } });
          if (cExists) {
            const log = await prisma.messageLog.create({
              data: {
                tenantId: params.tenantId,
                contactId: params.contactId,
                channel: 'WHATSAPP',
                provider: 'EVOLUTION_API',
                recipient: params.phone,
                templateName: params.templateName,
                content: finalMessageText,
                status: 'SENT',
                externalMessageId,
                costEstimate: 0.0,
              },
            });
            logId = log.id;
          }
        }
      } catch {}

      return {
        success: true,
        messageId: logId,
        provider: 'EVOLUTION_API',
        status: 'SENT',
        costEstimate: 0.0,
      };
    } catch (err: any) {
      return {
        success: false,
        messageId: '',
        provider: 'EVOLUTION_API',
        status: 'FAILED',
        error: err.message,
      };
    }
  }
}
