import { prisma } from '@/lib/prisma';
import {
  CheckoutPlatformId,
  ProcessCheckoutWebhookResult,
  StandardCheckoutEvent,
  StandardCheckoutEventType,
} from './types';
import { CheckoutAdapterFactory } from './adapters/factory';
import { automationEngine } from '../automation/engine';

export class CheckoutWebhookProcessor {
  private static tablesChecked = false;

  /**
   * Garante idempotência e auto-criação resiliente de tabelas no SQLite em produção
   */
  async ensureTables() {
    if (CheckoutWebhookProcessor.tablesChecked) return;
    try {
      await prisma.$executeRawUnsafe(`
        CREATE TABLE IF NOT EXISTS "integrations" (
          "id" TEXT PRIMARY KEY NOT NULL,
          "tenant_id" TEXT NOT NULL,
          "platform" TEXT NOT NULL,
          "name" TEXT NOT NULL,
          "status" TEXT NOT NULL DEFAULT 'ACTIVE',
          "secret_key" TEXT,
          "allowed_events" TEXT NOT NULL DEFAULT '["purchase_approved","purchase_waiting_payment","billet_printed","pix_generated","cart_abandoned","canceled","refunded","chargeback"]',
          "product_name" TEXT,
          "product_id" TEXT,
          "created_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
          "updated_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
          FOREIGN KEY ("tenant_id") REFERENCES "Tenant" ("id") ON DELETE CASCADE ON UPDATE CASCADE
        );
      `);

      await prisma.$executeRawUnsafe(`
        CREATE TABLE IF NOT EXISTS "webhook_events" (
          "id" TEXT PRIMARY KEY NOT NULL,
          "tenant_id" TEXT NOT NULL,
          "integration_id" TEXT,
          "platform" TEXT NOT NULL,
          "event_type" TEXT NOT NULL,
          "payload" TEXT NOT NULL,
          "status" TEXT NOT NULL DEFAULT 'PROCESSED',
          "customer_email" TEXT,
          "customer_name" TEXT,
          "customer_phone" TEXT,
          "product_name" TEXT,
          "price_value" REAL,
          "payment_type" TEXT,
          "transaction_id" TEXT,
          "error_message" TEXT,
          "created_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
          FOREIGN KEY ("tenant_id") REFERENCES "Tenant" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
          FOREIGN KEY ("integration_id") REFERENCES "integrations" ("id") ON DELETE SET NULL ON UPDATE CASCADE
        );
      `);

      await prisma.$executeRawUnsafe(`
        CREATE TABLE IF NOT EXISTS "products" (
          "id" TEXT PRIMARY KEY NOT NULL,
          "tenant_id" TEXT NOT NULL,
          "integration_id" TEXT NOT NULL,
          "external_id" TEXT,
          "name" TEXT NOT NULL,
          "created_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
          FOREIGN KEY ("tenant_id") REFERENCES "Tenant" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
          FOREIGN KEY ("integration_id") REFERENCES "integrations" ("id") ON DELETE CASCADE ON UPDATE CASCADE
        );
      `);

      await prisma.$executeRawUnsafe(`
        CREATE TABLE IF NOT EXISTS "integration_tags" (
          "id" TEXT PRIMARY KEY NOT NULL,
          "integration_id" TEXT NOT NULL,
          "tag_id" TEXT NOT NULL,
          "created_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
          FOREIGN KEY ("integration_id") REFERENCES "integrations" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
          FOREIGN KEY ("tag_id") REFERENCES "Tag" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
          UNIQUE("integration_id", "tag_id")
        );
      `);

      try {
        await prisma.$executeRawUnsafe(`ALTER TABLE "integrations" ADD COLUMN "webhook_url" TEXT;`);
      } catch {}

      CheckoutWebhookProcessor.tablesChecked = true;
    } catch {
      // Ignora se já existirem
    }
  }

  /**
   * Processa com segurança qualquer webhook de checkout recebido
   */
  async process(options: {
    payload: any;
    headers?: Record<string, string>;
    integrationId?: string;
    expectedTenantId?: string;
    overridePlatform?: CheckoutPlatformId;
  }): Promise<ProcessCheckoutWebhookResult> {
    await this.ensureTables();

    const { payload, headers = {}, integrationId, expectedTenantId, overridePlatform } = options;

    let integration: any = null;
    let tenant: any = null;

    // 1. Busca integração específica pelo ID se fornecido na URL
    if (integrationId) {
      integration = await prisma.checkoutIntegration.findUnique({
        where: { id: integrationId },
        include: {
          tenant: true,
          integrationTags: {
            include: { tag: true },
          },
        },
      });

      if (!integration) {
        return {
          success: false,
          duplicate: false,
          eventType: 'unknown',
          platform: 'CUSTOM',
          actionSummary: 'Integração de checkout não encontrada para o ID fornecido',
          error: 'Integração inexistente ou desativada',
        };
      }

      if (integration.status === 'INACTIVE') {
        return {
          success: false,
          duplicate: false,
          eventType: 'unknown',
          platform: integration.platform as CheckoutPlatformId,
          actionSummary: `A integração "${integration.name}" está inativa/pausada. Webhook descartado.`,
          error: 'Integração inativa',
        };
      }

      tenant = integration.tenant;
    }

    // 2. Busca Tenant por expectedTenantId ou Hottok / Token
    if (!tenant && expectedTenantId) {
      tenant = await prisma.tenant.findUnique({ where: { id: expectedTenantId } });
    }

    if (!tenant) {
      const hottok = payload?.hottok || headers['hottok'];
      if (hottok) {
        tenant = await prisma.tenant.findFirst({ where: { hotmartHottok: hottok } });
      }
    }

    // Fallback para primeiro tenant se nenhum especificado
    if (!tenant) {
      tenant = await prisma.tenant.findFirst({ orderBy: { createdAt: 'asc' } });
    }

    if (!tenant) {
      return {
        success: false,
        duplicate: false,
        eventType: 'unknown',
        platform: 'CUSTOM',
        actionSummary: 'Nenhum expert/tenant encontrado para vincular o evento',
        error: 'Tenant não localizado',
      };
    }

    // 3. Escolhe o Adapter adequado
    const platformToUse: CheckoutPlatformId =
      overridePlatform ||
      (integration?.platform as CheckoutPlatformId) ||
      CheckoutAdapterFactory.detectAdapter(payload, headers).platform;

    const adapter = CheckoutAdapterFactory.getAdapter(platformToUse);

    // 4. Validação de Assinatura / Chave Secreta
    const secretKeyToValidate = integration?.secretKey || tenant.hotmartHottok || undefined;
    if (secretKeyToValidate && adapter.verifySignature) {
      const isValid = adapter.verifySignature(payload, headers, secretKeyToValidate);
      if (!isValid) {
        return {
          success: false,
          duplicate: false,
          eventType: 'unknown',
          platform: platformToUse,
          actionSummary: 'Falha de autenticação: chave secreta ou assinatura inválida',
          error: 'Assinatura inválida',
        };
      }
    }

    // 5. Normalização do Evento para o Formato Padrão do LaunchFlow
    const normalizedEvent: StandardCheckoutEvent = adapter.normalize(payload, headers);

    const buyerEmail = normalizedEvent.customer.email;
    const buyerName = normalizedEvent.customer.name || 'Cliente';
    const buyerPhone = normalizedEvent.customer.phone;
    const productName = normalizedEvent.product.name || integration?.productName || 'Produto';
    const transactionId = normalizedEvent.transactionId || `tx_${Date.now()}`;
    const eventType = normalizedEvent.event;

    if (!buyerEmail) {
      // Se for um ping de validação de URL enviado pela Hotmart ou outra plataforma
      if (
        payload?.event === 'TEST' ||
        payload?.event === 'HOTMART_TEST' ||
        payload?.test === true ||
        payload?.hottok ||
        payload?.event?.includes?.('TEST') ||
        payload?.id === 'test'
      ) {
        return {
          success: true,
          duplicate: false,
          eventType: 'unknown',
          platform: platformToUse,
          actionSummary: 'Ping de validação de URL verificado com sucesso pela Hotmart.',
        };
      }

      return {
        success: false,
        duplicate: false,
        eventType,
        platform: platformToUse,
        actionSummary: 'Payload rejeitado: dados do cliente sem e-mail válido',
        error: 'E-mail do comprador obrigatório',
      };
    }

    // 6. Verificação de Eventos Permitidos na Configuração da Integração
    if (integration && integration.allowedEvents) {
      try {
        const allowedList: string[] = JSON.parse(integration.allowedEvents);
        if (allowedList.length > 0 && !allowedList.includes(eventType)) {
          // Registra o evento como ignorado
          await prisma.checkoutWebhookEvent.create({
            data: {
              tenantId: tenant.id,
              integrationId: integration.id,
              platform: platformToUse,
              eventType,
              payload: JSON.stringify(payload),
              status: 'IGNORED',
              customerEmail: buyerEmail,
              customerName: buyerName,
              customerPhone: buyerPhone,
              productName,
              transactionId,
              errorMessage: `Evento "${eventType}" desmarcado nas opções aceitas da integração.`,
            },
          });

          return {
            success: true,
            duplicate: false,
            ignored: true,
            eventType,
            platform: platformToUse,
            actionSummary: `Evento "${eventType}" recebido e ignorado conforme configuração da integração.`,
          };
        }
      } catch {}
    }

    // 7. Idempotência estrita: evita reprocessar a mesma transação no mesmo evento
    const existingEvent = await prisma.checkoutWebhookEvent.findFirst({
      where: {
        tenantId: tenant.id,
        transactionId,
        eventType,
        status: 'PROCESSED',
      },
    });

    if (existingEvent) {
      return {
        success: true,
        duplicate: true,
        eventType,
        platform: platformToUse,
        actionSummary: `Evento duplicado descartado com segurança (idempotência garantida). Transação: ${transactionId}`,
      };
    }

    // 8. Grava o log na tabela padronizada webhook_events
    const webhookRecord = await prisma.checkoutWebhookEvent.create({
      data: {
        tenantId: tenant.id,
        integrationId: integration?.id || null,
        platform: platformToUse,
        eventType,
        payload: JSON.stringify(payload),
        status: 'PROCESSED',
        customerEmail: buyerEmail,
        customerName: buyerName,
        customerPhone: buyerPhone,
        productName,
        priceValue: normalizedEvent.payment?.amount || null,
        paymentType: normalizedEvent.payment?.type || null,
        transactionId,
      },
    });

    // Retrocompatibilidade: Se for Hotmart, registra também em hotmartWebhookLog para dashboards/testes antigos
    if (platformToUse === 'HOTMART') {
      try {
        const idempotencyKey = `hotmart_${tenant.id}_${eventType}_${transactionId}`;
        await prisma.hotmartWebhookLog.upsert({
          where: { idempotencyKey },
          update: { processed: true },
          create: {
            tenantId: tenant.id,
            eventType: (payload.event || 'PURCHASE_APPROVED').toUpperCase(),
            transactionId,
            buyerEmail,
            buyerName,
            buyerPhone,
            productName,
            productId: normalizedEvent.product.id || undefined,
            paymentType: normalizedEvent.payment?.type || 'UNKNOWN',
            priceValue: normalizedEvent.payment?.amount || 0,
            idempotencyKey,
            processed: true,
            payload: JSON.stringify(payload),
          },
        });
      } catch {}
    }

    // 9. Cria ou atualiza o contato no CRM com isolamento de Tenant
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
        utmSource: `${platformToUse.toLowerCase()}_checkout`,
        consentGiven: true,
        status: 'ACTIVE',
      },
    });

    const actionSummaries: string[] = [];

    // Helper para adicionar tag de forma atômica
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

      // Dispara transição inteligente de fluxos
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

    // 10. Aplicação automática das tags configuradas nesta integração exclusiva
    if (integration?.integrationTags && integration.integrationTags.length > 0) {
      for (const it of integration.integrationTags) {
        if (it.tag?.name) {
          await addTag(it.tag.name);
        }
      }
    }

    // 11. Executa regras conforme o evento padronizado (Multi-plataforma)
    switch (eventType) {
      case 'purchase_approved': {
        // Remove tags transitórias de cobrança
        await removeTag('Pix Gerado');
        await removeTag('Boleto Gerado');
        await removeTag('Carrinho Abandonado');

        // Adiciona tags de cliente e comprador do produto
        await addTag('Cliente');
        await addTag('Aluno');
        if (productName) {
          await addTag(`Comprador: ${productName}`);
        }

        // REGRA CRÍTICA: Cancela imediatamente lembretes de cobrança agendados
        const cancelledJobs = await automationEngine.cancelPendingJobsForContact(
          tenant.id,
          contact.id,
          'PURCHASE_APPROVED'
        );
        if (cancelledJobs > 0) {
          actionSummaries.push(
            `${cancelledJobs} mensagens de cobrança agendadas foram canceladas com sucesso`
          );
        }

        // Cancela matrículas ativas em automações de recuperação
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

        actionSummaries.push(
          `Venda aprovada com sucesso na plataforma ${platformToUse} para ${buyerEmail}`
        );
        break;
      }

      case 'pix_generated': {
        await addTag('Pix Gerado');
        actionSummaries.push(`Pix gerado para ${buyerEmail}. Iniciando acompanhamento.`);
        break;
      }

      case 'billet_printed': {
        await addTag('Boleto Gerado');
        actionSummaries.push(`Boleto gerado para ${buyerEmail}.`);
        break;
      }

      case 'purchase_waiting_payment': {
        await addTag('Aguardando Pagamento');
        actionSummaries.push(`Aguardando pagamento de ${buyerEmail}.`);
        break;
      }

      case 'cart_abandoned': {
        await addTag('Carrinho Abandonado');
        actionSummaries.push(`Carrinho abandonado registrado para ${buyerEmail}.`);
        break;
      }

      case 'canceled': {
        await addTag('Compra Cancelada');
        actionSummaries.push(`Pedido cancelado para ${buyerEmail}.`);
        break;
      }

      case 'refunded': {
        await removeTag('Cliente');
        await removeTag('Aluno');
        await addTag('Reembolsado');
        actionSummaries.push(`Reembolso processado para ${buyerEmail}. Tag Cliente removida.`);
        break;
      }

      case 'chargeback': {
        await removeTag('Cliente');
        await removeTag('Aluno');
        await addTag('Chargeback');
        actionSummaries.push(`Chargeback registrado para ${buyerEmail}.`);
        break;
      }

      default: {
        actionSummaries.push(
          `Evento padronizado "${eventType}" recebido da plataforma ${platformToUse}.`
        );
      }
    }

    return {
      success: true,
      duplicate: false,
      eventType,
      platform: platformToUse,
      actionSummary: actionSummaries.join(' | '),
      contactId: contact.id,
      eventId: webhookRecord.id,
    };
  }
}

export const checkoutWebhookProcessor = new CheckoutWebhookProcessor();
