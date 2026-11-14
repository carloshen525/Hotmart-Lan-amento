import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { getActiveTenantId } from '@/lib/tenancy';

export async function GET(request: Request, { params }: { params: { id: string } }) {
  try {
    const tenantId = await getActiveTenantId();
    if (!tenantId) {
      return NextResponse.json({ error: 'Tenant não autenticado' }, { status: 401 });
    }

    const automation = await prisma.automation.findFirst({
      where: { id: params.id, tenantId },
    });

    if (!automation) {
      return NextResponse.json({ error: 'Automação não encontrada' }, { status: 404 });
    }

    const [allEnrollments, allStepLogs, pendingJobs] = await Promise.all([
      prisma.automationEnrollment.findMany({
        where: { automationId: params.id },
        select: {
          id: true,
          contactId: true,
          currentNodeId: true,
          status: true,
          enteredAt: true,
          completedAt: true,
        },
      }),
      prisma.automationStepLog.findMany({
        where: {
          enrollment: {
            automationId: params.id,
          },
        },
        select: {
          nodeId: true,
          status: true,
          contactId: true,
        },
      }),
      prisma.scheduledJob.findMany({
        where: {
          automationId: params.id,
          status: 'PENDING',
        },
        select: {
          targetNodeId: true,
          contactId: true,
        },
      }),
    ]);

    const nodeStats: Record<
      string,
      { leadsCount: number; waitingCount: number; successCount: number; failedCount: number }
    > = {};

    const getNodeStat = (nodeId: string) => {
      if (!nodeStats[nodeId]) {
        nodeStats[nodeId] = { leadsCount: 0, waitingCount: 0, successCount: 0, failedCount: 0 };
      }
      return nodeStats[nodeId];
    };

    // 1. Processar StepLogs (Histórico de execuções de cada nó)
    for (const log of allStepLogs) {
      if (!log.nodeId) continue;
      const stat = getNodeStat(log.nodeId);
      if (log.status === 'SUCCESS') {
        stat.successCount += 1;
      } else if (log.status === 'FAILED') {
        stat.failedCount += 1;
      }
    }

    // 2. Processar ScheduledJobs Pendentes (Leads aguardando no timer/delay)
    for (const job of pendingJobs) {
      if (!job.targetNodeId) continue;
      const stat = getNodeStat(job.targetNodeId);
      stat.waitingCount += 1;
    }

    // 3. Processar Enrollments Atuais (Onde os leads estão agora)
    for (const enr of allEnrollments) {
      if (enr.currentNodeId) {
        const stat = getNodeStat(enr.currentNodeId);
        if (enr.status === 'WAITING') {
          if (stat.waitingCount === 0) {
            stat.waitingCount += 1;
          }
        } else if (enr.status === 'FAILED' || enr.status === 'CANCELLED') {
          if (stat.failedCount === 0) {
            stat.failedCount += 1;
          }
        }
      }
    }

    // 4. Totais da sequência e nós especiais
    const totalEnrollments = allEnrollments.length;
    const activeInSequence = allEnrollments.filter(
      (e) => e.status === 'ACTIVE' || e.status === 'WAITING'
    ).length;
    const exitedFromSequence = allEnrollments.filter(
      (e) => e.status === 'COMPLETED' || e.status === 'CANCELLED' || e.status === 'FAILED'
    ).length;

    // Nó inicial seq_start sempre registra todos os enrollments que entraram
    const startStat = getNodeStat('seq_start');
    startStat.successCount = Math.max(startStat.successCount, totalEnrollments);
    startStat.leadsCount = totalEnrollments;

    // Calcular leadsCount para cada nó registrado
    for (const key of Object.keys(nodeStats)) {
      const item = nodeStats[key];
      item.leadsCount = Math.max(item.leadsCount, item.waitingCount + item.successCount + item.failedCount);
    }

    // Nós Macro
    let parsedNodes: any[] = [];
    try {
      parsedNodes = JSON.parse(automation.nodes || '[]');
    } catch {}

    for (const n of parsedNodes) {
      if (n.type === 'sequence_lead') {
        const seqStat = getNodeStat(n.id);
        seqStat.leadsCount = totalEnrollments;
        seqStat.waitingCount = allEnrollments.filter((e) => e.status === 'WAITING').length;
        seqStat.successCount = allEnrollments.filter((e) => e.status === 'COMPLETED').length;
        seqStat.failedCount = allEnrollments.filter(
          (e) => e.status === 'FAILED' || e.status === 'CANCELLED'
        ).length;
      } else if (n.type === 'tag') {
        const tagStat = getNodeStat(n.id);
        const cfg = n.data?.config || {};
        const tags = cfg.entryTags || cfg.tagNames || (cfg.tagName ? [cfg.tagName] : []);
        if (tags.length > 0) {
          const count = await prisma.contactTag.count({
            where: {
              contact: { tenantId },
              tag: { name: { in: tags } },
            },
          });
          tagStat.leadsCount = Math.max(count, totalEnrollments);
        } else {
          tagStat.leadsCount = totalEnrollments;
        }
      }
    }

    return NextResponse.json({
      success: true,
      stats: {
        totalLeads: totalEnrollments,
        activeInSequence,
        exitedFromSequence,
        nodeStats,
      },
    });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
