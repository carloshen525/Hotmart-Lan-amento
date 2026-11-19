import { prisma } from '@/lib/prisma';
import { messageManager } from '../messaging';
import { WhatsappQueueService } from '@/services/whatsapp/queue.service';
import { whatsappGroupService, computeGroupNameWithHashtagRule } from '@/services/whatsapp/group.service';
import { WorkflowNode, WorkflowEdge } from './types';
import { BackgroundSchedulerRunner } from './background-runner';
import { parseTargetDate, formatBrasiliaDateTime, formatRemainingTime } from '@/lib/date-utils';

export interface ExecutionBranchContext {
  branchId: string;
  sourceNodeId?: string;
  currentNodeId: string;
  currentStepLabel?: string;
  nextStepId?: string | null;
  nextStepLabel?: string | null;
  state: 'RUNNING' | 'WAITING' | 'COMPLETED' | 'FAILED';
  waitingUntil?: string | null;
  lastExecutedAt: string;
}

/**
 * Verifica se o nó 'toNodeId' é alcançável a partir do nó 'fromNodeId' em um grafo direcionado.
 * Retorna true se toNodeId for descendente de fromNodeId (ou se forem o mesmo nó).
 */
export function isNodeReachable(fromNodeId: string, toNodeId: string, edges: WorkflowEdge[]): boolean {
  if (fromNodeId === toNodeId) return true;
  const visited = new Set<string>();
  const queue = [fromNodeId];
  while (queue.length > 0) {
    const curr = queue.shift()!;
    if (curr === toNodeId) return true;
    if (visited.has(curr)) continue;
    visited.add(curr);
    for (const edge of edges) {
      if (edge.source === curr && !visited.has(edge.target)) {
        queue.push(edge.target);
      }
    }
  }
  return false;
}

/**
 * Identifica o ID da ramificação para um nó em um grafo com possíveis bifurcações.
 */
export function findBranchIdForNode(nodeId: string, nodes: WorkflowNode[], edges: WorkflowEdge[]): string {
  const bifurcations = nodes.filter((n) => edges.filter((e) => e.source === n.id).length > 1);
  if (bifurcations.length === 0) {
    return 'branch_main';
  }

  for (const bif of bifurcations) {
    const outEdges = edges.filter((e) => e.source === bif.id);
    for (const edge of outEdges) {
      if (edge.target === nodeId || isNodeReachable(edge.target, nodeId, edges)) {
        return `branch_${bif.id}_${edge.target}`;
      }
    }
  }

  return 'branch_main';
}

export class AutomationEngine {
  private runningSyncs = new Set<string>(); // automationId
  private executingNodes = new Set<string>(); // `${contactId}_${nodeId}`

  /**
   * Inscreve um contato em um fluxo de automação
   */
  async enrollContact(automationId: string, contactId: string, metadata: Record<string, any> = {}) {
    const automation = await prisma.automation.findUnique({
      where: { id: automationId },
    });

    if (!automation) throw new Error('Automação não encontrada');
    if (automation.status !== 'ACTIVE') {
      return { skipped: true, reason: 'Automação não está ativa' };
    }

    const contact = await prisma.contact.findUnique({
      where: { id: contactId },
      include: { tags: { include: { tag: true } } },
    });

    if (!contact) throw new Error('Contato não encontrado');
    if (contact.status === 'UNSUBSCRIBED') {
      return { skipped: true, reason: 'Contato cancelou inscrições (opt-out)' };
    }

    // Regra: Não criar execuções duplicadas. Cada lead tem apenas uma execução por fluxo.
    const existingEnrollment = await prisma.automationEnrollment.findFirst({
      where: {
        automationId,
        contactId,
      },
    });

    if (existingEnrollment) {
      if (existingEnrollment.status === 'ACTIVE' && existingEnrollment.currentNodeId) {
        await this.executeNode(existingEnrollment.id, existingEnrollment.currentNodeId, automation.tenantId);
      }
      return { enrollmentId: existingEnrollment.id, alreadyEnrolled: true };
    }

    // Criar a inscrição
    const enrollment = await prisma.automationEnrollment.create({
      data: {
        automationId,
        contactId,
        status: 'ACTIVE',
        metadata: JSON.stringify(metadata),
      },
    });

    // Encontrar o nó de gatilho
    const nodes: WorkflowNode[] = JSON.parse(automation.nodes || '[]');
    const edges: WorkflowEdge[] = JSON.parse(automation.edges || '[]');

    const triggerNode = nodes.find((n) => n.data.type === 'trigger') || nodes[0];
    if (!triggerNode) {
      await prisma.automationEnrollment.update({
        where: { id: enrollment.id },
        data: { status: 'COMPLETED', completedAt: new Date() },
      });
      return { enrollmentId: enrollment.id, completed: true };
    }

    // Registrar log do gatilho
    await prisma.automationStepLog.create({
      data: {
        enrollmentId: enrollment.id,
        contactId,
        nodeId: triggerNode.id,
        nodeType: 'trigger',
        action: triggerNode.data.subtype || 'TRIGGER_FIRED',
        status: 'SUCCESS',
        details: JSON.stringify({ trigger: triggerNode.data.label }),
      },
    });

    // Encontrar próximos nós conectados ao gatilho
    const outgoingEdges = edges.filter((e) => e.source === triggerNode.id);
    for (const edge of outgoingEdges) {
      await this.executeNode(enrollment.id, edge.target, automation.tenantId);
    }

    return { enrollmentId: enrollment.id, started: true };
  }

  /**
   * Executa um nó da automação para a inscrição ativa
   */
  async executeNode(enrollmentId: string, nodeId: string, tenantId: string): Promise<void> {
    if (!enrollmentId || !nodeId) return;
    const enrollment = await prisma.automationEnrollment.findUnique({
      where: { id: enrollmentId },
      include: {
        automation: true,
        contact: {
          include: { tags: { include: { tag: true } } },
        },
      },
    });

    if (
      !enrollment ||
      enrollment.status === 'CANCELLED' ||
      enrollment.status === 'PAUSED' ||
      enrollment.automation?.status !== 'ACTIVE'
    ) {
      return;
    }

    if (enrollment.status === 'COMPLETED') {
      // Reativa a inscrição se um novo nó ou ramo pendente precisa ser executado
      await prisma.automationEnrollment.update({
        where: { id: enrollmentId },
        data: { status: 'ACTIVE', completedAt: null },
      });
      enrollment.status = 'ACTIVE';
    }

    const { automation, contact } = enrollment;
    const nodes: WorkflowNode[] = JSON.parse(automation.nodes || '[]');
    const edges: WorkflowEdge[] = JSON.parse(automation.edges || '[]');

    const node = nodes.find((n) => n.id === nodeId);
    if (!node) {
      // Se não encontrou no nível macro, procura nos subfluxos de sequências internas
      for (const macroNode of nodes) {
        if (macroNode.type === 'sequence_lead') {
          const subflow = (macroNode.data as any)?.subflow || {};
          const subNodes: WorkflowNode[] = subflow.nodes || [];
          const subEdges: WorkflowEdge[] = subflow.edges || [];
          const subNode = subNodes.find((sn) => sn.id === nodeId);
          if (subNode) {
            await this.executeSubflowNode(
              enrollmentId,
              nodeId,
              subNodes,
              subEdges,
              tenantId,
              contact,
              automation.id
            );
            return;
          }
        }
      }
      return;
    }

    // Atualiza o nó atual
    await prisma.automationEnrollment.update({
      where: { id: enrollmentId },
      data: { currentNodeId: nodeId },
    });

    const execKey = `${contact.id}_${node.id}`;
    if (this.executingNodes.has(execKey)) {
      return;
    }

    // Regra de Idempotência: Se este nó de ação já foi executado com SUCESSO para este lead, nunca repete
    if (node.data.type === 'action') {
      const alreadySuccess = await prisma.automationStepLog.findFirst({
        where: {
          contactId: contact.id,
          nodeId: node.id,
          status: { in: ['SUCCESS', 'PROCESSING'] },
          enrollment: { automationId: automation.id },
        },
      });

      if (alreadySuccess) {
        if (alreadySuccess.status === 'PROCESSING') return;
        const nextEdges = edges.filter((e) => e.source === node.id);
        if (nextEdges.length === 0) {
          await prisma.automationEnrollment.update({
            where: { id: enrollmentId },
            data: { status: 'COMPLETED', completedAt: new Date() },
          });
        } else {
          for (const nextEdge of nextEdges) {
            await this.executeNode(enrollmentId, nextEdge.target, tenantId);
          }
        }
        return;
      }
    }

    const nodeType = (node.data?.type || node.type) as string;
    const subtype = node.data.subtype;
    const config = node?.data?.config || {};

    let stepStatus = 'SUCCESS';
    let stepDetails: any = {};
    let shouldHaltExecution = false;
    let chosenHandle: string | null = null;

    try {
      if (nodeType === 'action') {
        switch (subtype) {
          case 'SEND_EMAIL': {
            if (contact.email) {
              const firstName = contact.name ? contact.name.trim().split(/\s+/)[0] : '';
              const emailHtml =
                config.generatedHtml ||
                config.contentHtml ||
                config.html ||
                config.content ||
                '<p>Olá {{nome}}, temos uma novidade especial para você!</p>';

              const res = await messageManager.sendEmail({
                tenantId,
                contactId: contact.id,
                email: contact.email,
                subject: config.subject || 'Novidades do Lançamento',
                content: emailHtml,
                variables: {
                  nome: contact.name || '',
                  primeiro_nome: firstName || contact.name || '',
                  email: contact.email || '',
                  telefone: contact.phone || '',
                },
              });
              stepDetails = { emailSent: res.success, messageId: res.messageId, provider: res.provider };
            }
            break;
          }

          case 'SEND_WHATSAPP': {
            if (contact.phone) {
              // Resolve a instância configurada para o fluxo ou nó
              let wppInstanceId = (config as any).whatsappInstanceId;
              if (!wppInstanceId && enrollment.automation) {
                wppInstanceId = (enrollment.automation as any).whatsappInstanceId;
                if (!wppInstanceId && enrollment.automation.triggerConfig) {
                  try {
                    const parsedTrigger = typeof enrollment.automation.triggerConfig === 'string'
                      ? JSON.parse(enrollment.automation.triggerConfig)
                      : enrollment.automation.triggerConfig;
                    wppInstanceId = parsedTrigger?.whatsappInstanceId;
                  } catch {}
                }
              }

              // REGRA ESTRITA: O ÚNICO número permitido para disparar na automação deve ser o número configurado nela.
              // Se não houver número configurado ou se o configurado estiver desconectado, pausa o fluxo imediatamente!
              if (!wppInstanceId) {
                const errReason = 'Nenhum número de WhatsApp configurado neste fluxo. Disparo bloqueado.';
                console.warn(`[Engine] 🛑 ${errReason} Pausando automação ${enrollment.automationId}.`);
                await this.pauseAutomationDueToDisconnectedWhatsapp(enrollment.automationId, tenantId, errReason);
                return;
              }

              const configuredInst = await prisma.whatsappInstance.findFirst({
                where: { id: wppInstanceId, ...(tenantId ? { tenantId } : {}) },
                select: { id: true, status: true, name: true, phone: true },
              }).catch(() => null);

              if (!configuredInst || configuredInst.status !== 'CONNECTED') {
                const discReason = `O número configurado ("${configuredInst?.name || configuredInst?.phone || wppInstanceId}") está desconectado.`;
                console.warn(`[Engine] 🛑 ${discReason} Pausando automação ${enrollment.automationId} imediatamente.`);
                await this.pauseAutomationDueToDisconnectedWhatsapp(enrollment.automationId, tenantId, discReason);
                return;
              }

              const firstName = contact.name ? contact.name.trim().split(/\s+/)[0] : '';
              const blocks = (config.blocks as any[]) || [];
              if (Array.isArray(blocks) && blocks.length > 0) {
                let lastRes: any = null;
                for (let i = 0; i < blocks.length; i++) {
                  const b = blocks[i];
                  if (i > 0) {
                    await new Promise((r) => setTimeout(r, 600));
                  }
                  const isMedia = b.type !== 'text';
                  lastRes = await messageManager.sendWhatsApp({
                    tenantId,
                    contactId: contact.id,
                    phone: contact.phone,
                    whatsappInstanceId: wppInstanceId,
                    text: isMedia ? (b.caption || '') : (b.text || ''),
                    messageType: (['image', 'video', 'audio'].includes(b.type) ? b.type : (isMedia ? 'image' : 'text')) as any,
                    mediaUrl: isMedia ? b.mediaUrl : undefined,
                    mediaBase64: isMedia ? b.mediaBase64 : undefined,
                    mediaMimeType: isMedia ? b.mediaMimeType : undefined,
                    mediaFileName: isMedia ? b.mediaFileName : undefined,
                    caption: isMedia ? b.caption : undefined,
                    variables: {
                      nome: contact.name || '',
                      primeiro_nome: firstName || contact.name || '',
                      email: contact.email || '',
                      telefone: contact.phone || '',
                    },
                  });
                }
                stepDetails = {
                  whatsappSent: lastRes?.success ?? true,
                  blocksSent: blocks.length,
                  messageId: lastRes?.messageId,
                  provider: lastRes?.provider,
                };
              } else {
                const res = await messageManager.sendWhatsApp({
                  tenantId,
                  contactId: contact.id,
                  phone: contact.phone,
                  whatsappInstanceId: wppInstanceId,
                  templateName: config.templateName,
                  text: config.text || config.message || `Olá ${contact.name}!`,
                  messageType: config.messageType || (config.mediaUrl ? 'image' : 'text'),
                  mediaUrl: config.mediaUrl,
                  mediaBase64: config.mediaBase64,
                  mediaMimeType: config.mediaMimeType,
                  mediaFileName: config.mediaFileName,
                  caption: config.caption || config.message || config.text,
                  variables: {
                    nome: contact.name || '',
                    primeiro_nome: firstName || contact.name || '',
                    email: contact.email || '',
                    telefone: contact.phone || '',
                  },
                });
                stepDetails = { whatsappSent: res.success, messageId: res.messageId, provider: res.provider };
              }
            }
            break;
          }

          case 'ADD_TAG': {
            const tagName = config.tagName;
            if (tagName) {
              let tag = await prisma.tag.findUnique({
                where: { tenantId_name: { tenantId, name: tagName } },
              });
              if (!tag) {
                tag = await prisma.tag.create({
                  data: { tenantId, name: tagName, color: '#10b981' },
                });
              }
              await prisma.contactTag.upsert({
                where: { contactId_tagId: { contactId: contact.id, tagId: tag.id } },
                create: { contactId: contact.id, tagId: tag.id },
                update: {},
              });
              stepDetails = { tagAdded: tagName };
            }
            break;
          }

          case 'REMOVE_TAG': {
            const tagName = config.tagName;
            if (tagName) {
              const tag = await prisma.tag.findUnique({
                where: { tenantId_name: { tenantId, name: tagName } },
              });
              if (tag) {
                await prisma.contactTag.deleteMany({
                  where: { contactId: contact.id, tagId: tag.id },
                });
              }
              stepDetails = { tagRemoved: tagName };
            }
            break;
          }

          case 'EXIT_FLOW': {
            await prisma.automationEnrollment.update({
              where: { id: enrollmentId },
              data: { status: 'COMPLETED', completedAt: new Date() },
            });
            shouldHaltExecution = true;
            stepDetails = { flowExited: true };
            break;
          }

          case 'CANCEL_OTHER_FLOWS': {
            // Cancela outros fluxos ativos do mesmo lead (ex: cancela recuperação ao comprar)
            const otherEnrollments = await prisma.automationEnrollment.updateMany({
              where: {
                contactId: contact.id,
                id: { not: enrollmentId },
                status: 'ACTIVE',
              },
              data: { status: 'CANCELLED' },
            });
            // Cancela jobs agendados de outros fluxos
            await prisma.scheduledJob.updateMany({
              where: {
                contactId: contact.id,
                enrollmentId: { not: enrollmentId },
                status: 'PENDING',
              },
              data: { status: 'CANCELLED' },
            });
            stepDetails = { cancelledOtherFlowsCount: otherEnrollments.count };
            break;
          }

          default:
            stepDetails = { executedGenericAction: subtype };
        }
      } else if (nodeType === 'condition') {
        // Bloco condicional SE / SENÃO
        switch (subtype) {
          case 'HAS_TAG': {
            const targetTag = config.tagName;
            const hasTag = contact.tags.some((t) => t.tag.name.toLowerCase() === (targetTag || '').toLowerCase());
            chosenHandle = hasTag ? 'yes' : 'no';
            stepDetails = { condition: 'HAS_TAG', tag: targetTag, result: hasTag };
            break;
          }

          case 'HOTMART_STATUS': {
            const expectedStatus = config.status || 'PURCHASE_APPROVED';
            // Verifica no histórico de webhooks
            const webhookRecord = await prisma.hotmartWebhookLog.findFirst({
              where: {
                tenantId,
                buyerEmail: contact.email,
                eventType: expectedStatus,
              },
            });
            const matches = Boolean(webhookRecord);
            chosenHandle = matches ? 'yes' : 'no';
            stepDetails = { condition: 'HOTMART_STATUS', expected: expectedStatus, result: matches };
            break;
          }

          default: {
            chosenHandle = 'yes';
          }
        }
      } else if (nodeType === 'delay' || nodeType === 'timer') {
        // Temporizador persistente - suporta Tempo Contínuo (minutos, horas, dias) ou Data Específica
        let executeAt: Date;
        let summaryText = '';

        const isSpecific =
          config.timerType === 'SPECIFIC_DATE' ||
          config.delayType === 'specific_date' ||
          Boolean(config.specificDate);

        if (isSpecific) {
          const targetMs = parseTargetDate(config.specificDate);
          if (isNaN(targetMs)) {
            console.error(`[TIMER CRÍTICO] Formato de data inválido: "${config.specificDate}". Bloqueando execução antecipada.`);
            stepStatus = 'WAITING';
            shouldHaltExecution = true;
            return;
          }
          executeAt = new Date(targetMs);
          summaryText = `Data específica: ${formatBrasiliaDateTime(executeAt)}`;
        } else {
          const unit = config.unit || (config.minutes !== undefined ? 'minutes' : config.hours !== undefined ? 'hours' : 'days');
          const amount = Number(config.value ?? config.duration ?? config.minutes ?? config.hours ?? config.days ?? 1);
          let waitMinutes = 1;

          if (unit === 'minutes') {
            waitMinutes = Math.max(1, amount);
          } else if (unit === 'hours') {
            waitMinutes = Math.max(1, amount * 60);
          } else {
            // days
            waitMinutes = Math.max(1, amount * 1440);
          }

          executeAt = new Date(Date.now() + waitMinutes * 60 * 1000);
          summaryText = `${amount} ${unit}`;
        }

        // Encontrar os próximos nós após o delay
        const outgoing = edges.filter((e) => e.source === node.id);
        if (outgoing.length > 0) {
          const nowMs = Date.now();
          if (executeAt.getTime() <= nowMs) {
            const dispatchAfterPassed = isSpecific ? config.dispatchAfterPassed !== false : true;

            if (!dispatchAfterPassed) {
              // Condicional NÃO: Não disparar para leads que chegaram após o horário agendado
              stepStatus = 'SKIPPED';
              stepDetails = {
                scheduledUntil: executeAt,
                passedImmediately: false,
                skipped: true,
                reason: 'Lead chegou após o horário agendado e a condicional de disparar após o horário está desativada (NÃO)',
                summary: summaryText,
              };
              shouldHaltExecution = true; // Bloqueia avanço para os próximos nós
            } else {
              // Condicional SIM: Se o horário agendado já chegou ou passou, avança imediatamente sem criar agendamento pendente
              stepStatus = 'SUCCESS';
              stepDetails = { scheduledUntil: executeAt, passedImmediately: true, summary: summaryText };
              // Continua o fluxo para os nós seguintes sem pausar
            }
          } else {
            // Horário no futuro: Criar Job Agendado persistente e pausar execução
            const remainingMs = executeAt.getTime() - nowMs;
            console.log(
              `[TIMER AGENDADO] Lead: ${contact.id} | Tipo: ${isSpecific ? 'SPECIFIC_DATE' : 'RELATIVE'} | Data programada: ${formatBrasiliaDateTime(executeAt)} (${executeAt.toISOString()}) | Horário atual: ${formatBrasiliaDateTime(nowMs)} (${new Date(nowMs).toISOString()}) | Tempo restante: ${formatRemainingTime(remainingMs)}`
            );

            for (const nextEdge of outgoing) {
              await prisma.scheduledJob.create({
                data: {
                  tenantId,
                  enrollmentId,
                  contactId: contact.id,
                  automationId: automation.id,
                  targetNodeId: nextEdge.target,
                  executeAt,
                  cancelCondition: config.cancelCondition || 'PURCHASE_APPROVED',
                },
              });
            }

            await prisma.automationEnrollment.update({
              where: { id: enrollmentId },
              data: { status: 'WAITING', currentNodeId: node.id },
            });

            stepStatus = 'WAITING';
            stepDetails = { scheduledUntil: executeAt, summary: summaryText, cancelCondition: config.cancelCondition || 'PURCHASE_APPROVED' };
            shouldHaltExecution = true; // A execução pausa aqui até o job vencer
          }
        }
      } else if (nodeType === 'sequence_lead') {
        // Quando a execução do fluxo macro atinge uma Sequência Lead (após um Timer, Tag ou nó macro):
        await this.enrollInSequence(automation.id, node.id, contact.id, tenantId, {
          source: 'FLOW_PROGRESSION',
        });
        return;
      } else if (nodeType === 'tag' || nodeType === 'trigger') {
        // Quando a execução do fluxo macro atinge um nó de Tag (ex: Checkpoint de Tag entre sequências)
        // REGRA DO MOTOR DE FUNIS: Nós de Tag são guardas e condições, NUNCA aplicam tags ao contato.
        stepStatus = 'SUCCESS';
        stepDetails = { tagCheckpointPassed: true };
      }
    } catch (err: any) {
      stepStatus = 'FAILED';
      stepDetails = { error: err.message };
    }

    // Grava log do passo
    await prisma.automationStepLog.create({
      data: {
        enrollmentId,
        contactId: contact.id,
        nodeId: node.id,
        nodeType,
        action: subtype || node.data.label,
        status: stepStatus,
        details: JSON.stringify(stepDetails),
      },
    });

    if (shouldHaltExecution) {
      return;
    }

    // Determina as conexões seguintes
    let nextEdges: WorkflowEdge[] = [];
    if (nodeType === 'condition' && chosenHandle) {
      nextEdges = edges.filter((e) => e.source === node.id && (e.sourceHandle === chosenHandle || !e.sourceHandle));
    } else {
      nextEdges = edges.filter((e) => e.source === node.id);
    }

    if (nextEdges.length === 0) {
      // Fluxo concluído
      await prisma.automationEnrollment.update({
        where: { id: enrollmentId },
        data: { status: 'COMPLETED', completedAt: new Date() },
      });
      return;
    }

    // Segue para os próximos nós em cascata
    for (const nextEdge of nextEdges) {
      await this.executeNode(enrollmentId, nextEdge.target, tenantId);
    }
  }

  /**
   * Trata a adição de uma tag a um contato:
   * 1. Verifica se a tag é uma condição de SAÍDA de alguma sequência ativa (se for, ejeta o lead e cancela disparos pendentes)
   * 2. Se a tag de saída estiver conectada a uma nova sequência seguinte, transfere o lead para ela imediatamente
   * 3. Se for uma tag de entrada inicial, inscreve o lead na sequência correspondente
   */
  async handleContactTagAdded(tenantId: string, contactId: string, tagName: string): Promise<{
    exitedSequences: string[];
    enteredSequences: string[];
  }> {
    const exitedSequences: string[] = [];
    const enteredSequences: string[] = [];

    // Busca o contato com todas as suas tags atuais para validações AND/OR
    const contact = await prisma.contact.findUnique({
      where: { id: contactId },
      include: { tags: { include: { tag: true } } },
    });
    const currentTags = new Set<string>(
      contact?.tags.map((t) => t.tag.name.toLowerCase().trim()) || []
    );
    currentTags.add(tagName.toLowerCase().trim());

    // Helper para verificar se um nó de Tag satisfaz os critérios (Tags de Entrada, Tags de Exclusão e Data Limite)
    const isTagNodeSatisfied = (tagNode: WorkflowNode): boolean => {
      const cfg = tagNode?.data?.config || {};

      // 1. Agendar data e hora limite? (Se expirou, não libera)
      if (cfg.hasDateLimit && cfg.dateLimit) {
        const limitDate = new Date(cfg.dateLimit);
        if (!isNaN(limitDate.getTime()) && new Date() > limitDate) {
          return false;
        }
      }

      // 2. Tag(s) que impossibilitam a entrada dos leads (Exclusão)
      const exclusionList: string[] = cfg.exclusionTags || [];
      if (exclusionList.length > 0) {
        const hasAllExclusions = exclusionList.every((t) => currentTags.has(t.toLowerCase().trim()));
        if (hasAllExclusions) {
          return false; // Bloqueado: possui todas as tags de exclusão
        }
      }

      // 3. Tag(s) de entrada dos leads
      const tagList: string[] =
        cfg.entryTags && Array.isArray(cfg.entryTags) && cfg.entryTags.length > 0
          ? cfg.entryTags
          : cfg.tagNames && Array.isArray(cfg.tagNames) && cfg.tagNames.length > 0
          ? cfg.tagNames
          : cfg.tagName
          ? [cfg.tagName]
          : (tagNode.data as any).tagName
          ? [(tagNode.data as any).tagName]
          : [];

      if (tagList.length === 0) return false;

      // O evento disparador atual (tagName) precisa ser uma das tags de entrada
      const matchesTrigger = tagList.some(
        (t) => t.toLowerCase().trim() === tagName.toLowerCase().trim()
      );
      if (!matchesTrigger) return false;

      const matchMode: 'ALL' | 'ANY' = cfg.matchMode || 'ALL';

      if (matchMode === 'ALL') {
        // Para o lead entrar, deve possuir TODAS as tags de entrada simultaneamente
        return tagList.every((t) => currentTags.has(t.toLowerCase().trim()));
      } else {
        // Qualquer uma basta
        return true;
      }
    };

    // Função auxiliar para identificar em qual SequenceLeadNode o enrollment está ativo no momento
    const findActiveSequenceNode = (
      workflowNodes: WorkflowNode[],
      currentNodeId: string | null | undefined
    ): WorkflowNode | null => {
      if (!currentNodeId) return null;
      // 1. Direct match com sequence_lead
      const direct = workflowNodes.find((n) => n.id === currentNodeId && n.type === 'sequence_lead');
      if (direct) return direct;
      // 2. Nó interno de subfluxo pertencente a uma sequence_lead
      for (const mn of workflowNodes) {
        if (mn.type === 'sequence_lead') {
          const sub = (mn.data as any)?.subflow;
          if (sub?.nodes && Array.isArray(sub.nodes) && sub.nodes.some((sn: any) => sn.id === currentNodeId)) {
            return mn;
          }
        }
      }
      return null;
    };

    // 1. Buscar inscrições deste lead em automações ativas (ACTIVE, WAITING ou WAITING_TAG)
    const activeEnrollments = await prisma.automationEnrollment.findMany({
      where: {
        contactId,
        status: { in: ['ACTIVE', 'WAITING', 'WAITING_TAG'] },
      },
      include: {
        automation: true,
      },
    });

    for (const enrollment of activeEnrollments) {
      if (enrollment.automation.status !== 'ACTIVE') continue;
      const nodes: WorkflowNode[] = JSON.parse(enrollment.automation.nodes || '[]');
      const edges: WorkflowEdge[] = JSON.parse(enrollment.automation.edges || '[]');

      // Identifica a sequência na qual o lead está alocado atualmente
      const currentSequenceNode = findActiveSequenceNode(nodes, enrollment.currentNodeId);
      if (!currentSequenceNode) continue;

      // Encontra APENAS as tags de SAÍDA conectadas diretamente à saída desta sequência atual
      const outgoingFromSeq = edges.filter((e) => e.source === currentSequenceNode.id);

      const matchingExitTagNodes = outgoingFromSeq
        .map((e) => nodes.find((n) => n.id === e.target && (n.type === 'tag' || n.type === 'trigger')))
        .filter((n) => n && isTagNodeSatisfied(n)) as WorkflowNode[];

      if (matchingExitTagNodes.length > 0) {
        // Encontrou uma TAG DE SAÍDA válida conectada à sequência atual
        const targetTagNode = matchingExitTagNodes[0];

        // 1. Cancela todos os jobs e disparos agendados pendentes desta sequência
        await prisma.scheduledJob.updateMany({
          where: {
            enrollmentId: enrollment.id,
            status: 'PENDING',
          },
          data: { status: 'CANCELLED' },
        });

        // 2. Registra o log atômico da saída da sequência por tag
        await prisma.automationStepLog.create({
          data: {
            enrollmentId: enrollment.id,
            contactId,
            nodeId: targetTagNode.id,
            nodeType: 'sequence_exit',
            action: `SAÍDA_POR_TAG: ${tagName}`,
            status: 'SUCCESS',
            details: JSON.stringify({
              fromSequenceId: currentSequenceNode.id,
              fromSequenceName: currentSequenceNode.data?.label || 'Sequência Lead',
              exitTagNodeId: targetTagNode.id,
              tagName,
              reason: `Lead recebeu a tag de saída "${tagName}". Sequência anterior interrompida.`,
            }),
          },
        });

        exitedSequences.push(currentSequenceNode.data?.label || 'Sequência Lead');

        // 3. Verifica se esta tag de saída conecta a uma NOVA sequência seguinte
        const nextSeqEdges = edges.filter((e) => e.source === targetTagNode.id);
        let transferred = false;
        for (const nextEdge of nextSeqEdges) {
          const nextSeqNode = nodes.find(
            (n) => n.id === nextEdge.target && n.type === 'sequence_lead'
          );

          if (nextSeqNode) {
            // Inicia o lead na nova sequência conectada
            await this.enrollInSequence(
              enrollment.automation.id,
              nextSeqNode.id,
              contactId,
              tenantId,
              { triggeredByTag: tagName, previousSequence: currentSequenceNode.data?.label }
            );
            enteredSequences.push(nextSeqNode.data?.label || 'Nova Sequência');
            transferred = true;
            break;
          }
        }

        if (!transferred) {
          // Se a tag de saída não aponta para outra sequência, conclui a automação
          await prisma.automationEnrollment.update({
            where: { id: enrollment.id },
            data: { status: 'COMPLETED', completedAt: new Date() },
          });
        }
      }
    }

    // 2. Se não foi saída de sequência ativa, verifica se é uma tag de ENTRADA para fluxos ativos
    if (enteredSequences.length === 0) {
      const activeAutomations = await prisma.automation.findMany({
        where: { tenantId, status: 'ACTIVE' },
      });

      for (const auto of activeAutomations) {
        const nodes: WorkflowNode[] = JSON.parse(auto.nodes || '[]');
        const edges: WorkflowEdge[] = JSON.parse(auto.edges || '[]');

        // REGRA: Uma tag é de ENTRADA apenas se NÃO possuir arestas vindas de sequence_lead
        const rootEntryTagNodes = nodes.filter((n) => {
          if (n.type !== 'tag' && n.type !== 'trigger') return false;
          const hasIncomingFromSeq = edges.some(
            (e) => e.target === n.id && nodes.some((sn) => sn.id === e.source && sn.type === 'sequence_lead')
          );
          if (hasIncomingFromSeq) return false;
          return isTagNodeSatisfied(n);
        });

        for (const tagNode of rootEntryTagNodes) {
          const outgoing = edges.filter((e) => e.source === tagNode.id);
          for (const edge of outgoing) {
            const targetNode = nodes.find((n) => n.id === edge.target);
            if (!targetNode) continue;

            const existingEnr = await prisma.automationEnrollment.findFirst({
              where: {
                automationId: auto.id,
                contactId,
                status: { in: ['ACTIVE', 'WAITING', 'WAITING_TAG'] },
              },
            });

            if (!existingEnr) {
              if (targetNode.type === 'sequence_lead') {
                await this.enrollInSequence(auto.id, targetNode.id, contactId, tenantId, {
                  source: 'TAG_TRIGGER',
                  triggeredByTag: tagName,
                });
                enteredSequences.push(targetNode.data?.label || 'Sequência Lead');
              } else {
                const newEnr = await prisma.automationEnrollment.create({
                  data: {
                    automationId: auto.id,
                    contactId,
                    status: 'ACTIVE',
                    metadata: JSON.stringify({ source: 'TAG_TRIGGER', triggeredByTag: tagName }),
                  },
                });
                await this.executeNode(newEnr.id, targetNode.id, tenantId);
                enteredSequences.push(targetNode.data?.label || targetNode.id);
              }
            }
          }
        }
      }
    }

    return { exitedSequences, enteredSequences };
  }

  /**
   * Inscreve um lead em uma sequência específica e inicia a execução do seu sub-fluxo
   */
  async enrollInSequence(
    automationId: string,
    sequenceNodeId: string,
    contactId: string,
    tenantId: string,
    metadata: Record<string, any> = {}
  ) {
    const contact = await prisma.contact.findUnique({
      where: { id: contactId },
      include: { tags: { include: { tag: true } } },
    });
    if (!contact || contact.status === 'UNSUBSCRIBED') return;

    const automation = await prisma.automation.findUnique({
      where: { id: automationId },
    });
    if (!automation || automation.status !== 'ACTIVE') return;

    const nodes: WorkflowNode[] = JSON.parse(automation.nodes || '[]');
    const seqNode = nodes.find((n) => n.id === sequenceNodeId);
    if (!seqNode) return;

    // Regra: Não duplicar execuções. Cada lead possui um estado persistente único por fluxo.
    const existingEnrollment = await prisma.automationEnrollment.findFirst({
      where: {
        automationId,
        contactId,
      },
      orderBy: { enteredAt: 'desc' },
    });

    let enrollment = existingEnrollment;

    if (!enrollment) {
      // Cria a inscrição posicionada nesta sequência
      enrollment = await prisma.automationEnrollment.create({
        data: {
          automationId,
          contactId,
          currentNodeId: sequenceNodeId,
          status: 'ACTIVE',
          metadata: JSON.stringify(metadata),
        },
      });
    } else {
      // Lead já possui inscrição nesta automação (ex: veio de um Timer macro ou nó anterior).
      // Atualiza o currentNodeId para esta sequência e garante status ACTIVE
      await prisma.automationEnrollment.update({
        where: { id: enrollment.id },
        data: {
          currentNodeId: sequenceNodeId,
          status: 'ACTIVE',
          completedAt: null,
        },
      });
    }

    const subflow = (seqNode.data as any).subflow || {};
    const subNodes: WorkflowNode[] = subflow.nodes || [];
    const subEdges: WorkflowEdge[] = subflow.edges || [];

    if (subNodes.length === 0) {
      // Sequência sem nós internos: verifica se há conexões de saída macro para tags
      const macroEdges: WorkflowEdge[] = JSON.parse(automation.edges || '[]');
      const outgoingFromSeq = macroEdges.filter((e) => e.source === sequenceNodeId);
      const exitTagEdges = outgoingFromSeq.filter((me) =>
        nodes.some((n) => n.id === me.target && (n.type === 'tag' || n.type === 'trigger'))
      );

      if (exitTagEdges.length > 0) {
        await prisma.automationEnrollment.update({
          where: { id: enrollment.id },
          data: { status: 'WAITING_TAG', currentNodeId: sequenceNodeId, completedAt: null },
        });
        await prisma.automationStepLog.create({
          data: {
            enrollmentId: enrollment.id,
            contactId: contact.id,
            nodeId: sequenceNodeId,
            nodeType: 'sequence_lead',
            action: 'AGUARDANDO_TAG_SAIDA',
            status: 'SUCCESS',
            details: JSON.stringify({
              sequenceId: sequenceNodeId,
              sequenceName: seqNode.data?.label || 'Sequência Lead',
              message: 'Sequência sem mensagens internas. Lead aguardando TAG de saída.',
            }),
          },
        });
      } else {
        await prisma.automationEnrollment.update({
          where: { id: enrollment.id },
          data: { status: 'COMPLETED', currentNodeId: sequenceNodeId, completedAt: new Date() },
        });
      }
      return;
    }

    // Busca etapas internas já executadas com SUCESSO nesta sequência para este lead
    const successLogs = await prisma.automationStepLog.findMany({
      where: {
        contactId,
        nodeId: { in: subNodes.map((n) => n.id) },
        status: { in: ['SUCCESS', 'PROCESSING', 'QUEUED'] },
        enrollmentId: enrollment.id,
      },
      select: { nodeId: true },
    });
    const executedNodeIds = new Set(successLogs.map((l) => l.nodeId));

    const pendingJob = await prisma.scheduledJob.findFirst({
      where: {
        enrollmentId: enrollment.id,
        status: 'PENDING',
        targetNodeId: { in: subNodes.map((n) => n.id) },
      },
    });

    // Se nenhum nó interno foi executado e não há agendamento pendente nesta sequência:
    if (executedNodeIds.size === 0 && !pendingJob) {
      // Registra entrada na sequência
      await prisma.automationStepLog.create({
        data: {
          enrollmentId: enrollment.id,
          contactId,
          nodeId: seqNode.id,
          nodeType: 'sequence_lead',
          action: `ENTRADA_SEQUENCIA: ${seqNode.data.label || 'Sequência Lead'}`,
          status: 'SUCCESS',
          details: JSON.stringify({ sequenceName: seqNode.data.label, metadata }),
        },
      });

      const startNode = subNodes.find((n) => n.type === 'start');
      if (startNode) {
        // Registra o passo no nó Start para constar no progresso do funil
        await prisma.automationStepLog.create({
          data: {
            enrollmentId: enrollment.id,
            contactId,
            nodeId: startNode.id,
            nodeType: 'start',
            action: 'START_SEQUENCIA',
            status: 'SUCCESS',
            details: JSON.stringify({ sequenceId: seqNode.id }),
          },
        });

        await prisma.automationEnrollment.update({
          where: { id: enrollment.id },
          data: { currentNodeId: startNode.id },
        });

        const outgoingFromStart = subEdges.filter((e) => e.source === startNode.id);
        for (const edge of outgoingFromStart) {
          await this.executeSubflowNode(
            enrollment.id,
            edge.target,
            subNodes,
            subEdges,
            tenantId,
            contact,
            automationId
          );
        }
      } else {
        // Sem nó start explícito: executa os nós de entrada raiz
        const targetIds = new Set(subEdges.map((e) => e.target));
        const entryNodes = subNodes.filter((n) => !targetIds.has(n.id));
        const nodesToRun = entryNodes.length > 0 ? entryNodes : (subNodes.length > 0 ? [subNodes[0]] : []);
        for (const rn of nodesToRun) {
          await this.executeSubflowNode(
            enrollment.id,
            rn.id,
            subNodes,
            subEdges,
            tenantId,
            contact,
            automationId
          );
        }
      }
    } else if (executedNodeIds.size > 0) {
      // Lead já executou etapas anteriores nesta sequência: verifica se há novas etapas conectadas a partir das concluídas
      const nodesToExecute = new Set<string>();
      for (const executedId of Array.from(executedNodeIds)) {
        const outgoing = subEdges.filter((e) => e.source === executedId);
        for (const edge of outgoing) {
          if (!executedNodeIds.has(edge.target)) {
            if (!pendingJob || pendingJob.targetNodeId !== edge.target) {
              nodesToExecute.add(edge.target);
            }
          }
        }
      }
      for (const targetNodeId of Array.from(nodesToExecute)) {
        await this.executeSubflowNode(
          enrollment.id,
          targetNodeId,
          subNodes,
          subEdges,
          tenantId,
          contact,
          automationId
        );
      }
    }
  }

  /**
   * Executa nós internos de um sub-fluxo (Timer, Aquecimento, WhatsApp, E-mail)
   */
  async executeSubflowNode(
    enrollmentId: string,
    nodeId: string,
    subNodes: WorkflowNode[],
    subEdges: WorkflowEdge[],
    tenantId: string,
    contact: any,
    automationId?: string
  ) {
    const node = subNodes.find((n) => n.id === nodeId);
    if (!node) return;

    // Se automationId não foi passado, descobre pela inscrição
    let autoId: string = automationId || '';
    if (!autoId && enrollmentId) {
      const enr = await prisma.automationEnrollment.findUnique({
        where: { id: enrollmentId },
        select: { automationId: true },
      });
      autoId = enr?.automationId || '';
    }

    // Guarda Absoluta: Se a automação estiver PAUSADA ou INATIVA, aborta imediatamente
    if (autoId) {
      const parentAuto = await prisma.automation.findUnique({
        where: { id: autoId },
        select: { status: true },
      });
      if (!parentAuto || parentAuto.status !== 'ACTIVE') {
        return;
      }
    }

    const execKey = `${contact.id}_${node.id}`;
    if (this.executingNodes.has(execKey)) {
      return; // Prevenção de concorrência: nó já em execução ativa para este contato
    }

    // 1. Regra de Idempotência: Se este nó já foi executado com SUCESSO, está em PROCESSING ou na FILA (QUEUED) para este lead neste fluxo, NUNCA executa novamente.
    const alreadySuccess = await prisma.automationStepLog.findFirst({
      where: {
        contactId: contact.id,
        nodeId: node.id,
        status: { in: ['SUCCESS', 'PROCESSING', 'QUEUED'] },
        enrollment: autoId ? { automationId: autoId } : undefined,
      },
    });

    if (alreadySuccess) {
      if (alreadySuccess.status === 'PROCESSING' || alreadySuccess.status === 'QUEUED') {
        // Já em processamento ativo ou aguardando envio na fila por outra thread
        return;
      }
      // Já executou com sucesso! Pula a etapa e avança diretamente para os próximos nós conectados
      // Carrega a versão mais recente da estrutura do fluxo diretamente do banco
      let currentSubEdges = subEdges;
      let currentSubNodes = subNodes;
      if (autoId) {
        try {
          const freshAuto = await prisma.automation.findUnique({
            where: { id: autoId },
            select: { nodes: true },
          });
          if (freshAuto?.nodes) {
            const freshMacroNodes: WorkflowNode[] = JSON.parse(freshAuto.nodes || '[]');
            for (const mn of freshMacroNodes) {
              const sub = (mn.data as any)?.subflow;
              if (sub && Array.isArray(sub.nodes) && sub.nodes.some((sn: any) => sn.id === node.id)) {
                currentSubNodes = sub.nodes;
                currentSubEdges = sub.edges || [];
                break;
              }
            }
          }
        } catch {}
      }

      const nextOutgoing = currentSubEdges.filter((e) => e.source === node.id);
      if (nextOutgoing.length === 0) {
        await prisma.automationEnrollment.update({
          where: { id: enrollmentId },
          data: { status: 'COMPLETED', completedAt: new Date(), currentNodeId: node.id },
        });
      } else {
        await prisma.automationEnrollment.update({
          where: { id: enrollmentId },
          data: { status: 'ACTIVE', completedAt: null },
        });
        for (const edge of nextOutgoing) {
          await this.executeSubflowNode(
            enrollmentId,
            edge.target,
            currentSubNodes,
            currentSubEdges,
            tenantId,
            contact,
            autoId
          );
        }
      }
      return;
    }

    this.executingNodes.add(execKey);

    // Registra imediatamente o log em estado 'PROCESSING' para bloquear chamadas simultâneas
    let stepLog: any = null;
    try {
      stepLog = await prisma.automationStepLog.create({
        data: {
          enrollmentId,
          contactId: contact.id,
          nodeId: node.id,
          nodeType: node.type,
          action: node.type.toUpperCase(),
          status: 'PROCESSING',
          details: JSON.stringify({ inProgress: true, startedAt: new Date().toISOString() }),
        },
      });
    } catch {
      this.executingNodes.delete(execKey);
      return;
    }

    try {
      // Atualiza o nó onde o lead se encontra agora
      await prisma.automationEnrollment.update({
        where: { id: enrollmentId },
        data: { currentNodeId: node.id },
      });

    const cfg = node?.data?.config || {};
    let shouldHalt = false;
    let stepStatus = 'SUCCESS';
    let stepDetails: any = {};

    try {
      if (node.type === 'whatsapp') {
        if (contact.phone) {
          const firstName = contact.name ? contact.name.trim().split(/\s+/)[0] : '';
          const blocks = (cfg.blocks as any[]) || [];
          const isMedia = cfg.mediaUrl || ['image', 'video', 'audio', 'document', 'file'].includes(cfg.messageType);

          // Resolve a instância do WhatsApp: usa a definida no nó ou a definida na configuração da automação
          let wppInstanceId = (cfg as any).whatsappInstanceId;
          if (!wppInstanceId && autoId) {
            try {
              const auto = await prisma.automation.findUnique({
                where: { id: autoId },
                select: { triggerConfig: true, whatsappInstanceId: true },
              });
              if (auto) {
                wppInstanceId = auto.whatsappInstanceId;
                if (!wppInstanceId && auto.triggerConfig) {
                  const parsedTrigger = typeof auto.triggerConfig === 'string'
                    ? JSON.parse(auto.triggerConfig)
                    : auto.triggerConfig;
                  wppInstanceId = parsedTrigger?.whatsappInstanceId;
                }
              }
            } catch {}
          }

          // REGRA ESTRITA: O ÚNICO número permitido para disparar na automação deve ser o número configurado nela.
          // Se não houver número configurado ou se o configurado estiver desconectado, pausa o fluxo imediatamente!
          if (!wppInstanceId) {
            const errReason = 'Nenhum número de WhatsApp configurado neste fluxo. Disparo bloqueado.';
            console.warn(`[Engine] 🛑 ${errReason} Pausando automação ${autoId}.`);
            if (autoId) {
              await this.pauseAutomationDueToDisconnectedWhatsapp(autoId, tenantId, errReason);
            }
            return;
          }

          const configuredInst = await prisma.whatsappInstance.findFirst({
            where: { id: wppInstanceId, ...(tenantId ? { tenantId } : {}) },
            select: { id: true, status: true, name: true, phone: true },
          }).catch(() => null);

          if (!configuredInst || configuredInst.status !== 'CONNECTED') {
            const discReason = `O número de WhatsApp configurado para este fluxo ("${configuredInst?.name || configuredInst?.phone || wppInstanceId}") está desconectado.`;
            console.warn(`[Engine] 🛑 ${discReason} Pausando automação ${autoId} imediatamente.`);
            if (autoId) {
              await this.pauseAutomationDueToDisconnectedWhatsapp(autoId, tenantId, discReason);
            }
            return;
          }

          // Enfileira na Fila Persistente do WhatsApp com controle de cadência entre contatos
          const queueItemId = await WhatsappQueueService.enqueue({
            tenantId,
            whatsappInstanceId: wppInstanceId,
            contactId: contact.id,
            phone: contact.phone,
            contactName: contact.name,
            messageType: (['image', 'video', 'audio', 'document', 'file'].includes(cfg.messageType) ? cfg.messageType : (isMedia ? 'image' : 'text')) as any,
            text: cfg.message || cfg.text || `Olá ${contact.name}!`,
            mediaUrl: cfg.mediaUrl,
            mediaBase64: cfg.mediaBase64,
            mediaMimeType: cfg.mediaMimeType,
            mediaFileName: cfg.mediaFileName,
            caption: cfg.caption || cfg.message || cfg.text,
            blocks: Array.isArray(blocks) && blocks.length > 0 ? blocks : undefined,
            variables: {
              nome: contact.name || '',
              primeiro_nome: firstName || contact.name || '',
              email: contact.email || '',
              telefone: contact.phone || '',
            },
            enrollmentId,
            nodeId: node.id,
            automationId: autoId || undefined,
            fixedDelaySeconds: cfg.fixedDelaySeconds ? Number(cfg.fixedDelaySeconds) : undefined,
            useRandomDelay: cfg.useRandomDelay !== undefined ? Boolean(cfg.useRandomDelay) : undefined,
            minDelaySeconds: cfg.minDelaySeconds ? Number(cfg.minDelaySeconds) : undefined,
            maxDelaySeconds: cfg.maxDelaySeconds ? Number(cfg.maxDelaySeconds) : undefined,
          });

          stepStatus = 'QUEUED';
          stepDetails = {
            phone: contact.phone,
            queueItemId,
            status: 'QUEUED',
            enqueuedAt: new Date().toISOString(),
          };
          shouldHalt = true;
        } else {
          stepStatus = 'FAILED';
          stepDetails = { error: 'Contato sem telefone cadastrado' };
          shouldHalt = true;
        }
      } else if (node.type === 'email') {
        if (contact.email) {
          const firstName = contact.name ? contact.name.trim().split(/\s+/)[0] : '';
          const emailHtml =
            cfg.generatedHtml ||
            cfg.contentHtml ||
            cfg.html ||
            cfg.content ||
            cfg.message ||
            '<p>Olá!</p>';

          const emailRes = await messageManager.sendEmail({
            tenantId,
            contactId: contact.id,
            email: contact.email,
            subject: cfg.subject || 'Aviso do Lançamento',
            content: emailHtml,
            variables: {
              nome: contact.name || '',
              primeiro_nome: firstName || contact.name || '',
              email: contact.email || '',
              telefone: contact.phone || '',
            },
          });

          if (!emailRes || emailRes.success === false) {
            stepStatus = 'FAILED';
            stepDetails = { error: emailRes?.error || 'Falha no envio de e-mail', email: contact.email };
            shouldHalt = true;
          } else {
            stepDetails = { email: contact.email, subject: cfg.subject };
          }
        } else {
          stepStatus = 'FAILED';
          stepDetails = { error: 'Contato sem e-mail cadastrado' };
          shouldHalt = true;
        }
      } else if (node.type === 'timer' || node.type === 'delay') {
        const existingJob = await prisma.scheduledJob.findFirst({
          where: {
            enrollmentId,
            status: 'PENDING',
          },
        });

        if (!existingJob) {
          let executeAt: Date;
          let summaryText = '';

          const isSpecific =
            cfg.timerType === 'SPECIFIC_DATE' ||
            cfg.delayType === 'specific_date' ||
            Boolean(cfg.specificDate);

          if (isSpecific) {
            const targetMs = parseTargetDate(cfg.specificDate);
            if (isNaN(targetMs)) {
              console.error(`[TIMER CRÍTICO - SUBFLOW] Formato de data inválido: "${cfg.specificDate}". Bloqueando execução antecipada.`);
              shouldHalt = true;
              return;
            }
            executeAt = new Date(targetMs);
            summaryText = `Data específica: ${formatBrasiliaDateTime(executeAt)}`;
          } else {
            const unit = cfg.unit || (cfg.minutes !== undefined ? 'minutes' : cfg.hours !== undefined ? 'hours' : 'days');
            const amount = Number(cfg.value ?? cfg.duration ?? cfg.minutes ?? cfg.hours ?? cfg.days ?? 1);
            let waitMinutes = 1;

            if (unit === 'minutes') {
              waitMinutes = Math.max(1, amount);
            } else if (unit === 'hours') {
              waitMinutes = Math.max(1, amount * 60);
            } else {
              waitMinutes = Math.max(1, amount * 1440);
            }

            executeAt = new Date(Date.now() + waitMinutes * 60 * 1000);
            summaryText = `${amount} ${unit}`;
          }

          const outgoing = subEdges.filter((e) => e.source === node.id);
          const nowMs = Date.now();
          if (executeAt.getTime() <= nowMs) {
            const isSpecific =
              cfg.timerType === 'SPECIFIC_DATE' ||
              cfg.delayType === 'specific_date' ||
              Boolean(cfg.specificDate);
            const dispatchAfterPassed = isSpecific ? cfg.dispatchAfterPassed !== false : true;

            if (!dispatchAfterPassed) {
              // Condicional NÃO: Não disparar para leads que chegaram após o horário agendado
              stepDetails = {
                scheduledUntil: executeAt,
                passedImmediately: false,
                skipped: true,
                reason: 'Lead chegou após o horário agendado e a condicional de disparar após o horário está desativada (NÃO)',
                summary: summaryText,
              };
              shouldHalt = true; // Bloqueia avanço para os próximos nós
            } else {
              // Condicional SIM: Se o horário agendado já chegou ou passou, avança imediatamente sem criar agendamento pendente
              stepDetails = { scheduledUntil: executeAt, passedImmediately: true, summary: summaryText };
              for (const edge of outgoing) {
                await this.executeSubflowNode(
                  enrollmentId,
                  edge.target,
                  subNodes,
                  subEdges,
                  tenantId,
                  contact,
                  autoId
                );
              }
            }
          } else {
            const remainingMs = executeAt.getTime() - nowMs;
            console.log(
              `[TIMER AGENDADO - SUBFLOW] Lead: ${contact.id} | Tipo: ${isSpecific ? 'SPECIFIC_DATE' : 'RELATIVE'} | Data programada: ${formatBrasiliaDateTime(executeAt)} (${executeAt.toISOString()}) | Horário atual: ${formatBrasiliaDateTime(nowMs)} (${new Date(nowMs).toISOString()}) | Tempo restante: ${formatRemainingTime(remainingMs)}`
            );

            for (const edge of outgoing) {
              await prisma.scheduledJob.create({
                data: {
                  tenantId,
                  enrollmentId,
                  contactId: contact.id,
                  automationId: autoId || '',
                  targetNodeId: edge.target,
                  executeAt,
                  cancelCondition: cfg.cancelCondition || 'NONE',
                },
              });
            }

            await prisma.automationEnrollment.update({
              where: { id: enrollmentId },
              data: { status: 'WAITING', currentNodeId: node.id },
            });

            stepDetails = { scheduledUntil: executeAt, summary: summaryText };
            shouldHalt = true;
          }
        } else {
          stepDetails = { scheduledUntil: existingJob.executeAt, alreadyScheduled: true };
        }
        shouldHalt = true;
      } else if (node.type === 'aquecimento' || node.type === 'warmup') {
        const existingJob = await prisma.scheduledJob.findFirst({
          where: {
            enrollmentId,
            status: 'PENDING',
          },
        });

        if (!existingJob) {
          const rateLimit = Number(cfg.rateLimitPerMinute || cfg.releasesPerMinute || 1);
          const staggeredSeconds = Math.max(1, Math.floor(60 / rateLimit));
          const executeAt = new Date(Date.now() + staggeredSeconds * 1000);

          const outgoing = subEdges.filter((e) => e.source === node.id);
          for (const edge of outgoing) {
            await prisma.scheduledJob.create({
              data: {
                tenantId,
                enrollmentId,
                contactId: contact.id,
                automationId: autoId || '',
                targetNodeId: edge.target,
                executeAt,
                cancelCondition: 'NONE',
              },
            });
          }

          await prisma.automationEnrollment.update({
            where: { id: enrollmentId },
            data: { status: 'WAITING', currentNodeId: node.id },
          });

          stepDetails = { rateLimitPerMinute: rateLimit, staggeredSeconds };
        } else {
          stepDetails = { scheduledUntil: existingJob.executeAt, alreadyScheduled: true };
        }
        shouldHalt = true;
      }
    } catch (err: any) {
      stepStatus = 'FAILED';
      stepDetails = { error: err.message };
      shouldHalt = true;
    }

    // Atualiza o log da etapa do sub-fluxo com o status final (sem sobrescrever se o worker da fila já concluiu com SUCCESS)
    if (stepLog) {
      const currentLog = await prisma.automationStepLog.findUnique({
        where: { id: stepLog.id },
        select: { status: true },
      });

      if (currentLog?.status !== 'SUCCESS') {
        await prisma.automationStepLog.update({
          where: { id: stepLog.id },
          data: {
            status: stepStatus,
            details: JSON.stringify(stepDetails),
          },
        });
      }
    }

    if (shouldHalt || stepStatus === 'FAILED') {
      if (stepStatus === 'FAILED') {
        await prisma.automationEnrollment.update({
          where: { id: enrollmentId },
          data: { status: 'FAILED' },
        });
      }
      return;
    }

    // Próximos nós conectados internamente usando a estrutura dinâmica mais recente
    let currentSubEdges = subEdges;
    let currentSubNodes = subNodes;
    let parentMacroNode: WorkflowNode | null = null;
    let macroEdges: WorkflowEdge[] = [];
    let freshMacroNodes: WorkflowNode[] = [];

    if (autoId) {
      try {
        const freshAuto = await prisma.automation.findUnique({
          where: { id: autoId },
          select: { nodes: true, edges: true },
        });
        if (freshAuto?.nodes) {
          macroEdges = JSON.parse(freshAuto.edges || '[]');
          freshMacroNodes = JSON.parse(freshAuto.nodes || '[]');
          for (const mn of freshMacroNodes) {
            const sub = (mn.data as any)?.subflow;
            if (sub && Array.isArray(sub.nodes) && sub.nodes.some((sn: any) => sn.id === node.id)) {
              currentSubNodes = sub.nodes;
              currentSubEdges = sub.edges || [];
              parentMacroNode = mn;
              break;
            }
          }
        }
      } catch {}
    }

    const nextOutgoing = currentSubEdges.filter((e) => e.source === node.id);
    if (nextOutgoing.length === 0) {
      // Subfluxo interno desta sequência terminou!
      const macroOutgoing = parentMacroNode
        ? macroEdges.filter((e) => e.source === parentMacroNode!.id)
        : [];

      // Verifica se a Sequência pai possui conexões macro seguintes para nós de Tag (TAG DE SAÍDA)
      const exitTagEdges = macroOutgoing.filter((me) => {
        return freshMacroNodes.some(
          (fn) => fn.id === me.target && (fn.type === 'tag' || fn.type === 'trigger')
        );
      });

      if (exitTagEdges.length > 0) {
        // REGRA PRINCIPAL: Quando o lead conclui todas as mensagens internas da sequência,
        // ele DEVE PERMANECER na sequência com status 'WAITING_TAG' (Aguardando TAG de saída).
        // A conclusão das mensagens NÃO avança o lead automaticamente e NUNCA aplica a tag ao lead.
        await prisma.automationStepLog.create({
          data: {
            enrollmentId,
            contactId: contact.id,
            nodeId: parentMacroNode!.id,
            nodeType: 'sequence_lead',
            action: 'AGUARDANDO_TAG_SAIDA',
            status: 'SUCCESS',
            details: JSON.stringify({
              sequenceId: parentMacroNode!.id,
              sequenceName: parentMacroNode!.data?.label || 'Sequência Lead',
              message: 'Mensagens internas concluídas. Lead aguardando TAG de saída para transição.',
            }),
          },
        });

        await prisma.automationEnrollment.update({
          where: { id: enrollmentId },
          data: {
            status: 'WAITING_TAG',
            currentNodeId: parentMacroNode!.id,
            completedAt: null,
          },
        });
      } else {
        // Sem nós de tag de saída conectados: conclui todo o funil
        await prisma.automationEnrollment.update({
          where: { id: enrollmentId },
          data: {
            status: 'COMPLETED',
            currentNodeId: parentMacroNode?.id || node.id,
            completedAt: new Date(),
          },
        });

        await prisma.automationStepLog.create({
          data: {
            enrollmentId,
            contactId: contact.id,
            nodeId: parentMacroNode?.id || node.id,
            nodeType: 'sequence_lead',
            action: 'CONCLUSAO_FUNIL',
            status: 'SUCCESS',
            details: JSON.stringify({
              sequenceId: parentMacroNode?.id,
              sequenceName: parentMacroNode?.data?.label,
              message: 'Lead concluiu a sequência final do funil.',
            }),
          },
        });
      }
    } else {
      for (const edge of nextOutgoing) {
        await this.executeSubflowNode(
          enrollmentId,
          edge.target,
          currentSubNodes,
          currentSubEdges,
          tenantId,
          contact,
          autoId
        );
      }
    }
    } finally {
      this.executingNodes.delete(execKey);
    }
  }

  /**
   * Avança dinamicamente o fluxo a partir de uma etapa concluída (ex: disparo da fila do WhatsApp)
   */
  async advanceFromSubflowNode(
    enrollmentId: string,
    nodeId: string,
    tenantId: string,
    autoId?: string | null
  ): Promise<void> {
    if (!enrollmentId || !nodeId) return;
    const enrollment = await prisma.automationEnrollment.findUnique({
      where: { id: enrollmentId },
      include: { contact: true, automation: true },
    });

    if (
      !enrollment ||
      enrollment.status === 'COMPLETED' ||
      enrollment.status === 'CANCELLED' ||
      enrollment.status === 'PAUSED' ||
      enrollment.automation?.status !== 'ACTIVE'
    ) {
      return;
    }

    const contact = enrollment.contact;
    const effectiveAutoId = autoId || enrollment.automationId;

    let currentSubNodes: WorkflowNode[] = [];
    let currentSubEdges: WorkflowEdge[] = [];
    let parentMacroNode: WorkflowNode | null = null;
    let macroEdges: WorkflowEdge[] = [];
    let freshMacroNodes: WorkflowNode[] = [];

    if (effectiveAutoId) {
      try {
        const freshAuto = await prisma.automation.findUnique({
          where: { id: effectiveAutoId },
          select: { nodes: true, edges: true },
        });
        if (freshAuto?.nodes) {
          freshMacroNodes = JSON.parse(freshAuto.nodes || '[]');
          macroEdges = JSON.parse(freshAuto.edges || '[]');
          for (const mn of freshMacroNodes) {
            const sub = (mn.data as any)?.subflow;
            if (sub && Array.isArray(sub.nodes) && sub.nodes.some((sn: any) => sn.id === nodeId)) {
              currentSubNodes = sub.nodes;
              currentSubEdges = sub.edges || [];
              parentMacroNode = mn;
              break;
            }
          }
        }
      } catch (err: any) {
        console.warn('[AutomationEngine] Erro ao carregar nós para avanço de etapa:', err.message);
      }
    }

    const nextOutgoing = currentSubEdges.filter((e) => e.source === nodeId);
    if (nextOutgoing.length === 0) {
      // Subfluxo interno desta sequência terminou!
      const macroOutgoing = parentMacroNode
        ? macroEdges.filter((e) => e.source === parentMacroNode!.id)
        : [];

      // Verifica se a Sequência pai possui conexões macro seguintes para nós de Tag (TAG DE SAÍDA)
      const exitTagEdges = macroOutgoing.filter((me) => {
        return freshMacroNodes.some(
          (fn) => fn.id === me.target && (fn.type === 'tag' || fn.type === 'trigger')
        );
      });

      if (exitTagEdges.length > 0) {
        // REGRA PRINCIPAL: Permanece com status 'WAITING_TAG' na sequência atual.
        // Não avança para a próxima sequência e não aplica tags ao contato.
        await prisma.automationStepLog.create({
          data: {
            enrollmentId,
            contactId: contact.id,
            nodeId: parentMacroNode!.id,
            nodeType: 'sequence_lead',
            action: 'AGUARDANDO_TAG_SAIDA',
            status: 'SUCCESS',
            details: JSON.stringify({
              sequenceId: parentMacroNode!.id,
              sequenceName: parentMacroNode!.data?.label || 'Sequência Lead',
              message: 'Mensagens internas concluídas. Lead aguardando TAG de saída para transição.',
            }),
          },
        });

        await prisma.automationEnrollment.update({
          where: { id: enrollmentId },
          data: {
            status: 'WAITING_TAG',
            currentNodeId: parentMacroNode!.id,
            completedAt: null,
          },
        });
      } else {
        // Sem nós de tag de saída conectados: conclui todo o funil
        await prisma.automationEnrollment.update({
          where: { id: enrollmentId },
          data: {
            status: 'COMPLETED',
            currentNodeId: parentMacroNode?.id || nodeId,
            completedAt: new Date(),
          },
        });

        await prisma.automationStepLog.create({
          data: {
            enrollmentId,
            contactId: contact.id,
            nodeId: parentMacroNode?.id || nodeId,
            nodeType: 'sequence_lead',
            action: 'CONCLUSAO_FUNIL',
            status: 'SUCCESS',
            details: JSON.stringify({
              sequenceId: parentMacroNode?.id,
              sequenceName: parentMacroNode?.data?.label,
              message: 'Lead concluiu a sequência final do funil.',
            }),
          },
        });
      }
    } else {
      await prisma.automationEnrollment.update({
        where: { id: enrollmentId },
        data: { status: 'ACTIVE', completedAt: null },
      });
      for (const edge of nextOutgoing) {
        await this.executeSubflowNode(
          enrollmentId,
          edge.target,
          currentSubNodes,
          currentSubEdges,
          tenantId,
          contact,
          effectiveAutoId
        );
      }
    }
  }

  /**
   * Sincroniza e inscreve leads existentes que já possuem as tags de entrada quando o fluxo é ativado
   */
  async syncExistingLeadsForAutomation(automationId: string, tenantId: string): Promise<number> {
    if (this.runningSyncs.has(automationId)) {
      return 0; // Prevenção de concorrência: já existe sincronização ativa para esta automação
    }
    this.runningSyncs.add(automationId);

    try {
      const automation = await prisma.automation.findFirst({
        where: { id: automationId, tenantId },
      });
      if (!automation || automation.status !== 'ACTIVE') return 0;

    const nodes: WorkflowNode[] = JSON.parse(automation.nodes || '[]');
    const edges: WorkflowEdge[] = JSON.parse(automation.edges || '[]');

    // REGRA DE OURO: Considera APENAS nós de TAG que sejam raízes de ENTRADA (sem arestas vindas de sequence_lead)
    const allTagNodes = nodes.filter((n) => n.type === 'tag' || n.type === 'trigger');
    const entryTagNodes = allTagNodes.filter(
      (tn) => !edges.some((e) => e.target === tn.id && nodes.some((sn) => sn.id === e.source && sn.type === 'sequence_lead'))
    );
    let totalEnrolled = 0;

    for (const tagNode of entryTagNodes) {
      const cfg = tagNode?.data?.config || {};
      const tagList: string[] =
        cfg.entryTags && Array.isArray(cfg.entryTags) && cfg.entryTags.length > 0
          ? cfg.entryTags
          : cfg.tagNames && Array.isArray(cfg.tagNames) && cfg.tagNames.length > 0
          ? cfg.tagNames
          : cfg.tagName
          ? [cfg.tagName]
          : (tagNode.data as any).tagName
          ? [(tagNode.data as any).tagName]
          : [];

      if (tagList.length === 0) continue;

      const outgoingEdges = edges.filter((e) => e.source === tagNode.id);
      const targetNodes = nodes.filter((n) => outgoingEdges.some((edge) => edge.target === n.id));

      if (targetNodes.length === 0) continue;

      const contactsWithTag = await prisma.contact.findMany({
        where: {
          tenantId,
          status: { not: 'UNSUBSCRIBED' },
          tags: {
            some: {
              tag: {
                name: { in: tagList },
              },
            },
          },
        },
        include: {
          tags: { include: { tag: true } },
        },
      });

      for (const contact of contactsWithTag) {
        const contactTagNames = new Set(contact.tags.map((t) => t.tag.name.toLowerCase().trim()));

        // Validação de exclusão
        const exclusionList: string[] = cfg.exclusionTags || [];
        if (exclusionList.length > 0) {
          const hasExclusion = exclusionList.some((ex) => contactTagNames.has(ex.toLowerCase().trim()));
          if (hasExclusion) continue;
        }

        // Validação de modo de entrada: ALL vs ANY
        const matchMode: 'ALL' | 'ANY' = cfg.matchMode || 'ALL';
        if (matchMode === 'ALL') {
          const hasAll = tagList.every((tn) => contactTagNames.has(tn.toLowerCase().trim()));
          if (!hasAll) continue;
        }

        for (const targetNode of targetNodes) {
          const isSequence = targetNode.type === 'sequence_lead';

          // Verifica se já existe QUALQUER inscrição deste contato nesta automação (independente de status)
          const existingEnrollment = await prisma.automationEnrollment.findFirst({
            where: {
              automationId,
              contactId: contact.id,
            },
            orderBy: { enteredAt: 'desc' },
          });

          if (!existingEnrollment) {
            // Novo lead elegível que entrou na TAG:
            if (isSequence) {
              await this.enrollInSequence(automationId, targetNode.id, contact.id, tenantId, {
                source: 'SYNC_ON_ACTIVATION',
                tags: tagList.join(','),
              });
            } else {
              const newEnr = await prisma.automationEnrollment.create({
                data: {
                  automationId,
                  contactId: contact.id,
                  status: 'ACTIVE',
                  metadata: JSON.stringify({ source: 'SYNC_ON_ACTIVATION', tags: tagList.join(',') }),
                },
              });
              await this.executeNode(newEnr.id, targetNode.id, tenantId);
            }
            totalEnrolled++;
          } else {
            // Lead já cadastrado:
            if (!isSequence) {
              const isTimerNode = targetNode.type === 'timer' || targetNode.type === 'delay';
              if (isTimerNode) {
                const cfg = targetNode.data?.config || {};
                const tDate = parseTargetDate(cfg.specificDate || cfg.targetDate || cfg.targetTime);
                const nowMs = Date.now();
                if (!isNaN(tDate) && tDate > nowMs) {
                  // Se é um timer configurado para o futuro, verifica se já há um job pendente sincronizado com ele
                  const existingFutureJob = await prisma.scheduledJob.findFirst({
                    where: {
                      enrollmentId: existingEnrollment.id,
                      status: 'PENDING',
                      executeAt: { gte: new Date(tDate - 2000), lte: new Date(tDate + 2000) },
                    },
                  });
                  if (!existingFutureJob) {
                    // Reconfigura o timer para a nova data futura selecionada pelo usuário
                    await prisma.scheduledJob.updateMany({
                      where: { enrollmentId: existingEnrollment.id, status: 'PENDING' },
                      data: { status: 'CANCELLED', lastError: 'Timer reconfigurado para nova data futura' },
                    });
                    await prisma.automationStepLog.deleteMany({
                      where: { enrollmentId: existingEnrollment.id, nodeId: targetNode.id },
                    });
                    await this.executeNode(existingEnrollment.id, targetNode.id, tenantId);
                    continue;
                  }
                }
              }

              const successLog = await prisma.automationStepLog.findFirst({
                where: { contactId: contact.id, nodeId: targetNode.id, status: 'SUCCESS', enrollment: { automationId } },
              });
              const pendingJob = await prisma.scheduledJob.findFirst({
                where: { enrollmentId: existingEnrollment.id, status: 'PENDING' },
              });
              if (!successLog && !pendingJob) {
                await this.executeNode(existingEnrollment.id, targetNode.id, tenantId);
              }
              continue;
            }

            // Para sequências: NUNCA reiniciar nós já enviados, mas permitir entrada e avanço em novas etapas
            const seqNode = targetNode;
            const subflow = (seqNode.data as any).subflow || {};
            const subNodes: WorkflowNode[] = subflow.nodes || [];
            const subEdges: WorkflowEdge[] = subflow.edges || [];

            if (subNodes.length === 0) continue;

            // 1. Busca todos os nós executados com SUCESSO para este lead nesta automação
            const successLogs = await prisma.automationStepLog.findMany({
              where: {
                contactId: contact.id,
                status: 'SUCCESS',
                enrollment: { automationId },
              },
              select: { nodeId: true },
            });
            const executedNodeIds = new Set(successLogs.map((l) => l.nodeId));

            // Identifica todos os nós pertencentes a ESTA sequência específica
            const thisSeqNodeIds = new Set([seqNode.id, ...subNodes.map((n) => n.id)]);
            const hasRunThisSeq = Array.from(executedNodeIds).some((id) => thisSeqNodeIds.has(id));

            const pendingJobInThisSeq = await prisma.scheduledJob.findFirst({
              where: {
                enrollmentId: existingEnrollment.id,
                status: 'PENDING',
                targetNodeId: { in: Array.from(thisSeqNodeIds) },
              },
            });

            // Se o lead NUNCA executou nenhuma etapa desta sequência e não possui job pendente nela:
            // Ele acaba de ser conectado a esta sequência (ramificação nova ou nova etapa adicionada ao fluxo)!
            if (!hasRunThisSeq && !pendingJobInThisSeq) {
              await this.enrollInSequence(automationId, seqNode.id, contact.id, tenantId, {
                source: 'SYNC_NEW_SEQUENCE_BRANCH',
                tags: tagList.join(','),
              });
              totalEnrolled++;
              continue;
            }

            // 2. Se o lead já entrou nesta sequência, verifica se novos nós internos foram adicionados
            const pendingJob = pendingJobInThisSeq;
            const nodesToExecute = new Set<string>();

            for (const executedId of Array.from(executedNodeIds)) {
              if (!thisSeqNodeIds.has(executedId)) continue;
              const outgoing = subEdges.filter((e) => e.source === executedId);
              for (const edge of outgoing) {
                if (!executedNodeIds.has(edge.target)) {
                  if (!pendingJob || pendingJob.targetNodeId !== edge.target) {
                    nodesToExecute.add(edge.target);
                  }
                }
              }
            }

            // 3. Se houver novos nós a serem percorridos internamente nesta sequência, avança o lead
            if (nodesToExecute.size > 0) {
              await prisma.automationEnrollment.update({
                where: { id: existingEnrollment.id },
                data: {
                  status: 'ACTIVE',
                  completedAt: null,
                },
              });

              for (const targetNodeId of Array.from(nodesToExecute)) {
                await this.executeSubflowNode(
                  existingEnrollment.id,
                  targetNodeId,
                  subNodes,
                  subEdges,
                  tenantId,
                  contact,
                  automationId
                );
              }
            }
          }
        }
      }
    }

    // 2. AVANÇO AUTOMÁTICO EM NOVAS ETAPAS DO MACRO FLUXO (para leads já cadastrados)
    // Se o usuário adicionou novas etapas (Sequências, Tags, Disparos, etc.) conectadas a nós já concluídos,
    // os leads devem avançar automaticamente para essas novas etapas sem reiniciar o fluxo!
    const allEnrollments = await prisma.automationEnrollment.findMany({
      where: { automationId },
      include: { contact: true },
    });

    for (const enr of allEnrollments) {
      if (!enr.contact || enr.contact.status === 'UNSUBSCRIBED') continue;

      const successLogs = await prisma.automationStepLog.findMany({
        where: {
          enrollmentId: enr.id,
          status: 'SUCCESS',
        },
        select: { nodeId: true },
      });
      const executedNodeIds = new Set(successLogs.map((l) => l.nodeId));

      const pendingJob = await prisma.scheduledJob.findFirst({
        where: { enrollmentId: enr.id, status: 'PENDING' },
      });

      for (const edge of edges) {
        if (executedNodeIds.has(edge.source) && !executedNodeIds.has(edge.target)) {
          if (!pendingJob || pendingJob.targetNodeId !== edge.target) {
            const targetNode = nodes.find((n) => n.id === edge.target);
            if (!targetNode) continue;

            if (targetNode.type === 'sequence_lead') {
              const subflow = (targetNode.data as any)?.subflow || {};
              const subNodes: WorkflowNode[] = subflow.nodes || [];
              const targetSeqIds = new Set([targetNode.id, ...subNodes.map((n) => n.id)]);
              const hasRunTarget = Array.from(executedNodeIds).some((id) => targetSeqIds.has(id));
              const hasPendingInTarget = pendingJob && targetSeqIds.has(pendingJob.targetNodeId);

              if (!hasRunTarget && !hasPendingInTarget) {
                await this.enrollInSequence(automationId, targetNode.id, enr.contactId, tenantId, {
                  source: 'SYNC_NEW_MACRO_STEP',
                });
                totalEnrolled++;
              }
            } else {
              await prisma.automationEnrollment.update({
                where: { id: enr.id },
                data: { status: 'ACTIVE', completedAt: null },
              });
              await this.executeNode(enr.id, targetNode.id, tenantId);
              totalEnrolled++;
            }
          }
        }
      }
    }

    return totalEnrolled;
    } finally {
      this.runningSyncs.delete(automationId);
    }
  }

  /**
   * Cancela imediatamente mensagens pendentes/agendadas quando uma condição ocorre
   * Ex: compra aprovada cancela lembretes de Pix e cobrança
   */
  async cancelPendingJobsForContact(tenantId: string, contactId: string, cancelCondition?: string) {
    const whereClause: any = {
      tenantId,
      contactId,
      status: 'PENDING',
    };

    if (cancelCondition) {
      whereClause.cancelCondition = cancelCondition;
    }

    const result = await prisma.scheduledJob.updateMany({
      where: whereClause,
      data: { status: 'CANCELLED' },
    });

    return result.count;
  }

  /**
   * Sincroniza e inscreve todos os grupos elegíveis configurados para uma automação de grupos
   */
  async enrollGroupsByAutomation(automationId: string): Promise<{ totalGroups: number; enrolledCount: number }> {
    const automation = await prisma.automation.findUnique({
      where: { id: automationId },
    });

    if (!automation || automation.status !== 'ACTIVE' || (automation as any).targetType !== 'GROUP') {
      return { totalGroups: 0, enrolledCount: 0 };
    }

    const tenantId = automation.tenantId;

    // 1. Grupos elegíveis para este tenant
    const where: any = {
      tenantId,
      status: { not: 'LEFT' },
    };

    if ((automation as any).whatsappInstanceId) {
      where.whatsappInstanceId = (automation as any).whatsappInstanceId;
    }

    // 2. Filtro por Tags de Grupos (tanto da coluna quanto dos nós de Tag configurados no Canvas)
    let targetTags: string[] = [];
    try {
      if ((automation as any).targetGroupTags) {
        const parsed = JSON.parse((automation as any).targetGroupTags);
        if (Array.isArray(parsed)) targetTags.push(...parsed);
      }
    } catch {}

    try {
      const macroNodes: any[] = JSON.parse(automation.nodes || '[]');
      for (const mn of macroNodes) {
        if (mn.type === 'tag' || mn.type === 'trigger') {
          const cfg = mn.data?.config || {};
          const tList: string[] =
            cfg.entryTags ||
            cfg.tagNames ||
            (cfg.tagName ? [cfg.tagName] : (mn.data as any)?.tagName ? [(mn.data as any).tagName] : []);
          tList.forEach((t) => {
            if (!targetTags.includes(t)) targetTags.push(t);
          });
        }
      }
    } catch {}

    // 3. Filtro por Seleção Manual de Grupos
    let manualGroupIds: string[] = [];
    try {
      if ((automation as any).targetGroupIds) {
        manualGroupIds = JSON.parse((automation as any).targetGroupIds);
      }
    } catch {}

    // Aplica filtros combinados (tolerante a tags com ou sem prefixo '#')
    if (targetTags.length > 0) {
      where.tags = {
        some: {
          tag: {
            OR: [
              { id: { in: targetTags } },
              { name: { in: targetTags } },
              ...targetTags.map((t) => ({ name: t.toLowerCase() })),
              ...targetTags.map((t) => ({ name: t.toUpperCase() })),
              ...targetTags.map((t) => ({ name: t.replace(/^#/, '') })),
              ...targetTags.map((t) => ({ name: `#${t.replace(/^#/, '')}` })),
              ...targetTags.map((t) => ({ name: t.replace(/^#/, '').toLowerCase() })),
              ...targetTags.map((t) => ({ name: t.replace(/^#/, '').toUpperCase() })),
            ],
          },
        },
      };
    }

    if (manualGroupIds.length > 0) {
      where.OR = [
        { id: { in: manualGroupIds } },
        { jid: { in: manualGroupIds } },
      ];
    }

    const eligibleGroups = await prisma.whatsappGroup.findMany({
      where,
      include: {
        whatsappInstance: true,
        tags: { include: { tag: true } },
      },
    });

    // SUPORTE A COMUNIDADES: Se uma comunidade foi selecionada diretamente ou através de Tag,
    // expande automaticamente para todos os subgrupos elegíveis vinculados a ela
    const targetGroupsMap = new Map<string, (typeof eligibleGroups)[0]>();
    for (const group of eligibleGroups) {
      targetGroupsMap.set(group.id, group);

      if ((group as any).isCommunity) {
        const subGroups = await prisma.whatsappGroup.findMany({
          where: {
            tenantId,
            parentCommunityJid: group.jid,
            status: { not: 'LEFT' },
            isEligible: true,
          },
          include: {
            whatsappInstance: true,
            tags: { include: { tag: true } },
          },
        });
        for (const sub of subGroups) {
          targetGroupsMap.set(sub.id, sub);
        }
      }
    }

    const finalTargetGroups = Array.from(targetGroupsMap.values());
    let enrolledCount = 0;

    for (const group of finalTargetGroups) {
      try {
        const res = await this.enrollGroup(automationId, group.id);
        if (res && (res.started || res.alreadyEnrolled)) {
          enrolledCount++;
        }
      } catch (err: any) {
        console.error(`[AutomationEngine] Erro ao inscrever grupo ${group.name} (${group.jid}):`, err.message);
      }
    }

    return {
      totalGroups: finalTargetGroups.length,
      enrolledCount,
    };
  }

  /**
   * Inscreve um grupo individual em um fluxo de automação de grupos
   */
  async enrollGroup(automationId: string, groupId: string, metadata: Record<string, any> = {}) {
    const automation = await prisma.automation.findUnique({
      where: { id: automationId },
    });

    if (!automation) throw new Error('Automação não encontrada');
    if (automation.status !== 'ACTIVE') {
      return { skipped: true, reason: 'Automação não está ativa' };
    }

    const group = await prisma.whatsappGroup.findUnique({
      where: { id: groupId },
      include: { whatsappInstance: true },
    });

    if (!group) throw new Error('Grupo não encontrado');
    if (group.status === 'LEFT') {
      return { skipped: true, reason: 'A instância saiu do grupo' };
    }

    // Regra: Não duplicar execuções para o mesmo grupo no mesmo fluxo
    const existingEnrollment = await prisma.automationGroupEnrollment.findUnique({
      where: {
        automationId_groupId: {
          automationId,
          groupId,
        },
      },
    });

    if (existingEnrollment) {
      // Se novas etapas foram adicionadas ao fluxo de grupos, retoma a execução apenas para os novos nós
      await this.checkAndAdvanceNewGroupNodes(existingEnrollment.id, automation);
      return { enrollmentId: existingEnrollment.id, alreadyEnrolled: true };
    }

    // Cria a inscrição do grupo
    const enrollment = await prisma.automationGroupEnrollment.create({
      data: {
        automationId,
        groupId,
        tenantId: automation.tenantId,
        status: 'ACTIVE',
        metadata: JSON.stringify(metadata),
      },
    });

    // Encontra nós do fluxo
    const nodes: WorkflowNode[] = JSON.parse(automation.nodes || '[]');
    const edges: WorkflowEdge[] = JSON.parse(automation.edges || '[]');

    const triggerNode =
      nodes.find(
        (n) =>
          n.type === 'tag' ||
          n.data?.type === 'tag' ||
          n.type === 'trigger' ||
          n.data?.type === 'trigger' ||
          n.type === 'start' ||
          !edges.some((e) => e.target === n.id)
      ) || nodes[0];
    if (!triggerNode) {
      await prisma.automationGroupEnrollment.update({
        where: { id: enrollment.id },
        data: { status: 'COMPLETED', completedAt: new Date() },
      });
      return { enrollmentId: enrollment.id, completed: true };
    }

    // Registra log do gatilho para o grupo
    await prisma.automationGroupStepLog.create({
      data: {
        enrollmentId: enrollment.id,
        groupId,
        tenantId: automation.tenantId,
        nodeId: triggerNode.id,
        nodeType: 'trigger',
        action: triggerNode.data?.subtype || 'TRIGGER_GROUP_FIRED',
        status: 'SUCCESS',
        details: JSON.stringify({ trigger: triggerNode.data?.label || 'Gatilho de Grupo' }),
      },
    });

    // Percorre os nós conectados ao gatilho
    const outgoingEdges = edges.filter((e) => e.source === triggerNode.id);
    for (const edge of outgoingEdges) {
      await this.executeGroupNode(enrollment.id, edge.target, automation.tenantId);
    }

    return { enrollmentId: enrollment.id, started: true };
  }

  /**
   * Executa um nó da automação para o grupo inscrito
   */
  async executeGroupNode(enrollmentId: string, nodeId: string, tenantId: string): Promise<void> {
    const enrollment = await prisma.automationGroupEnrollment.findUnique({
      where: { id: enrollmentId },
      include: {
        automation: true,
        group: {
          include: { whatsappInstance: true, tags: { include: { tag: true } } },
        },
      },
    });

    if (
      !enrollment ||
      enrollment.status === 'CANCELLED' ||
      enrollment.status === 'PAUSED' ||
      enrollment.automation?.status !== 'ACTIVE'
    ) {
      return;
    }

    const { automation, group } = enrollment;

    // 1. Validação de fluxo ativo e integridade do grupo
    if (automation.status !== 'ACTIVE') {
      console.log(`[STATE MACHINE - BLOQUEIO] Fluxo "${automation.name}" não está ativo (status: ${automation.status}).`);
      return;
    }

    if (group.status === 'LEFT') {
      console.log(`[STATE MACHINE - BLOQUEIO] Instância não participa mais do grupo ${group.name} (${group.jid}).`);
      return;
    }

    const nodes: WorkflowNode[] = JSON.parse(automation.nodes || '[]');
    const edges: WorkflowEdge[] = JSON.parse(automation.edges || '[]');

    const node = nodes.find((n) => n.id === nodeId);
    if (!node) return;

    const nodeType = node.data?.type || node.type;

    // 2. Regra Anti-Duplicação e Idempotência:
    // Se o nó já foi concluído (SUCCESS) ou está em processamento (QUEUED / PROCESSING), NÃO reexecuta!
    const existingLog = await prisma.automationGroupStepLog.findFirst({
      where: {
        enrollmentId,
        nodeId,
        status: { in: ['SUCCESS', 'QUEUED', 'PROCESSING'] },
        action: { not: 'WAIT_TIMER' },
      },
    });

    if (existingLog) {
      console.log(
        `[STATE MACHINE] Etapa "${node.data?.label || nodeType}" (${nodeId}) já executada/em fila para o grupo ${group.name} (status: ${existingLog.status}).`
      );
      return;
    }

    // 3. VALIDAÇÃO DE PRÉ-REQUISITOS (DEPENDÊNCIA SEQUENCIAL ESTRITA)
    // Uma etapa SOMENTE pode ser executada se TODAS as etapas anteriores conectadas a ela
    // tiverem sido previamente concluídas com SUCCESS (e nunca com WAIT_TIMER pendente).
    const incomingEdges = edges.filter((e) => e.target === nodeId);
    if (incomingEdges.length > 0) {
      for (const inc of incomingEdges) {
        const sourceLog = await prisma.automationGroupStepLog.findFirst({
          where: {
            enrollmentId,
            nodeId: inc.source,
            status: 'SUCCESS',
            action: { not: 'WAIT_TIMER' },
          },
        });

        if (!sourceLog) {
          const sourceNode = nodes.find((n) => n.id === inc.source);
          console.log(
            `[STATE MACHINE - BLOQUEIO SEQUENCIAL]\n` +
            `Grupo: ${group.name} (${group.jid})\n` +
            `Fluxo: ${automation.name} (${automation.id})\n` +
            `Etapa tentada: ${node.data?.label || nodeType} (${nodeId})\n` +
            `Motivo do bloqueio: A etapa anterior "${sourceNode?.data?.label || inc.source}" ainda não foi concluída com sucesso.\n` +
            `Horário: ${formatBrasiliaDateTime(Date.now())}`
          );
          return;
        }
      }
    }

    // 4. VALIDAÇÃO DE TIMER BLOQUEANTE COM ESCOPO LOCAL DE RAMIFICAÇÃO (GRAFO DIRECIONADO)
    // O timer possui escopo LOCAL à sua ramificação: ele bloqueia exclusivamente os nós descendentes
    // que dependem dele no grafo. Ramificações paralelas NUNCA são bloqueadas ou atrasadas por timers de outros ramos!
    const waitLogs = await prisma.automationGroupStepLog.findMany({
      where: {
        enrollmentId,
        action: 'WAIT_TIMER',
      },
    });

    if (waitLogs.length > 0) {
      const passedLogs = await prisma.automationGroupStepLog.findMany({
        where: {
          enrollmentId,
          action: { in: ['TIMER_PASSED', 'TIMER_EXPIRED_SKIPPED'] },
        },
        select: { nodeId: true },
      });
      const passedIds = new Set(passedLogs.map((p) => p.nodeId));
      const pendingTimers = waitLogs.filter((w) => !passedIds.has(w.nodeId) && w.nodeId !== nodeId);

      for (const pending of pendingTimers) {
        // Bloqueia SOMENTE se o timer pendente for um ancestral deste nó no grafo direcionado
        if (isNodeReachable(pending.nodeId, nodeId, edges)) {
          const timerNode = nodes.find((n) => n.id === pending.nodeId);
          console.log(
            `[STATE MACHINE - BLOQUEIO TIMER LOCAL]\n` +
            `Grupo: ${group.name} (${group.jid})\n` +
            `Fluxo: ${automation.name} (${automation.id})\n` +
            `Etapa tentada: ${node.data?.label || nodeType} (${nodeId})\n` +
            `Motivo do bloqueio: Esta ramificação depende do timer "${timerNode?.data?.label || pending.nodeId}" que ainda está aguardando seu horário.\n` +
            `Horário: ${formatBrasiliaDateTime(Date.now())}`
          );
          return;
        }
      }
    }

    if (enrollment.status === 'COMPLETED') {
      await prisma.automationGroupEnrollment.update({
        where: { id: enrollmentId },
        data: { status: 'ACTIVE', completedAt: null },
      });
      enrollment.status = 'ACTIVE';
    }

    // 5. ATUALIZAÇÃO DA MÁQUINA DE ESTADOS (RAMIFICAÇÃO / ETAPA ATUAL / PRÓXIMA ETAPA)
    const outgoingEdges = edges.filter((e) => e.source === nodeId);
    const nextNode = outgoingEdges.length > 0 ? nodes.find((n) => n.id === outgoingEdges[0].target) : null;
    const nextStepLabel = nextNode?.data?.label || (nextNode ? nextNode.type : 'Fim da Ramificação');
    const currentBranchId = findBranchIdForNode(nodeId, nodes, edges);

    let currentMeta: any = {};
    try {
      currentMeta = JSON.parse(enrollment.metadata || '{}');
    } catch {}
    if (!currentMeta.branches || typeof currentMeta.branches !== 'object') {
      currentMeta.branches = {};
    }

    currentMeta.branches[currentBranchId] = {
      branchId: currentBranchId,
      currentNodeId: nodeId,
      currentStepType: nodeType,
      currentStepLabel: node.data?.label || nodeType,
      nextStepId: nextNode?.id || null,
      nextStepLabel,
      state: 'RUNNING',
      waitingUntil: null,
      lastExecutedAt: new Date().toISOString(),
    };

    await prisma.automationGroupEnrollment.update({
      where: { id: enrollmentId },
      data: {
        currentNodeId: nodeId,
        status: 'ACTIVE',
        metadata: JSON.stringify(currentMeta),
      },
    });

    console.log(
      `[STATE MACHINE - EXECUÇÃO]\n` +
      `Grupo: ${group.name} (${group.jid})\n` +
      `Fluxo: ${automation.name} (${automation.id})\n` +
      `Etapa atual: ${node.data?.label || nodeType} (${nodeId})\n` +
      `Próxima etapa: ${nextStepLabel} (${nextNode?.id || 'FIM'})\n` +
      `Horário: ${formatBrasiliaDateTime(Date.now())}\n` +
      `Resultado: INICIADO\n` +
      `Tempo aguardado: 0s`
    );

    // 1. Nó do tipo TIMER
    if (nodeType === 'timer' || nodeType === 'delay') {
      const config = node.data?.config || {};
      let targetTimestamp: number;
      const targetTimeStr = config.specificDate || config.targetDate || config.targetTime;
      const isSpecificGroup = Boolean(
        config.timerType === 'SPECIFIC_DATE' ||
        config.delayType === 'specific_date' ||
        targetTimeStr
      );

      if (isSpecificGroup) {
        targetTimestamp = parseTargetDate(targetTimeStr);
        if (isNaN(targetTimestamp)) {
          console.error(
            `[TIMER CRÍTICO - GRUPO] Data específica inválida: "${targetTimeStr}". Bloqueando execução antecipada.`
          );
          return;
        }
      } else {
        const rawUnit = (config.unit || 'minutes').toLowerCase().trim();
        const rawVal = Number(
          config.value ??
          config.duration ??
          config.minutes ??
          config.delayValue ??
          config.timeValue ??
          1
        ) || 1;
        let delayMs = rawVal * 60000;
        if (rawUnit === 'seconds' || rawUnit === 'segundos' || rawUnit === 's') {
          delayMs = rawVal * 1000;
        } else if (rawUnit === 'hours' || rawUnit === 'horas' || rawUnit === 'h') {
          delayMs = rawVal * 3600000;
        } else if (rawUnit === 'days' || rawUnit === 'dias' || rawUnit === 'd') {
          delayMs = rawVal * 86400000;
        } else {
          delayMs = rawVal * 60000;
        }
        targetTimestamp = Date.now() + delayMs;
      }

      const now = Date.now();

      if (targetTimestamp > now) {
        const remainingMs = targetTimestamp - now;
        console.log(
          `[TIMER AGENDADO - GRUPO] Enrollment: ${enrollmentId} | Grupo: ${group.name} | Tipo: ${isSpecificGroup ? 'SPECIFIC_DATE' : 'RELATIVE'} | Data programada: ${formatBrasiliaDateTime(targetTimestamp)} (${new Date(targetTimestamp).toISOString()}) | Horário atual: ${formatBrasiliaDateTime(now)} (${new Date(now).toISOString()}) | Tempo restante: ${formatRemainingTime(remainingMs)}`
        );

        // Atualiza a ramificação específica para WAITING com escopo local
        currentMeta.branches[currentBranchId] = {
          branchId: currentBranchId,
          currentNodeId: nodeId,
          currentStepType: 'timer',
          currentStepLabel: node.data?.label || 'Timer',
          nextStepId: nextNode?.id || null,
          nextStepLabel,
          state: 'WAITING',
          waitingUntil: new Date(targetTimestamp).toISOString(),
          lastExecutedAt: new Date().toISOString(),
        };

        // Se existirem outras ramificações em RUNNING, o enrollment global permanece ACTIVE
        const branchList: any[] = Object.values(currentMeta.branches);
        const hasOtherRunningBranch = branchList.some(
          (b) => b.branchId !== currentBranchId && b.state === 'RUNNING'
        );

        await prisma.automationGroupEnrollment.update({
          where: { id: enrollmentId },
          data: {
            status: hasOtherRunningBranch ? 'ACTIVE' : 'WAITING',
            currentNodeId: nodeId,
            metadata: JSON.stringify(currentMeta),
          },
        });

        // CRÍTICO: Status DEVE SER 'WAITING', NUNCA 'SUCCESS'!
        await prisma.automationGroupStepLog.create({
          data: {
            enrollmentId,
            groupId: group.id,
            tenantId,
            nodeId,
            nodeType: 'timer',
            action: 'WAIT_TIMER',
            status: 'WAITING',
            details: JSON.stringify({
              targetDate: new Date(targetTimestamp).toISOString(),
              scheduledFor: new Date(targetTimestamp).toISOString(),
              timerType: isSpecificGroup ? 'SPECIFIC_DATE' : 'RELATIVE',
              remainingMs,
            }),
          },
        });
        return; // Aguarda o horário
      }

      // SEGURANÇA MÁXIMA: Se por qualquer razão tentar executar antes da hora:
      if (targetTimestamp > now) {
        console.error(
          `[ERRO CRÍTICO] Bloqueio de segurança: tentativa de execução antecipada no grupo ${group.name}! Previsto: ${new Date(targetTimestamp).toISOString()} vs Atual: ${new Date(now).toISOString()}`
        );
        return;
      }

      // Se o horário já chegou ou passou:
      const dispatchAfterPassedGroup = isSpecificGroup ? config.dispatchAfterPassed !== false : true;

      if (!dispatchAfterPassedGroup && targetTimestamp <= now) {
        // Condicional NÃO: grupo chegou após o horário e não deve disparar
        await prisma.automationGroupStepLog.create({
          data: {
            enrollmentId,
            groupId: group.id,
            tenantId,
            nodeId,
            nodeType: 'timer',
            action: 'TIMER_EXPIRED_SKIPPED',
            status: 'SKIPPED',
            details: JSON.stringify({
              reason: 'Grupo chegou após o horário agendado e a condicional de disparar após o horário está desativada (NÃO)',
              targetDate: new Date(targetTimestamp).toISOString(),
            }),
          },
        });
        return; // Não avança para os próximos nós do grupo
      }

      const diffSec = Math.round((now - targetTimestamp) / 1000);
      console.log(
        `[TIMER EXECUTADO - GRUPO] Enrollment: ${enrollmentId} | Grupo: ${group.name} | Data prevista: ${formatBrasiliaDateTime(targetTimestamp)} | Data real: ${formatBrasiliaDateTime(now)} | Diferença: ${diffSec}s`
      );

      await prisma.automationGroupStepLog.create({
        data: {
          enrollmentId,
          groupId: group.id,
          tenantId,
          nodeId,
          nodeType: 'timer',
          action: 'TIMER_PASSED',
          status: 'SUCCESS',
          details: JSON.stringify({
            passedAt: new Date().toISOString(),
            scheduledFor: new Date(targetTimestamp).toISOString(),
          }),
        },
      });

      const outgoingEdges = edges.filter((e) => e.source === nodeId);
      for (const edge of outgoingEdges) {
        await this.executeGroupNode(enrollmentId, edge.target, tenantId);
      }
      return;
    }

    // 2. Nó de Envio de WHATSAPP no Grupo
    if (nodeType === 'whatsapp') {
      const config = node.data?.config || {};

      // GUARDA ANTI-DUPLICAÇÃO: Verifica se já existe mensagem enfileirada ou enviada para este nó e grupo
      try {
        const existingQueue = await (prisma as any).whatsappQueue.findFirst({
          where: {
            tenantId,
            nodeId,
            groupEnrollmentId: enrollmentId,
            status: { in: ['PENDING', 'PROCESSING', 'SENT'] },
          },
        });

        if (existingQueue) {
          console.warn(
            `[ANTI-DUPLICAÇÃO] Mensagem de grupo para nó ${nodeId} já existe na fila (id: ${existingQueue.id}, status: ${existingQueue.status}). Abortando duplicação.`
          );
          return;
        }
      } catch {}

      // REGRA ESTRITA: O ÚNICO número permitido para disparar na automação deve ser o número configurado nela.
      let targetInstanceId =
        config.whatsappInstanceId ||
        (automation as any).flowWhatsappInstanceId ||
        (automation as any).whatsappInstanceId ||
        group.whatsappInstanceId;

      if (!targetInstanceId) {
        const discReason = 'Nenhum número de WhatsApp configurado para este fluxo de grupos. Disparo bloqueado.';
        console.warn(`[GroupEngine] 🛑 ${discReason} Pausando automação ${automation.id}.`);
        await this.pauseAutomationDueToDisconnectedWhatsapp(automation.id, tenantId, discReason);
        return;
      }

      const configuredInst = await prisma.whatsappInstance.findFirst({
        where: { id: targetInstanceId, ...(tenantId ? { tenantId } : {}) },
        select: { id: true, status: true, name: true, phone: true },
      }).catch(() => null);

      if (!configuredInst || configuredInst.status !== 'CONNECTED') {
        const discReason = `O número configurado ("${configuredInst?.name || configuredInst?.phone || targetInstanceId}") está desconectado.`;
        console.warn(`[GroupEngine] 🛑 ${discReason} Pausando automação ${automation.id} imediatamente.`);
        await this.pauseAutomationDueToDisconnectedWhatsapp(automation.id, tenantId, discReason);
        return;
      }

      // Validação de elegibilidade (apenas com a instância configurada, sem troca de número)
      const check = await whatsappGroupService.verifyGroupEligibility(
        tenantId,
        group.jid,
        targetInstanceId
      );

      if (!check.eligible) {
        await prisma.automationGroupStepLog.create({
          data: {
            enrollmentId,
            groupId: group.id,
            tenantId,
            nodeId,
            nodeType: 'whatsapp',
            action: 'SEND_GROUP_WHATSAPP_ABORTED',
            status: 'FAILED',
            details: JSON.stringify({ error: check.reason || 'Instância não é administradora do grupo' }),
          },
        });

        await prisma.automationGroupEnrollment.update({
          where: { id: enrollmentId },
          data: { status: 'FAILED' },
        });
        return;
      }

      // Cria log em status QUEUED
      await prisma.automationGroupStepLog.create({
        data: {
          enrollmentId,
          groupId: group.id,
          tenantId,
          nodeId,
          nodeType: 'whatsapp',
          action: 'QUEUE_GROUP_WHATSAPP',
          status: 'QUEUED',
          details: JSON.stringify({
            groupJid: group.jid,
            text: (config.text || config.caption || '').slice(0, 100),
          }),
        },
      });

      // Disparo Direto: Se o nó for precedido diretamente por Tag/Trigger (sem timers intermediários),
      // o primeiro grupo é disparado IMEDIATAMENTE (forceImmediate) sem espera desnecessária
      const incomingToNode = edges.filter((e) => e.target === nodeId);
      const isDirectConnection = incomingToNode.some((e) => {
        const src = nodes.find((n) => n.id === e.source);
        return src && (src.type === 'tag' || src.type === 'trigger');
      });

      let existingPendingCount = 0;
      try {
        if ((prisma as any).whatsappQueue) {
          existingPendingCount = await (prisma as any).whatsappQueue.count({
            where: {
              nodeId,
              status: { in: ['PENDING', 'PROCESSING'] },
            },
          });
        }
      } catch {}

      const forceImmediate = isDirectConnection && existingPendingCount === 0;

      // Enfileira mensagem para o grupo na fila persistente com delay entre grupos
      await WhatsappQueueService.enqueue({
        tenantId,
        whatsappInstanceId: targetInstanceId,
        phone: group.jid, // JID do grupo
        contactName: group.name,
        recipientType: 'GROUP',
        groupJid: group.jid,
        groupEnrollmentId: enrollmentId,
        nodeId,
        automationId: automation.id,
        text: config.text || config.caption || '',
        messageType: config.mediaUrl ? (config.messageType || 'image') : 'text',
        mediaUrl: config.mediaUrl,
        mediaFileName: config.mediaFileName,
        caption: config.caption,
        blocks: config.blocks,
        forceImmediate,
        fixedDelaySeconds: (automation as any).delayBetweenGroups ?? 30,
        useRandomDelay: (automation as any).useRandomDelay ?? true,
        minDelaySeconds: (automation as any).minDelaySeconds ?? 20,
        maxDelaySeconds: (automation as any).maxDelaySeconds ?? 45,
      });

      return; // A conclusão e avanço acontecem quando a mensagem é enviada pela fila
    }

    // 2.2. Ação / Edição de Grupos (Abrir/Fechar mensagens, Alterar Nome/Assunto com regra do #, Alterar Descrição, Alterar Imagem)
    if (nodeType === 'editar_grupo' || nodeType === 'group_action') {
      const cfg = node.data?.config || {};
      const actionType = cfg.groupActionType || 'multi_config';

      // 1. Checagem de elegibilidade e permissão administrativa (Requisito Teste 4)
      const instanceId = (automation as any).whatsappInstanceId || group.whatsappInstanceId;
      const check = await whatsappGroupService.checkGroupEligibility(group.id, instanceId, tenantId);

      if (!check.eligible) {
        const adminErrorMsg = check.reason || 'Instância conectada não possui permissão de administrador no grupo';
        console.warn(`[Automation Engine] Edição de grupo abortada para ${group.name} (${group.jid}): ${adminErrorMsg}`);

        await prisma.automationGroupStepLog.create({
          data: {
            enrollmentId,
            groupId: group.id,
            tenantId,
            nodeId,
            nodeType: 'editar_grupo',
            action: 'EDIT_GROUP_ABORTED_NO_ADMIN',
            status: 'FAILED',
            details: JSON.stringify({ error: adminErrorMsg, groupJid: group.jid }),
          },
        });
        return; // Não tenta alterar e informa falta de permissão!
      }

      const instance = check.instance || await prisma.whatsappInstance.findUnique({
        where: { id: instanceId },
      });
      let instanceName: string | undefined = instance?.instanceName || group.whatsappInstance?.instanceName;
      if (!instanceName) {
        const anyActiveInstance = await prisma.whatsappInstance.findFirst({
          where: { tenantId, status: 'CONNECTED' },
        });
        instanceName = anyActiveInstance?.instanceName;
      }

      if (!instanceName) {
        console.error(`[Automation Engine] Nenhuma instância de WhatsApp conectada para executar ação no grupo ${group.name}`);
        await prisma.automationGroupStepLog.create({
          data: {
            enrollmentId,
            groupId: group.id,
            tenantId,
            nodeId,
            nodeType: 'editar_grupo',
            action: 'EDIT_GROUP_NO_INSTANCE',
            status: 'FAILED',
            details: JSON.stringify({ error: 'Nenhuma instância de WhatsApp ativa encontrada' }),
          },
        });
        return;
      }

      const updateErrors: string[] = [];
      const updatedActions: string[] = [];

      try {
        // 1. Alterar Permissão (Fechar / Abrir Grupo)
        const shouldUpdateSetting = Boolean(
          cfg.enableUpdateSetting ||
          actionType === 'close_group' ||
          actionType === 'open_group'
        );
        if (shouldUpdateSetting) {
          const settingMode = cfg.groupSetting || (actionType === 'close_group' ? 'announcement' : 'not_announcement');
          const setRes = await whatsappGroupService.updateGroupSetting(instanceName, group.jid, settingMode);
          if (setRes.success) {
            updatedActions.push(`Permissão: ${settingMode}`);
          } else {
            updateErrors.push(`Falha ao alterar permissão: ${setRes.error || 'Erro na API'}`);
          }
        }

        // 2. Alterar Nome do Grupo com a Regra do Hashtag (#):
        // Caso o nome do seu grupo contenha '#' (hashtag), o caractere especial '#'
        // permanecerá junto com os elementos que o seguem.
        // Exemplo: Nome atual "Lançamento #10", Novo nome "Vagas abertas" -> "Vagas abertas #10"
        const shouldUpdateSubject = Boolean(
          cfg.enableUpdateSubject ||
          actionType === 'update_subject' ||
          (cfg.newSubject && cfg.newSubject.trim().length > 0)
        );
        const rawNewSubject = cfg.newSubject || cfg.subject;

        if (shouldUpdateSubject && rawNewSubject) {
          const finalSubject = computeGroupNameWithHashtagRule(group.name, rawNewSubject);
          const subjRes = await whatsappGroupService.updateGroupSubject(instanceName, group.jid, finalSubject);
          if (subjRes.success) {
            await prisma.whatsappGroup.update({
              where: { id: group.id },
              data: { name: finalSubject },
            });
            updatedActions.push(`Nome: ${finalSubject}`);
          } else {
            updateErrors.push(`Falha ao alterar nome: ${subjRes.error || 'Erro na API'}`);
          }
        }

        // 3. Alterar Descrição do Grupo
        const shouldUpdateDescription = Boolean(
          cfg.enableUpdateDescription ||
          actionType === 'update_description' ||
          (cfg.newDescription && cfg.newDescription.trim().length > 0)
        );
        const newDesc = cfg.newDescription || cfg.description;
        if (shouldUpdateDescription && newDesc) {
          const descRes = await whatsappGroupService.updateGroupDescription(instanceName, group.jid, newDesc);
          if (descRes.success) {
            updatedActions.push('Descrição atualizada');
          } else {
            updateErrors.push(`Falha ao alterar descrição: ${descRes.error || 'Erro na API'}`);
          }
        }

        // 4. Alterar Imagem do Grupo (Validação de formato e confirmação obrigatória)
        const shouldUpdatePicture = Boolean(
          cfg.enableUpdatePicture ||
          actionType === 'update_picture' ||
          (cfg.pictureUrl && cfg.pictureUrl.trim().length > 0)
        );
        const newPicture = cfg.pictureUrl || cfg.newPicture;
        if (shouldUpdatePicture) {
          if (!newPicture) {
            updateErrors.push('Falha ao alterar imagem do grupo: Nenhuma imagem fornecida');
          } else {
            const picRes = await whatsappGroupService.updateGroupPicture(instanceName, group.jid, newPicture);
            if (picRes.success) {
              await prisma.whatsappGroup.update({
                where: { id: group.id },
                data: { pictureUrl: newPicture },
              });
              updatedActions.push('Imagem alterada com sucesso');
            } else {
              updateErrors.push(picRes.error || 'Falha ao alterar imagem do grupo Motivo: retorno da API');
            }
          }
        }
      } catch (err: any) {
        console.error('[Automation Engine] Error executing group action:', err);
        updateErrors.push(err.message || 'Erro inesperado na execução das ações do grupo');
      }

      // Se todas as ações falharam (ex: erro de imagem inválida ou retorno negativo da Evolution API),
      // registra log de falha e não marca como sucesso falso! (Requisito 5)
      if (updateErrors.length > 0 && updatedActions.length === 0) {
        const combinedError = updateErrors.join(' | ');
        console.error(`[Automation Engine] Falha na edição do grupo ${group.name}: ${combinedError}`);
        await prisma.automationGroupStepLog.create({
          data: {
            enrollmentId,
            groupId: group.id,
            tenantId,
            nodeId,
            nodeType: 'editar_grupo',
            action: actionType,
            status: 'FAILED',
            details: JSON.stringify({ error: combinedError, actions: updatedActions }),
          },
        });
        return; // Interrompe para não avançar com falha!
      }

      // Se houver mensagem configurada junto ou for do tipo message
      const hasMessage = actionType === 'message' || Boolean(cfg.message || cfg.text || (cfg.blocks && cfg.blocks.length > 0));
      if (hasMessage) {
        // Registra log em status QUEUED para rastreabilidade, cálculo de badges e atualização correta pela fila
        await prisma.automationGroupStepLog.create({
          data: {
            enrollmentId,
            groupId: group.id,
            tenantId,
            nodeId,
            nodeType: 'editar_grupo',
            action: 'QUEUE_GROUP_WHATSAPP',
            status: 'QUEUED',
            details: JSON.stringify({
              actionType,
              groupJid: group.jid,
              actions: updatedActions,
              text: (cfg.message || cfg.text || cfg.caption || '').slice(0, 100),
              label: node.data?.label || 'Configurar grupo',
            }),
          },
        });

        await WhatsappQueueService.enqueue({
          tenantId,
          whatsappInstanceId: (automation as any).whatsappInstanceId || group.whatsappInstanceId,
          phone: group.jid,
          contactName: group.name,
          recipientType: 'GROUP',
          groupJid: group.jid,
          groupEnrollmentId: enrollmentId,
          nodeId,
          automationId: automation.id,
          text: cfg.message || cfg.text || cfg.caption || '',
          messageType: cfg.mediaUrl ? (cfg.messageType || 'image') : 'text',
          mediaUrl: cfg.mediaUrl,
          mediaFileName: cfg.mediaFileName,
          caption: cfg.caption,
          blocks: cfg.blocks,
          fixedDelaySeconds: (automation as any).delayBetweenGroups ?? 30,
          useRandomDelay: (automation as any).useRandomDelay ?? true,
          minDelaySeconds: (automation as any).minDelaySeconds ?? 20,
          maxDelaySeconds: (automation as any).maxDelaySeconds ?? 45,
        });
        return; // A fila concluirá o passo e avançará para os nós seguintes através de advanceGroupNode
      }

      // Se não enviou mensagem (apenas configurou o grupo), registra log de sucesso
      await prisma.automationGroupStepLog.create({
        data: {
          enrollmentId,
          groupId: group.id,
          tenantId,
          nodeId,
          nodeType: 'editar_grupo',
          action: actionType,
          status: 'SUCCESS',
          details: JSON.stringify({
            actionType,
            actions: updatedActions,
            errors: updateErrors.length > 0 ? updateErrors : undefined,
            label: node.data?.label || 'Editar grupos',
          }),
        },
      });

      // Avança de forma segura e inteligente respeitando outros ramos e timers pendentes
      await this.advanceGroupNode(enrollmentId, nodeId, tenantId, automation.id);
      return;
    }

    // 2.3. Nó de Condição / Decisão
    if ((nodeType as string) === 'condition' || (nodeType as string) === 'condicao') {
      const config = node.data?.config || {};
      const condType = config.conditionType || config.type || 'has_tag';
      let conditionResult = false;
      let reason = '';

      if (condType === 'has_tag') {
        const targetTag = (config.tagName || config.tag || '').toLowerCase().trim();
        const groupTags = group.tags?.map((t: any) => t.tag?.name?.toLowerCase().trim()) || [];
        conditionResult = groupTags.includes(targetTag) || groupTags.includes(`#${targetTag.replace(/^#/, '')}`);
        reason = conditionResult ? `Grupo possui a tag "${targetTag}"` : `Grupo NÃO possui a tag "${targetTag}"`;
      } else if (condType === 'is_admin') {
        conditionResult = Boolean(group.isAdmin);
        reason = conditionResult ? 'Instância é administradora do grupo' : 'Instância NÃO é administradora';
      } else if (condType === 'is_community') {
        conditionResult = Boolean((group as any).isCommunity);
        reason = conditionResult ? 'Grupo é uma Comunidade' : 'Grupo NÃO é uma Comunidade';
      } else {
        conditionResult = true;
        reason = 'Condição padrão atendida';
      }

      await prisma.automationGroupStepLog.create({
        data: {
          enrollmentId,
          groupId: group.id,
          tenantId,
          nodeId,
          nodeType: 'condition',
          action: 'CONDITION_EVALUATED',
          status: 'SUCCESS',
          details: JSON.stringify({
            conditionType: condType,
            result: conditionResult,
            reason,
          }),
        },
      });

      const chosenHandle = conditionResult ? 'true' : 'false';
      console.log(
        `[STATE MACHINE - CONDIÇÃO] Grupo: ${group.name} | Resultado: ${conditionResult} (${reason}) | Ramo selecionado: ${chosenHandle}`
      );
      await this.advanceGroupNode(enrollmentId, nodeId, tenantId, automation.id, chosenHandle);
      return;
    }

    // 3. Outros nós (Ações, Tags de Grupos, etc.)
    await prisma.automationGroupStepLog.create({
      data: {
        enrollmentId,
        groupId: group.id,
        tenantId,
        nodeId,
        nodeType,
        action: node.data?.subtype || 'STEP_EXECUTED',
        status: 'SUCCESS',
        details: JSON.stringify({ label: node.data?.label || nodeType }),
      },
    });

    // Avança de forma segura e inteligente respeitando outros ramos e timers pendentes
    await this.advanceGroupNode(enrollmentId, nodeId, tenantId, automation.id);
  }

  /**
   * Avança a inscrição do grupo após a conclusão de um nó
   */
  async advanceGroupNode(
    enrollmentId: string,
    currentNodeId: string,
    tenantId: string,
    automationId?: string,
    chosenHandle?: string
  ): Promise<void> {
    const enrollment = await prisma.automationGroupEnrollment.findUnique({
      where: { id: enrollmentId },
      include: { automation: true },
    });

    if (
      !enrollment ||
      enrollment.status === 'CANCELLED' ||
      enrollment.status === 'PAUSED' ||
      enrollment.automation?.status !== 'ACTIVE'
    ) {
      return;
    }

    const automation = enrollment.automation;
    const edges: WorkflowEdge[] = JSON.parse(automation.edges || '[]');

    let outgoingEdges = edges.filter((e) => e.source === currentNodeId);
    if (chosenHandle) {
      outgoingEdges = outgoingEdges.filter(
        (e) =>
          e.sourceHandle === chosenHandle ||
          (chosenHandle === 'true' && ((e as any).label === 'SIM' || (e as any).label === 'Sim' || (e as any).sourceHandle === 'sim')) ||
          (chosenHandle === 'false' && ((e as any).label === 'NÃO' || (e as any).label === 'Não' || (e as any).sourceHandle === 'nao'))
      );
    }

    if (outgoingEdges.length === 0) {
      // Verifica se outros ramos ainda estão aguardando timers ou possuem nós pendentes
      const waitLogs = await prisma.automationGroupStepLog.findMany({
        where: {
          enrollmentId,
          action: 'WAIT_TIMER',
        },
      });
      const passedLogs = await prisma.automationGroupStepLog.findMany({
        where: {
          enrollmentId,
          action: { in: ['TIMER_PASSED', 'TIMER_EXPIRED_SKIPPED'] },
        },
        select: { nodeId: true },
      });
      const passedNodeIds = new Set(passedLogs.map((p) => p.nodeId));
      const hasPendingTimers = waitLogs.some((w) => !passedNodeIds.has(w.nodeId));

      const successLogs = await prisma.automationGroupStepLog.findMany({
        where: {
          enrollmentId,
          status: 'SUCCESS',
          action: { not: 'WAIT_TIMER' },
        },
        select: { nodeId: true },
      });
      const executedNodeIds = new Set(successLogs.map((l) => l.nodeId));
      executedNodeIds.add(currentNodeId);

      // Verifica se existem itens na fila do WhatsApp pendentes ou processando para este enrollment
      let hasPendingQueue = false;
      try {
        const pendingCount = await (prisma as any).whatsappQueue.count({
          where: {
            groupEnrollmentId: enrollmentId,
            status: { in: ['PENDING', 'PROCESSING'] },
          },
        });
        hasPendingQueue = pendingCount > 0;
      } catch {}

      const nodes: WorkflowNode[] = JSON.parse(automation.nodes || '[]');
      const currentBranchId = findBranchIdForNode(currentNodeId, nodes, edges);
      let currentMeta: any = {};
      try {
        currentMeta = JSON.parse(enrollment.metadata || '{}');
      } catch {}
      if (!currentMeta.branches) currentMeta.branches = {};
      if (currentMeta.branches[currentBranchId]) {
        currentMeta.branches[currentBranchId].state = 'COMPLETED';
        currentMeta.branches[currentBranchId].nextStepId = null;
        currentMeta.branches[currentBranchId].nextStepLabel = 'Concluído';
        currentMeta.branches[currentBranchId].lastExecutedAt = new Date().toISOString();
      }

      // Verifica se existe alguma outra ramificação ainda em andamento no fluxo ou mensagens na fila
      const pendingTimerNodeIds = new Set(waitLogs.filter((w) => !passedNodeIds.has(w.nodeId)).map((w) => w.nodeId));
      const hasUnexecutedConnectedNodes = edges.some(
        (edge) => executedNodeIds.has(edge.source) && !executedNodeIds.has(edge.target) && !pendingTimerNodeIds.has(edge.target)
      );

      if (hasPendingQueue || hasUnexecutedConnectedNodes) {
        // Outro ramo ainda está sendo processado ativamente na sua vez; mantém o grupo ativo
        await prisma.automationGroupEnrollment.update({
          where: { id: enrollmentId },
          data: { status: 'ACTIVE', metadata: JSON.stringify(currentMeta) },
        });
        return;
      }

      if (hasPendingTimers) {
        // Nenhum ramo está em execução ativa, mas existem timers aguardando horário
        const pendingTimerNodeId = waitLogs.find((w) => !passedNodeIds.has(w.nodeId))?.nodeId || null;
        await prisma.automationGroupEnrollment.update({
          where: { id: enrollmentId },
          data: { status: 'WAITING', currentNodeId: pendingTimerNodeId, metadata: JSON.stringify(currentMeta) },
        });
        return;
      }

      // Todos os ramos foram concluídos com sucesso!
      await prisma.automationGroupEnrollment.update({
        where: { id: enrollmentId },
        data: { status: 'COMPLETED', completedAt: new Date(), currentNodeId: null, metadata: JSON.stringify(currentMeta) },
      });
      return;
    }

    for (const edge of outgoingEdges) {
      await this.executeGroupNode(enrollmentId, edge.target, tenantId);
    }
  }

  /**
   * Se novas etapas foram adicionadas ao fluxo de grupos, retoma a execução apenas para os novos nós
   */
  async checkAndAdvanceNewGroupNodes(enrollmentId: string, automation: any): Promise<void> {
    const executedLogs = await prisma.automationGroupStepLog.findMany({
      where: {
        enrollmentId,
        status: { in: ['SUCCESS', 'QUEUED', 'PROCESSING'] },
        action: { not: 'WAIT_TIMER' },
      },
      select: { nodeId: true },
    });

    const activeWaitLogs = await prisma.automationGroupStepLog.findMany({
      where: {
        enrollmentId,
        action: 'WAIT_TIMER',
      },
      select: { nodeId: true },
    });
    const waitingNodeIds = new Set(activeWaitLogs.map((w) => w.nodeId));

    const executedNodeIds = new Set(executedLogs.map((l) => l.nodeId));
    const nodes: WorkflowNode[] = JSON.parse(automation.nodes || '[]');
    const edges: WorkflowEdge[] = JSON.parse(automation.edges || '[]');

    const unexecutedConnectedNodes: string[] = [];

    for (const edge of edges) {
      if (
        executedNodeIds.has(edge.source) &&
        !executedNodeIds.has(edge.target) &&
        !waitingNodeIds.has(edge.target)
      ) {
        if (!unexecutedConnectedNodes.includes(edge.target)) {
          unexecutedConnectedNodes.push(edge.target);
        }
      }
    }

    if (unexecutedConnectedNodes.length > 0) {
      await prisma.automationGroupEnrollment.update({
        where: { id: enrollmentId },
        data: { status: 'ACTIVE', completedAt: null },
      });

      for (const targetId of unexecutedConnectedNodes) {
        await this.executeGroupNode(enrollmentId, targetId, automation.tenantId);
      }
    }
  }

  /**
   * Retorna estatísticas detalhadas de execução para o painel de acompanhamento de automação em grupos
   */
  async getGroupAutomationStats(automationId: string, tenantId: string) {
    const enrollments = await prisma.automationGroupEnrollment.findMany({
      where: { automationId, tenantId },
      include: {
        group: {
          select: {
            id: true,
            name: true,
            jid: true,
            pictureUrl: true,
            participantsCount: true,
            isAdmin: true,
            adminRole: true,
            status: true,
          },
        },
        stepLogs: {
          orderBy: { executedAt: 'desc' },
          take: 1,
        },
      },
    });

    const total = enrollments.length;
    let pending = 0;
    let processing = 0;
    let completed = 0;
    let failed = 0;

    for (const e of enrollments) {
      if (e.status === 'COMPLETED') completed++;
      else if (e.status === 'FAILED') failed++;
      else if (e.status === 'WAITING' || e.status === 'PENDING') pending++;
      else processing++;
    }

    return {
      totalGroups: total,
      pendingCount: pending,
      processingCount: processing,
      completedCount: completed,
      failedCount: failed,
      enrollments: enrollments.map((e) => ({
        id: e.id,
        group: e.group,
        status: e.status,
        currentNodeId: e.currentNodeId,
        enteredAt: e.enteredAt,
        completedAt: e.completedAt,
        lastStep: e.stepLogs[0] || null,
      })),
    };
  }

  /**
   * Sincroniza periodicamente todas as automações ativas com os contatos que possuem as tags de entrada,
   * garantindo que nenhum lead novo fique para trás mesmo se a campanha já estiver ativa.
   */
  async syncAllActiveAutomations(): Promise<number> {
    try {
      const activeAutos = await prisma.automation.findMany({
        where: { status: 'ACTIVE' },
        select: { id: true, tenantId: true, targetType: true },
      });

      let totalSynced = 0;
      for (const auto of activeAutos) {
        if (auto.targetType === 'GROUP') {
          await this.enrollGroupsByAutomation(auto.id);
          totalSynced++;
        } else {
          totalSynced += await this.syncExistingLeadsForAutomation(auto.id, auto.tenantId);
        }
      }
      return totalSynced;
    } catch (err: any) {
      console.warn('[AutomationEngine] Erro ao sincronizar automações ativas:', err.message);
      return 0;
    }
  }

  /**
   * REGRA DE OURO DO USUÁRIO:
   * Pausa imediatamente a automação quando seu WhatsApp configurado é desconectado ou indisponível.
   * Cancela todos os jobs e itens de fila pendentes e congela os enrollments.
   */
  async pauseAutomationDueToDisconnectedWhatsapp(
    automationId: string,
    tenantId?: string | null,
    reason?: string
  ): Promise<void> {
    try {
      console.warn(`[AutomationEngine] 🛑 Pausando automação ${automationId} por WhatsApp desconectado: ${reason}`);

      // 1. Atualiza status da automação para PAUSED
      await prisma.automation.update({
        where: { id: automationId },
        data: {
          status: 'PAUSED',
          updatedAt: new Date(),
        },
      }).catch(() => null);

      // 2. Cancela ScheduledJobs pendentes
      await prisma.scheduledJob.updateMany({
        where: {
          automationId,
          status: { in: ['PENDING', 'RUNNING'] },
        },
        data: {
          status: 'CANCELLED',
          lastError: `Automação pausada: ${reason || 'WhatsApp desconectado'}`,
        },
      }).catch(() => null);

      // 3. Cancela itens da whatsapp_queue vinculados
      await prisma.$executeRawUnsafe(`
        UPDATE whatsapp_queue
        SET status = 'CANCELLED', error_message = ?, updated_at = CURRENT_TIMESTAMP
        WHERE status IN ('PENDING', 'PROCESSING')
          AND (
            automation_id = ? 
            OR enrollment_id IN (SELECT id FROM "AutomationEnrollment" WHERE "automationId" = ?)
            OR enrollment_id IN (SELECT id FROM "AutomationGroupEnrollment" WHERE "automationId" = ?)
          )
      `, `Cancelado: ${reason || 'WhatsApp configurado desconectado'}`, automationId, automationId, automationId).catch(() => {});

      // 4. Pausa todos os enrollments individuais ativos
      await prisma.automationEnrollment.updateMany({
        where: {
          automationId,
          status: { in: ['ACTIVE', 'WAITING'] },
        },
        data: {
          status: 'PAUSED',
        },
      }).catch(() => null);

      // 5. Pausa group enrollments
      await prisma.automationGroupEnrollment.updateMany({
        where: {
          automationId,
          status: { in: ['ACTIVE', 'WAITING'] },
        },
        data: {
          status: 'PAUSED',
        },
      }).catch(() => null);
    } catch (err) {
      console.error(`[AutomationEngine] Erro ao pausar automação ${automationId}:`, err);
    }
  }

  /**
   * Monitor contínuo de saúde:
   * Varre periodicamente automações ATIVAS e verifica se a instância de WhatsApp configurada nelas
   * continua conectada. Caso tenha sido desconectada ou removida, pausa a automação imediatamente.
   */
  async checkActiveAutomationsWhatsappHealth(): Promise<void> {
    try {
      const activeAutos = await prisma.automation.findMany({
        where: { status: 'ACTIVE' },
        select: {
          id: true,
          name: true,
          tenantId: true,
          whatsappInstanceId: true,
          triggerConfig: true,
          nodes: true,
        },
      });

      for (const auto of activeAutos) {
        let wppId = auto.whatsappInstanceId;
        if (!wppId && auto.triggerConfig) {
          try {
            const trg = typeof auto.triggerConfig === 'string' ? JSON.parse(auto.triggerConfig) : auto.triggerConfig;
            wppId = trg?.whatsappInstanceId;
          } catch {}
        }
        if (!wppId && auto.nodes) {
          try {
            const nodes = typeof auto.nodes === 'string' ? JSON.parse(auto.nodes) : auto.nodes;
            if (Array.isArray(nodes)) {
              for (const n of nodes) {
                if (n.data?.whatsappInstanceId) {
                  wppId = n.data.whatsappInstanceId;
                  break;
                }
              }
            }
          } catch {}
        }

        if (wppId) {
          const inst = await prisma.whatsappInstance.findUnique({
            where: { id: wppId },
            select: { id: true, status: true, name: true, phone: true },
          }).catch(() => null);

          if (!inst || inst.status !== 'CONNECTED') {
            const discReason = `Número de WhatsApp configurado ("${inst?.name || inst?.phone || wppId}") está desconectado.`;
            console.warn(`[AutomationHealth] 🛑 ${discReason} Pausando automação "${auto.name}" (${auto.id}).`);
            await this.pauseAutomationDueToDisconnectedWhatsapp(auto.id, auto.tenantId, discReason);
          }
        }
      }
    } catch (err) {
      console.error('[AutomationHealth] Erro ao verificar saúde do WhatsApp em automações ativas:', err);
    }
  }
}

export const automationEngine = new AutomationEngine();
