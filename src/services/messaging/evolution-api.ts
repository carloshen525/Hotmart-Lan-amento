import { prisma } from '@/lib/prisma';
import crypto from 'crypto';
import fs from 'fs';
import path from 'path';
import { SendWhatsAppParams, SendResult } from './types';

export class EvolutionApiService {
  private apiUrl: string;
  private apiKey: string;

  constructor() {
    this.apiUrl = (process.env.EVOLUTION_API_URL || '')
      .trim()
      .replace(/^["']|["']$/g, '')
      .replace(/\/$/, '');
    this.apiKey = (process.env.EVOLUTION_API_KEY || '')
      .trim()
      .replace(/^["']|["']$/g, '');
  }

  isConfigured(): boolean {
    return Boolean(this.apiUrl && this.apiKey);
  }

  /**
   * Obtém todas as instâncias do WhatsApp cadastradas para o tenant
   */
  async listAllInstances(tenantId?: string) {
    return prisma.whatsappInstance.findMany({
      where: tenantId ? { tenantId } : undefined,
      orderBy: [{ isDefault: 'desc' }, { createdAt: 'desc' }],
    });
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
   * Consulta o status de uma instância ou de todas as instâncias do tenant autenticado
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

    // 1. Sincroniza instâncias ativas da Evolution API pertencentes a este tenant
    if (this.isConfigured()) {
      try {
        const evoRes = await fetch(`${this.apiUrl}/instance/fetchInstances`, {
          headers: { apikey: this.apiKey },
          signal: AbortSignal.timeout(4000),
        });
        evoData = await evoRes.json().catch(() => ([]));
        if (Array.isArray(evoData)) {
          for (const evo of evoData) {
            const evoName = evo.name || evo.instanceName || evo.instance?.name || evo.instance?.instanceName;
            const evoState = String(
              evo.connectionStatus ||
              evo.state ||
              evo.status ||
              evo.instance?.state ||
              evo.instance?.status ||
              ''
            ).toLowerCase();
            const isOpen = evoState === 'open' || evoState === 'connected';

            if (isOpen && evoName) {
              const rawPhone = evo.ownerJid ? evo.ownerJid.replace(/@.*$/, '') : '';
              const phone = rawPhone ? (rawPhone.startsWith('+') ? rawPhone : '+' + rawPhone) : null;
              const profileName = evo.profileName || 'WhatsApp Conectado';

              const existing = await prisma.whatsappInstance.findFirst({
                where: {
                  OR: [
                    { instanceName: evoName },
                    ...(phone ? [{ phone }] : []),
                  ],
                },
              });

              if (existing) {
                await prisma.whatsappInstance.update({
                  where: { id: existing.id },
                  data: {
                    tenantId, // Vincula ao tenant ativo se ainda não estava
                    instanceName: evoName,
                    status: 'CONNECTED',
                    phone: phone || existing.phone,
                    profileName: profileName || existing.profileName,
                    lastConnectedAt: new Date(),
                    qrcode: null,
                  },
                }).catch(() => {});
              } else {
                const totalCount = await prisma.whatsappInstance.count({ where: { tenantId } }).catch(() => 0);
                await prisma.whatsappInstance.create({
                  data: {
                    tenantId,
                    name: profileName + (phone ? ` (${phone})` : ''),
                    instanceName: evoName,
                    instanceToken: evo.token || crypto.randomUUID(),
                    status: 'CONNECTED',
                    phone,
                    profileName,
                    isDefault: totalCount === 0,
                    lastConnectedAt: new Date(),
                    qrcode: null,
                  },
                }).catch(() => {});
              }
            }
          }
        }
      } catch {
        // Silencioso em caso de timeout
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

    // Busca todas as instâncias cadastradas deste tenant
    const instances = await prisma.whatsappInstance.findMany({
      where: { tenantId },
      orderBy: [{ isDefault: 'desc' }, { createdAt: 'desc' }],
    });

    // Sincroniza cada instância
    const syncedInstances = await Promise.all(
      instances.map((inst) => this.syncSingleInstance(inst))
    );

    // 2. Garantia absoluta: se a Evolution API possui instâncias conectadas,
    // mescla diretamente na lista para nunca sumir da tela mesmo se houver delay no banco
    if (Array.isArray(evoData)) {
      for (const evo of evoData) {
        const evoName = evo.name || evo.instanceName || evo.instance?.name || evo.instance?.instanceName;
        const evoState = String(
          evo.connectionStatus ||
          evo.state ||
          evo.status ||
          evo.instance?.state ||
          evo.instance?.status ||
          ''
        ).toLowerCase();
        const isOpen = evoState === 'open' || evoState === 'connected';

        if (isOpen && evoName) {
          const rawPhone = evo.ownerJid ? evo.ownerJid.replace(/@.*$/, '') : '';
          const phone = rawPhone ? (rawPhone.startsWith('+') ? rawPhone : '+' + rawPhone) : null;
          const profileName = evo.profileName || 'WhatsApp Conectado';

          const alreadyInList = syncedInstances.some(
            (s) => s.instanceName === evoName || (phone && s.phone === phone)
          );

          if (!alreadyInList) {
            syncedInstances.push({
              id: evo.id || evoName,
              name: profileName + (phone ? ` (${phone})` : ''),
              instanceName: evoName,
              connected: true,
              status: 'CONNECTED',
              phone,
              profileName,
              isDefault: syncedInstances.length === 0,
              lastConnectedAt: evo.updatedAt ? new Date(evo.updatedAt) : new Date(),
              qrcode: null,
            });
          }
        }
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
   * Atualiza apelido/nome amigável ou define como número padrão (com isolamento por tenant)
   */
  async updateInstance(instanceId: string, tenantId: string, data: { name?: string; isDefault?: boolean }) {
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
      const cleanPhone = params.phone.replace(/\D/g, '');

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

      // Se for envio de mídia (imagem, vídeo ou áudio)
      if (messageType !== 'text' && (params.mediaUrl || params.mediaBase64)) {
        // Resolve payload de mídia (URL ou Base64)
        let mediaPayload = params.mediaBase64 || params.mediaUrl || '';

        // Se o arquivo for local (/uploads/...), lemos do disco e convertemos para Data URI
        // para garantir que a Evolution API receba o arquivo mesmo se estiver em Docker ou outra rede
        if (params.mediaUrl && (params.mediaUrl.startsWith('/uploads/') || params.mediaUrl.startsWith('uploads/'))) {
          try {
            const localRelative = params.mediaUrl.replace(/^\//, '');
            const localPath = path.join(process.cwd(), 'public', localRelative);
            if (fs.existsSync(localPath)) {
              const fileBuf = fs.readFileSync(localPath);
              const fallbackMime = messageType === 'audio' ? 'audio/mpeg' : messageType === 'video' ? 'video/mp4' : 'image/jpeg';
              const mime = params.mediaMimeType || fallbackMime;
              mediaPayload = `data:${mime};base64,${fileBuf.toString('base64')}`;
            }
          } catch (readErr) {
            console.error('[EvolutionApi] Erro ao ler arquivo de mídia local do disco:', readErr);
          }
        }

        let response: Response;
        let responseData: any = {};
        let logContent = '';

        if (messageType === 'audio') {
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
                mimetype: params.mediaMimeType || 'audio/mp3',
                media: mediaPayload,
                fileName: params.mediaFileName || 'audio.mp3',
              }),
            });
            responseData = await response.json().catch(() => ({}));
          }
        } else {
          // Envio de Imagem ou Vídeo com legenda
          const mediaKind = messageType === 'video' ? 'video' : 'image';
          const defaultMime = messageType === 'video' ? 'video/mp4' : 'image/jpeg';
          const defaultName = messageType === 'video' ? 'video.mp4' : 'imagem.jpg';
          logContent = `[${messageType === 'video' ? '🎥 Vídeo' : '📷 Imagem'}] ${formattedCaption ? `Legenda: ${formattedCaption}` : params.mediaFileName || ''}`;

          const mediaUrl = `${this.apiUrl}/message/sendMedia/${encodeURIComponent(instance.instanceName)}`;
          response = await fetch(mediaUrl, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              apikey: this.apiKey,
            },
            body: JSON.stringify({
              number: cleanPhone,
              mediatype: mediaKind,
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

        if (!response.ok) {
          const errorMsg = responseData?.message || responseData?.error || `Falha no envio de mídia (HTTP ${response.status})`;
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

          return {
            success: false,
            messageId: '',
            provider: 'EVOLUTION_API',
            status: 'FAILED',
            error: String(errorMsg),
          };
        }

        const externalMessageId = responseData?.key?.id || `evo_${Date.now()}`;
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

        return {
          success: true,
          messageId: log.id,
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

        return {
          success: false,
          messageId: '',
          provider: 'EVOLUTION_API',
          status: 'FAILED',
          error: String(errorMsg),
        };
      }

      const externalMessageId = data?.key?.id || `evo_${Date.now()}`;

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

      return {
        success: true,
        messageId: log.id,
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
