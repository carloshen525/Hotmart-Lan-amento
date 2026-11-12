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
              const res = await messageManager.sendWhatsApp({
                tenantId,
                contactId: contact.id,
                phone: contact.phone,
                templateName: config.templateName,
                text: config.text || `Olá ${contact.name}! Prepare-se para o nosso evento ao vivo.`,
                variables: { nome: contact.name },
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
        // Temporizador persistente
        const waitMinutes = Number(config.minutes) || (Number(config.hours) ? Number(config.hours) * 60 : 0) || (Number(config.days) ? Number(config.days) * 1440 : 1);
        const executeAt = new Date(Date.now() + waitMinutes * 60 * 1000);

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

          stepDetails = { scheduledUntil: executeAt, waitMinutes, cancelCondition: config.cancelCondition || 'PURCHASE_APPROVED' };
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
