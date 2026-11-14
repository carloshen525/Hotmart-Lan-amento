import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { getActiveTenantId } from '@/lib/tenancy';

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

    for (const log of allStepLogs) {
      if (!log.nodeId) continue;
      const stat = getNodeStat(log.nodeId);
      if (log.status === 'SUCCESS') {
        stat.successCount += 1;
      } else if (log.status === 'FAILED') {
        stat.failedCount += 1;
      }
    }

    for (const job of pendingJobs) {
      if (!job.targetNodeId) continue;
      const stat = getNodeStat(job.targetNodeId);
      stat.waitingCount += 1;
    }

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

    const totalEnrollments = allEnrollments.length;
    const activeInSequence = allEnrollments.filter(
      (e) => e.status === 'ACTIVE' || e.status === 'WAITING'
    ).length;
    const exitedFromSequence = allEnrollments.filter(
      (e) => e.status === 'COMPLETED' || e.status === 'CANCELLED' || e.status === 'FAILED'
    ).length;

    const startStat = getNodeStat('seq_start');
    startStat.successCount = Math.max(startStat.successCount, totalEnrollments);
    startStat.leadsCount = totalEnrollments;

    for (const key of Object.keys(nodeStats)) {
      const item = nodeStats[key];
      item.leadsCount = Math.max(item.leadsCount, item.waitingCount + item.successCount + item.failedCount);
    }

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

export async function PUT(request: Request, { params }: { params: { id: string } }) {
  try {
    const tenantId = await getActiveTenantId();
    const body = await request.json();

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
