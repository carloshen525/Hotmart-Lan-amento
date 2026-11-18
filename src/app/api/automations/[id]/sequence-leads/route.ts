import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { getActiveTenantId } from '@/lib/tenancy';

export const dynamic = 'force-dynamic';

export async function GET(request: Request, { params }: { params: { id: string } }) {
  try {
    const tenantId = await getActiveTenantId();
    if (!tenantId) {
      return NextResponse.json({ error: 'Não autenticado' }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const nodeId = searchParams.get('nodeId');
    const statusFilter = searchParams.get('status') || 'ALL';
    const search = searchParams.get('search')?.toLowerCase().trim() || '';

    if (!nodeId) {
      return NextResponse.json({ error: 'Parâmetro nodeId é obrigatório' }, { status: 400 });
    }

    const automation = await prisma.automation.findFirst({
      where: { id: params.id, tenantId },
    });

    if (!automation) {
      return NextResponse.json({ error: 'Automação não encontrada' }, { status: 404 });
    }

    const nodes = JSON.parse(automation.nodes || '[]');
    const seqNode = nodes.find((n: any) => n.id === nodeId);
    if (!seqNode) {
      return NextResponse.json({ error: 'Bloco de sequência não encontrado no fluxo' }, { status: 404 });
    }

    const subflow = (seqNode.data as any)?.subflow || {};
    const subNodes: any[] = subflow.nodes || [];
    const subNodeIds = new Set<string>([nodeId, ...subNodes.map((sn: any) => sn.id)]);

    // 1. Inscrições na automação com contatos válidos
    const enrollments = await prisma.automationEnrollment.findMany({
      where: {
        automationId: params.id,
        contact: {
          tenantId,
          status: { not: 'UNSUBSCRIBED' },
        },
      },
      include: {
        contact: {
          include: {
            tags: {
              include: { tag: true },
            },
          },
        },
      },
      orderBy: { enteredAt: 'desc' },
    });

    // 2. Step logs relevantes a esta sequência
    const stepLogs = await prisma.automationStepLog.findMany({
      where: {
        enrollment: { automationId: params.id },
      },
      orderBy: { executedAt: 'desc' },
      take: 2000,
    });

    // 3. Agendamentos pendentes
    const pendingJobs = await prisma.scheduledJob.findMany({
      where: {
        enrollment: { automationId: params.id },
        status: 'PENDING',
      },
      orderBy: { executeAt: 'asc' },
    });

    // Processamento de cada lead
    const processedLeads: any[] = [];
    const seenContactIds = new Set<string>();

    for (const enr of enrollments) {
      if (!enr.contact || seenContactIds.has(enr.contactId)) continue;

      const isCurrentInSeq = enr.currentNodeId && subNodeIds.has(enr.currentNodeId);
      const leadLogs = stepLogs.filter((l) => l.contactId === enr.contactId);
      const hasLogsInSeq = leadLogs.some((l) => subNodeIds.has(l.nodeId));

      // Se o lead nunca esteve nem está nesta sequência, ignora
      if (!isCurrentInSeq && !hasLogsInSeq) continue;

      seenContactIds.add(enr.contactId);

      // Determina o status detalhado dentro da sequência
      let sequenceStatus = 'EXECUTING';
      let sequenceStatusLabel = 'Executando mensagens';

      const pendingJobForLead = pendingJobs.find(
        (j) => j.contactId === enr.contactId && subNodeIds.has(j.targetNodeId)
      );

      const exitLog = leadLogs.find(
        (l) => l.nodeType === 'sequence_exit' && l.details?.includes(nodeId)
      );

      if (exitLog) {
        sequenceStatus = 'TRANSFERRED';
        sequenceStatusLabel = 'Transferido para outra sequência';
      } else if (enr.status === 'WAITING_TAG' && enr.currentNodeId === nodeId) {
        sequenceStatus = 'WAITING_TAG';
        sequenceStatusLabel = 'Aguardando TAG de saída';
      } else if (pendingJobForLead) {
        sequenceStatus = 'WAITING_DELAY';
        sequenceStatusLabel = 'Aguardando tempo (Delay)';
      } else if (enr.status === 'COMPLETED') {
        sequenceStatus = 'COMPLETED';
        sequenceStatusLabel = 'Concluído';
      } else if (isCurrentInSeq) {
        sequenceStatus = 'EXECUTING';
        sequenceStatusLabel = 'Executando mensagens';
      } else {
        sequenceStatus = 'TRANSFERRED';
        sequenceStatusLabel = 'Transferido para outra sequência';
      }

      // Filtro de status
      if (statusFilter !== 'ALL' && sequenceStatus !== statusFilter) {
        continue;
      }

      // Filtro de busca (nome, email, telefone)
      const c = enr.contact;
      if (search) {
        const matchesName = c.name?.toLowerCase().includes(search);
        const matchesEmail = c.email?.toLowerCase().includes(search);
        const matchesPhone = c.phone?.toLowerCase().includes(search);
        if (!matchesName && !matchesEmail && !matchesPhone) {
          continue;
        }
      }

      // Encontra o nome do passo atual
      let currentStepName = null;
      if (enr.currentNodeId) {
        const matchingSubNode = subNodes.find((sn) => sn.id === enr.currentNodeId);
        if (matchingSubNode) {
          currentStepName = matchingSubNode.data?.label || matchingSubNode.type;
        } else if (enr.currentNodeId === nodeId) {
          currentStepName = seqNode.data?.label || 'Sequência Lead';
        }
      }

      // Próxima mensagem agendada
      let nextScheduledMessage = null;
      if (pendingJobForLead) {
        const targetSubNode = subNodes.find((sn) => sn.id === pendingJobForLead.targetNodeId);
        nextScheduledMessage = {
          executeAt: pendingJobForLead.executeAt,
          stepName: targetSubNode?.data?.label || 'Mensagem agendada',
        };
      }

      // Histórico de transições e eventos desta sequência
      const relevantLogs = leadLogs
        .filter((l) => subNodeIds.has(l.nodeId) || l.nodeType === 'sequence_exit')
        .slice(0, 10)
        .map((l) => ({
          id: l.id,
          action: l.action,
          status: l.status,
          executedAt: l.executedAt,
          details: l.details ? JSON.parse(l.details) : null,
        }));

      processedLeads.push({
        contactId: c.id,
        name: c.name || 'Sem nome',
        email: c.email || 'Sem e-mail',
        phone: c.phone || 'Sem telefone',
        tags: c.tags.map((t) => t.tag.name),
        sequenceStatus,
        sequenceStatusLabel,
        currentStepName,
        nextScheduledMessage,
        enteredAt: enr.enteredAt,
        history: relevantLogs,
      });
    }

    const stats = {
      total: processedLeads.length,
      executing: processedLeads.filter((l) => l.sequenceStatus === 'EXECUTING').length,
      waitingDelay: processedLeads.filter((l) => l.sequenceStatus === 'WAITING_DELAY').length,
      waitingTag: processedLeads.filter((l) => l.sequenceStatus === 'WAITING_TAG').length,
      transferred: processedLeads.filter((l) => l.sequenceStatus === 'TRANSFERRED').length,
      completed: processedLeads.filter((l) => l.sequenceStatus === 'COMPLETED').length,
    };

    return NextResponse.json({
      sequence: {
        id: seqNode.id,
        label: seqNode.data?.label || 'Sequência Lead',
      },
      stats,
      leads: processedLeads,
    });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
