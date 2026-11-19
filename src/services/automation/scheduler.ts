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
        enrollment: { include: { automation: true } },
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

        // 2. Se a inscrição ou a automação foram canceladas/pausadas
        if (job.enrollment && (job.enrollment.status === 'CANCELLED' || job.enrollment.status === 'PAUSED')) {
          await prisma.scheduledJob.update({
            where: { id: job.id },
            data: { status: 'CANCELLED', lastError: `Inscrição ${job.enrollment.status}` },
          });
          cancelled++;
          continue;
        }

        if (job.enrollment?.automation && job.enrollment.automation.status !== 'ACTIVE') {
          console.warn(
            `[AutomationScheduler] 🛑 CANCELANDO JOB ${job.id}: Automação "${job.enrollment.automation.name}" está ${job.enrollment.automation.status}.`
          );
          await prisma.scheduledJob.update({
            where: { id: job.id },
            data: { status: 'CANCELLED', lastError: `Automação está ${job.enrollment.automation.status}` },
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
   * Processa timers de automações em grupos onde a ramificação está em WAITING aguardando a data/hora.
   * Suporta múltiplas ramificações independentes e paralelas no mesmo enrollment.
   */
  async processDueGroupTimers(): Promise<{ processed: number; failed: number }> {
    const now = Date.now();
    let processed = 0;
    let failed = 0;
    const handledTimerKeys = new Set<string>();

    try {
      // Busca todos os timers pendentes em grupos de automações ativas que ainda não receberam TIMER_PASSED
      const pendingWaitLogs = await prisma.automationGroupStepLog.findMany({
        where: {
          action: 'WAIT_TIMER',
        },
        orderBy: { executedAt: 'asc' },
      });

      for (const waitLog of pendingWaitLogs) {
        try {
          const timerKey = `${waitLog.enrollmentId}:${waitLog.nodeId}`;
          if (handledTimerKeys.has(timerKey)) continue;
          handledTimerKeys.add(timerKey);

          const alreadyPassed = await prisma.automationGroupStepLog.findFirst({
            where: {
              enrollmentId: waitLog.enrollmentId,
              nodeId: waitLog.nodeId,
              action: { in: ['TIMER_PASSED', 'TIMER_EXPIRED_SKIPPED'] },
            },
          });
          if (alreadyPassed) continue;

          const enr = await prisma.automationGroupEnrollment.findUnique({
            where: { id: waitLog.enrollmentId },
            include: { automation: true },
          });

          if (!enr || enr.status === 'CANCELLED' || enr.automation.status !== 'ACTIVE') {
            continue;
          }

          const nodes: any[] = JSON.parse(enr.automation.nodes || '[]');
          const edges: any[] = JSON.parse(enr.automation.edges || '[]');
          const currentNode = nodes.find((n) => n.id === waitLog.nodeId);
          if (!currentNode) continue;

          const cfg = currentNode.data?.config || {};
          let targetTime = parseTargetDate(cfg.specificDate || cfg.targetDate || cfg.targetTime);

          if (isNaN(targetTime) && waitLog.details) {
            try {
              const parsed = JSON.parse(waitLog.details);
              if (parsed.scheduledFor || parsed.targetDate) {
                targetTime = parseTargetDate(parsed.scheduledFor || parsed.targetDate);
              }
            } catch {}
          }

          if (isNaN(targetTime)) continue;

          // Se o horário ainda não foi alcançado, esta ramificação continua aguardando intacta
          if (targetTime > now) {
            continue;
          }

          // Horário atingido! Executa pontualmente
          const diffSec = Math.round((now - targetTime) / 1000);
          console.log(
            `[TIMER EXECUTADO - RAMIFICAÇÃO] Enrollment: ${enr.id} | Grupo: ${enr.groupId} | Node: ${currentNode.id} | Data prevista: ${formatBrasiliaDateTime(targetTime)} | Data real: ${formatBrasiliaDateTime(now)} | Diferença: ${diffSec}s`
          );

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

          // Avança exclusivamente a ramificação deste timer na máquina de estados
          await automationEngine.advanceGroupNode(enr.id, currentNode.id, enr.tenantId, enr.automation.id);
          processed++;
        } catch (timerErr: any) {
          failed++;
          console.error(`[AutomationScheduler] Erro ao processar timer de ramificação ${waitLog.id}:`, timerErr.message);
        }
      }
    } catch (err: any) {
      console.error('[AutomationScheduler] Erro ao buscar timers de ramificações:', err.message);
    }

    return { processed, failed };
  }
}

export const automationScheduler = new AutomationScheduler();
