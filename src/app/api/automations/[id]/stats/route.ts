import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { getActiveTenantId } from '@/lib/tenancy';
import { automationEngine } from '@/services/automation/engine';

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

    // O endpoint de estatísticas é estritamente de leitura (read-only).
    // Não executa sincronizações pesadas síncronas que bloqueiam o painel.

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

    // 1. Deduplica enrollments por contactId único (garante conjunto único de leads)
    const enrollmentsByContact = new Map<string, (typeof allEnrollments)[0]>();
    for (const enr of allEnrollments) {
      const existing = enrollmentsByContact.get(enr.contactId);
      if (!existing) {
        enrollmentsByContact.set(enr.contactId, enr);
      } else {
        // Dá preferência para ACTIVE ou WAITING se houver histórico antigo
        if (existing.status !== 'ACTIVE' && (enr.status === 'ACTIVE' || enr.status === 'WAITING')) {
          enrollmentsByContact.set(enr.contactId, enr);
        }
      }
    }
    const distinctEnrollments = Array.from(enrollmentsByContact.values());
    const totalEnrollments = distinctEnrollments.length;

    // 2. Mapeamento por nós com contatos únicos (Set<string>)
    const nodeSuccessContacts = new Map<string, Set<string>>();
    const nodeWaitingContacts = new Map<string, Set<string>>();
    const nodeFailedContacts = new Map<string, Set<string>>();

    for (const log of allStepLogs) {
      if (!log.nodeId || !log.contactId) continue;
      if (log.status === 'SUCCESS') {
        if (!nodeSuccessContacts.has(log.nodeId)) nodeSuccessContacts.set(log.nodeId, new Set());
        nodeSuccessContacts.get(log.nodeId)!.add(log.contactId);
      } else if (log.status === 'FAILED') {
        if (!nodeFailedContacts.has(log.nodeId)) nodeFailedContacts.set(log.nodeId, new Set());
        nodeFailedContacts.get(log.nodeId)!.add(log.contactId);
      }
    }

    for (const job of pendingJobs) {
      if (!job.targetNodeId || !job.contactId) continue;
      if (!nodeWaitingContacts.has(job.targetNodeId)) nodeWaitingContacts.set(job.targetNodeId, new Set());
      nodeWaitingContacts.get(job.targetNodeId)!.add(job.contactId);
    }

    for (const enr of distinctEnrollments) {
      if (!enr.currentNodeId) continue;
      if (enr.status === 'WAITING') {
        if (!nodeWaitingContacts.has(enr.currentNodeId)) nodeWaitingContacts.set(enr.currentNodeId, new Set());
        nodeWaitingContacts.get(enr.currentNodeId)!.add(enr.contactId);
      } else if (enr.status === 'FAILED') {
        if (!nodeFailedContacts.has(enr.currentNodeId)) nodeFailedContacts.set(enr.currentNodeId, new Set());
        nodeFailedContacts.get(enr.currentNodeId)!.add(enr.contactId);
      }
    }

    const nodeStats: Record<
      string,
      { leadsCount: number; waitingCount: number; successCount: number; failedCount: number }
    > = {};

    const allNodeIds = new Set<string>([
      ...Array.from(nodeSuccessContacts.keys()),
      ...Array.from(nodeWaitingContacts.keys()),
      ...Array.from(nodeFailedContacts.keys()),
    ]);

    for (const nodeId of Array.from(allNodeIds)) {
      const successSet = nodeSuccessContacts.get(nodeId) || new Set();
      const waitingSet = nodeWaitingContacts.get(nodeId) || new Set();
      const failedSet = nodeFailedContacts.get(nodeId) || new Set();

      const uniqueLeads = new Set([
        ...Array.from(successSet),
        ...Array.from(waitingSet),
        ...Array.from(failedSet),
      ]);

      nodeStats[nodeId] = {
        leadsCount: uniqueLeads.size,
        waitingCount: waitingSet.size,
        successCount: successSet.size,
        failedCount: failedSet.size,
      };
    }

    const getNodeStat = (nodeId: string) => {
      if (!nodeStats[nodeId]) {
        nodeStats[nodeId] = { leadsCount: 0, waitingCount: 0, successCount: 0, failedCount: 0 };
      }
      return nodeStats[nodeId];
    };

    // Nó inicial seq_start registra todos os contatos únicos inscritos
    const startStat = getNodeStat('seq_start');
    startStat.successCount = Math.max(startStat.successCount, totalEnrollments);
    startStat.leadsCount = totalEnrollments;

    const activeInSequence = distinctEnrollments.filter(
      (e) => e.status === 'ACTIVE' || e.status === 'WAITING'
    ).length;
    const exitedFromSequence = distinctEnrollments.filter(
      (e) => e.status === 'COMPLETED' || e.status === 'CANCELLED' || e.status === 'FAILED'
    ).length;

    // Nós Macro
    let parsedNodes: any[] = [];
    try {
      parsedNodes = JSON.parse(automation.nodes || '[]');
    } catch {}

    for (const n of parsedNodes) {
      if (n.type === 'sequence_lead') {
        const seqStat = getNodeStat(n.id);
        seqStat.leadsCount = totalEnrollments;
        seqStat.waitingCount = distinctEnrollments.filter((e) => e.status === 'WAITING').length;
        seqStat.successCount = distinctEnrollments.filter((e) => e.status === 'COMPLETED').length;
        seqStat.failedCount = distinctEnrollments.filter(
          (e) => e.status === 'FAILED' || e.status === 'CANCELLED'
        ).length;
      } else if (n.type === 'tag') {
        const tagStat = getNodeStat(n.id);
        const cfg = n.data?.config || {};
        const tags: string[] = cfg.entryTags || cfg.tagNames || (cfg.tagName ? [cfg.tagName] : []);
        if (tags.length > 0) {
          // Contagem baseada estritamente no conjunto ÚNICO de leads pertencentes à TAG
          const count = await prisma.contact.count({
            where: {
              tenantId,
              status: { not: 'UNSUBSCRIBED' },
              tags: {
                some: {
                  tag: { name: { in: tags } },
                },
              },
            },
          });
          tagStat.leadsCount = count;
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
