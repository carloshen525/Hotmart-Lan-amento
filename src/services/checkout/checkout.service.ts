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
    try {
      if ((prisma as any).checkoutIntegration) {
        return await (prisma as any).checkoutIntegration.findMany({
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
    } catch {}

    // Fallback SQL resiliente
    try {
      const rows: any[] = await prisma.$queryRawUnsafe(
        `SELECT * FROM integrations WHERE tenant_id = ? ORDER BY created_at DESC;`,
        tenantId
      );
      return rows.map((r) => ({
        id: r.id,
        tenantId: r.tenant_id,
        platform: r.platform,
        name: r.name,
        status: r.status,
        secretKey: r.secret_key,
        webhookUrl: r.webhook_url,
        allowedEvents: r.allowed_events,
        productName: r.product_name,
        productId: r.product_id,
        createdAt: r.created_at,
        updatedAt: r.updated_at,
        integrationTags: [],
        _count: { webhookEvents: 0, products: 0 },
      }));
    } catch {
      return [];
    }
  }

  /**
   * Busca uma integração específica
   */
  async getIntegration(id: string, tenantId: string) {
    await checkoutWebhookProcessor.ensureTables();
    try {
      if ((prisma as any).checkoutIntegration) {
        return await (prisma as any).checkoutIntegration.findFirst({
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
    } catch {}

    try {
      const rows: any[] = await prisma.$queryRawUnsafe(
        `SELECT * FROM integrations WHERE id = ? AND tenant_id = ? LIMIT 1;`,
        id,
        tenantId
      );
      if (!rows || rows.length === 0) return null;
      const r = rows[0];
      return {
        id: r.id,
        tenantId: r.tenant_id,
        platform: r.platform,
        name: r.name,
        status: r.status,
        secretKey: r.secret_key,
        webhookUrl: r.webhook_url,
        allowedEvents: r.allowed_events,
        productName: r.product_name,
        productId: r.product_id,
        createdAt: r.created_at,
        updatedAt: r.updated_at,
        products: [],
        integrationTags: [],
        webhookEvents: [],
      };
    } catch {
      return null;
    }
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
    try {
      if ((prisma as any).checkoutIntegration) {
        let exists = await (prisma as any).checkoutIntegration.findUnique({ where: { id: uniqueId } });
        while (exists && !data.customId) {
          uniqueId = crypto.randomBytes(4).toString('hex');
          exists = await (prisma as any).checkoutIntegration.findUnique({ where: { id: uniqueId } });
        }
      }
    } catch {}

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

    let integrationId = uniqueId;

    try {
      if ((prisma as any).checkoutIntegration) {
        const created = await (prisma as any).checkoutIntegration.create({
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
        integrationId = created.id;
      } else {
        await prisma.$executeRawUnsafe(
          `INSERT INTO integrations (id, tenant_id, platform, name, secret_key, webhook_url, allowed_events, product_name, product_id, status, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'ACTIVE', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP);`,
          uniqueId,
          data.tenantId,
          data.platform,
          data.name.trim(),
          secretKey,
          webhookUrl,
          allowedEventsJson,
          data.productName?.trim() || null,
          data.productId?.trim() || null
        );
      }
    } catch (createErr: any) {
      await prisma.$executeRawUnsafe(
        `INSERT INTO integrations (id, tenant_id, platform, name, secret_key, webhook_url, allowed_events, product_name, product_id, status, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'ACTIVE', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP);`,
        uniqueId,
        data.tenantId,
        data.platform,
        data.name.trim(),
        secretKey,
        webhookUrl,
        allowedEventsJson,
        data.productName?.trim() || null,
        data.productId?.trim() || null
      );
    }

    // 4. Salva tags associadas à integração
    if (data.tagIds && Array.isArray(data.tagIds) && data.tagIds.length > 0) {
      for (const tagId of data.tagIds) {
        if (!tagId) continue;
        try {
          if ((prisma as any).integrationTag) {
            await (prisma as any).integrationTag.create({
              data: {
                integrationId,
                tagId,
              },
            });
          } else {
            const itId = `itag_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`;
            await prisma.$executeRawUnsafe(
              `INSERT OR IGNORE INTO integration_tags (id, integration_id, tag_id, created_at) VALUES (?, ?, ?, CURRENT_TIMESTAMP);`,
              itId,
              integrationId,
              tagId
            );
          }
        } catch {}
      }
    }

    return this.getIntegration(integrationId, data.tenantId);
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

    try {
      if (Object.keys(updateData).length > 0) {
        if ((prisma as any).checkoutIntegration) {
          await (prisma as any).checkoutIntegration.updateMany({
            where: { id, tenantId },
            data: updateData,
          });
        }
      }
    } catch {}

    // Atualiza tags vinculadas se fornecidas
    if (data.tagIds !== undefined) {
      try {
        if ((prisma as any).integrationTag) {
          await (prisma as any).integrationTag.deleteMany({
            where: { integrationId: id },
          });
        } else {
          await prisma.$executeRawUnsafe(
            `DELETE FROM integration_tags WHERE integration_id = ?;`,
            id
          );
        }
      } catch {}

      if (Array.isArray(data.tagIds) && data.tagIds.length > 0) {
        for (const tagId of data.tagIds) {
          if (!tagId) continue;
          try {
            if ((prisma as any).integrationTag) {
              await (prisma as any).integrationTag.create({
                data: {
                  integrationId: id,
                  tagId,
                },
              });
            } else {
              const itId = `itag_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`;
              await prisma.$executeRawUnsafe(
                `INSERT OR IGNORE INTO integration_tags (id, integration_id, tag_id, created_at) VALUES (?, ?, ?, CURRENT_TIMESTAMP);`,
                itId,
                id,
                tagId
              );
            }
          } catch {}
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
