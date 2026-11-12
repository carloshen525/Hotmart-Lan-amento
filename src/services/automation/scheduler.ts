import { prisma } from '@/lib/prisma';
import { automationEngine } from './engine';

export class AutomationScheduler {
  /**
   * Processa jobs agendados que já atingiram seu tempo de execução
   */
  async processDueJobs(): Promise<{ processed: number; cancelled: number; failed: number }> {
    const now = new Date();

    // Busca jobs pendentes cujo tempo chegou
    const dueJobs = await prisma.scheduledJob.findMany({
      where: {
        status: 'PENDING',
        executeAt: { lte: now },
      },
      include: {
        contact: { include: { tags: { include: { tag: true } } } },
        enrollment: true,
      },
      take: 50, // Limite seguro por lote para evitar contenção
    });

    let processed = 0;
    let cancelled = 0;
    let failed = 0;

    for (const job of dueJobs) {
      try {
        // Bloqueio atômico do job
        const updated = await prisma.scheduledJob.updateMany({
          where: { id: job.id, status: 'PENDING' },
          data: { status: 'PROCESSING', attempts: { increment: 1 } },
        });

        if (updated.count === 0) continue; // Outro worker pegou

        // 1. Verificar condição de cancelamento (ex: se o lead já comprou ou cancelou)
        if (job.contact.status === 'UNSUBSCRIBED') {
          await prisma.scheduledJob.update({
            where: { id: job.id },
            data: { status: 'CANCELLED', lastError: 'Lead cancelou inscrições' },
          });
          cancelled++;
          continue;
        }

        if (job.cancelCondition === 'PURCHASE_APPROVED') {
          const hasPurchased = await prisma.hotmartWebhookLog.findFirst({
            where: {
              tenantId: job.tenantId,
              buyerEmail: job.contact.email,
              eventType: 'PURCHASE_APPROVED',
            },
          });

          const hasClienteTag = job.contact.tags.some((t) => t.tag.name.toLowerCase() === 'cliente');

          if (hasPurchased || hasClienteTag) {
            await prisma.scheduledJob.update({
              where: { id: job.id },
              data: {
                status: 'CANCELLED',
                lastError: 'Cancelado automaticamente: compra já aprovada',
              },
            });
            cancelled++;
            continue;
          }
        }

        // 2. Se a inscrição foi cancelada externamente
        if (job.enrollment.status === 'CANCELLED') {
          await prisma.scheduledJob.update({
            where: { id: job.id },
            data: { status: 'CANCELLED', lastError: 'Inscrição cancelada' },
          });
          cancelled++;
          continue;
        }

        // 3. Reativa a inscrição para ACTIVE e executa o próximo nó
        await prisma.automationEnrollment.update({
          where: { id: job.enrollmentId },
          data: { status: 'ACTIVE' },
        });

        await automationEngine.executeNode(job.enrollmentId, job.targetNodeId, job.tenantId);

        await prisma.scheduledJob.update({
          where: { id: job.id },
          data: { status: 'COMPLETED' },
        });

        processed++;
      } catch (err: any) {
        failed++;
        await prisma.scheduledJob.update({
          where: { id: job.id },
          data: {
            status: job.attempts >= job.maxAttempts ? 'FAILED' : 'PENDING',
            lastError: err.message,
          },
        });
      }
    }

    return { processed, cancelled, failed };
  }
}

export const automationScheduler = new AutomationScheduler();
