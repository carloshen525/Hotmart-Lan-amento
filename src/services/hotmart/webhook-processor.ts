import { prisma } from '@/lib/prisma';
import { HotmartWebhookPayload, WebhookProcessResult } from './types';
import { automationEngine } from '../automation/engine';

export class HotmartWebhookProcessor {
  /**
   * Processa com segurança e idempotência qualquer webhook da Hotmart
   */
  async process(payload: HotmartWebhookPayload, expectedTenantId?: string): Promise<WebhookProcessResult> {
    const eventType = payload.event || 'UNKNOWN';
    const hottok = payload.hottok || '';
    const buyerEmail = payload.data?.buyer?.email?.trim().toLowerCase();
    const transactionId = payload.data?.purchase?.transaction || payload.id || `tx_${Date.now()}`;
    const buyerName = payload.data?.buyer?.name || 'Cliente';
    const buyerPhone = payload.data?.buyer?.checkout_phone;
    const productName = payload.data?.product?.name || 'Produto Hotmart';
    const productId = String(payload.data?.product?.id || '');
    const paymentType = payload.data?.purchase?.payment?.type || 'UNKNOWN';
    const priceValue = payload.data?.purchase?.price?.value || 0;

    if (!buyerEmail) {
      return {
        success: false,
        duplicate: false,
        eventType,
        actionSummary: 'Payload rejeitado: comprador sem e-mail',
        error: 'E-mail do comprador obrigatório',
      };
    }

    // 1. Identificar o Tenant (Expert) pelo Hottok ou pelo expectedTenantId
    let tenant = null;
    if (expectedTenantId) {
      tenant = await prisma.tenant.findUnique({ where: { id: expectedTenantId } });
    } else if (hottok) {
      tenant = await prisma.tenant.findFirst({
        where: { hotmartHottok: hottok },
      });
    }

    if (!tenant) {
      // Fallback para o primeiro tenant se houver token global configurado
      const envHottok = process.env.HOTMART_HOTTOK_SECRET;
      if (!envHottok || envHottok === hottok) {
        tenant = await prisma.tenant.findFirst({ orderBy: { createdAt: 'asc' } });
      }
    }

    if (!tenant) {
      return {
        success: false,
        duplicate: false,
        eventType,
        actionSummary: 'Hottok inválido ou expert não encontrado',
        error: 'Token de autenticação Hotmart não reconhecido',
      };
    }

    // 2. Chave de Idempotência
    const idempotencyKey = `hotmart_${tenant.id}_${eventType}_${transactionId}`;
    const existingLog = await prisma.hotmartWebhookLog.findUnique({
      where: { idempotencyKey },
    });

    if (existingLog) {
      return {
        success: true,
        duplicate: true,
        eventType,
        actionSummary: `Evento duplicado descartado com segurança (idempotência garantida). Transação: ${transactionId}`,
      };
    }

    // 3. Registrar o Webhook
    const webhookLog = await prisma.hotmartWebhookLog.create({
      data: {
        tenantId: tenant.id,
        eventType,
        transactionId,
        buyerEmail,
        buyerName,
        buyerPhone,
        productName,
        productId,
        paymentType,
        priceValue,
        idempotencyKey,
        processed: false,
        payload: JSON.stringify(payload),
      },
    });

    // 4. Criar ou atualizar o contato no CRM
    const contact = await prisma.contact.upsert({
      where: {
        tenantId_email: {
          tenantId: tenant.id,
          email: buyerEmail,
        },
      },
      update: {
        name: buyerName,
        phone: buyerPhone || undefined,
        updatedAt: new Date(),
      },
      create: {
        tenantId: tenant.id,
        name: buyerName,
        email: buyerEmail,
        phone: buyerPhone,
        utmSource: 'hotmart_checkout',
        consentGiven: true,
        status: 'ACTIVE',
      },
    });

    const actionSummaries: string[] = [];

    // Helper para adicionar tag
    const addTag = async (tagName: string) => {
      let tag = await prisma.tag.findUnique({
        where: { tenantId_name: { tenantId: tenant.id, name: tagName } },
      });
      if (!tag) {
        tag = await prisma.tag.create({
          data: { tenantId: tenant.id, name: tagName, color: '#10b981' },
        });
      }
      await prisma.contactTag.upsert({
        where: { contactId_tagId: { contactId: contact.id, tagId: tag.id } },
        create: { contactId: contact.id, tagId: tag.id },
        update: {},
      });
      actionSummaries.push(`Tag "${tagName}" adicionada`);

      // Dispara transição inteligente de saída de sequências ou entrada em novas sequências
      try {
        const flowResult = await automationEngine.handleContactTagAdded(
          tenant.id,
          contact.id,
          tagName
        );
        if (flowResult.exitedSequences.length > 0) {
          actionSummaries.push(
            `Lead ejetado das sequências: ${flowResult.exitedSequences.join(', ')}`
          );
        }
        if (flowResult.enteredSequences.length > 0) {
          actionSummaries.push(
            `Lead ingressou nas novas sequências: ${flowResult.enteredSequences.join(', ')}`
          );
        }
      } catch {}
    };

    // Helper para remover tag
    const removeTag = async (tagName: string) => {
      const tag = await prisma.tag.findUnique({
        where: { tenantId_name: { tenantId: tenant.id, name: tagName } },
      });
      if (tag) {
        await prisma.contactTag.deleteMany({
          where: { contactId: contact.id, tagId: tag.id },
        });
        actionSummaries.push(`Tag "${tagName}" removida`);
      }
    };

    // 5. Execução de Regras Conforme o Evento
    switch (eventType) {
      case 'PURCHASE_WAITING_PAYMENT': {
        if (paymentType === 'PIX' || paymentType === 'BILLET') {
          const tagName = paymentType === 'PIX' ? 'Pix Gerado' : 'Boleto Gerado';
          await addTag(tagName);

          // Disparar automação de recuperação se houver fluxo ativo para este evento
          const recoveryAutomation = await prisma.automation.findFirst({
            where: {
              tenantId: tenant.id,
              status: 'ACTIVE',
              triggerType: 'HOTMART_EVENT',
              triggerConfig: { contains: 'PURCHASE_WAITING_PAYMENT' },
            },
          });

          if (recoveryAutomation) {
            await automationEngine.enrollContact(recoveryAutomation.id, contact.id, {
              transactionId,
              productName,
              paymentType,
              priceValue,
            });
            actionSummaries.push(`Inscrito na automação de recuperação: "${recoveryAutomation.name}"`);
          }
        }
        break;
      }

      case 'PURCHASE_APPROVED':
      case 'PURCHASE_COMPLETE': {
        // Remove tags transitórias de cobrança
        await removeTag('Pix Gerado');
        await removeTag('Boleto Gerado');
        await removeTag('Carrinho Abandonado');

        // Adiciona tag de cliente
        await addTag('Cliente');
        await addTag(`Comprador: ${productName}`);

        // REGRA CRÍTICA: Cancela imediatamente quaisquer cobranças/lembretes agendados
        const cancelledJobs = await automationEngine.cancelPendingJobsForContact(
          tenant.id,
          contact.id,
          'PURCHASE_APPROVED'
        );
        if (cancelledJobs > 0) {
          actionSummaries.push(`${cancelledJobs} mensagens de cobrança agendadas foram canceladas com sucesso`);
        }

        // Encerra fluxos de vendas ou recuperação incompatíveis
        await prisma.automationEnrollment.updateMany({
          where: {
            contactId: contact.id,
            status: { in: ['ACTIVE', 'WAITING'] },
            automation: {
              name: { contains: 'Recuperação' },
            },
          },
          data: { status: 'CANCELLED' },
        });

        // Inscreve no fluxo de Pós-Venda / Boas-Vindas
        const posVendaAutomation = await prisma.automation.findFirst({
          where: {
            tenantId: tenant.id,
            status: 'ACTIVE',
            triggerType: 'HOTMART_EVENT',
            triggerConfig: { contains: 'PURCHASE_APPROVED' },
          },
        });

        if (posVendaAutomation) {
          await automationEngine.enrollContact(posVendaAutomation.id, contact.id, {
            transactionId,
            productName,
            priceValue,
          });
          actionSummaries.push(`Inscrito na automação de Pós-Venda: "${posVendaAutomation.name}"`);
        }
        break;
      }

      case 'PURCHASE_OUT_OF_SHOPPING_CART': {
        await addTag('Carrinho Abandonado');
        break;
      }

      case 'PURCHASE_REFUNDED':
      case 'PURCHASE_CHARGEBACK': {
        await removeTag('Cliente');
        await addTag(eventType === 'PURCHASE_REFUNDED' ? 'Reembolsado' : 'Chargeback');

        // Cancela acessos a fluxos de pós-venda
        await prisma.automationEnrollment.updateMany({
          where: {
            contactId: contact.id,
            status: 'ACTIVE',
          },
          data: { status: 'CANCELLED' },
        });
        break;
      }

      case 'PURCHASE_CANCELED':
      case 'PURCHASE_EXPIRED': {
        await removeTag('Pix Gerado');
        await removeTag('Boleto Gerado');
        await addTag('Pagamento Expirado');
        break;
      }

      default:
        actionSummaries.push(`Evento ${eventType} registrado no histórico`);
    }

    // Marca webhook como processado
    await prisma.hotmartWebhookLog.update({
      where: { id: webhookLog.id },
      data: { processed: true },
    });

    // Registra trilha de auditoria
    await prisma.auditLog.create({
      data: {
        tenantId: tenant.id,
        action: 'WEBHOOK_HOTMART_PROCESSED',
        resource: 'HotmartWebhookLog',
        details: JSON.stringify({
          eventType,
          buyerEmail,
          transactionId,
          actions: actionSummaries,
        }),
      },
    });

    return {
      success: true,
      duplicate: false,
      eventType,
      contactId: contact.id,
      actionSummary: actionSummaries.join(' | ') || 'Processado com sucesso',
    };
  }
}

export const hotmartWebhookProcessor = new HotmartWebhookProcessor();
