import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { getActiveTenantId } from '@/lib/tenancy';
import { automationEngine } from '@/services/automation/engine';

export async function GET(request: Request, { params }: { params: { id: string } }) {
  try {
    const tenantId = await getActiveTenantId();
    const automation = await prisma.automation.findFirst({
      where: { id: params.id, tenantId },
      include: {
        _count: {
          select: {
            enrollments: true,
            scheduledJobs: true,
          },
        },
        enrollments: {
          take: 10,
          orderBy: { enteredAt: 'desc' },
          include: { contact: true },
        },
      },
    });

    if (!automation) {
      return NextResponse.json({ error: 'Automação não encontrada' }, { status: 404 });
    }

    if (automation.status === 'ACTIVE') {
      await automationEngine.syncExistingLeadsForAutomation(params.id, tenantId).catch(() => {});
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

    // 1. Deduplica enrollments por contactId único (garante conjunto único de leads)
    const enrollmentsByContact = new Map<string, (typeof allEnrollments)[0]>();
    for (const enr of allEnrollments) {
      const existing = enrollmentsByContact.get(enr.contactId);
      if (!existing) {
        enrollmentsByContact.set(enr.contactId, enr);
      } else {
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

    const startStat = getNodeStat('seq_start');
    startStat.successCount = Math.max(startStat.successCount, totalEnrollments);
    startStat.leadsCount = totalEnrollments;

    const activeInSequence = distinctEnrollments.filter(
      (e) => e.status === 'ACTIVE' || e.status === 'WAITING'
    ).length;
    const exitedFromSequence = distinctEnrollments.filter(
      (e) => e.status === 'COMPLETED' || e.status === 'CANCELLED' || e.status === 'FAILED'
    ).length;

    let parsedNodes: any[] = [];
    let parsedEdges: any[] = [];
    try {
      parsedNodes = JSON.parse(automation.nodes || '[]');
      parsedEdges = JSON.parse(automation.edges || '[]');
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
        const tags = cfg.entryTags || cfg.tagNames || (cfg.tagName ? [cfg.tagName] : []);
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
          tagStat.leadsCount = totalEnrollments;
        }
      }
    }

    return NextResponse.json({
      automation: {
        ...automation,
        nodes: parsedNodes,
        edges: parsedEdges,
      },
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

// Validação de segurança para temporizadores de data específica
function validateTimerNodes(nodes: any[]): string | null {
  if (!Array.isArray(nodes)) return null;
  for (const node of nodes) {
    const cfg = node.data?.config;
    if (cfg && (cfg.timerType === 'SPECIFIC_DATE' || cfg.delayType === 'specific_date')) {
      if (!cfg.specificDate) {
        return '❌ A data e hora selecionadas já passaram. Escolha um horário futuro.';
      }
      const targetTime = new Date(cfg.specificDate).getTime();
      if (isNaN(targetTime) || targetTime <= Date.now()) {
        return '❌ A data e hora selecionadas já passaram. Escolha um horário futuro.';
      }
    }
    const subNodes = node.data?.subflow?.nodes;
    if (Array.isArray(subNodes)) {
      const subError = validateTimerNodes(subNodes);
      if (subError) return subError;
    }
  }
  return null;
}

export async function PUT(request: Request, { params }: { params: { id: string } }) {
  try {
    const tenantId = await getActiveTenantId();
    const body = await request.json();

    const existing = await prisma.automation.findFirst({
      where: { id: params.id, tenantId },
    });
    if (!existing) {
      return NextResponse.json({ error: 'Automação não encontrada' }, { status: 404 });
    }

    // Regra 1: Validação no backend - Impedir salvar datas no passado
    if (body.nodes !== undefined) {
      const timerValidationError = validateTimerNodes(body.nodes);
      if (timerValidationError) {
        return NextResponse.json({ error: timerValidationError }, { status: 400 });
      }
    }

    const isStructuralEdit =
      body.nodes !== undefined ||
      body.edges !== undefined ||
      body.triggerConfig !== undefined ||
      body.triggerType !== undefined;

    // Regra: Toda edição dentro do fluxo só pode ser feita com ele pausado/desativado.
    // Se a automação estiver ATIVA no banco e o usuário enviar edições na estrutura sem pausar:
    const targetStatus = body.status !== undefined ? body.status : existing.status;
    if (existing.status === 'ACTIVE' && isStructuralEdit && targetStatus === 'ACTIVE') {
      return NextResponse.json(
        {
          error: 'Toda edição no fluxo só pode ser feita com ele pausado/desativado. Pause a automação antes de salvar alterações.',
          requiresPause: true,
        },
        { status: 400 }
      );
    }

    const updateData: any = {};
    if (body.name !== undefined) updateData.name = body.name;
    if (body.description !== undefined) updateData.description = body.description;
    if (body.status !== undefined) updateData.status = body.status;
    if (body.triggerType !== undefined) updateData.triggerType = body.triggerType;
    if (body.triggerConfig !== undefined) updateData.triggerConfig = typeof body.triggerConfig === 'string' ? body.triggerConfig : JSON.stringify(body.triggerConfig);
    if (body.nodes !== undefined) updateData.nodes = JSON.stringify(body.nodes);
    if (body.edges !== undefined) updateData.edges = JSON.stringify(body.edges);

    const automation = await prisma.automation.update({
      where: { id: params.id },
      data: updateData,
    });

    if (automation.status === 'ACTIVE') {
      await automationEngine.syncExistingLeadsForAutomation(params.id, tenantId).catch(() => {});
    }

    return NextResponse.json({ success: true, automation });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

export async function DELETE(request: Request, { params }: { params: { id: string } }) {
  try {
    await prisma.automation.delete({
      where: { id: params.id },
    });
    return NextResponse.json({ success: true });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
