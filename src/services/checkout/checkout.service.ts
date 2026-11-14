import { prisma } from '@/lib/prisma';
import { CheckoutPlatformId } from './types';
import { checkoutWebhookProcessor } from './webhook-processor';
import crypto from 'crypto';

export class CheckoutService {
  /**
   * Lista todas as integrações de checkout de um tenant
   */
  async listIntegrations(tenantId: string) {
    await checkoutWebhookProcessor.ensureTables();
    return prisma.checkoutIntegration.findMany({
      where: { tenantId },
      include: {
        _count: {
          select: { webhookEvents: true, products: true },
        },
        integrationTags: {
          include: {
            tag: true,
          },
        },
      },
      orderBy: { createdAt: 'desc' },
    });
  }

  /**
   * Busca uma integração específica
   */
  async getIntegration(id: string, tenantId: string) {
    await checkoutWebhookProcessor.ensureTables();
    return prisma.checkoutIntegration.findFirst({
      where: { id, tenantId },
      include: {
        products: true,
        integrationTags: {
          include: {
            tag: true,
          },
        },
        webhookEvents: {
          take: 20,
          orderBy: { createdAt: 'desc' },
        },
      },
    });
  }

  /**
   * Cria uma nova integração de checkout com webhook e chave exclusivos
   */
  async createIntegration(data: {
    tenantId: string;
    platform: CheckoutPlatformId;
    name: string;
    secretKey?: string;
    allowedEvents?: string[];
    productName?: string;
    productId?: string;
    tagIds?: string[];
    baseUrl?: string;
    customId?: string;
  }) {
    await checkoutWebhookProcessor.ensureTables();

    // 1. Gera ou utiliza identificador exclusivo de 8 caracteres hexadecimais (ex: 8a2d91f6)
    let uniqueId = data.customId?.trim() || crypto.randomBytes(4).toString('hex');
    let exists = await prisma.checkoutIntegration.findUnique({ where: { id: uniqueId } });
    while (exists && !data.customId) {
      uniqueId = crypto.randomBytes(4).toString('hex');
      exists = await prisma.checkoutIntegration.findUnique({ where: { id: uniqueId } });
    }

    // 2. Gera chave secreta exclusiva se o usuário não tiver preenchido uma personalizada
    const secretKey =
      data.secretKey?.trim() ||
      `whsec_${crypto.randomBytes(12).toString('hex')}`;

    // 3. Monta a URL exclusiva do Webhook
    const base = data.baseUrl?.replace(/\/$/, '') || '';
    const webhookUrl = `${base}/api/webhooks/checkout/${uniqueId}`;

    const allowedEventsJson = data.allowedEvents
      ? JSON.stringify(data.allowedEvents)
      : JSON.stringify([
          'purchase_approved',
          'purchase_waiting_payment',
          'billet_printed',
          'pix_generated',
          'cart_abandoned',
          'canceled',
          'refunded',
          'chargeback',
        ]);

    const integration = await prisma.checkoutIntegration.create({
      data: {
        id: uniqueId,
        tenantId: data.tenantId,
        platform: data.platform,
        name: data.name.trim(),
        secretKey,
        webhookUrl,
        allowedEvents: allowedEventsJson,
        productName: data.productName?.trim() || null,
        productId: data.productId?.trim() || null,
        status: 'ACTIVE',
      },
    });

    // 4. Salva tags associadas à integração
    if (data.tagIds && Array.isArray(data.tagIds) && data.tagIds.length > 0) {
      for (const tagId of data.tagIds) {
        if (!tagId) continue;
        await prisma.integrationTag.create({
          data: {
            integrationId: integration.id,
            tagId,
          },
        }).catch(() => {});
      }
    }

    return this.getIntegration(integration.id, data.tenantId);
  }

  /**
   * Atualiza uma integração de checkout
   */
  async updateIntegration(
    id: string,
    tenantId: string,
    data: {
      name?: string;
      platform?: CheckoutPlatformId;
      status?: 'ACTIVE' | 'INACTIVE';
      secretKey?: string | null;
      allowedEvents?: string[];
      productName?: string | null;
      productId?: string | null;
      tagIds?: string[];
      webhookUrl?: string | null;
    }
  ) {
    await checkoutWebhookProcessor.ensureTables();

    const updateData: any = {};
    if (data.name !== undefined) updateData.name = data.name.trim();
    if (data.platform !== undefined) updateData.platform = data.platform;
    if (data.status !== undefined) updateData.status = data.status;
    if (data.secretKey !== undefined) updateData.secretKey = data.secretKey?.trim() || null;
    if (data.webhookUrl !== undefined) updateData.webhookUrl = data.webhookUrl?.trim() || null;
    if (data.allowedEvents !== undefined) {
      updateData.allowedEvents = JSON.stringify(data.allowedEvents);
    }
    if (data.productName !== undefined) updateData.productName = data.productName?.trim() || null;
    if (data.productId !== undefined) updateData.productId = data.productId?.trim() || null;

    if (Object.keys(updateData).length > 0) {
      await prisma.checkoutIntegration.updateMany({
        where: { id, tenantId },
        data: updateData,
      });
    }

    // Atualiza tags vinculadas se fornecidas
    if (data.tagIds !== undefined) {
      await prisma.integrationTag.deleteMany({
        where: { integrationId: id },
      });

      if (Array.isArray(data.tagIds) && data.tagIds.length > 0) {
        for (const tagId of data.tagIds) {
          if (!tagId) continue;
          await prisma.integrationTag.create({
            data: {
              integrationId: id,
              tagId,
            },
          }).catch(() => {});
        }
      }
    }

    return this.getIntegration(id, tenantId);
  }

  /**
   * Exclui uma integração de checkout
   */
  async deleteIntegration(id: string, tenantId: string) {
    await checkoutWebhookProcessor.ensureTables();
    return prisma.checkoutIntegration.deleteMany({
      where: { id, tenantId },
    });
  }

  /**
   * Lista histórico de webhooks recebidos com filtros e isolamento multi-tenant
   */
  async listWebhookEvents(tenantId: string, limit: number = 50, integrationId?: string) {
    await checkoutWebhookProcessor.ensureTables();
    return prisma.checkoutWebhookEvent.findMany({
      where: {
        tenantId,
        ...(integrationId ? { integrationId } : {}),
      },
      take: limit,
      orderBy: { createdAt: 'desc' },
      include: {
        integration: {
          select: { name: true, platform: true },
        },
      },
    });
  }

  /**
   * Métricas de eventos de checkout do tenant
   */
  async getStats(tenantId: string) {
    await checkoutWebhookProcessor.ensureTables();

    const [totalIntegrations, totalEvents, approvedCount, waitingCount, abandonedCount] =
      await Promise.all([
        prisma.checkoutIntegration.count({ where: { tenantId } }),
        prisma.checkoutWebhookEvent.count({ where: { tenantId } }),
        prisma.checkoutWebhookEvent.count({
          where: { tenantId, eventType: 'purchase_approved', status: 'PROCESSED' },
        }),
        prisma.checkoutWebhookEvent.count({
          where: {
            tenantId,
            eventType: { in: ['purchase_waiting_payment', 'pix_generated', 'billet_printed'] },
          },
        }),
        prisma.checkoutWebhookEvent.count({
          where: { tenantId, eventType: 'cart_abandoned' },
        }),
      ]);

    return {
      totalIntegrations,
      totalEvents,
      approvedCount,
      waitingCount,
      abandonedCount,
    };
  }
}

export const checkoutService = new CheckoutService();
