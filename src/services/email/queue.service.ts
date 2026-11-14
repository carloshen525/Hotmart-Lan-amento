import { prisma } from '@/lib/prisma';
import { EmailService } from './email.service';
import { EmailOptions, EmailResult } from './types';

export interface EnqueueEmailOptions {
  tenantId: string;
  to: string;
  subject: string;
  html: string;
  scheduledAt?: Date;
  maxAttempts?: number;
  contactId?: string;
  metadata?: any;
}

export interface ProcessQueueOptions {
  batchSize?: number;
  delayMs?: number;
  tenantId?: string;
}

export class EmailQueueService {
  /**
   * Garante a existência da tabela email_queue em bancos SQLite mesmo sem push prévio
   */
  static async ensureQueueTable(): Promise<void> {
    try {
      await prisma.$executeRawUnsafe(`
        CREATE TABLE IF NOT EXISTS email_queue (
          id TEXT PRIMARY KEY,
          tenantId TEXT NOT NULL,
          to_email TEXT NOT NULL,
          subject TEXT NOT NULL,
          html_content TEXT NOT NULL,
          status TEXT NOT NULL DEFAULT 'PENDING',
          attempts INTEGER NOT NULL DEFAULT 0,
          max_attempts INTEGER NOT NULL DEFAULT 3,
          error_message TEXT,
          scheduled_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
          sent_at DATETIME,
          created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
          updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
        );
      `);

      await prisma.$executeRawUnsafe(`
        CREATE INDEX IF NOT EXISTS idx_email_queue_tenant_status ON email_queue (tenantId, status);
      `);
      await prisma.$executeRawUnsafe(`
        CREATE INDEX IF NOT EXISTS idx_email_queue_status_sched ON email_queue (status, scheduled_at);
      `);
    } catch {}
  }

  /**
   * Enfileira um novo e-mail para processamento ordenado e seguro
   */
  static async enqueue(options: EnqueueEmailOptions): Promise<string> {
    const { tenantId, to, subject, html, scheduledAt, maxAttempts = 3 } = options;

    if (!tenantId) {
      throw new Error('Tenant ID é obrigatório para enfileirar e-mail.');
    }
    if (!to || !subject || !html) {
      throw new Error('Destinatário, assunto e conteúdo são obrigatórios para a fila de e-mail.');
    }

    const scheduled = scheduledAt || new Date();

    // 1. Tenta via ORM Prisma se o delegate estiver disponível
    try {
      if ((prisma as any).emailQueue) {
        const item = await (prisma as any).emailQueue.create({
          data: {
            tenantId,
            toEmail: to.trim(),
            subject: subject.trim(),
            htmlContent: html,
            status: 'PENDING',
            attempts: 0,
            maxAttempts,
            scheduledAt: scheduled,
          },
        });
        return item.id;
      }
    } catch {
      // Fallback SQL
    }

    // 2. Fallback SQL resiliente
    await this.ensureQueueTable();
    const id = `eq_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
    const schedIso = scheduled.toISOString();

    await prisma.$executeRawUnsafe(
      `
      INSERT INTO email_queue (id, tenantId, to_email, subject, html_content, status, attempts, max_attempts, scheduled_at, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, 'PENDING', 0, ?, ?, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP);
      `,
      id,
      tenantId,
      to.trim(),
      subject.trim(),
      html,
      maxAttempts,
      schedIso
    );

    return id;
  }

  /**
   * Processador de lote da fila de e-mails (Worker)
   */
  static async processBatch(options: ProcessQueueOptions = {}) {
    const { batchSize = 20, delayMs = 500, tenantId } = options;
    await this.ensureQueueTable();

    const now = new Date();
    let pendingItems: any[] = [];

    // 1. Busca os próximos e-mails pendentes cuja data agendada já chegou
    try {
      if ((prisma as any).emailQueue) {
        pendingItems = await (prisma as any).emailQueue.findMany({
          where: {
            status: 'PENDING',
            scheduledAt: { lte: now },
            ...(tenantId ? { tenantId } : {}),
          },
          orderBy: { scheduledAt: 'asc' },
          take: batchSize,
        });
      }
    } catch {}

    if (!pendingItems || pendingItems.length === 0) {
      // Fallback SQL para buscar pendentes
      try {
        const rows: any[] = await prisma.$queryRawUnsafe(
          `
          SELECT id, tenantId, to_email as toEmail, subject, html_content as htmlContent,
                 status, attempts, max_attempts as maxAttempts, scheduled_at as scheduledAt
          FROM email_queue
          WHERE status = 'PENDING' AND datetime(scheduled_at) <= datetime(?)
          ${tenantId ? `AND tenantId = '${tenantId}'` : ''}
          ORDER BY scheduled_at ASC
          LIMIT ?;
          `,
          now.toISOString(),
          batchSize
        );
        pendingItems = rows || [];
      } catch {
        pendingItems = [];
      }
    }

    if (pendingItems.length === 0) {
      return {
        processed: 0,
        sent: 0,
        failed: 0,
        message: 'Nenhum e-mail pendente na fila para processar.',
      };
    }

    let sentCount = 0;
    let failedCount = 0;

    // 2. Itera sobre cada e-mail do lote com intervalo de segurança entre envios
    for (let i = 0; i < pendingItems.length; i++) {
      const item = pendingItems[i];

      // Marca o item como 'PROCESSING' para evitar concorrência com outros workers
      await this.updateItemStatus(item.id, 'PROCESSING');

      try {
        // Envia utilizando o servidor SMTP exclusivo do tenant do e-mail
        const result: EmailResult = await EmailService.sendDirect(item.tenantId, {
          to: item.toEmail,
          subject: item.subject,
          html: item.htmlContent,
        });

        if (result.success) {
          // Sucesso: marca como 'SENT' e grava horário
          await this.markAsSent(item.id, result.messageId);
          sentCount++;
        } else {
          // Falha: incrementa tentativa e agenda retry ou marca como 'FAILED'
          const nextAttempts = (item.attempts || 0) + 1;
          const max = item.maxAttempts || 3;
          const isFinal = nextAttempts >= max;

          await this.handleFailure(
            item.id,
            nextAttempts,
            isFinal,
            result.error || 'Erro desconhecido ao enviar'
          );
          failedCount++;
        }
      } catch (err: any) {
        const nextAttempts = (item.attempts || 0) + 1;
        const max = item.maxAttempts || 3;
        const isFinal = nextAttempts >= max;

        await this.handleFailure(item.id, nextAttempts, isFinal, err.message);
        failedCount++;
      }

      // Intervalo entre disparos (rate limit) para proteger a reputação do SMTP
      if (delayMs > 0 && i < pendingItems.length - 1) {
        await new Promise((resolve) => setTimeout(resolve, delayMs));
      }
    }

    return {
      processed: pendingItems.length,
      sent: sentCount,
      failed: failedCount,
      message: `${pendingItems.length} e-mail(s) processado(s): ${sentCount} enviado(s) com sucesso, ${failedCount} com falha/reagendamento.`,
    };
  }

  /**
   * Atualiza status de um item na fila
   */
  private static async updateItemStatus(id: string, status: string): Promise<void> {
    try {
      if ((prisma as any).emailQueue) {
        await (prisma as any).emailQueue.update({
          where: { id },
          data: { status, updatedAt: new Date() },
        });
        return;
      }
    } catch {}

    await prisma.$executeRawUnsafe(
      `UPDATE email_queue SET status = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?;`,
      status,
      id
    );
  }

  /**
   * Marca item como enviado com sucesso
   */
  private static async markAsSent(id: string, messageId?: string): Promise<void> {
    const now = new Date();
    try {
      if ((prisma as any).emailQueue) {
        await (prisma as any).emailQueue.update({
          where: { id },
          data: {
            status: 'SENT',
            sentAt: now,
            errorMessage: null,
            updatedAt: now,
          },
        });
        return;
      }
    } catch {}

    await prisma.$executeRawUnsafe(
      `UPDATE email_queue SET status = 'SENT', sent_at = CURRENT_TIMESTAMP, error_message = NULL, updated_at = CURRENT_TIMESTAMP WHERE id = ?;`,
      id
    );
  }

  /**
   * Trata falha no envio: reagenda com backoff ou marca como FAILED
   */
  private static async handleFailure(
    id: string,
    attempts: number,
    isFinal: boolean,
    error: string
  ): Promise<void> {
    const now = new Date();
    if (isFinal) {
      // Esgotou tentativas: FAILED
      try {
        if ((prisma as any).emailQueue) {
          await (prisma as any).emailQueue.update({
            where: { id },
            data: {
              status: 'FAILED',
              attempts,
              errorMessage: error,
              updatedAt: now,
            },
          });
          return;
        }
      } catch {}

      await prisma.$executeRawUnsafe(
        `UPDATE email_queue SET status = 'FAILED', attempts = ?, error_message = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?;`,
        attempts,
        error,
        id
      );
    } else {
      // Reagenda para daqui a 2 minutos * tentativa (backoff simples)
      const delayMinutes = Math.min(10, attempts * 2);
      const nextScheduled = new Date(now.getTime() + delayMinutes * 60 * 1000);

      try {
        if ((prisma as any).emailQueue) {
          await (prisma as any).emailQueue.update({
            where: { id },
            data: {
              status: 'PENDING',
              attempts,
              scheduledAt: nextScheduled,
              errorMessage: error,
              updatedAt: now,
            },
          });
          return;
        }
      } catch {}

      await prisma.$executeRawUnsafe(
        `UPDATE email_queue SET status = 'PENDING', attempts = ?, scheduled_at = ?, error_message = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?;`,
        attempts,
        nextScheduled.toISOString(),
        error,
        id
      );
    }
  }

  /**
   * Obtém estatísticas e resumo da fila de e-mails
   */
  static async getQueueStats(tenantId?: string) {
    await this.ensureQueueTable();

    try {
      const rows: any[] = await prisma.$queryRawUnsafe(`
        SELECT status, COUNT(*) as count
        FROM email_queue
        ${tenantId ? `WHERE tenantId = '${tenantId}'` : ''}
        GROUP BY status;
      `);

      const stats = {
        pending: 0,
        processing: 0,
        sent: 0,
        failed: 0,
        total: 0,
      };

      for (const r of rows || []) {
        const s = (r.status || '').toLowerCase();
        const cnt = Number(r.count) || 0;
        if (s === 'pending') stats.pending = cnt;
        else if (s === 'processing') stats.processing = cnt;
        else if (s === 'sent') stats.sent = cnt;
        else if (s === 'failed') stats.failed = cnt;
        stats.total += cnt;
      }

      return stats;
    } catch {
      return { pending: 0, processing: 0, sent: 0, failed: 0, total: 0 };
    }
  }

  /**
   * Lista itens da fila de e-mails para auditoria e monitoramento
   */
  static async listQueue(tenantId: string, limit = 50) {
    await this.ensureQueueTable();

    try {
      if ((prisma as any).emailQueue) {
        return await (prisma as any).emailQueue.findMany({
          where: { tenantId },
          orderBy: { createdAt: 'desc' },
          take: limit,
        });
      }
    } catch {}

    try {
      const rows: any[] = await prisma.$queryRawUnsafe(
        `
        SELECT id, tenantId, to_email as toEmail, subject, status, attempts,
               max_attempts as maxAttempts, error_message as errorMessage,
               scheduled_at as scheduledAt, sent_at as sentAt, created_at as createdAt
        FROM email_queue
        WHERE tenantId = ?
        ORDER BY created_at DESC
        LIMIT ?;
        `,
        tenantId,
        limit
      );
      return rows.map((r) => ({
        ...r,
        scheduledAt: new Date(r.scheduledAt),
        sentAt: r.sentAt ? new Date(r.sentAt) : null,
        createdAt: new Date(r.createdAt),
      }));
    } catch {
      return [];
    }
  }
}
