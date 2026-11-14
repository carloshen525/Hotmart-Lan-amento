import { prisma } from '@/lib/prisma';
import { messageManager } from '../messaging';
import { WorkflowNode, WorkflowEdge } from './types';

export class AutomationEngine {
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
      return;
    }

    // Atualiza o nó atual
    await prisma.automationEnrollment.update({
      where: { id: enrollmentId },
      data: { currentNodeId: nodeId },
    });

    const nodeType = node.data.type;
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
              const res = await messageManager.sendEmail({
                tenantId,
                contactId: contact.id,
                email: contact.email,
                subject: config.subject || 'Novidades do Lançamento',
                content: config.content || '<p>Olá {{nome}}, temos uma novidade especial para você!</p>',
                variables: { nome: contact.name, email: contact.email },
              });
              stepDetails = { emailSent: res.success, messageId: res.messageId, provider: res.provider };
            }
            break;
          }

          case 'SEND_WHATSAPP': {
            if (contact.phone) {
              const firstName = contact.name ? contact.name.trim().split(/\s+/)[0] : '';
              const res = await messageManager.sendWhatsApp({
                tenantId,
                contactId: contact.id,
                phone: contact.phone,
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
      } else if (nodeType === 'delay') {
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
      const outgoingFromStart = subEdges.filter((e) => e.source === startNode.id);
      for (const edge of outgoingFromStart) {
        await this.executeSubflowNode(
          enrollment.id,
          edge.target,
          subNodes,
          subEdges,
          tenantId,
          contact
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
    contact: any
  ) {
    const node = subNodes.find((n) => n.id === nodeId);
    if (!node) return;

    const cfg = node.data.config || {};
    let shouldHalt = false;

    if (node.type === 'whatsapp' && contact.phone) {
      const firstName = contact.name ? contact.name.trim().split(/\s+/)[0] : '';
      await messageManager.sendWhatsApp({
        tenantId,
        contactId: contact.id,
        phone: contact.phone,
        text: cfg.message || cfg.text || `Olá ${contact.name}!`,
        messageType: cfg.messageType || (cfg.mediaUrl ? 'image' : 'text'),
        mediaUrl: cfg.mediaUrl,
        mediaBase64: cfg.mediaBase64,
        mediaMimeType: cfg.mediaMimeType,
        mediaFileName: cfg.mediaFileName,
        caption: cfg.caption || cfg.message || cfg.text,
        variables: {
          nome: contact.name || '',
          primeiro_nome: firstName || contact.name || '',
          email: contact.email || '',
          telefone: contact.phone || '',
        },
      });
    } else if (node.type === 'email' && contact.email) {
      await messageManager.sendEmail({
        tenantId,
        contactId: contact.id,
        email: contact.email,
        subject: cfg.subject || 'Aviso do Lançamento',
        content: cfg.content || cfg.message || '<p>Olá!</p>',
        variables: { nome: contact.name, email: contact.email },
      });
    } else if (node.type === 'timer' || node.type === 'delay') {
      const waitMinutes = Number(cfg.value ?? cfg.minutes ?? (cfg.unit === 'hours' ? (cfg.value || 1) * 60 : 1));
      const executeAt = new Date(Date.now() + Math.max(1, waitMinutes) * 60 * 1000);

      const outgoing = subEdges.filter((e) => e.source === node.id);
      for (const edge of outgoing) {
        await prisma.scheduledJob.create({
          data: {
            tenantId,
            enrollmentId,
            contactId: contact.id,
            automationId: '',
            targetNodeId: edge.target,
            executeAt,
            cancelCondition: cfg.cancelCondition || 'NONE',
          },
        });
      }
      shouldHalt = true;
    } else if (node.type === 'aquecimento' || node.type === 'warmup') {
      // Throttle: escalona proporcionalmente
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
            automationId: '',
            targetNodeId: edge.target,
            executeAt,
            cancelCondition: 'NONE',
          },
        });
      }
      shouldHalt = true;
    }

    if (shouldHalt) return;

    // Continua para os próximos nós conectados internamente
    const nextOutgoing = subEdges.filter((e) => e.source === node.id);
    for (const edge of nextOutgoing) {
      await this.executeSubflowNode(
        enrollmentId,
        edge.target,
        subNodes,
        subEdges,
        tenantId,
        contact
      );
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
