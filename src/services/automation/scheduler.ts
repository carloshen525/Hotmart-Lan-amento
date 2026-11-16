import { prisma } from '@/lib/prisma';
import { automationEngine } from './engine';

function parseTargetDate(dateStr?: string | null): number {
  if (!dateStr) return NaN;
  const clean = dateStr.trim();
  if (/[Z+-]\d{2}(:?\d{2})?$/.test(clean) || clean.endsWith('Z')) {
    return new Date(clean).getTime();
  }
  if (/^\d{4}-\d{2}-\d{2}[T ]\d{2}:\d{2}(:\d{2})?(\.\d+)?$/.test(clean)) {
    const isoWithT = clean.replace(' ', 'T');
    const withOffset = new Date(`${isoWithT}-03:00`).getTime();
    if (!isNaN(withOffset)) return withOffset;
  }
  return new Date(clean).getTime();
}

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
        if (job.contact && job.contact.status === 'UNSUBSCRIBED') {
          await prisma.scheduledJob.update({
            where: { id: job.id },
            data: { status: 'CANCELLED', lastError: 'Lead cancelou inscrições' },
          });
          cancelled++;
          continue;
        }

        if (job.contact && job.cancelCondition === 'PURCHASE_APPROVED') {
          const hasPurchased = await prisma.hotmartWebhookLog.findFirst({
            where: {
              tenantId: job.tenantId,
              buyerEmail: job.contact.email,
              eventType: 'PURCHASE_APPROVED',
            },
          });

          const hasClienteTag = Array.isArray(job.contact.tags) && job.contact.tags.some((t) => t.tag.name.toLowerCase() === 'cliente');

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
        if (job.enrollment && job.enrollment.status === 'CANCELLED') {
          await prisma.scheduledJob.update({
            where: { id: job.id },
            data: { status: 'CANCELLED', lastError: 'Inscrição cancelada' },
          });
          cancelled++;
          continue;
        }

        // 3. Reativa a inscrição para ACTIVE e executa o próximo nó
        if (job.enrollmentId) {
          await prisma.automationEnrollment.update({
            where: { id: job.enrollmentId },
            data: { status: 'ACTIVE' },
          }).catch(() => {});
        }

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
        }).catch(() => {});
      }
    }

    return { processed, cancelled, failed };
  }

  /**
   * Processa timers de automações em grupos onde o grupo está em WAITING aguardando a data/hora
   */
  async processDueGroupTimers(): Promise<{ processed: number; failed: number }> {
    const now = Date.now();
    let processed = 0;
    let failed = 0;

    try {
      const waitingEnrollments = await prisma.automationGroupEnrollment.findMany({
        where: {
          status: 'WAITING',
          currentNodeId: { not: null },
        },
        include: {
          automation: true,
        },
      });

      for (const enr of waitingEnrollments) {
        try {
          if (!enr.currentNodeId || enr.automation.status !== 'ACTIVE') continue;

          const nodes: any[] = JSON.parse(enr.automation.nodes || '[]');
          const edges: any[] = JSON.parse(enr.automation.edges || '[]');
          const currentNode = nodes.find((n) => n.id === enr.currentNodeId);
          if (!currentNode) continue;

          const cfg = currentNode.data?.config || {};
          const targetStr = cfg.specificDate || cfg.targetDate || cfg.targetTime;
          const targetTime = parseTargetDate(targetStr);

          // Se não há targetTime ou se o horário agendado já chegou
          if (isNaN(targetTime) || targetTime <= now) {
            // Reativa o grupo para ACTIVE
            await prisma.automationGroupEnrollment.update({
              where: { id: enr.id },
              data: { status: 'ACTIVE' },
            });

            await prisma.automationGroupStepLog.create({
              data: {
                enrollmentId: enr.id,
                groupId: enr.groupId,
                tenantId: enr.tenantId,
                nodeId: currentNode.id,
                nodeType: 'timer',
                action: 'TIMER_PASSED',
                status: 'SUCCESS',
                details: JSON.stringify({ passedAt: new Date().toISOString() }),
              },
            });

            const outgoingEdges = edges.filter((e) => e.source === currentNode.id);
            for (const edge of outgoingEdges) {
              await automationEngine.executeGroupNode(enr.id, edge.target, enr.tenantId);
            }
            processed++;
          }
        } catch (enrErr: any) {
          failed++;
          console.error(`[AutomationScheduler] Erro ao processar timer do grupo ${enr.id}:`, enrErr.message);
        }
      }
    } catch (err: any) {
      console.error('[AutomationScheduler] Erro ao buscar timers de grupos:', err.message);
    }

    return { processed, failed };
  }
}

export const automationScheduler = new AutomationScheduler();
