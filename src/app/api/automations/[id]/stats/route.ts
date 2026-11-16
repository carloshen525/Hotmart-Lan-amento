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

    // Se o fluxo estiver ativo, sincroniza novos nós ou novas conexões para garantir que os leads avancem
    if (automation.status === 'ACTIVE') {
      await automationEngine.syncExistingLeadsForAutomation(params.id, tenantId).catch((err) => {
        console.error('[Automation Stats Sync Error]:', err);
      });
    }

    const [allEnrollments, allStepLogs, pendingJobs] = await Promise.all([
      prisma.automationEnrollment.findMany({
        where: {
          automationId: params.id,
          contact: {
            tenantId,
            status: { not: 'UNSUBSCRIBED' },
          },
        },
        select: {
          id: true,
          contactId: true,
          currentNodeId: true,
          status: true,
          enteredAt: true,
          completedAt: true,
          contact: {
            select: {
              id: true,
              name: true,
              email: true,
              phone: true,
              status: true,
              tags: {
                select: {
                  tag: { select: { name: true } },
                },
              },
            },
          },
        },
      }),
      prisma.automationStepLog.findMany({
        where: {
          enrollment: {
            automationId: params.id,
          },
          contact: {
            status: { not: 'UNSUBSCRIBED' },
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
          contact: {
            status: { not: 'UNSUBSCRIBED' },
          },
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

    // Nós e Conexões Macro
    let parsedNodes: any[] = [];
    let parsedEdges: any[] = [];
    try {
      parsedNodes = JSON.parse(automation.nodes || '[]');
      parsedEdges = JSON.parse(automation.edges || '[]');
    } catch {}

    // 1. Calcula primeiro as estatísticas de cada nó de Tag (fonte da verdade de leads elegíveis)
    for (const n of parsedNodes) {
      if (n.type === 'tag' || n.type === 'trigger') {
        const tagStat = getNodeStat(n.id);
        const cfg = n.data?.config || {};
        const tags: string[] =
          cfg.entryTags || cfg.tagNames || (cfg.tagName ? [cfg.tagName] : (n.data as any)?.tagName ? [(n.data as any).tagName] : []) || [];
        if (tags.length > 0) {
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
          tagStat.leadsCount = 0;
        }
      }
    }

    // 2. Higieniza preventivamente inscrições órfãs (leads desmarcados/sem tag no CRM)
    const allAutoTagNames = new Set<string>();
    for (const pn of parsedNodes) {
      if (pn.type === 'tag' || pn.type === 'trigger') {
        const cfg = pn.data?.config || {};
        const tList: string[] =
          cfg.entryTags || cfg.tagNames || (cfg.tagName ? [cfg.tagName] : (pn.data as any)?.tagName ? [(pn.data as any).tagName] : []) || [];
        tList.forEach((t) => allAutoTagNames.add(t.toLowerCase().trim()));
      }
    }

    if (allAutoTagNames.size > 0) {
      const untaggedActive = allEnrollments.filter((e) => {
        if (e.status !== 'ACTIVE' && e.status !== 'WAITING') return false;
        const cTags = e.contact?.tags?.map((t: any) => t.tag?.name?.toLowerCase().trim()) || [];
        return !cTags.some((ct: string) => allAutoTagNames.has(ct));
      });

      if (untaggedActive.length > 0) {
        const untaggedIds = untaggedActive.map((e) => e.id);
        await prisma.automationEnrollment.updateMany({
          where: { id: { in: untaggedIds } },
          data: { status: 'CANCELLED' },
        }).catch(() => {});
        await prisma.scheduledJob.updateMany({
          where: { enrollmentId: { in: untaggedIds }, status: 'PENDING' },
          data: { status: 'CANCELLED' },
        }).catch(() => {});
      }
    }

    // 3. Calcula as estatísticas de cada Sequência de acordo estrito com a Tag conectada
    for (const n of parsedNodes) {
      if (n.type === 'sequence_lead') {
        const seqStat = getNodeStat(n.id);

        // Identifica os nós de Tag de entrada que se conectam a esta sequência
        const incomingEdges = parsedEdges.filter((e) => e.target === n.id);
        const sourceTagNodes = parsedNodes.filter(
          (pn) => (pn.type === 'tag' || pn.type === 'trigger') && incomingEdges.some((e) => e.source === pn.id)
        );

        const sourceTagNames = new Set<string>();
        let targetTagLeadsCap = Infinity;

        sourceTagNodes.forEach((tn) => {
          const cfg = tn.data?.config || {};
          const tList: string[] =
            cfg.entryTags || cfg.tagNames || (cfg.tagName ? [cfg.tagName] : (tn.data as any)?.tagName ? [(tn.data as any).tagName] : []) || [];
          tList.forEach((t) => sourceTagNames.add(t.toLowerCase().trim()));

          const tnStat = getNodeStat(tn.id);
          if (tnStat.leadsCount !== undefined && tnStat.leadsCount < targetTagLeadsCap) {
            targetTagLeadsCap = tnStat.leadsCount;
          }
        });

        // Filtra os leads que realmente possuem as tags de entrada desta sequência
        const seqEnrollments = sourceTagNames.size > 0
          ? distinctEnrollments.filter((e) => {
              if (!e.contact || e.contact.status === 'UNSUBSCRIBED') return false;
              const cTags = e.contact.tags?.map((t: any) => t.tag?.name?.toLowerCase().trim()) || [];
              return cTags.some((ct: string) => sourceTagNames.has(ct));
            })
          : distinctEnrollments.filter((e) => e.contact && e.contact.status !== 'UNSUBSCRIBED');

        const computedCount = sourceTagNodes.length > 0 && targetTagLeadsCap !== Infinity
          ? Math.min(seqEnrollments.length, targetTagLeadsCap)
          : seqEnrollments.length;

        seqStat.leadsCount = computedCount;
        seqStat.waitingCount = seqEnrollments.filter((e) => e.status === 'WAITING').length;
        seqStat.successCount = seqEnrollments.filter((e) => e.status === 'COMPLETED').length;
        seqStat.failedCount = seqEnrollments.filter(
          (e) => e.status === 'FAILED' || e.status === 'CANCELLED'
        ).length;

        // Harmoniza a contagem dos badges para não ultrapassar a quantidade real da tag
        if (seqStat.waitingCount + seqStat.successCount + seqStat.failedCount > computedCount) {
          if (seqStat.waitingCount > computedCount) seqStat.waitingCount = computedCount;
          seqStat.successCount = Math.max(0, computedCount - seqStat.waitingCount - seqStat.failedCount);
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
