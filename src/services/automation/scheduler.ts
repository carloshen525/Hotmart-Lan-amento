import { prisma } from '@/lib/prisma';
import { automationEngine } from './engine';
import { parseTargetDate, formatBrasiliaDateTime, formatRemainingTime } from '@/lib/date-utils';

export class AutomationScheduler {
  /**
   * Processa jobs agendados que já atingiram seu tempo de execução
   */
  async processDueJobs(): Promise<{ processed: number; cancelled: number; failed: number }> {
    const now = new Date();

    // Busca jobs pendentes cujo tempo de execução programado já chegou
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
        // Bloqueio de segurança: impede estritamente execução antecipada
        if (job.executeAt.getTime() > now.getTime()) {
          console.error(
            `[ERRO CRÍTICO] Bloqueio de segurança: tentativa de execução antecipada do job ${job.id}! Programado: ${job.executeAt.toISOString()} vs Atual: ${now.toISOString()}`
          );
          continue;
        }

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

        // Log detalhado de execução pontual do timer
        const diffSec = Math.round((now.getTime() - job.executeAt.getTime()) / 1000);
        console.log(
          `[TIMER EXECUTADO] Job: ${job.id} | Lead: ${job.contactId} | Data prevista: ${formatBrasiliaDateTime(job.executeAt)} (${job.executeAt.toISOString()}) | Data real: ${formatBrasiliaDateTime(now)} (${now.toISOString()}) | Diferença: ${diffSec}s`
        );

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

    // 4. Auto-recuperação resiliente: Verifica inscrições individuais em WAITING cujo timer já venceu e que não possuem job ativo pendente
    try {
      const stuckWaitingEnrollments = await prisma.automationEnrollment.findMany({
        where: {
          status: 'WAITING',
          currentNodeId: { not: null },
        },
        include: {
          automation: true,
          scheduledJobs: {
            where: { status: 'PENDING' },
          },
        },
        take: 30,
      });

      for (const enr of stuckWaitingEnrollments) {
        if (!enr.currentNodeId || !enr.automation || enr.automation.status !== 'ACTIVE') continue;
        if (enr.scheduledJobs && enr.scheduledJobs.length > 0) continue; // Possui job agendado aguardando no tempo certo

        const nodes: any[] = JSON.parse(enr.automation.nodes || '[]');
        const edges: any[] = JSON.parse(enr.automation.edges || '[]');
        const currentNode = nodes.find((n) => n.id === enr.currentNodeId);
        if (!currentNode || (currentNode.type !== 'timer' && currentNode.type !== 'delay')) continue;

        const cfg = currentNode.data?.config || {};
        const targetStr = cfg.specificDate || cfg.targetDate || cfg.targetTime;
        const targetTime = parseTargetDate(targetStr);

        // Se targetTime for inválido (NaN), NUNCA executa antecipadamente! Mantém aguardando.
        if (isNaN(targetTime)) {
          continue;
        }

        // Se for no futuro, mantém estritamente aguardando
        if (targetTime > now.getTime()) {
          continue;
        }

        // Executa apenas quando targetTime <= now:
        if (targetTime <= now.getTime()) {
          const diffSec = Math.round((now.getTime() - targetTime) / 1000);
          console.log(
            `[TIMER EXECUTADO - RECUPERAÇÃO] Lead: ${enr.contactId} | Data prevista: ${formatBrasiliaDateTime(targetTime)} | Data real: ${formatBrasiliaDateTime(now)} | Diferença: ${diffSec}s`
          );

          await prisma.automationEnrollment.update({
            where: { id: enr.id },
            data: { status: 'ACTIVE' },
          });

          await prisma.automationStepLog.create({
            data: {
              enrollmentId: enr.id,
              contactId: enr.contactId,
              nodeId: currentNode.id,
              nodeType: 'timer',
              action: 'TIMER_PASSED',
              status: 'SUCCESS',
              details: JSON.stringify({ passedAt: new Date().toISOString(), recovered: true }),
            },
          });

          const outgoing = edges.filter((e) => e.source === currentNode.id);
          for (const edge of outgoing) {
            await automationEngine.executeNode(enr.id, edge.target, enr.automation.tenantId);
          }
          processed++;
        }
      }
    } catch (stuckErr: any) {
      console.warn('[AutomationScheduler] Aviso na auto-recuperação de timers:', stuckErr.message);
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
          let targetTime = parseTargetDate(targetStr);

          // Se for timer relativo ou se targetTime não veio da config do nó, busca no log WAIT_TIMER
          if (isNaN(targetTime)) {
            const lastWaitLog = await prisma.automationGroupStepLog.findFirst({
              where: {
                enrollmentId: enr.id,
                nodeId: currentNode.id,
                action: 'WAIT_TIMER',
              },
              orderBy: { executedAt: 'desc' },
            });
            if (lastWaitLog && lastWaitLog.details) {
              try {
                const parsed = JSON.parse(lastWaitLog.details);
                if (parsed.scheduledFor || parsed.targetDate) {
                  targetTime = parseTargetDate(parsed.scheduledFor || parsed.targetDate);
                }
              } catch {}
            }
          }

          // Se targetTime for inválido (NaN), NUNCA disparar! Mantém aguardando com segurança
          if (isNaN(targetTime)) {
            continue;
          }

          // Se o horário ainda não foi alcançado, mantém o grupo aguardando intacto
          if (targetTime > now) {
            continue;
          }

          // SEGURANÇA MÁXIMA: Executa estritamente quando targetTime <= now
          if (targetTime <= now) {
            const diffSec = Math.round((now - targetTime) / 1000);
            console.log(
              `[TIMER EXECUTADO - GRUPO] Enrollment: ${enr.id} | Grupo: ${enr.groupId} | Data prevista: ${formatBrasiliaDateTime(targetTime)} (${new Date(targetTime).toISOString()}) | Data real: ${formatBrasiliaDateTime(now)} (${new Date(now).toISOString()}) | Diferença: ${diffSec}s`
            );

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
                details: JSON.stringify({
                  passedAt: new Date().toISOString(),
                  scheduledFor: new Date(targetTime).toISOString(),
                }),
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
