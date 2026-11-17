import { prisma } from '@/lib/prisma';
import fs from 'fs';
import path from 'path';

export interface GroupSyncResult {
  totalSynced: number;
  eligibleCount: number;
  ineligibleCount: number;
  unverifiedCount: number;
  leftCount: number;
  instancesProcessed: number;
}

export class WhatsappGroupService {
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
   * Sincroniza todos os grupos das instâncias conectadas do tenant com a Evolution API.
   * REGRA FUNDAMENTAL: Apenas classifica como elegível se a própria instância conectada for administradora real (admin ou superadmin).
   */
  async syncGroups(tenantId: string, whatsappInstanceId?: string): Promise<GroupSyncResult> {
    if (!this.isConfigured()) {
      throw new Error('Evolution API não configurada no servidor.');
    }

    // Busca instâncias ativas do tenant
    const instances = await prisma.whatsappInstance.findMany({
      where: {
        tenantId,
        ...(whatsappInstanceId ? { id: whatsappInstanceId } : {}),
      },
    });

    if (instances.length === 0) {
      return {
        totalSynced: 0,
        eligibleCount: 0,
        ineligibleCount: 0,
        unverifiedCount: 0,
        leftCount: 0,
        instancesProcessed: 0,
      };
    }

    let totalSynced = 0;
    let eligibleCount = 0;
    let ineligibleCount = 0;
    let unverifiedCount = 0;
    let leftCount = 0;

    for (const instance of instances) {
      try {
        // Busca os grupos reais da instância na Evolution API
        const url = `${this.apiUrl}/group/fetchAllGroups/${encodeURIComponent(instance.instanceName)}?getParticipants=true`;
        const res = await fetch(url, {
          method: 'GET',
          headers: {
            apikey: this.apiKey,
          },
        });

        if (!res.ok) {
          console.warn(`[GroupService] Erro ao buscar grupos da instância ${instance.instanceName}: status ${res.status}`);
          continue;
        }

        const rawGroups = await res.json();
        if (!Array.isArray(rawGroups)) {
          console.warn(`[GroupService] Resposta inesperada para instância ${instance.instanceName}:`, rawGroups);
          continue;
        }

        // Tenta também buscar comunidades caso a Evolution API utilize endpoint específico
        try {
          const comUrl = `${this.apiUrl}/community/fetchAll/${encodeURIComponent(instance.instanceName)}`;
          const comRes = await fetch(comUrl, { method: 'GET', headers: { apikey: this.apiKey } });
          if (comRes.ok) {
            const comData = await comRes.json();
            if (Array.isArray(comData)) {
              for (const c of comData) {
                if (!rawGroups.some((g: any) => g.id === c.id)) {
                  rawGroups.push({ ...c, isCommunity: true });
                }
              }
            }
          }
        } catch {}

        try {
          const findComUrl = `${this.apiUrl}/group/findCommunities/${encodeURIComponent(instance.instanceName)}`;
          const findComRes = await fetch(findComUrl, { method: 'GET', headers: { apikey: this.apiKey } });
          if (findComRes.ok) {
            const findComData = await findComRes.json();
            if (Array.isArray(findComData)) {
              for (const c of findComData) {
                if (!rawGroups.some((g: any) => g.id === c.id)) {
                  rawGroups.push({ ...c, isCommunity: true });
                }
              }
            }
          }
        } catch {}

        // Determina o número de telefone da instância para identificar seu participante no grupo
        let myNumber = (instance.phone || '').replace(/\D/g, '');
        if (!myNumber || myNumber.length < 8) {
          // Fallback: consulta informações da instância na Evolution API
          try {
            const instRes = await fetch(`${this.apiUrl}/instance/fetchInstances`, {
              headers: { apikey: this.apiKey },
            });
            if (instRes.ok) {
              const allInst = await instRes.json();
              const found = allInst.find((i: any) => i.name === instance.instanceName);
              if (found && found.ownerJid) {
                myNumber = found.ownerJid.replace(/\D/g, '');
              }
            }
          } catch {}
        }

        const returnedJids = new Set<string>();

        for (const group of rawGroups) {
          const jid = group.id;
          if (!jid) continue;
          returnedJids.add(jid);

          const name = group.subject || 'Grupo sem nome';
          const pictureUrl = group.pictureUrl || null;
          const participants = Array.isArray(group.participants) ? group.participants : [];
          const size = Number(group.size) || participants.length;

          // Localiza o participante correspondente à instância conectada
          let meParticipant: any = null;
          if (participants.length > 0 && myNumber) {
            meParticipant = participants.find((p: any) => {
              const pPhone = (p.phoneNumber || '').replace(/\D/g, '');
              const pId = (p.id || '').replace(/\D/g, '');
              if (pPhone && (pPhone === myNumber || pPhone.includes(myNumber) || myNumber.includes(pPhone))) return true;
              if (pId && (pId === myNumber || pId.includes(myNumber) || myNumber.includes(pId))) return true;
              if (myNumber.length >= 8) {
                const last8 = myNumber.slice(-8);
                if (pPhone.endsWith(last8) || pId.endsWith(last8)) return true;
              }
              return false;
            });
          }

          // Validação estrita de administrador
          let isAdmin = false;
          let adminRole: string | null = null;
          let status = 'NOT_ADMIN';
          let isEligible = false;

          if (participants.length === 0) {
            // Caso a API não retorne participantes, classificar como NÃO VERIFICADO
            adminRole = 'unverified';
            status = 'UNVERIFIED';
            isEligible = false;
            unverifiedCount++;
          } else if (meParticipant) {
            if (meParticipant.admin === 'admin' || meParticipant.admin === 'superadmin') {
              isAdmin = true;
              adminRole = meParticipant.admin;
              status = 'ACTIVE';
              isEligible = true;
              eligibleCount++;
            } else {
              isAdmin = false;
              adminRole = 'none';
              status = 'NOT_ADMIN';
              isEligible = false;
              ineligibleCount++;
            }
          } else {
            // A instância não está na lista de participantes
            isAdmin = false;
            adminRole = 'none';
            status = 'LEFT';
            isEligible = false;
            leftCount++;
          }

          // Gravação / Atualização no banco com integridade
          await prisma.whatsappGroup.upsert({
            where: {
              whatsappInstanceId_jid: {
                whatsappInstanceId: instance.id,
                jid,
              },
            },
            create: {
              tenantId,
              whatsappInstanceId: instance.id,
              jid,
              name,
              pictureUrl,
              participantsCount: size,
              isAdmin,
              adminRole,
              status,
              isEligible,
              metadata: JSON.stringify({
                owner: group.owner,
                isCommunity: Boolean(group.isCommunity || group.isParentGroup || group.linkedParent || group.linkedParentJid || (name && name.toLowerCase().includes('comunidade'))),
                isCommunityAnnounce: Boolean(group.isCommunityAnnounce),
                linkedParentJid: group.linkedParentJid || group.linkedParent || null,
                creation: group.creation,
                myRole: adminRole,
              }),
              lastSyncedAt: new Date(),
            },
            update: {
              name,
              pictureUrl,
              participantsCount: size,
              isAdmin,
              adminRole,
              status,
              isEligible,
              metadata: JSON.stringify({
                owner: group.owner,
                isCommunity: Boolean(group.isCommunity || group.isParentGroup || group.linkedParent || group.linkedParentJid || (name && name.toLowerCase().includes('comunidade'))),
                isCommunityAnnounce: Boolean(group.isCommunityAnnounce),
                linkedParentJid: group.linkedParentJid || group.linkedParent || null,
                creation: group.creation,
                myRole: adminRole,
              }),
              lastSyncedAt: new Date(),
            },
          });

          totalSynced++;
        }

        // Atualiza grupos no banco que não foram retornados pela API (a instância saiu do grupo)
        const groupsInDb = await prisma.whatsappGroup.findMany({
          where: { whatsappInstanceId: instance.id },
          select: { id: true, jid: true, status: true },
        });

        for (const dbGroup of groupsInDb) {
          if (!returnedJids.has(dbGroup.jid) && dbGroup.status !== 'LEFT') {
            await prisma.whatsappGroup.update({
              where: { id: dbGroup.id },
              data: {
                status: 'LEFT',
                isAdmin: false,
                isEligible: false,
                lastSyncedAt: new Date(),
              },
            });
            leftCount++;
          }
        }
      } catch (err: any) {
        console.error(`[GroupService] Erro durante sincronização da instância ${instance.instanceName}:`, err.message);
      }
    }

    return {
      totalSynced,
      eligibleCount,
      ineligibleCount,
      unverifiedCount,
      leftCount,
      instancesProcessed: instances.length,
    };
  }

  /**
   * Alias para verificação de elegibilidade do grupo
   */
  async checkGroupEligibility(
    groupIdOrJid: string,
    whatsappInstanceId?: string,
    tenantId?: string
  ): Promise<{ eligible: boolean; reason?: string; group?: any; instance?: any }> {
    if (tenantId) {
      return this.verifyGroupEligibility(tenantId, groupIdOrJid, whatsappInstanceId);
    }
    const group = await prisma.whatsappGroup.findFirst({
      where: { OR: [{ id: groupIdOrJid }, { jid: groupIdOrJid }] },
    });
    if (!group) return { eligible: false, reason: 'Grupo não encontrado' };
    return this.verifyGroupEligibility(group.tenantId, groupIdOrJid, whatsappInstanceId);
  }

  /**
   * Validação em tempo real antes de disparos ou ativação de automação.
   * Consulta a Evolution API diretamente para assegurar que a instância ainda participa do grupo
   * e que continua sendo administradora ativa.
   */
  async verifyGroupEligibility(
    tenantId: string,
    groupIdOrJid: string,
    whatsappInstanceId?: string
  ): Promise<{ eligible: boolean; reason?: string; group?: any; instance?: any }> {
    // 1. Busca grupo no banco isolado por tenantId
    const group = await prisma.whatsappGroup.findFirst({
      where: {
        tenantId,
        OR: [{ id: groupIdOrJid }, { jid: groupIdOrJid }],
        ...(whatsappInstanceId ? { whatsappInstanceId } : {}),
      },
      include: {
        whatsappInstance: true,
        tags: { include: { tag: true } },
      },
    });

    if (!group) {
      return { eligible: false, reason: 'Grupo não cadastrado ou não pertence a este Expert.' };
    }

    const instance = group.whatsappInstance;
    if (!instance) {
      return { eligible: false, reason: 'Nenhuma instância de WhatsApp associada a este grupo.' };
    }

    // 2. Valida conexão da instância
    if (instance.status !== 'CONNECTED') {
      return {
        eligible: false,
        reason: `A instância de WhatsApp (${instance.name || instance.instanceName}) está desconectada.`,
        group,
        instance,
      };
    }

    // 3. Consulta em tempo real os metadados do grupo na Evolution API
    try {
      const url = `${this.apiUrl}/group/findGroupInfos/${encodeURIComponent(instance.instanceName)}?groupJid=${encodeURIComponent(group.jid)}`;
      const res = await fetch(url, {
        method: 'GET',
        headers: { apikey: this.apiKey },
      });

      if (!res.ok) {
        // Se a API retornou 400/404, a instância provavelmente não está mais no grupo
        await prisma.whatsappGroup.update({
          where: { id: group.id },
          data: { status: 'LEFT', isAdmin: false, isEligible: false },
        });
        return {
          eligible: false,
          reason: 'A instância não participa mais deste grupo ou o grupo foi apagado no WhatsApp.',
          group,
          instance,
        };
      }

      const info = await res.json();
      const participants = Array.isArray(info.participants) ? info.participants : [];

      if (participants.length === 0) {
        await prisma.whatsappGroup.update({
          where: { id: group.id },
          data: { status: 'UNVERIFIED', isEligible: false },
        });
        return {
          eligible: false,
          reason: 'Não foi possível verificar a lista de participantes do grupo pela Evolution API.',
          group,
          instance,
        };
      }

      let myNumber = (instance.phone || '').replace(/\D/g, '');
      const me = participants.find((p: any) => {
        const pPhone = (p.phoneNumber || '').replace(/\D/g, '');
        const pId = (p.id || '').replace(/\D/g, '');
        if (myNumber && (pPhone === myNumber || pPhone.includes(myNumber) || myNumber.includes(pPhone))) return true;
        if (myNumber && (pId === myNumber || pId.includes(myNumber) || myNumber.includes(pId))) return true;
        if (myNumber && myNumber.length >= 8) {
          const last8 = myNumber.slice(-8);
          if (pPhone.endsWith(last8) || pId.endsWith(last8)) return true;
        }
        return false;
      });

      if (!me) {
        await prisma.whatsappGroup.update({
          where: { id: group.id },
          data: { status: 'LEFT', isAdmin: false, isEligible: false },
        });
        return {
          eligible: false,
          reason: 'A instância conectada não faz parte dos participantes deste grupo.',
          group,
          instance,
        };
      }

      if (me.admin !== 'admin' && me.admin !== 'superadmin') {
        await prisma.whatsappGroup.update({
          where: { id: group.id },
          data: { status: 'NOT_ADMIN', isAdmin: false, isEligible: false, adminRole: 'none' },
        });
        return {
          eligible: false,
          reason: 'A instância perdeu a permissão de administrador neste grupo.',
          group,
          instance,
        };
      }

      // Confirmação total da permissão real
      await prisma.whatsappGroup.update({
        where: { id: group.id },
        data: {
          status: 'ACTIVE',
          isAdmin: true,
          adminRole: me.admin,
          isEligible: true,
          participantsCount: Number(info.size) || participants.length,
          lastSyncedAt: new Date(),
        },
      });

      return { eligible: true, group, instance };
    } catch (err: any) {
      return {
        eligible: false,
        reason: `Falha na verificação da Evolution API: ${err.message}`,
        group,
        instance,
      };
    }
  }

  /**
   * Retorna os grupos do tenant com filtros de elegibilidade e busca
   */
  async getGroups(
    tenantId: string,
    options: {
      search?: string;
      eligibleOnly?: boolean;
      instanceId?: string;
      tagId?: string;
      status?: string;
    } = {}
  ) {
    const where: any = {
      tenantId,
      ...(options.eligibleOnly ? { isEligible: true } : {}),
      ...(options.instanceId ? { whatsappInstanceId: options.instanceId } : {}),
      ...(options.status ? { status: options.status } : {}),
    };

    if (options.search) {
      where.OR = [
        { name: { contains: options.search } },
        { jid: { contains: options.search } },
      ];
    }

    if (options.tagId) {
      where.tags = {
        some: { tagId: options.tagId },
      };
    }

    return await prisma.whatsappGroup.findMany({
      where,
      include: {
        whatsappInstance: {
          select: {
            id: true,
            name: true,
            instanceName: true,
            phone: true,
            status: true,
          },
        },
        tags: {
          include: {
            tag: true,
          },
        },
      },
      orderBy: [{ isEligible: 'desc' }, { name: 'asc' }],
    });
  }

  /**
   * Retorna tags exclusivas de grupos
   */
  async getGroupTags(tenantId: string) {
    return await prisma.groupTag.findMany({
      where: { tenantId },
      include: {
        _count: {
          select: { groups: true },
        },
      },
      orderBy: { name: 'asc' },
    });
  }

  /**
   * Cria nova tag exclusiva de grupos
   */
  async createGroupTag(tenantId: string, name: string, color = '#10b981', description?: string) {
    const cleanName = name.trim();
    if (!cleanName) throw new Error('Nome da tag não pode ser vazio');

    return await prisma.groupTag.upsert({
      where: {
        tenantId_name: {
          tenantId,
          name: cleanName,
        },
      },
      create: {
        tenantId,
        name: cleanName,
        color,
        description,
      },
      update: {
        color,
        description,
      },
    });
  }

  /**
   * Exclui tag de grupos
   */
  async deleteGroupTag(tenantId: string, tagId: string) {
    const tag = await prisma.groupTag.findFirst({
      where: { id: tagId, tenantId },
    });
    if (!tag) throw new Error('Tag de grupo não encontrada.');

    await prisma.groupTag.delete({
      where: { id: tagId },
    });
    return { success: true };
  }

  /**
   * Associa tags a múltiplos grupos em massa
   */
  async addTagsToGroups(tenantId: string, groupIds: string[], tagIds: string[]) {
    // Valida que os grupos pertencem ao tenant
    const groups = await prisma.whatsappGroup.findMany({
      where: { id: { in: groupIds }, tenantId },
      select: { id: true },
    });

    const validGroupIds = groups.map((g) => g.id);

    for (const groupId of validGroupIds) {
      for (const tagId of tagIds) {
        await prisma.groupTagOnGroup.upsert({
          where: {
            groupId_tagId: { groupId, tagId },
          },
          create: { groupId, tagId },
          update: {},
        });
      }
    }

    // Dispara em background a inscrição de grupos para quaisquer automações ativas deste tenant
    try {
      const { automationEngine } = await import('@/services/automation/engine');
      const activeGroupAutomations = await prisma.automation.findMany({
        where: {
          tenantId,
          status: 'ACTIVE',
          targetType: 'GROUP',
        },
        select: { id: true },
      });

      for (const auto of activeGroupAutomations) {
        automationEngine.enrollGroupsByAutomation(auto.id).catch((err: any) => {
          console.error('[AutomationEngine] Erro ao sincronizar grupos após adicionar tag:', err?.message);
        });
      }
    } catch {}

    return { updated: validGroupIds.length };
  }

  /**
   * Remove tags de múltiplos grupos em massa
   */
  async removeTagsFromGroups(tenantId: string, groupIds: string[], tagIds: string[]) {
    const groups = await prisma.whatsappGroup.findMany({
      where: { id: { in: groupIds }, tenantId },
      select: { id: true },
    });

    const validGroupIds = groups.map((g) => g.id);

    await prisma.groupTagOnGroup.deleteMany({
      where: {
        groupId: { in: validGroupIds },
        tagId: { in: tagIds },
      },
    });

    return { updated: validGroupIds.length };
  }

  /**
   * Altera configurações de envio de mensagens no grupo (apenas admins ou todos)
   */
  async updateGroupSetting(instanceName: string, groupJid: string, action: 'announcement' | 'not_announcement') {
    try {
      const url = `${this.apiUrl}/group/updateSetting/${encodeURIComponent(instanceName)}?groupJid=${encodeURIComponent(groupJid)}`;
      const res = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', apikey: this.apiKey },
        body: JSON.stringify({ action }),
      });
      return { success: res.ok };
    } catch (err: any) {
      console.error('[Group Service] updateGroupSetting error:', err);
      return { success: false, error: err.message };
    }
  }

  /**
   * Altera o assunto / nome de um grupo
   */
  async updateGroupSubject(instanceName: string, groupJid: string, subject: string) {
    try {
      const url = `${this.apiUrl}/group/updateGroupSubject/${encodeURIComponent(instanceName)}?groupJid=${encodeURIComponent(groupJid)}`;
      const res = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', apikey: this.apiKey },
        body: JSON.stringify({ groupJid, subject }),
      });
      return { success: res.ok };
    } catch (err: any) {
      console.error('[Group Service] updateGroupSubject error:', err);
      return { success: false, error: err.message };
    }
  }

  /**
   * Altera a descrição de um grupo
   */
  async updateGroupDescription(instanceName: string, groupJid: string, description: string) {
    try {
      const url = `${this.apiUrl}/group/updateGroupDescription/${encodeURIComponent(instanceName)}?groupJid=${encodeURIComponent(groupJid)}`;
      const res = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', apikey: this.apiKey },
        body: JSON.stringify({ groupJid, description }),
      });
      return { success: res.ok };
    } catch (err: any) {
      console.error('[Group Service] updateGroupDescription error:', err);
      return { success: false, error: err.message };
    }
  }

  /**
   * Altera a imagem / foto de perfil de um grupo via Evolution API
   */
  async updateGroupPicture(
    instanceName: string,
    groupJid: string,
    imageInput: string
  ): Promise<{ success: boolean; error?: string; status?: number; data?: any }> {
    try {
      if (!this.isConfigured()) {
        return { success: false, error: 'Evolution API não configurada no servidor' };
      }

      // 1. Validar e processar formato da imagem (MIME type, extensão, magic bytes, base64/url)
      const processed = validateAndProcessGroupImage(imageInput);
      if (!processed.valid || !processed.payload) {
        console.warn('[Group Service] Imagem inválida rejeitada antes do envio:', processed.error);
        return {
          success: false,
          error: processed.error || 'Não foi possível alterar a imagem do grupo. Formato de arquivo não suportado.',
        };
      }

      const cleanJid = groupJid.includes('@g.us') ? groupJid : `${groupJid}@g.us`;

      // 2. Logs para diagnóstico ANTES do envio (Requisito 6)
      console.log('Alterando imagem do grupo:');
      console.log('Grupo:', cleanJid);
      console.log('Instância:', instanceName);
      console.log('Arquivo:', processed.fileName || 'imagem');
      console.log('Tipo:', processed.mimeType || 'image/jpeg');
      console.log('Tamanho:', processed.fileSize ? `${processed.fileSize} bytes` : 'URL externa');

      const urlWithQuery = `${this.apiUrl}/group/updateGroupPicture/${encodeURIComponent(instanceName)}?groupJid=${encodeURIComponent(cleanJid)}`;
      const urlWithoutQuery = `${this.apiUrl}/group/updateGroupPicture/${encodeURIComponent(instanceName)}`;

      const headers = {
        'Content-Type': 'application/json',
        apikey: this.apiKey,
      };

      // Payload contendo groupJid e a imagem convertida para Base64 puro ou URL pública
      const bodyPayload = JSON.stringify({
        groupJid: cleanJid,
        image: processed.payload,
        picture: processed.payload,
      });

      // Tentativa 1: POST com query string
      let res = await fetch(urlWithQuery, {
        method: 'POST',
        headers,
        body: bodyPayload,
      }).catch((e) => ({ ok: false, status: 500, json: async () => ({ error: e.message }) } as any));

      let resData = await res.json().catch(() => ({}));

      // Tentativa 2: Se 404/405, tenta PUT com query string (padrão em certas versões da Evolution API)
      if (!res.ok && (res.status === 404 || res.status === 405)) {
        res = await fetch(urlWithQuery, {
          method: 'PUT',
          headers,
          body: bodyPayload,
        }).catch((e) => ({ ok: false, status: 500, json: async () => ({ error: e.message }) } as any));
        resData = await res.json().catch(() => ({}));
      }

      // Tentativa 3: Se 404/405, tenta POST sem query string (groupJid apenas no body)
      if (!res.ok && (res.status === 404 || res.status === 405)) {
        res = await fetch(urlWithoutQuery, {
          method: 'POST',
          headers,
          body: bodyPayload,
        }).catch((e) => ({ ok: false, status: 500, json: async () => ({ error: e.message }) } as any));
        resData = await res.json().catch(() => ({}));
      }

      // Tentativa 4: Se 404/405, tenta PUT sem query string
      if (!res.ok && (res.status === 404 || res.status === 405)) {
        res = await fetch(urlWithoutQuery, {
          method: 'PUT',
          headers,
          body: bodyPayload,
        }).catch((e) => ({ ok: false, status: 500, json: async () => ({ error: e.message }) } as any));
        resData = await res.json().catch(() => ({}));
      }

      // 3. Logs para diagnóstico RESPOSTA (Requisito 6)
      const resMessage =
        resData?.message ||
        resData?.response?.message ||
        resData?.error ||
        (res.ok ? 'Imagem alterada com sucesso' : `Erro HTTP ${res.status}`);

      console.log('Evolution API:');
      console.log('Status:', res.status);
      console.log('Mensagem:', typeof resMessage === 'object' ? JSON.stringify(resMessage) : resMessage);

      // 4. Validação estrita de sucesso (Requisito 5)
      // Somente salvar 'Imagem alterada com sucesso' quando a Evolution API retornar confirmação positiva
      const isApiSuccess =
        res.ok &&
        !resData?.error &&
        resData?.status !== 400 &&
        resData?.status !== 401 &&
        resData?.status !== 403 &&
        resData?.status !== 404 &&
        resData?.status !== 500;

      if (isApiSuccess) {
        return {
          success: true,
          status: res.status,
          data: resData,
        };
      }

      const errorMessage =
        (Array.isArray(resData?.response?.message) ? resData.response.message.join(', ') : resData?.response?.message) ||
        resData?.message ||
        resData?.error ||
        `Retorno HTTP ${res.status}`;

      return {
        success: false,
        status: res.status,
        error: `Falha ao alterar imagem do grupo Motivo: ${errorMessage}`,
        data: resData,
      };
    } catch (err: any) {
      console.error('[Group Service] updateGroupPicture exception:', err);
      return {
        success: false,
        error: `Falha ao alterar imagem do grupo Motivo: ${err.message || 'Erro inesperado'}`,
      };
    }
  }
}

export interface ProcessedGroupImage {
  valid: boolean;
  error?: string;
  payload?: string; // base64 ou URL pública
  mimeType?: string;
  fileSize?: number;
  fileName?: string;
}

/**
 * Validador e processador de formato de imagem para grupos do WhatsApp.
 * Verifica MIME type, extensão, integridade/magic bytes e converte para Base64 puro ou URL pública.
 * Formatos suportados: JPG/JPEG, PNG, WEBP.
 */
export function validateAndProcessGroupImage(imageInput: string): ProcessedGroupImage {
  if (!imageInput || typeof imageInput !== 'string' || !imageInput.trim()) {
    return {
      valid: false,
      error: 'Não foi possível alterar a imagem do grupo. Nenhuma imagem fornecida.',
    };
  }

  const trimmed = imageInput.trim();

  // 1. Caso seja URL pública (http/https)
  if (trimmed.startsWith('http://') || trimmed.startsWith('https://')) {
    const urlWithoutQuery = trimmed.split('?')[0].toLowerCase();
    const isJpg = urlWithoutQuery.endsWith('.jpg') || urlWithoutQuery.endsWith('.jpeg');
    const isPng = urlWithoutQuery.endsWith('.png');
    const isWebp = urlWithoutQuery.endsWith('.webp');

    if (!isJpg && !isPng && !isWebp) {
      return {
        valid: false,
        error: 'Não foi possível alterar a imagem do grupo. Formato de arquivo não suportado.',
      };
    }

    const mime = isPng ? 'image/png' : isWebp ? 'image/webp' : 'image/jpeg';
    return {
      valid: true,
      payload: trimmed,
      mimeType: mime,
      fileName: trimmed.split('/').pop() || 'group_pic.jpg',
    };
  }

  // 2. Caso seja Base64 direto ou Data URI (data:image/...;base64,...)
  if (trimmed.startsWith('data:image/') || (!trimmed.startsWith('/') && trimmed.length > 100 && !trimmed.includes(' '))) {
    let mimeType = 'image/jpeg';
    let rawBase64 = trimmed;

    if (trimmed.startsWith('data:image/')) {
      const match = trimmed.match(/^data:(image\/[a-zA-Z0-9.+_-]+);base64,(.+)$/s);
      if (match) {
        mimeType = match[1].toLowerCase();
        rawBase64 = match[2];
      }
    }

    if (!['image/jpeg', 'image/jpg', 'image/png', 'image/webp'].includes(mimeType)) {
      return {
        valid: false,
        error: 'Não foi possível alterar a imagem do grupo. Formato de arquivo não suportado.',
      };
    }

    try {
      const buffer = Buffer.from(rawBase64, 'base64');
      if (buffer.length < 50) {
        return {
          valid: false,
          error: 'Não foi possível alterar a imagem do grupo. Formato de arquivo não suportado.',
        };
      }

      // Validação de magic bytes
      const isJpegMagic = buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff;
      const isPngMagic = buffer[0] === 0x89 && buffer[1] === 0x50 && buffer[2] === 0x4e && buffer[3] === 0x47;
      const isWebpMagic = buffer.slice(0, 4).toString() === 'RIFF' && buffer.slice(8, 12).toString() === 'WEBP';

      if (!isJpegMagic && !isPngMagic && !isWebpMagic) {
        return {
          valid: false,
          error: 'Não foi possível alterar a imagem do grupo. Formato de arquivo não suportado.',
        };
      }

      const verifiedMime = isPngMagic ? 'image/png' : isWebpMagic ? 'image/webp' : 'image/jpeg';

      return {
        valid: true,
        payload: rawBase64,
        mimeType: verifiedMime,
        fileSize: buffer.length,
        fileName: `group_pic.${verifiedMime === 'image/png' ? 'png' : verifiedMime === 'image/webp' ? 'webp' : 'jpg'}`,
      };
    } catch {
      return {
        valid: false,
        error: 'Não foi possível alterar a imagem do grupo. Formato de arquivo não suportado.',
      };
    }
  }

  // 3. Caso seja arquivo local salvo no disco (/uploads/... ou uploads/...)
  if (trimmed.startsWith('/uploads/') || trimmed.startsWith('uploads/')) {
    const localRelative = trimmed.replace(/^\//, '');
    const localPath = path.join(process.cwd(), 'public', localRelative);

    if (!fs.existsSync(localPath)) {
      return {
        valid: false,
        error: `Arquivo de imagem do grupo não encontrado no servidor: ${trimmed}`,
      };
    }

    const lowerName = localRelative.toLowerCase();
    const hasValidExt =
      lowerName.endsWith('.jpg') ||
      lowerName.endsWith('.jpeg') ||
      lowerName.endsWith('.png') ||
      lowerName.endsWith('.webp');

    if (!hasValidExt) {
      return {
        valid: false,
        error: 'Não foi possível alterar a imagem do grupo. Formato de arquivo não suportado.',
      };
    }

    try {
      const buffer = fs.readFileSync(localPath);
      if (buffer.length < 50) {
        return {
          valid: false,
          error: 'Não foi possível alterar a imagem do grupo. Formato de arquivo não suportado.',
        };
      }

      // Validação de magic bytes
      const isJpegMagic = buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff;
      const isPngMagic = buffer[0] === 0x89 && buffer[1] === 0x50 && buffer[2] === 0x4e && buffer[3] === 0x47;
      const isWebpMagic = buffer.slice(0, 4).toString() === 'RIFF' && buffer.slice(8, 12).toString() === 'WEBP';

      if (!isJpegMagic && !isPngMagic && !isWebpMagic) {
        return {
          valid: false,
          error: 'Não foi possível alterar a imagem do grupo. Formato de arquivo não suportado.',
        };
      }

      const verifiedMime = isPngMagic ? 'image/png' : isWebpMagic ? 'image/webp' : 'image/jpeg';
      const base64Data = buffer.toString('base64');

      return {
        valid: true,
        payload: base64Data,
        mimeType: verifiedMime,
        fileSize: buffer.length,
        fileName: path.basename(localPath),
      };
    } catch (readErr: any) {
      return {
        valid: false,
        error: `Erro ao ler arquivo local da imagem do grupo: ${readErr.message}`,
      };
    }
  }

  return {
    valid: false,
    error: 'Não foi possível alterar a imagem do grupo. Formato de arquivo não suportado.',
  };
}

/**
 * Regra do Hashtag (#) para alteração de nomes de grupos:
 * Caso o nome do seu grupo contenha o seguinte caractere especial '#' (hashtag),
 * quando você alterar o nome do seu grupo, o caractere especial, '#' (hashtag)
 * permanecerá junto com os elementos que o seguem.
 * 
 * Exemplo:
 * Nome do grupo: Lançamento #10
 * Novo nome digitado: Vagas abertas
 * Resultado final: Vagas abertas #10
 */
export function computeGroupNameWithHashtagRule(currentName: string, newName: string): string {
  const trimmedNew = (newName || '').trim();
  if (!trimmedNew) return currentName || '';

  if (!currentName || !currentName.includes('#')) {
    return trimmedNew;
  }

  // Se o novo nome digitado pelo usuário já contém '#', respeita a digitação
  if (trimmedNew.includes('#')) {
    return trimmedNew;
  }

  const hashIndex = currentName.indexOf('#');
  const hashPart = currentName.slice(hashIndex).trim(); // ex: "#10" ou "#05 - VIP"

  return `${trimmedNew} ${hashPart}`;
}

export const whatsappGroupService = new WhatsappGroupService();
