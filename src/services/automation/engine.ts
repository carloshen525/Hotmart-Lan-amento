import { prisma } from '@/lib/prisma';
import { messageManager } from '../messaging';
import { WhatsappQueueService } from '@/services/whatsapp/queue.service';
import { WorkflowNode, WorkflowEdge } from './types';

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
    const enrollment = await prisma.automationEnrollment.findUnique({
      where: { id: enrollmentId },
      include: {
        automation: true,
        contact: {
          include: { tags: { include: { tag: true } } },
        },
      },
    });

    if (!enrollment || enrollment.status === 'CANCELLED' || enrollment.status === 'COMPLETED') {
      return;
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
    const config = node.data.config || {};

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
                    whatsappInstanceId: (config as any).whatsappInstanceId,
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
                  whatsappInstanceId: (config as any).whatsappInstanceId,
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

        if (config.timerType === 'SPECIFIC_DATE' || config.delayType === 'specific_date' || config.specificDate) {
          const target = new Date(config.specificDate);
          executeAt = !isNaN(target.getTime()) ? target : new Date(Date.now() + 60 * 1000);
          summaryText = `Data específica: ${executeAt.toISOString()}`;
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
          // Criar Job Agendado persistente
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
            data: { status: 'WAITING' },
          });

          stepDetails = { scheduledUntil: executeAt, summary: summaryText, cancelCondition: config.cancelCondition || 'PURCHASE_APPROVED' };
          shouldHaltExecution = true; // A execução pausa aqui até o job vencer
        }
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
      const cfg = tagNode.data.config || {};

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

    // 1. Buscar inscrições ativas ou em espera deste lead
    const activeEnrollments = await prisma.automationEnrollment.findMany({
      where: {
        contactId,
        status: { in: ['ACTIVE', 'WAITING'] },
      },
      include: {
        automation: true,
      },
    });

    for (const enrollment of activeEnrollments) {
      const nodes: WorkflowNode[] = JSON.parse(enrollment.automation.nodes || '[]');
      const edges: WorkflowEdge[] = JSON.parse(enrollment.automation.edges || '[]');

      // Encontra a sequência em que o lead está alocado
      const currentSequenceNode =
        nodes.find((n) => n.id === enrollment.currentNodeId && n.type === 'sequence_lead') ||
        nodes.find((n) => n.type === 'sequence_lead');

      if (currentSequenceNode) {
        // Encontra todas as tags de SAÍDA conectadas à saída desta sequência
        const outgoingFromSeq = edges.filter((e) => e.source === currentSequenceNode.id);

        for (const outEdge of outgoingFromSeq) {
          const targetTagNode = nodes.find(
            (n) =>
              n.id === outEdge.target &&
              (n.type === 'tag' || n.type === 'trigger')
          );

          if (targetTagNode && isTagNodeSatisfied(targetTagNode)) {
            // Cancela todos os jobs e disparos agendados restantes desta sequência
            await prisma.scheduledJob.updateMany({
              where: {
                enrollmentId: enrollment.id,
                status: 'PENDING',
              },
              data: { status: 'CANCELLED' },
            });

            // Finaliza/ejeta a inscrição atual
            await prisma.automationEnrollment.update({
              where: { id: enrollment.id },
              data: {
                status: 'CANCELLED',
                completedAt: new Date(),
              },
            });

            // Registra o log da saída
            await prisma.automationStepLog.create({
              data: {
                enrollmentId: enrollment.id,
                contactId,
                nodeId: currentSequenceNode.id,
                nodeType: 'sequence_exit',
                action: `SAÍDA_POR_TAG: ${tagName}`,
                status: 'CANCELLED',
                details: JSON.stringify({
                  reason: `Lead atendeu à regra da tag de saída "${tagName}". Sequência interrompida.`,
                  exitTagNodeId: targetTagNode.id,
                }),
              },
            });

            exitedSequences.push(currentSequenceNode.data.label || 'Sequência Lead');

            // Verifica se esta tag de saída conecta a uma NOVA sequência seguinte
            const nextSeqEdges = edges.filter((e) => e.source === targetTagNode.id);
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
                  { triggeredByTag: tagName, previousSequence: currentSequenceNode.data.label }
                );
                enteredSequences.push(nextSeqNode.data.label || 'Nova Sequência');
              }
            }
          }
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

        // Procura nós de tag que atendam aos requisitos
        const matchingTagNodes = nodes.filter((n) => {
          if (n.type !== 'tag' && n.type !== 'trigger') return false;
          return isTagNodeSatisfied(n);
        });

        for (const tagNode of matchingTagNodes) {
          // Verifica se essa tag é ENTRADA (conecta para uma sequência)
          const outgoing = edges.filter((e) => e.source === tagNode.id);
          for (const edge of outgoing) {
            const targetSeq = nodes.find(
              (n) => n.id === edge.target && n.type === 'sequence_lead'
            );
            if (targetSeq) {
              await this.enrollInSequence(auto.id, targetSeq.id, contactId, tenantId, {
                triggeredByTag: tagName,
              });
              enteredSequences.push(targetSeq.data.label || 'Sequência Lead');
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

    if (existingEnrollment) {
      // Lead já possui inscrição nesta automação. NUNCA recriar e NUNCA reiniciar do início!
      const subflow = (seqNode.data as any).subflow || {};
      const subNodes: WorkflowNode[] = subflow.nodes || [];
      const subEdges: WorkflowEdge[] = subflow.edges || [];

      // Caso novas etapas tenham sido adicionadas ao fluxo:
      // Se a inscrição estava concluída, verifica se a última etapa que o lead completou possui novas saídas
      if (existingEnrollment.status === 'COMPLETED' && existingEnrollment.currentNodeId) {
        const outgoingFromLast = subEdges.filter((e) => e.source === existingEnrollment.currentNodeId);
        if (outgoingFromLast.length > 0) {
          await prisma.automationEnrollment.update({
            where: { id: existingEnrollment.id },
            data: { status: 'ACTIVE', completedAt: null },
          });
          for (const edge of outgoingFromLast) {
            await this.executeSubflowNode(
              existingEnrollment.id,
              edge.target,
              subNodes,
              subEdges,
              tenantId,
              contact,
              automationId
            );
          }
        }
      }
      return;
    }

    // Cria a inscrição posicionada nesta sequência
    const enrollment = await prisma.automationEnrollment.create({
      data: {
        automationId,
        contactId,
        currentNodeId: sequenceNodeId,
        status: 'ACTIVE',
        metadata: JSON.stringify(metadata),
      },
    });

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

    // Executa os nós internos do sub-fluxo da sequência
    const subflow = (seqNode.data as any).subflow || {};
    const subNodes: WorkflowNode[] = subflow.nodes || [];
    const subEdges: WorkflowEdge[] = subflow.edges || [];

    const startNode = subNodes.find((n) => n.type === 'start') || subNodes[0];
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
    let autoId = automationId;
    if (!autoId) {
      const enr = await prisma.automationEnrollment.findUnique({
        where: { id: enrollmentId },
        select: { automationId: true },
      });
      autoId = enr?.automationId || '';
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

    const cfg = node.data.config || {};
    let shouldHalt = false;
    let stepStatus = 'SUCCESS';
    let stepDetails: any = {};

    try {
      if (node.type === 'whatsapp') {
        if (contact.phone) {
          const firstName = contact.name ? contact.name.trim().split(/\s+/)[0] : '';
          const blocks = (cfg.blocks as any[]) || [];
          const isMedia = cfg.mediaUrl || ['image', 'video', 'audio', 'document', 'file'].includes(cfg.messageType);

          // Enfileira na Fila Persistente do WhatsApp com controle de cadência entre contatos
          const queueItemId = await WhatsappQueueService.enqueue({
            tenantId,
            whatsappInstanceId: (cfg as any).whatsappInstanceId,
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

          if (cfg.timerType === 'SPECIFIC_DATE' || cfg.delayType === 'specific_date' || cfg.specificDate) {
            const target = new Date(cfg.specificDate);
            executeAt = !isNaN(target.getTime()) ? target : new Date(Date.now() + 60 * 1000);
            summaryText = `Data específica: ${executeAt.toISOString()}`;
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
          for (const edge of outgoing) {
            await prisma.scheduledJob.create({
              data: {
                tenantId,
                enrollmentId,
                contactId: contact.id,
                automationId: autoId,
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
                automationId: autoId,
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

    // Atualiza o log da etapa do sub-fluxo com o status final
    if (stepLog) {
      await prisma.automationStepLog.update({
        where: { id: stepLog.id },
        data: {
          status: stepStatus,
          details: JSON.stringify(stepDetails),
        },
      });
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
      // Chegou ao fim do fluxo da sequência!
      await prisma.automationEnrollment.update({
        where: { id: enrollmentId },
        data: { status: 'COMPLETED', completedAt: new Date() },
      });
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
    const enrollment = await prisma.automationEnrollment.findUnique({
      where: { id: enrollmentId },
      include: { contact: true, automation: true },
    });

    if (!enrollment || enrollment.status === 'COMPLETED' || enrollment.status === 'CANCELLED') {
      return;
    }

    const contact = enrollment.contact;
    const effectiveAutoId = autoId || enrollment.automationId;

    let currentSubNodes: WorkflowNode[] = [];
    let currentSubEdges: WorkflowEdge[] = [];

    if (effectiveAutoId) {
      try {
        const freshAuto = await prisma.automation.findUnique({
          where: { id: effectiveAutoId },
          select: { nodes: true },
        });
        if (freshAuto?.nodes) {
          const freshMacroNodes: WorkflowNode[] = JSON.parse(freshAuto.nodes || '[]');
          for (const mn of freshMacroNodes) {
            const sub = (mn.data as any)?.subflow;
            if (sub && Array.isArray(sub.nodes) && sub.nodes.some((sn: any) => sn.id === nodeId)) {
              currentSubNodes = sub.nodes;
              currentSubEdges = sub.edges || [];
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
      await prisma.automationEnrollment.update({
        where: { id: enrollmentId },
        data: { status: 'COMPLETED', completedAt: new Date() },
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

    const tagNodes = nodes.filter((n) => n.type === 'tag' || n.type === 'trigger');
    let totalEnrolled = 0;

    for (const tagNode of tagNodes) {
      const cfg = tagNode.data.config || {};
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
      const connectedSequences = nodes.filter(
        (n) => n.type === 'sequence_lead' && outgoingEdges.some((edge) => edge.target === n.id)
      );

      if (connectedSequences.length === 0) continue;

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

        for (const seqNode of connectedSequences) {
          // Verifica se já existe QUALQUER inscrição deste contato nesta automação (independente de status)
          const existingEnrollment = await prisma.automationEnrollment.findFirst({
            where: {
              automationId,
              contactId: contact.id,
            },
            orderBy: { enteredAt: 'desc' },
          });

          if (!existingEnrollment) {
            // Novo lead elegível que entrou na TAG: inscreve normalmente na primeira etapa
            await this.enrollInSequence(automationId, seqNode.id, contact.id, tenantId, {
              source: 'SYNC_ON_ACTIVATION',
              tags: tagList.join(','),
            });
            totalEnrolled++;
          } else {
            // Lead já cadastrado: NUNCA reiniciar, NUNCA reenfileirar, NUNCA reenviar mensagens
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

            // 2. Verifica se o lead possui job agendado PENDING (ex: temporizador/timer em contagem regressiva)
            const pendingJob = await prisma.scheduledJob.findFirst({
              where: {
                enrollmentId: existingEnrollment.id,
                status: 'PENDING',
              },
            });

            // 3. Identifica nós seguintes que AINDA NÃO foram executados a partir de etapas já concluídas
            const nodesToExecute = new Set<string>();

            for (const executedId of Array.from(executedNodeIds)) {
              const outgoing = subEdges.filter((e) => e.source === executedId);
              for (const edge of outgoing) {
                if (!executedNodeIds.has(edge.target)) {
                  // Se não há agendamento pendente para este nó alvo, ele é candidato à execução imediata
                  if (!pendingJob || pendingJob.targetNodeId !== edge.target) {
                    nodesToExecute.add(edge.target);
                  }
                }
              }
            }

            // 4. Caso o lead nunca tenha executado nenhuma etapa interna (ex: acabou de entrar ou sequência acabou de ser conectada)
            if (executedNodeIds.size === 0 && !pendingJob) {
              const startNode = subNodes.find((n) => n.type === 'start') || subNodes[0];
              if (startNode) {
                const outgoingFromStart = subEdges.filter((e) => e.source === startNode.id);
                for (const edge of outgoingFromStart) {
                  nodesToExecute.add(edge.target);
                }
              }
            }

            // 5. Se houver novos nós a serem percorridos, avança o lead
            if (nodesToExecute.size > 0) {
              // Reativa a inscrição para ACTIVE caso estivesse COMPLETED
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
}

export const automationEngine = new AutomationEngine();
