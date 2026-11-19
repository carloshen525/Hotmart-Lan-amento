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

    // Endpoint de estatísticas é estritamente de LEITURA (read-only).
    // Nunca dispara envio de mensagens ou sincronização com efeito colateral.

    // Nós e Conexões Macro
    let parsedNodes: any[] = [];
    let parsedEdges: any[] = [];
    try {
      parsedNodes = JSON.parse(automation.nodes || '[]');
      parsedEdges = JSON.parse(automation.edges || '[]');
    } catch {}

    const isGroupMode = (automation as any).targetType === 'GROUP';

    let allEnrollments: any[] = [];
    let allStepLogs: any[] = [];
    let allQueueItems: any[] = [];
    let pendingJobs: any[] = [];

    if (isGroupMode) {
      const [allGroupEnrollments, allGroupStepLogs, groupQueue] = await Promise.all([
        prisma.automationGroupEnrollment.findMany({
          where: { automationId: params.id },
          select: {
            id: true,
            groupId: true,
            currentNodeId: true,
            status: true,
            enteredAt: true,
            completedAt: true,
          },
        }),
        prisma.automationGroupStepLog.findMany({
          where: { enrollment: { automationId: params.id } },
          select: {
            nodeId: true,
            status: true,
            groupId: true,
          },
        }),
        prisma.whatsappQueue.findMany({
          where: { automationId: params.id },
          select: {
            nodeId: true,
            status: true,
            contactId: true,
            phone: true,
            groupEnrollmentId: true,
            groupJid: true,
          },
        }).catch(() => []),
      ]);

      allEnrollments = allGroupEnrollments.map((g) => ({
        id: g.id,
        contactId: g.groupId,
        currentNodeId: g.currentNodeId,
        status: g.status,
        enteredAt: g.enteredAt,
        completedAt: g.completedAt,
        contact: null,
      }));

      allStepLogs = allGroupStepLogs.map((l) => ({
        nodeId: l.nodeId,
        status: l.status,
        contactId: l.groupId,
      }));

      allQueueItems = (groupQueue || []).map((q: any) => ({
        nodeId: q.nodeId,
        status: q.status,
        contactId: q.groupEnrollmentId || q.groupJid || q.phone,
        phone: q.groupJid || q.phone,
      }));
    } else {
      const results = await Promise.all([
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
        prisma.whatsappQueue.findMany({
          where: {
            automationId: params.id,
          },
          select: {
            nodeId: true,
            status: true,
            contactId: true,
            phone: true,
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

      allEnrollments = results[0];
      allStepLogs = results[1];
      allQueueItems = results[2];
      pendingJobs = results[3];
    }

    // 1. Identifica todos os nós de tags de entrada do fluxo e suas tags obrigatórias
    const entryTagConfigs: Array<{ tags: string[] }> = [];
    for (const pn of parsedNodes) {
      if (pn.type === 'tag' || pn.type === 'trigger') {
        const isExitTag = parsedEdges.some(
          (e) => e.target === pn.id && parsedNodes.some((sn) => sn.id === e.source && sn.type === 'sequence_lead')
        );
        if (!isExitTag) {
          const cfg = pn.data?.config || {};
          const tList: string[] =
            cfg.entryTags || cfg.tagNames || (cfg.tagName ? [cfg.tagName] : (pn.data as any)?.tagName ? [(pn.data as any).tagName] : []) || [];
          const cleaned = tList.map((t) => t.trim()).filter(Boolean);
          if (cleaned.length > 0) {
            entryTagConfigs.push({ tags: cleaned });
          }
        }
      }
    }

    // 2. Filtra inscrições de leads para estatísticas sem deletar dados do banco
    let validEnrollments = allEnrollments;
    if (!isGroupMode && entryTagConfigs.length > 0) {
      validEnrollments = allEnrollments.filter((e) => {
        const cTags = new Set(e.contact?.tags?.map((t: any) => t.tag?.name?.toLowerCase().trim()) || []);
        // Para cada nó de entrada, o lead deve possuir TODAS as tags daquele nó (interseção AND estrita)
        return entryTagConfigs.some((nodeCfg) =>
          nodeCfg.tags.every((t) => cTags.has(t.toLowerCase().trim()))
        );
      });
      // Se todos foram filtrados por tags alteradas mas existem inscrições reais, preserva inscrições do fluxo
      if (validEnrollments.length === 0 && allEnrollments.length > 0) {
        validEnrollments = allEnrollments;
      }
    }

    // 3. Deduplica enrollments por contactId único (garante conjunto único de leads válidos)
    const enrollmentsByContact = new Map<string, (typeof allEnrollments)[0]>();
    for (const enr of validEnrollments) {
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
    const validContactIds = new Set(distinctEnrollments.map((e) => e.contactId));

    // 4. Mapeamento por nós com contatos únicos (Set<string>) combinando step logs e fila persistente do WhatsApp
    const nodeSuccessContacts = new Map<string, Set<string>>();
    const nodeWaitingContacts = new Map<string, Set<string>>();
    const nodeFailedContacts = new Map<string, Set<string>>();

    // 4.1. Processa StepLogs (apenas de contatos válidos da automação)
    for (const log of allStepLogs) {
      if (!log.nodeId || !log.contactId) continue;
      if (validContactIds.size > 0 && !validContactIds.has(log.contactId)) continue;
      const key = log.contactId;

      if (log.status === 'SUCCESS') {
        if (!nodeSuccessContacts.has(log.nodeId)) nodeSuccessContacts.set(log.nodeId, new Set());
        nodeSuccessContacts.get(log.nodeId)!.add(key);
        nodeWaitingContacts.get(log.nodeId)?.delete(key);
      } else if (log.status === 'FAILED') {
        if (!nodeFailedContacts.has(log.nodeId)) nodeFailedContacts.set(log.nodeId, new Set());
        nodeFailedContacts.get(log.nodeId)!.add(key);
      } else if (log.status === 'QUEUED' || log.status === 'PROCESSING' || log.status === 'WAITING') {
        if (!nodeSuccessContacts.get(log.nodeId)?.has(key)) {
          if (!nodeWaitingContacts.has(log.nodeId)) nodeWaitingContacts.set(log.nodeId, new Set());
          nodeWaitingContacts.get(log.nodeId)!.add(key);
        }
      }
    }

    // 4.2. Processa Fila do WhatsApp (apenas de contatos válidos da automação)
    for (const item of allQueueItems) {
      if (!item.nodeId) continue;
      if (item.contactId && validContactIds.size > 0 && !validContactIds.has(item.contactId)) continue;
      const key = item.contactId || item.phone;
      if (!key) continue;

      if (item.status === 'SENT') {
        if (!nodeSuccessContacts.has(item.nodeId)) nodeSuccessContacts.set(item.nodeId, new Set());
        nodeSuccessContacts.get(item.nodeId)!.add(key);
        nodeWaitingContacts.get(item.nodeId)?.delete(key);
      } else if (item.status === 'PENDING' || item.status === 'PROCESSING') {
        if (!nodeSuccessContacts.get(item.nodeId)?.has(key)) {
          if (!nodeWaitingContacts.has(item.nodeId)) nodeWaitingContacts.set(item.nodeId, new Set());
          nodeWaitingContacts.get(item.nodeId)!.add(key);
        }
      } else if (item.status === 'FAILED') {
        if (!nodeSuccessContacts.get(item.nodeId)?.has(key)) {
          if (!nodeFailedContacts.has(item.nodeId)) nodeFailedContacts.set(item.nodeId, new Set());
          nodeFailedContacts.get(item.nodeId)!.add(key);
        }
      }
    }

    // 4.3. Processa agendamentos de jobs pendentes (timers e delays de contatos válidos)
    for (const job of pendingJobs) {
      if (!job.contactId) continue;
      if (validContactIds.size > 0 && !validContactIds.has(job.contactId)) continue;

      // Descobre se o job é originado por um nó de Timer/Delay
      let waitingNodeId = job.targetNodeId;

      // 1. Procura no fluxo Macro nó timer que conecta a targetNodeId
      const incomingMacroEdge = parsedEdges.find(
        (e) => e.target === job.targetNodeId && parsedNodes.some((n) => n.id === e.source && (n.type === 'timer' || n.type === 'delay'))
      );
      if (incomingMacroEdge) {
        waitingNodeId = incomingMacroEdge.source;
      } else {
        // 2. Procura nos subfluxos de sequências se há timer conectando internamente
        for (const pn of parsedNodes) {
          const subflow = (pn.data as any)?.subflow;
          if (subflow?.nodes && Array.isArray(subflow.nodes)) {
            const subEdges: any[] = subflow.edges || [];
            const incomingSubEdge = subEdges.find(
              (e) => e.target === job.targetNodeId && subflow.nodes.some((sn: any) => sn.id === e.source && (sn.type === 'timer' || sn.type === 'delay'))
            );
            if (incomingSubEdge) {
              waitingNodeId = incomingSubEdge.source;
              break;
            }
          }
        }
      }

      if (waitingNodeId) {
        if (!nodeWaitingContacts.has(waitingNodeId)) nodeWaitingContacts.set(waitingNodeId, new Set());
        nodeWaitingContacts.get(waitingNodeId)!.add(job.contactId);
        // Garante que o nó de timer não conste como sucesso enquanto o job estiver aguardando o tempo vencer
        nodeSuccessContacts.get(waitingNodeId)?.delete(job.contactId);
      }
    }

    // 4.4. Processa status dos enrollments
    for (const enr of distinctEnrollments) {
      if (!enr.currentNodeId) continue;
      if (enr.status === 'WAITING') {
        if (!nodeWaitingContacts.has(enr.currentNodeId)) nodeWaitingContacts.set(enr.currentNodeId, new Set());
        nodeWaitingContacts.get(enr.currentNodeId)!.add(enr.contactId);
        nodeSuccessContacts.get(enr.currentNodeId)?.delete(enr.contactId);
      } else if (enr.status === 'FAILED') {
        if (!nodeSuccessContacts.get(enr.currentNodeId)?.has(enr.contactId)) {
          if (!nodeFailedContacts.has(enr.currentNodeId)) nodeFailedContacts.set(enr.currentNodeId, new Set());
          nodeFailedContacts.get(enr.currentNodeId)!.add(enr.contactId);
        }
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

    // Nó inicial padrão seq_start alinhado ao total de leads válidos
    const startStat = getNodeStat('seq_start');
    startStat.successCount = totalEnrollments;
    startStat.leadsCount = totalEnrollments;
    startStat.waitingCount = 0;
    startStat.failedCount = 0;

    const activeInSequence = distinctEnrollments.filter(
      (e) => e.status === 'ACTIVE' || e.status === 'WAITING'
    ).length;
    const exitedFromSequence = distinctEnrollments.filter(
      (e) => e.status === 'COMPLETED' || e.status === 'CANCELLED' || e.status === 'FAILED'
    ).length;

    // 5. Calcula primeiro as estatísticas de cada nó de Tag (fonte da verdade de leads elegíveis)
    for (const n of parsedNodes) {
      if (n.type === 'tag' || n.type === 'trigger') {
        const tagStat = getNodeStat(n.id);
        const cfg = n.data?.config || {};
        const tags: string[] =
          cfg.entryTags || cfg.tagNames || (cfg.tagName ? [cfg.tagName] : (n.data as any)?.tagName ? [(n.data as any).tagName] : []) || [];

        // Verifica se é uma TAG DE SAÍDA (possui aresta de entrada vinda de sequence_lead)
        const isExitTag = parsedEdges.some(
          (e) => e.target === n.id && parsedNodes.some((sn) => sn.id === e.source && sn.type === 'sequence_lead')
        );

        if (isExitTag) {
          // TAG DE SAÍDA: exibe o número exato de leads que EFETIVAMENTE saíram por esta tag neste funil
          const exitedContactIds = new Set<string>();
          for (const log of allStepLogs) {
            if (log.nodeId === n.id) {
              exitedContactIds.add(log.contactId);
            }
          }
          tagStat.leadsCount = exitedContactIds.size;
          tagStat.successCount = exitedContactIds.size;
          tagStat.waitingCount = 0;
          tagStat.failedCount = 0;
        } else {
          // TAG DE ENTRADA RAIZ: exibe contatos elegíveis na base para alimentar o início do funil
          if (tags.length > 0) {
            const tagAndConditions = tags.map((t) => {
              const trimmed = t.trim();
              const clean = trimmed.replace(/^#/, '');
              const variations = Array.from(
                new Set([
                  trimmed,
                  clean,
                  trimmed.toLowerCase(),
                  trimmed.toUpperCase(),
                  clean.toLowerCase(),
                  clean.toUpperCase(),
                  `#${clean}`,
                ])
              );

              return {
                tags: {
                  some: {
                    tag: {
                      OR: [
                        { id: trimmed },
                        ...variations.map((v) => ({ name: v })),
                      ],
                    },
                  },
                },
              };
            });

            if (isGroupMode) {
              const count = await prisma.whatsappGroup.count({
                where: {
                  tenantId,
                  status: { not: 'LEFT' },
                  AND: tagAndConditions,
                },
              });
              tagStat.leadsCount = count;
            } else {
              const count = await prisma.contact.count({
                where: {
                  tenantId,
                  status: { not: 'UNSUBSCRIBED' },
                  AND: tagAndConditions,
                },
              });
              tagStat.leadsCount = count;
            }
          } else {
            tagStat.leadsCount = 0;
          }
        }
      }
    }

    // Função auxiliar para rastrear todos os nós ancestrais (a montante) de um nó no fluxo
    const getUpstreamNodes = (targetNodeId: string): any[] => {
      const visited = new Set<string>();
      const queue = [targetNodeId];
      const upstream: any[] = [];

      while (queue.length > 0) {
        const current = queue.shift()!;
        const incoming = parsedEdges.filter((e) => e.target === current);
        for (const edge of incoming) {
          if (!visited.has(edge.source)) {
            visited.add(edge.source);
            queue.push(edge.source);
            const sourceNode = parsedNodes.find((n) => n.id === edge.source);
            if (sourceNode) {
              upstream.push(sourceNode);
            }
          }
        }
      }

      return upstream;
    };

    // 6. Harmoniza as estatísticas de nós de Timer/Delay e de Sequências
    for (const n of parsedNodes) {
      if (n.type === 'timer' || n.type === 'delay') {
        const timerStat = getNodeStat(n.id);
        const upstreamNodes = getUpstreamNodes(n.id);
        let sourceTagNodes = upstreamNodes.filter((pn) => pn.type === 'tag' || pn.type === 'trigger');
        if (sourceTagNodes.length === 0) {
          sourceTagNodes = parsedNodes.filter((pn) => pn.type === 'tag' || pn.type === 'trigger');
        }
        let timerCap = Infinity;
        sourceTagNodes.forEach((tn) => {
          const tnStat = getNodeStat(tn.id);
          if (tnStat.leadsCount !== undefined && tnStat.leadsCount < timerCap) {
            timerCap = tnStat.leadsCount;
          }
        });
        if (timerCap !== Infinity) {
          if (timerStat.leadsCount > timerCap) timerStat.leadsCount = timerCap;
          if (timerStat.waitingCount > timerCap) timerStat.waitingCount = timerCap;
          if (timerStat.successCount > timerCap) timerStat.successCount = timerCap;
        }
      } else if (n.type === 'sequence_lead') {
        const seqStat = getNodeStat(n.id);
        const subflow = (n.data as any)?.subflow || {};
        const subNodes: any[] = subflow.nodes || [];
        const subNodeIds = new Set<string>([n.id, ...subNodes.map((sn: any) => sn.id)]);

        // 1. Leads com inscrições atualmente posicionadas nesta sequência (macro ou subfluxo interno)
        const currentlyInThisSequence = distinctEnrollments.filter((e) => {
          if (!e.currentNodeId) return false;
          return subNodeIds.has(e.currentNodeId);
        });

        // 2. Leads que possuem histórico de execução (step logs) nesta sequência
        const contactIdsWithLogsInSeq = new Set<string>();
        for (const log of allStepLogs) {
          if (subNodeIds.has(log.nodeId)) {
            contactIdsWithLogsInSeq.add(log.contactId);
          }
        }

        // Conjunto unificado de leads que estão ou passaram por esta sequência
        const allSeqContactIds = new Set<string>([
          ...currentlyInThisSequence.map((e) => e.contactId),
          ...Array.from(contactIdsWithLogsInSeq),
        ]);

        const seqEnrollments = distinctEnrollments.filter((e) => allSeqContactIds.has(e.contactId));

        seqStat.leadsCount = seqEnrollments.length;
        seqStat.waitingCount = currentlyInThisSequence.filter(
          (e) => e.status === 'WAITING' || e.status === 'WAITING_TAG'
        ).length;
        seqStat.successCount = seqEnrollments.filter(
          (e) => e.status === 'COMPLETED' || (!currentlyInThisSequence.some((c) => c.contactId === e.contactId))
        ).length;
        seqStat.failedCount = currentlyInThisSequence.filter(
          (e) => e.status === 'FAILED'
        ).length;

        // Harmoniza rigorosamente o nó Start e nós internos do subfluxo da sequência
        for (const sn of subNodes) {
          const subStat = getNodeStat(sn.id);
          if (sn.type === 'start' || sn.id === 'seq_start') {
            subStat.leadsCount = seqStat.leadsCount;
            subStat.successCount = seqStat.leadsCount;
            subStat.waitingCount = 0;
            subStat.failedCount = 0;
          } else {
            const realTotal = subStat.successCount + subStat.waitingCount + subStat.failedCount;
            if (realTotal > 0) {
              subStat.leadsCount = Math.min(realTotal, seqStat.leadsCount);
            } else if (subStat.leadsCount > seqStat.leadsCount) {
              subStat.leadsCount = seqStat.leadsCount;
            }
            if (subStat.successCount > seqStat.leadsCount) subStat.successCount = seqStat.leadsCount;
            if (subStat.waitingCount > seqStat.leadsCount) subStat.waitingCount = seqStat.leadsCount;
          }
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
