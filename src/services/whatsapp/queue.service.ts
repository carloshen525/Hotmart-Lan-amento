import { prisma } from '@/lib/prisma';
import { messageManager } from '@/services/messaging';
import { whatsappGroupService } from '@/services/whatsapp/group.service';

export interface EnqueueWhatsappOptions {
  tenantId: string;
  whatsappInstanceId?: string | null;
  contactId?: string | null;
  phone: string;
  contactName?: string | null;
  recipientType?: 'INDIVIDUAL' | 'GROUP';
  groupJid?: string | null;
  groupEnrollmentId?: string | null;
  messageType?: string;
  text?: string | null;
  mediaUrl?: string | null;
  mediaBase64?: string | null;
  mediaMimeType?: string | null;
  mediaFileName?: string | null;
  caption?: string | null;
  blocks?: any[] | null;
  variables?: Record<string, string> | null;
  enrollmentId?: string | null;
  nodeId?: string | null;
  automationId?: string | null;
  maxAttempts?: number;
  fixedDelaySeconds?: number;
  useRandomDelay?: boolean;
  minDelaySeconds?: number;
  maxDelaySeconds?: number;
  forceImmediate?: boolean;
}

export interface WhatsappQueueStats {
  pendingCount: number;
  processingCount: number;
  sentCount: number;
  failedCount: number;
  totalCount: number;
  currentlySending: {
    id: string;
    phone: string;
    contactName: string | null;
    instanceName: string | null;
    startedAt: string | null;
  } | null;
  nextScheduled: {
    id: string;
    phone: string;
    contactName: string | null;
    scheduledAt: string;
    secondsLeft: number;
  } | null;
  recentItems: Array<{
    id: string;
    phone: string;
    contactName: string | null;
    messageType: string;
    status: string;
    scheduledAt: string;
    sentAt: string | null;
    attempts: number;
    error: string | null;
  }>;
}

export class WhatsappQueueService {
  // Lock de concorrência com timestamp por instância: previne workers duplicados e limpa locks estagnados
  private static processingInstances = new Map<string, number>();

  private static isInstanceLocked(key: string): boolean {
    const lastActive = this.processingInstances.get(key);
    if (!lastActive) return false;
    // Se o worker estiver inativo há mais de 45 segundos, considera estagnado e libera
    if (Date.now() - lastActive > 45000) {
      this.processingInstances.delete(key);
      return false;
    }
    return true;
  }

  /**
   * Garante a criação da tabela whatsapp_queue e das colunas de cadência na tabela de instâncias
   */
  static async ensureQueueTable(): Promise<void> {
    try {
      await prisma.$executeRawUnsafe(`
        CREATE TABLE IF NOT EXISTS whatsapp_queue (
          id TEXT PRIMARY KEY,
          tenant_id TEXT NOT NULL,
          whatsapp_instance_id TEXT,
          contact_id TEXT,
          phone TEXT NOT NULL,
          contact_name TEXT,
          message_type TEXT NOT NULL DEFAULT 'text',
          text TEXT,
          media_url TEXT,
          media_base64 TEXT,
          media_mime_type TEXT,
          media_file_name TEXT,
          caption TEXT,
          blocks TEXT,
          variables TEXT,
          enrollment_id TEXT,
          node_id TEXT,
          automation_id TEXT,
          status TEXT NOT NULL DEFAULT 'PENDING',
          scheduled_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
          sent_at DATETIME,
          attempts INTEGER NOT NULL DEFAULT 0,
          max_attempts INTEGER NOT NULL DEFAULT 3,
          error_message TEXT,
          metadata TEXT,
          created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
          updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
        );
      `);

      await prisma.$executeRawUnsafe(`
        CREATE INDEX IF NOT EXISTS idx_whatsapp_queue_tenant_status ON whatsapp_queue (tenant_id, status);
      `);
      await prisma.$executeRawUnsafe(`
        CREATE INDEX IF NOT EXISTS idx_whatsapp_queue_status_sched ON whatsapp_queue (status, scheduled_at);
      `);
      await prisma.$executeRawUnsafe(`
        CREATE INDEX IF NOT EXISTS idx_whatsapp_queue_inst_status ON whatsapp_queue (whatsapp_instance_id, status);
      `);

      // Garante colunas de cadência na tabela WhatsappInstance caso ainda não existam
      try {
        const cols: any = await prisma.$queryRawUnsafe(`PRAGMA table_info("WhatsappInstance");`);
        const colSet = new Set((cols || []).map((c: any) => c.name));
        if (!colSet.has('fixed_delay_seconds')) {
          await prisma.$executeRawUnsafe(`ALTER TABLE "WhatsappInstance" ADD COLUMN fixed_delay_seconds INTEGER DEFAULT 30;`);
        }
        if (!colSet.has('use_random_delay')) {
          await prisma.$executeRawUnsafe(`ALTER TABLE "WhatsappInstance" ADD COLUMN use_random_delay BOOLEAN DEFAULT 1;`);
        }
        if (!colSet.has('min_delay_seconds')) {
          await prisma.$executeRawUnsafe(`ALTER TABLE "WhatsappInstance" ADD COLUMN min_delay_seconds INTEGER DEFAULT 20;`);
        }
        if (!colSet.has('max_delay_seconds')) {
          await prisma.$executeRawUnsafe(`ALTER TABLE "WhatsappInstance" ADD COLUMN max_delay_seconds INTEGER DEFAULT 45;`);
        }
      } catch {}

      // Limpeza de itens duplicados PENDING remanescentes criados indevidamente
      try {
        await prisma.$executeRawUnsafe(`
          DELETE FROM whatsapp_queue
          WHERE status = 'PENDING'
          AND node_id IS NOT NULL
          AND rowid NOT IN (
            SELECT MIN(rowid)
            FROM whatsapp_queue
            WHERE status = 'PENDING' AND node_id IS NOT NULL
            GROUP BY tenant_id, node_id, phone, COALESCE(group_enrollment_id, '')
          );
        `);
      } catch {}
    } catch (err: any) {
      console.warn('[WhatsappQueueService] Aviso em ensureQueueTable:', err.message);
    }
  }

  /**
   * Enfileira uma mensagem respeitando o delay/cadência configurado entre contatos
   */
  static async enqueue(options: EnqueueWhatsappOptions): Promise<string> {
    await this.ensureQueueTable();

    const {
      tenantId,
      whatsappInstanceId,
      contactId,
      phone,
      contactName,
      recipientType: rawRecipientType,
      groupJid: rawGroupJid,
      groupEnrollmentId = null,
      messageType = 'text',
      text,
      mediaUrl,
      mediaBase64,
      mediaMimeType,
      mediaFileName,
      caption,
      blocks,
      variables,
      enrollmentId,
      nodeId,
      automationId,
      maxAttempts = 3,
      forceImmediate = false,
    } = options;

    const recipientType = rawRecipientType || (rawGroupJid || phone.includes('@g.us') ? 'GROUP' : 'INDIVIDUAL');
    const groupJid = rawGroupJid || (recipientType === 'GROUP' ? phone : null);

    if (!tenantId) {
      throw new Error('tenantId é obrigatório para enfileirar mensagem de WhatsApp.');
    }
    if (!phone) {
      throw new Error('phone é obrigatório para enfileirar mensagem de WhatsApp.');
    }

    // GUARDA ANTI-DUPLICAÇÃO ESTRITA:
    // Impede enfileiramento repetido da mesma etapa para o mesmo grupo ou lead
    if (tenantId && nodeId && (groupEnrollmentId || groupJid || phone || enrollmentId)) {
      const dedupFilter: any = {
        tenantId,
        nodeId,
        status: { in: ['PENDING', 'PROCESSING', 'SENT'] },
      };

      if (groupEnrollmentId) {
        dedupFilter.groupEnrollmentId = groupEnrollmentId;
      } else if (groupJid) {
        dedupFilter.groupJid = groupJid;
      } else if (enrollmentId) {
        dedupFilter.enrollmentId = enrollmentId;
      } else if (phone) {
        dedupFilter.phone = phone;
      }

      let existingQueueItem: any = null;
      try {
        if ((prisma as any).whatsappQueue) {
          existingQueueItem = await (prisma as any).whatsappQueue.findFirst({
            where: dedupFilter,
            orderBy: { createdAt: 'desc' },
          });
        }
      } catch {}

      if (!existingQueueItem) {
        try {
          const rows: any = await prisma.$queryRawUnsafe(`
            SELECT id, status FROM whatsapp_queue
            WHERE tenant_id = ? AND node_id = ? AND phone = ?
            AND status IN ('PENDING', 'PROCESSING', 'SENT')
            LIMIT 1;
          `, tenantId, nodeId, phone);
          if (Array.isArray(rows) && rows.length > 0) existingQueueItem = rows[0];
        } catch {}
      }

      if (existingQueueItem) {
        console.warn(
          `[WhatsappQueueService] 🛑 BLOQUEIO ANTI-DUPLICAÇÃO: Mensagem para nó ${nodeId} e destino ${phone} já existe na fila (id: ${existingQueueItem.id}, status: ${existingQueueItem.status}). Ignorando duplicação.`
        );
        return existingQueueItem.id;
      }
    }

    // 1. Busca configurações de delay da instância do WhatsApp
    let fixedDelay = options.fixedDelaySeconds ?? 30;
    let useRandom = options.useRandomDelay ?? true;
    let minDelay = options.minDelaySeconds ?? 20;
    let maxDelay = options.maxDelaySeconds ?? 45;

    if (whatsappInstanceId) {
      try {
        const inst = await prisma.whatsappInstance.findUnique({
          where: { id: whatsappInstanceId },
          select: {
            fixedDelaySeconds: true,
            useRandomDelay: true,
            minDelaySeconds: true,
            maxDelaySeconds: true,
          },
        });
        if (inst) {
          if (options.fixedDelaySeconds === undefined && inst.fixedDelaySeconds != null) {
            fixedDelay = inst.fixedDelaySeconds;
          }
          if (options.useRandomDelay === undefined && inst.useRandomDelay != null) {
            useRandom = inst.useRandomDelay;
          }
          if (options.minDelaySeconds === undefined && inst.minDelaySeconds != null) {
            minDelay = inst.minDelaySeconds;
          }
          if (options.maxDelaySeconds === undefined && inst.maxDelaySeconds != null) {
            maxDelay = inst.maxDelaySeconds;
          }
        }
      } catch {}
    }

    // Garante limites sãos
    if (minDelay < 1) minDelay = 1;
    if (maxDelay < minDelay) maxDelay = minDelay;
    if (fixedDelay < 1) fixedDelay = 1;

    // 2. Calcula data/hora de agendamento (scheduledAt)
    let scheduledAt = new Date();

    if (!forceImmediate) {
      // Busca a última mensagem agendada ou em processamento para esta instância do WhatsApp
      let lastItem: any = null;
      try {
        if ((prisma as any).whatsappQueue) {
          lastItem = await (prisma as any).whatsappQueue.findFirst({
            where: {
              tenantId,
              whatsappInstanceId: whatsappInstanceId || null,
              status: { in: ['PENDING', 'PROCESSING'] },
            },
            orderBy: { scheduledAt: 'desc' },
          });
        }
      } catch {
        // Fallback SQL
        const rows: any = await prisma.$queryRawUnsafe(`
          SELECT * FROM whatsapp_queue 
          WHERE tenant_id = ? AND (whatsapp_instance_id = ? OR whatsapp_instance_id IS NULL)
          AND status IN ('PENDING', 'PROCESSING')
          ORDER BY scheduled_at DESC LIMIT 1
        `, tenantId, whatsappInstanceId || null);
        if (Array.isArray(rows) && rows.length > 0) lastItem = rows[0];
      }

      const nowTime = Date.now();
      if (lastItem) {
        const lastScheduledTime = new Date(lastItem.scheduledAt || lastItem.scheduled_at).getTime();
        const baseTime = Math.max(nowTime, lastScheduledTime);

        // Regra de Ouro: Delay é entre destinatários diferentes (contatos ou grupos diferentes)
        const isGroupItem = recipientType === 'GROUP' || (phone && phone.includes('@g.us'));
        const lastPhone = lastItem.phone;
        const lastContactId = lastItem.contactId || lastItem.contact_id;
        const lastRecipientType = lastItem.recipientType || lastItem.recipient_type || (lastPhone && lastPhone.includes('@g.us') ? 'GROUP' : 'INDIVIDUAL');
        const lastGroupJid = lastItem.groupJid || lastItem.group_jid || (lastRecipientType === 'GROUP' ? lastPhone : null);

        let isSameDestination = false;
        if (isGroupItem || lastRecipientType === 'GROUP') {
          isSameDestination = Boolean(groupJid && lastGroupJid && groupJid === lastGroupJid);
        } else {
          isSameDestination =
            (contactId && lastContactId && contactId === lastContactId) ||
            (phone && lastPhone && phone.replace(/\D/g, '') === lastPhone.replace(/\D/g, ''));
        }

        if (isSameDestination) {
          // Mesmo destino: delay mínimo de segurança (1s)
          scheduledAt = new Date(baseTime + 1000);
        } else {
          // Destinatário diferente: aplica cadência anti-bloqueio configurada!
          let delaySeconds = fixedDelay;
          if (useRandom) {
            delaySeconds = Math.floor(Math.random() * (maxDelay - minDelay + 1)) + minDelay;
          }
          scheduledAt = new Date(baseTime + delaySeconds * 1000);
        }
      } else {
        // Fila estava vazia: primeiro disparo imediato
        scheduledAt = new Date(nowTime);
      }
    }

    // 3. Salva no banco de dados
    const id = `wq_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
    const blocksJson = blocks ? JSON.stringify(blocks) : null;
    const varsJson = variables ? JSON.stringify(variables) : null;

    try {
      if ((prisma as any).whatsappQueue) {
        const created = await (prisma as any).whatsappQueue.create({
          data: {
            id,
            tenantId,
            whatsappInstanceId: whatsappInstanceId || null,
            contactId: contactId || null,
            phone,
            contactName: contactName || null,
            recipientType,
            groupJid: groupJid || null,
            groupEnrollmentId: groupEnrollmentId || null,
            messageType,
            text: text || null,
            mediaUrl: mediaUrl || null,
            mediaBase64: mediaBase64 || null,
            mediaMimeType: mediaMimeType || null,
            mediaFileName: mediaFileName || null,
            caption: caption || null,
            blocks: blocksJson,
            variables: varsJson,
            enrollmentId: enrollmentId || null,
            nodeId: nodeId || null,
            automationId: automationId || null,
            status: 'PENDING',
            scheduledAt,
            attempts: 0,
            maxAttempts,
          },
        });

        // Desperta o worker em segundo plano para esta instância
        this.wakeWorker(whatsappInstanceId || null);

        return created.id;
      }
    } catch (err: any) {
      console.warn('[WhatsappQueueService] Fallback SQL ao criar item na fila:', err.message);
    }

    // Fallback SQL
    await prisma.$executeRawUnsafe(
      `
      INSERT INTO whatsapp_queue (
        id, tenant_id, whatsapp_instance_id, contact_id, phone, contact_name,
        recipient_type, group_jid, group_enrollment_id,
        message_type, text, media_url, media_base64, media_mime_type, media_file_name,
        caption, blocks, variables, enrollment_id, node_id, automation_id,
        status, scheduled_at, attempts, max_attempts, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'PENDING', ?, 0, ?, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
      `,
      id,
      tenantId,
      whatsappInstanceId || null,
      contactId || null,
      phone,
      contactName || null,
      recipientType,
      groupJid || null,
      groupEnrollmentId || null,
      messageType,
      text || null,
      mediaUrl || null,
      mediaBase64 || null,
      mediaMimeType || null,
      mediaFileName || null,
      caption || null,
      blocksJson,
      varsJson,
      enrollmentId || null,
      nodeId || null,
      automationId || null,
      scheduledAt.toISOString(),
      maxAttempts
    );

    this.wakeWorker(whatsappInstanceId || null);
    return id;
  }

  /**
   * Dispara o processador em segundo plano de forma não-bloqueante
   */
  static wakeWorker(whatsappInstanceId?: string | null): void {
    const key = whatsappInstanceId || '__DEFAULT__';
    if (this.isInstanceLocked(key)) {
      return; // Já tem worker ativo processando ordenadamente
    }

    // Inicia loop em background sem aguardar a promise
    void this.processQueueLoop(whatsappInstanceId || null);
  }

  /**
   * Loop do worker da instância: garante que 1 único processo envie mensagens daquela instância,
   * respeitando a ordem FIFO estrita e os horários agendados com atraso entre contatos.
   */
  static async processQueueLoop(whatsappInstanceId: string | null): Promise<void> {
    const key = whatsappInstanceId || '__DEFAULT__';
    if (this.isInstanceLocked(key)) {
      return;
    }

    this.processingInstances.set(key, Date.now());

    try {
      while (true) {
        this.processingInstances.set(key, Date.now());
        const now = new Date();

        // 1. Busca a próxima mensagem da fila desta instância
        let nextItem: any = null;
        try {
          if ((prisma as any).whatsappQueue) {
            nextItem = await (prisma as any).whatsappQueue.findFirst({
              where: {
                whatsappInstanceId: whatsappInstanceId || null,
                status: 'PENDING',
              },
              orderBy: [
                { scheduledAt: 'asc' },
                { createdAt: 'asc' },
              ],
            });
          }
        } catch {
          const rows: any = await prisma.$queryRawUnsafe(`
            SELECT * FROM whatsapp_queue
            WHERE (whatsapp_instance_id = ? OR (whatsapp_instance_id IS NULL AND ? IS NULL))
            AND status = 'PENDING'
            ORDER BY scheduled_at ASC, created_at ASC
            LIMIT 1
          `, whatsappInstanceId, whatsappInstanceId);
          if (Array.isArray(rows) && rows.length > 0) nextItem = rows[0];
        }

        // Se não há mensagens pendentes, o worker encerra seu ciclo
        if (!nextItem) {
          break;
        }

        const scheduledAt = new Date(nextItem.scheduledAt || nextItem.scheduled_at);
        const waitMs = scheduledAt.getTime() - Date.now();

        // Se a mensagem ainda não atingiu o horário agendado de envio
        if (waitMs > 0) {
          // Se o atraso for menor ou igual a 60 segundos, o worker aguarda o tempo exato
          if (waitMs <= 60000) {
            await new Promise((r) => setTimeout(r, waitMs));
          } else {
            // Atraso longo (> 1 minuto): libera o worker para não segurar processo desnecessariamente.
            // O próximo agendador/cron (/api/jobs/process) acordará o worker quando o momento chegar.
            break;
          }
        }

        // 2. Tenta reservar atomicamente o item para 'PROCESSING'
        let claimed = false;
        try {
          if ((prisma as any).whatsappQueue) {
            const updateRes = await (prisma as any).whatsappQueue.updateMany({
              where: {
                id: nextItem.id,
                status: 'PENDING',
              },
              data: {
                status: 'PROCESSING',
                updatedAt: new Date(),
              },
            });
            claimed = updateRes.count > 0;
          }
        } catch {}

        if (!claimed) {
          const updateCount = await prisma.$executeRawUnsafe(`
            UPDATE whatsapp_queue
            SET status = 'PROCESSING', updated_at = CURRENT_TIMESTAMP
            WHERE id = ? AND status = 'PENDING'
          `, nextItem.id);
          claimed = (updateCount as number) > 0;
        }

        if (!claimed) {
          continue; // Já foi pego por outro fluxo ou cancelado
        }

        // 3. Executa o disparo da mensagem
        await this.dispatchItem(nextItem);
      }
    } catch (err: any) {
      console.error(`[WhatsappQueueService] Erro no loop da instância ${key}:`, err.message);
    } finally {
      this.processingInstances.delete(key);
    }
  }

  /**
   * Envia fisicamente a mensagem e conclui a etapa na automação
   */
  private static async dispatchItem(item: any): Promise<void> {
    const rawBlocks = item.blocks ? (typeof item.blocks === 'string' ? JSON.parse(item.blocks) : item.blocks) : null;
    const rawVars = item.variables ? (typeof item.variables === 'string' ? JSON.parse(item.variables) : item.variables) : {};

    const isGroup = item.recipientType === 'GROUP' || (item.phone && item.phone.includes('@g.us'));
    if (isGroup) {
      const tenantId = item.tenantId || item.tenant_id;
      const jid = item.groupJid || item.phone;
      const instanceId = item.whatsappInstanceId || item.whatsapp_instance_id;

      // Validação obrigatória e em tempo real de Administrador antes do envio
      const check = await whatsappGroupService.verifyGroupEligibility(tenantId, jid, instanceId);
      if (!check.eligible) {
        const errorMsg = `Envio para grupo abortado: ${check.reason || 'Instância sem privilégios de administrador ou desconectada.'}`;
        console.warn(`[WhatsappQueueService] ${errorMsg} (JID: ${jid})`);

        await prisma.whatsappQueue.update({
          where: { id: item.id },
          data: {
            status: 'FAILED',
            errorMessage: errorMsg,
            attempts: (item.attempts || 0) + 1,
            updatedAt: new Date(),
          },
        }).catch(() => {});

        const groupEnrollmentId = item.groupEnrollmentId || item.group_enrollment_id;
        const nodeId = item.nodeId || item.node_id;
        if (groupEnrollmentId && nodeId) {
          await prisma.automationGroupStepLog.create({
            data: {
              enrollmentId: groupEnrollmentId,
              groupId: check.group?.id || item.contactId || item.contact_id || item.id,
              tenantId,
              nodeId,
              nodeType: 'whatsapp',
              action: 'SEND_GROUP_WHATSAPP_FAILED',
              status: 'FAILED',
              details: JSON.stringify({ error: errorMsg, reason: check.reason }),
            },
          }).catch(() => {});
        }

        return; // Interrompe o envio para este grupo!
      }
    }

    // Guarda de Segurança Final: impede disparo duplicado de item já enviado anteriormente
    const groupEnrollmentId = item.groupEnrollmentId || item.group_enrollment_id;
    const nodeId = item.nodeId || item.node_id;
    const tenantId = item.tenantId || item.tenant_id;
    const destination = item.groupJid || item.phone;

    if (nodeId && (groupEnrollmentId || destination)) {
      let alreadySent: any = null;
      try {
        if ((prisma as any).whatsappQueue) {
          alreadySent = await (prisma as any).whatsappQueue.findFirst({
            where: {
              tenantId,
              nodeId,
              status: 'SENT',
              ...(groupEnrollmentId ? { groupEnrollmentId } : { phone: destination }),
              id: { not: item.id },
            },
          });
        }
      } catch {}

      if (alreadySent) {
        console.warn(
          `[WhatsappQueueService] 🛑 CANCELANDO DISPARO DUPLICADO: O nó ${nodeId} já foi enviado anteriormente para ${destination} (item ${alreadySent.id}). Cancelando item atual ${item.id}.`
        );
        try {
          if ((prisma as any).whatsappQueue) {
            await (prisma as any).whatsappQueue.update({
              where: { id: item.id },
              data: {
                status: 'CANCELLED',
                errorMessage: 'Cancelado automaticamente: mensagem já enviada anteriormente (anti-duplicação)',
              },
            });
          }
        } catch {}
        return;
      }
    }

    let success = false;
    let errorMessage = '';

    try {
      if (Array.isArray(rawBlocks) && rawBlocks.length > 0) {
        // Envio de múltiplos blocos em sequência para este contato
        for (let i = 0; i < rawBlocks.length; i++) {
          const b = rawBlocks[i];
          if (i > 0) {
            await new Promise((r) => setTimeout(r, 600));
          }
          const isMedia = b.type !== 'text';
          const sendRes = await messageManager.sendWhatsApp({
            tenantId: item.tenantId || item.tenant_id,
            contactId: item.contactId || item.contact_id || undefined,
            phone: item.phone,
            whatsappInstanceId: item.whatsappInstanceId || item.whatsapp_instance_id || undefined,
            text: isMedia ? (b.caption || '') : (b.text || ''),
            messageType: (['image', 'video', 'audio', 'document', 'file'].includes(b.type) ? b.type : (isMedia ? 'image' : 'text')) as any,
            mediaUrl: isMedia ? b.mediaUrl : undefined,
            mediaBase64: isMedia ? b.mediaBase64 : undefined,
            mediaMimeType: isMedia ? b.mediaMimeType : undefined,
            mediaFileName: isMedia ? b.mediaFileName : undefined,
            caption: isMedia ? b.caption : undefined,
            variables: rawVars,
          });

          if (!sendRes || sendRes.success === false) {
            throw new Error(sendRes?.error || 'Falha no envio de bloco via WhatsApp');
          }
        }
        success = true;
      } else {
        // Envio de mensagem única
        const sendRes = await messageManager.sendWhatsApp({
          tenantId: item.tenantId || item.tenant_id,
          contactId: item.contactId || item.contact_id || undefined,
          phone: item.phone,
          whatsappInstanceId: item.whatsappInstanceId || item.whatsapp_instance_id || undefined,
          text: item.text || item.caption || 'Olá!',
          messageType: item.messageType || item.message_type || 'text',
          mediaUrl: item.mediaUrl || item.media_url || undefined,
          mediaBase64: item.mediaBase64 || item.media_base64 || undefined,
          mediaMimeType: item.mediaMimeType || item.media_mime_type || undefined,
          mediaFileName: item.mediaFileName || item.media_file_name || undefined,
          caption: item.caption || item.text || undefined,
          variables: rawVars,
        });

        if (sendRes && sendRes.success) {
          success = true;
        } else {
          throw new Error(sendRes?.error || 'Falha no envio via WhatsApp');
        }
      }
    } catch (err: any) {
      errorMessage = err.message || 'Erro desconhecido no envio de WhatsApp';
      success = false;
    }

    const currentAttempts = (item.attempts || 0) + 1;
    const maxAttempts = item.maxAttempts || item.max_attempts || 3;

    if (success) {
      // 4. Marca item como SENT com sucesso
      try {
        if ((prisma as any).whatsappQueue) {
          await (prisma as any).whatsappQueue.update({
            where: { id: item.id },
            data: {
              status: 'SENT',
              sentAt: new Date(),
              attempts: currentAttempts,
              errorMessage: null,
            },
          });
        }
      } catch {}

      await prisma.$executeRawUnsafe(`
        UPDATE whatsapp_queue
        SET status = 'SENT', sent_at = CURRENT_TIMESTAMP, attempts = ?, error_message = NULL, updated_at = CURRENT_TIMESTAMP
        WHERE id = ?
      `, currentAttempts, item.id);

      // Cancela quaisquer duplicatas PENDING remanescentes para o mesmo nó e destino
      if (nodeId && (groupEnrollmentId || destination)) {
        try {
          if ((prisma as any).whatsappQueue) {
            await (prisma as any).whatsappQueue.updateMany({
              where: {
                tenantId,
                nodeId,
                status: 'PENDING',
                ...(groupEnrollmentId ? { groupEnrollmentId } : { phone: destination }),
                id: { not: item.id },
              },
              data: {
                status: 'CANCELLED',
                errorMessage: 'Cancelado automaticamente: duplicata detectada na fila',
              },
            });
          }
        } catch {}
      }

      // 5. Se pertencer a uma automação, atualiza o log da etapa para SUCCESS e avança o fluxo
      const enrollmentId = item.enrollmentId || item.enrollment_id;
      const automationId = item.automationId || item.automation_id;
      const contactId = item.contactId || item.contact_id;

      if (nodeId && (enrollmentId || contactId)) {
        try {
          await prisma.automationStepLog.updateMany({
            where: {
              nodeId,
              ...(enrollmentId ? { enrollmentId } : { contactId }),
              status: { in: ['QUEUED', 'PROCESSING'] },
            },
            data: {
              status: 'SUCCESS',
              details: JSON.stringify({
                phone: item.phone,
                sentAt: new Date().toISOString(),
                queueItemId: item.id,
              }),
            },
          });

          // Avança dinamicamente para os próximos nós conectados no fluxo
          const { automationEngine } = await import('@/services/automation/engine');
          await automationEngine.advanceFromSubflowNode(enrollmentId, nodeId, tenantId, automationId);
        } catch (advErr: any) {
          console.error('[WhatsappQueueService] Erro ao avançar automação após envio:', advErr.message);
        }
      }

      if (nodeId && groupEnrollmentId) {
        try {
          await prisma.automationGroupStepLog.updateMany({
            where: {
              nodeId,
              enrollmentId: groupEnrollmentId,
              status: { in: ['QUEUED', 'PROCESSING'] },
            },
            data: {
              status: 'SUCCESS',
              details: JSON.stringify({
                groupJid: item.phone,
                sentAt: new Date().toISOString(),
                queueItemId: item.id,
              }),
            },
          });

          // Avança dinamicamente para os próximos nós conectados no fluxo de grupo
          const { automationEngine } = await import('@/services/automation/engine');
          await automationEngine.advanceGroupNode(groupEnrollmentId, nodeId, tenantId, automationId);
        } catch (advErr: any) {
          console.error('[WhatsappQueueService] Erro ao avançar automação de grupo após envio:', advErr.message);
        }
      }
    } else {
      // 6. Falha no envio: verifica tentativas
      if (currentAttempts >= maxAttempts) {
        // Falha permanente
        try {
          if ((prisma as any).whatsappQueue) {
            await (prisma as any).whatsappQueue.update({
              where: { id: item.id },
              data: {
                status: 'FAILED',
                attempts: currentAttempts,
                errorMessage,
              },
            });
          }
        } catch {}

        await prisma.$executeRawUnsafe(`
          UPDATE whatsapp_queue
          SET status = 'FAILED', attempts = ?, error_message = ?, updated_at = CURRENT_TIMESTAMP
          WHERE id = ?
        `, currentAttempts, errorMessage, item.id);

        const enrollmentId = item.enrollmentId || item.enrollment_id;
        const contactId = item.contactId || item.contact_id;
        const nodeId = item.nodeId || item.node_id;
        if (nodeId && (enrollmentId || contactId)) {
          await prisma.automationStepLog.updateMany({
            where: {
              nodeId,
              ...(enrollmentId ? { enrollmentId } : { contactId }),
              status: { in: ['QUEUED', 'PROCESSING'] },
            },
            data: {
              status: 'FAILED',
              details: JSON.stringify({ error: errorMessage, attempts: currentAttempts }),
            },
          });
        }
      } else {
        // Re-agenda para nova tentativa em 20 segundos
        const retryAt = new Date(Date.now() + 20000);
        await prisma.$executeRawUnsafe(`
          UPDATE whatsapp_queue
          SET status = 'PENDING', scheduled_at = ?, attempts = ?, error_message = ?, updated_at = CURRENT_TIMESTAMP
          WHERE id = ?
        `, retryAt.toISOString(), currentAttempts, errorMessage, item.id);
      }
    }
  }

  /**
   * Processa itens vencidos em lote (acionado por endpoints cron ou manual)
   */
  static async processBatch(options: { tenantId?: string; batchSize?: number } = {}): Promise<{
    processed: number;
    sent: number;
    failed: number;
  }> {
    await this.ensureQueueTable();
    const batchSize = options.batchSize || 10;

    let dueItems: any[] = [];
    try {
      if ((prisma as any).whatsappQueue) {
        dueItems = await (prisma as any).whatsappQueue.findMany({
          where: {
            status: 'PENDING',
            scheduledAt: { lte: new Date() },
            ...(options.tenantId ? { tenantId: options.tenantId } : {}),
          },
          orderBy: [
            { scheduledAt: 'asc' },
            { createdAt: 'asc' },
          ],
          take: batchSize,
        });
      }
    } catch {
      const rows: any = await prisma.$queryRawUnsafe(`
        SELECT * FROM whatsapp_queue
        WHERE status = 'PENDING' AND scheduled_at <= CURRENT_TIMESTAMP
        ORDER BY scheduled_at ASC, created_at ASC
        LIMIT ?
      `, batchSize);
      if (Array.isArray(rows)) dueItems = rows;
    }

    let sent = 0;
    let failed = 0;

    const seenKeys = new Set<string>();
    for (const item of dueItems) {
      // Dispara worker para a instância do item de forma garantida
      const instanceId = item.whatsappInstanceId || item.whatsapp_instance_id || null;
      const key = instanceId || '__DEFAULT__';
      if (!seenKeys.has(key)) {
        seenKeys.add(key);
        this.wakeWorker(instanceId);
      }
      sent++;
    }

    // Se houver qualquer item vencido mas nenhum worker ativo para a chave default, acorda preventivamente
    if (dueItems.length > 0 && !seenKeys.has('__DEFAULT__')) {
      this.wakeWorker(null);
    }

    return { processed: dueItems.length, sent, failed };
  }

  /**
   * Obtém estatísticas e status ao vivo da fila para exibição no painel
   */
  static async getQueueStats(tenantId: string, whatsappInstanceId?: string | null): Promise<WhatsappQueueStats> {
    await this.ensureQueueTable();

    try {
      let pendingCount = 0;
      let processingCount = 0;
      let sentCount = 0;
      let failedCount = 0;

      if ((prisma as any).whatsappQueue) {
        const counts = await Promise.all([
          (prisma as any).whatsappQueue.count({
            where: { tenantId, status: 'PENDING', ...(whatsappInstanceId ? { whatsappInstanceId } : {}) },
          }),
          (prisma as any).whatsappQueue.count({
            where: { tenantId, status: 'PROCESSING', ...(whatsappInstanceId ? { whatsappInstanceId } : {}) },
          }),
          (prisma as any).whatsappQueue.count({
            where: { tenantId, status: 'SENT', ...(whatsappInstanceId ? { whatsappInstanceId } : {}) },
          }),
          (prisma as any).whatsappQueue.count({
            where: { tenantId, status: 'FAILED', ...(whatsappInstanceId ? { whatsappInstanceId } : {}) },
          }),
        ]);
        pendingCount = counts[0];
        processingCount = counts[1];
        sentCount = counts[2];
        failedCount = counts[3];
      } else {
        const rows: any = await prisma.$queryRawUnsafe(`
          SELECT status, COUNT(*) as count FROM whatsapp_queue
          WHERE tenant_id = ?
          GROUP BY status
        `, tenantId);
        if (Array.isArray(rows)) {
          for (const r of rows) {
            const count = Number(r.count || 0);
            if (r.status === 'PENDING') pendingCount = count;
            if (r.status === 'PROCESSING') processingCount = count;
            if (r.status === 'SENT') sentCount = count;
            if (r.status === 'FAILED') failedCount = count;
          }
        }
      }

      // Contato sendo enviado no momento
      let currentlySending: any = null;
      try {
        if ((prisma as any).whatsappQueue) {
          currentlySending = await (prisma as any).whatsappQueue.findFirst({
            where: { tenantId, status: 'PROCESSING', ...(whatsappInstanceId ? { whatsappInstanceId } : {}) },
            include: { whatsappInstance: { select: { name: true, phone: true } } },
            orderBy: { updatedAt: 'desc' },
          });
        }
      } catch {}

      // Próxima mensagem agendada
      let nextScheduled: any = null;
      try {
        if ((prisma as any).whatsappQueue) {
          nextScheduled = await (prisma as any).whatsappQueue.findFirst({
            where: { tenantId, status: 'PENDING', ...(whatsappInstanceId ? { whatsappInstanceId } : {}) },
            orderBy: [{ scheduledAt: 'asc' }, { createdAt: 'asc' }],
          });
        }
      } catch {}

      // Últimos itens da fila
      let recentItems: any[] = [];
      try {
        if ((prisma as any).whatsappQueue) {
          recentItems = await (prisma as any).whatsappQueue.findMany({
            where: { tenantId, ...(whatsappInstanceId ? { whatsappInstanceId } : {}) },
            orderBy: { createdAt: 'desc' },
            take: 10,
          });
        }
      } catch {}

      const now = Date.now();
      const nextTime = nextScheduled ? new Date(nextScheduled.scheduledAt).getTime() : 0;
      const secondsLeft = nextScheduled ? Math.max(0, Math.ceil((nextTime - now) / 1000)) : 0;

      return {
        pendingCount,
        processingCount,
        sentCount,
        failedCount,
        totalCount: pendingCount + processingCount + sentCount + failedCount,
        currentlySending: currentlySending
          ? {
              id: currentlySending.id,
              phone: currentlySending.phone,
              contactName: currentlySending.contactName || null,
              instanceName: currentlySending.whatsappInstance?.name || null,
              startedAt: currentlySending.updatedAt?.toISOString() || null,
            }
          : null,
        nextScheduled: nextScheduled
          ? {
              id: nextScheduled.id,
              phone: nextScheduled.phone,
              contactName: nextScheduled.contactName || null,
              scheduledAt: new Date(nextScheduled.scheduledAt).toISOString(),
              secondsLeft,
            }
          : null,
        recentItems: recentItems.map((item) => ({
          id: item.id,
          phone: item.phone,
          contactName: item.contactName || null,
          messageType: item.messageType || 'text',
          status: item.status,
          scheduledAt: new Date(item.scheduledAt).toISOString(),
          sentAt: item.sentAt ? new Date(item.sentAt).toISOString() : null,
          attempts: item.attempts || 0,
          error: item.errorMessage || null,
        })),
      };
    } catch (err: any) {
      console.error('[WhatsappQueueService] Erro em getQueueStats:', err.message);
      return {
        pendingCount: 0,
        processingCount: 0,
        sentCount: 0,
        failedCount: 0,
        totalCount: 0,
        currentlySending: null,
        nextScheduled: null,
        recentItems: [],
      };
    }
  }
}
