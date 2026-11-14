import { prisma } from '@/lib/prisma';
import crypto from 'crypto';
import { FormIntegrationDTO, FormPlatformId } from './types';

export class FormService {
  private static tablesChecked = false;

  /**
   * Garante a existência das tabelas de integração de formulários no SQLite
   */
  async ensureTables(): Promise<void> {
    if (FormService.tablesChecked) return;

    try {
      await prisma.$executeRawUnsafe(`
        CREATE TABLE IF NOT EXISTS "form_integrations" (
          "id" TEXT PRIMARY KEY NOT NULL,
          "tenant_id" TEXT NOT NULL,
          "name" TEXT NOT NULL,
          "platform" TEXT NOT NULL DEFAULT 'ELEMENTOR',
          "status" TEXT NOT NULL DEFAULT 'ACTIVE',
          "webhook_url" TEXT,
          "secret_key" TEXT,
          "allow_reentry" TEXT NOT NULL DEFAULT 'ALWAYS',
          "target_automation_id" TEXT,
          "field_mapping" TEXT,
          "sample_payload" TEXT,
          "total_events" INTEGER NOT NULL DEFAULT 0,
          "new_contacts" INTEGER NOT NULL DEFAULT 0,
          "updated_contacts" INTEGER NOT NULL DEFAULT 0,
          "last_event_at" DATETIME,
          "created_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
          "updated_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
          FOREIGN KEY ("tenant_id") REFERENCES "Tenant" ("id") ON DELETE CASCADE ON UPDATE CASCADE
        );
      `);

      await prisma.$executeRawUnsafe(`
        CREATE TABLE IF NOT EXISTS "form_integration_tags" (
          "id" TEXT PRIMARY KEY NOT NULL,
          "integration_id" TEXT NOT NULL,
          "tag_id" TEXT NOT NULL,
          "created_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
          FOREIGN KEY ("integration_id") REFERENCES "form_integrations" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
          FOREIGN KEY ("tag_id") REFERENCES "Tag" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
          UNIQUE("integration_id", "tag_id")
        );
      `);

      await prisma.$executeRawUnsafe(`
        CREATE TABLE IF NOT EXISTS "form_webhook_events" (
          "id" TEXT PRIMARY KEY NOT NULL,
          "tenant_id" TEXT NOT NULL,
          "integration_id" TEXT,
          "status" TEXT NOT NULL DEFAULT 'PROCESSED',
          "payload" TEXT NOT NULL,
          "parsed_data" TEXT,
          "contact_id" TEXT,
          "contact_email" TEXT,
          "contact_name" TEXT,
          "contact_phone" TEXT,
          "tags_applied" TEXT,
          "automations_triggered" TEXT,
          "error_message" TEXT,
          "ip_address" TEXT,
          "user_agent" TEXT,
          "created_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
          FOREIGN KEY ("tenant_id") REFERENCES "Tenant" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
          FOREIGN KEY ("integration_id") REFERENCES "form_integrations" ("id") ON DELETE SET NULL ON UPDATE CASCADE
        );
      `);

      FormService.tablesChecked = true;
    } catch {
      // Ignora se já existirem
    }
  }

  /**
   * Lista todas as integrações de formulários do tenant
   */
  async listIntegrations(tenantId: string) {
    await this.ensureTables();

    try {
      if ((prisma as any).formIntegration) {
        return await (prisma as any).formIntegration.findMany({
          where: { tenantId },
          include: {
            _count: {
              select: { events: true },
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
      const rows = (await prisma.$queryRawUnsafe(
        `SELECT * FROM form_integrations WHERE tenant_id = ? ORDER BY created_at DESC;`,
        tenantId
      )) as any[];

      const result = [];
      for (const r of rows) {
        const tags = (await prisma.$queryRawUnsafe(
          `SELECT fit.id, fit.tag_id, t.name, t.color FROM form_integration_tags fit
           JOIN Tag t ON t.id = fit.tag_id WHERE fit.integration_id = ?;`,
          r.id
        ).catch(() => [])) as any[];

        const eventCount = (await prisma.$queryRawUnsafe(
          `SELECT COUNT(*) as count FROM form_webhook_events WHERE integration_id = ?;`,
          r.id
        ).catch(() => [{ count: 0 }])) as any[];

        result.push({
          id: r.id,
          tenantId: r.tenant_id,
          name: r.name,
          platform: r.platform,
          status: r.status,
          webhookUrl: r.webhook_url,
          secretKey: r.secret_key,
          allowReentry: r.allow_reentry,
          targetAutomationId: r.target_automation_id,
          fieldMapping: r.field_mapping,
          samplePayload: r.sample_payload,
          totalEvents: Number(r.total_events) || 0,
          newContacts: Number(r.new_contacts) || 0,
          updatedContacts: Number(r.updated_contacts) || 0,
          lastEventAt: r.last_event_at,
          createdAt: r.created_at,
          updatedAt: r.updated_at,
          integrationTags: tags.map((t) => ({
            id: t.id,
            tagId: t.tag_id,
            tag: { id: t.tag_id, name: t.name, color: t.color },
          })),
          _count: { events: Number(eventCount[0]?.count) || 0 },
        });
      }
      return result;
    } catch {
      return [];
    }
  }

  /**
   * Busca uma integração específica
   */
  async getIntegration(id: string, tenantId: string) {
    await this.ensureTables();

    try {
      if ((prisma as any).formIntegration) {
        return await (prisma as any).formIntegration.findFirst({
          where: { id, tenantId },
          include: {
            integrationTags: {
              include: { tag: true },
            },
            events: {
              take: 20,
              orderBy: { createdAt: 'desc' },
            },
          },
        });
      }
    } catch {}

    try {
      const rows = (await prisma.$queryRawUnsafe(
        `SELECT * FROM form_integrations WHERE id = ? AND tenant_id = ? LIMIT 1;`,
        id,
        tenantId
      )) as any[];
      if (!rows || rows.length === 0) return null;
      const r = rows[0];

      const tags = (await prisma.$queryRawUnsafe(
        `SELECT fit.id, fit.tag_id, t.name, t.color FROM form_integration_tags fit
         JOIN Tag t ON t.id = fit.tag_id WHERE fit.integration_id = ?;`,
        r.id
      ).catch(() => [])) as any[];

      return {
        id: r.id,
        tenantId: r.tenant_id,
        name: r.name,
        platform: r.platform,
        status: r.status,
        webhookUrl: r.webhook_url,
        secretKey: r.secret_key,
        allowReentry: r.allow_reentry,
        targetAutomationId: r.target_automation_id,
        fieldMapping: r.field_mapping,
        samplePayload: r.sample_payload,
        totalEvents: Number(r.total_events) || 0,
        newContacts: Number(r.new_contacts) || 0,
        updatedContacts: Number(r.updated_contacts) || 0,
        lastEventAt: r.last_event_at,
        createdAt: r.created_at,
        updatedAt: r.updated_at,
        integrationTags: tags.map((t) => ({
          id: t.id,
          tagId: t.tag_id,
          tag: { id: t.tag_id, name: t.name, color: t.color },
        })),
        events: [],
      };
    } catch {
      return null;
    }
  }

  /**
   * Cria uma nova integração de formulário com URL exclusiva
   */
  async createIntegration(data: FormIntegrationDTO) {
    await this.ensureTables();

    let uniqueId = data.customId?.trim() || crypto.randomBytes(4).toString('hex');
    try {
      if ((prisma as any).formIntegration) {
        let exists = await (prisma as any).formIntegration.findUnique({ where: { id: uniqueId } });
        while (exists && !data.customId) {
          uniqueId = crypto.randomBytes(4).toString('hex');
          exists = await (prisma as any).formIntegration.findUnique({ where: { id: uniqueId } });
        }
      }
    } catch {}

    const secretKey = data.secretKey?.trim() || 'whsec_' + crypto.randomBytes(8).toString('hex');
    const baseUrl = process.env.NEXTAUTH_URL || process.env.NEXT_PUBLIC_APP_URL || 'https://launchflow.app';
    const cleanBaseUrl = baseUrl.replace(/\/$/, '');
    const webhookUrl = `${cleanBaseUrl}/api/webhooks/wordpress/${uniqueId}`;

    const fieldMappingStr = data.fieldMapping ? JSON.stringify(data.fieldMapping) : null;
    const samplePayloadStr = data.samplePayload ? JSON.stringify(data.samplePayload) : null;

    let integration: any;

    if ((prisma as any).formIntegration) {
      integration = await (prisma as any).formIntegration.create({
        data: {
          id: uniqueId,
          tenantId: data.tenantId,
          name: data.name,
          platform: data.platform || 'ELEMENTOR',
          status: data.status || 'ACTIVE',
          secretKey,
          webhookUrl,
          allowReentry: data.allowReentry || 'ALWAYS',
          targetAutomationId: data.targetAutomationId || null,
          fieldMapping: fieldMappingStr,
          samplePayload: samplePayloadStr,
        },
      });
    } else {
      await prisma.$executeRawUnsafe(
        `INSERT INTO form_integrations (id, tenant_id, name, platform, status, secret_key, webhook_url, allow_reentry, target_automation_id, field_mapping, sample_payload, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'), datetime('now'));`,
        uniqueId,
        data.tenantId,
        data.name,
        data.platform || 'ELEMENTOR',
        data.status || 'ACTIVE',
        secretKey,
        webhookUrl,
        data.allowReentry || 'ALWAYS',
        data.targetAutomationId || null,
        fieldMappingStr,
        samplePayloadStr
      );

      integration = {
        id: uniqueId,
        tenantId: data.tenantId,
        name: data.name,
        platform: data.platform || 'ELEMENTOR',
        status: data.status || 'ACTIVE',
        secretKey,
        webhookUrl,
        allowReentry: data.allowReentry || 'ALWAYS',
        targetAutomationId: data.targetAutomationId || null,
        fieldMapping: fieldMappingStr,
        samplePayload: samplePayloadStr,
      };
    }

    // Vincula tags selecionadas
    if (data.tagIds && Array.isArray(data.tagIds) && data.tagIds.length > 0) {
      for (const tagId of data.tagIds) {
        try {
          if ((prisma as any).formIntegrationTag) {
            await (prisma as any).formIntegrationTag.create({
              data: {
                id: crypto.randomUUID(),
                integrationId: uniqueId,
                tagId,
              },
            });
          } else {
            await prisma.$executeRawUnsafe(
              `INSERT OR IGNORE INTO form_integration_tags (id, integration_id, tag_id, created_at)
               VALUES (?, ?, ?, datetime('now'));`,
              crypto.randomUUID(),
              uniqueId,
              tagId
            );
          }
        } catch {}
      }
    }

    return this.getIntegration(uniqueId, data.tenantId);
  }

  /**
   * Atualiza uma integração existente
   */
  async updateIntegration(id: string, tenantId: string, data: Partial<FormIntegrationDTO>) {
    await this.ensureTables();

    const existing = await this.getIntegration(id, tenantId);
    if (!existing) {
      throw new Error('Integração de formulário não encontrada.');
    }

    const fieldMappingStr =
      data.fieldMapping !== undefined ? (data.fieldMapping ? JSON.stringify(data.fieldMapping) : null) : undefined;
    const samplePayloadStr =
      data.samplePayload !== undefined ? (data.samplePayload ? JSON.stringify(data.samplePayload) : null) : undefined;

    if ((prisma as any).formIntegration) {
      const updateData: any = {
        updatedAt: new Date(),
      };
      if (data.name !== undefined) updateData.name = data.name;
      if (data.status !== undefined) updateData.status = data.status;
      if (data.platform !== undefined) updateData.platform = data.platform;
      if (data.secretKey !== undefined) updateData.secretKey = data.secretKey;
      if (data.allowReentry !== undefined) updateData.allowReentry = data.allowReentry;
      if (data.targetAutomationId !== undefined) updateData.targetAutomationId = data.targetAutomationId;
      if (fieldMappingStr !== undefined) updateData.fieldMapping = fieldMappingStr;
      if (samplePayloadStr !== undefined) updateData.samplePayload = samplePayloadStr;

      await (prisma as any).formIntegration.update({
        where: { id },
        data: updateData,
      });
    } else {
      await prisma.$executeRawUnsafe(
        `UPDATE form_integrations
         SET name = COALESCE(?, name),
             status = COALESCE(?, status),
             secret_key = COALESCE(?, secret_key),
             allow_reentry = COALESCE(?, allow_reentry),
             target_automation_id = ?,
             field_mapping = COALESCE(?, field_mapping),
             sample_payload = COALESCE(?, sample_payload),
             updated_at = datetime('now')
         WHERE id = ? AND tenant_id = ?;`,
        data.name ?? null,
        data.status ?? null,
        data.secretKey ?? null,
        data.allowReentry ?? null,
        data.targetAutomationId !== undefined ? data.targetAutomationId : existing.targetAutomationId,
        fieldMappingStr ?? null,
        samplePayloadStr ?? null,
        id,
        tenantId
      );
    }

    // Se fornecidas tags, sincroniza
    if (data.tagIds !== undefined && Array.isArray(data.tagIds)) {
      if ((prisma as any).formIntegrationTag) {
        await (prisma as any).formIntegrationTag.deleteMany({
          where: { integrationId: id },
        });
        for (const tagId of data.tagIds) {
          await (prisma as any).formIntegrationTag.create({
            data: {
              id: crypto.randomUUID(),
              integrationId: id,
              tagId,
            },
          }).catch(() => {});
        }
      } else {
        await prisma.$executeRawUnsafe(
          `DELETE FROM form_integration_tags WHERE integration_id = ?;`,
          id
        );
        for (const tagId of data.tagIds) {
          await prisma.$executeRawUnsafe(
            `INSERT OR IGNORE INTO form_integration_tags (id, integration_id, tag_id, created_at)
             VALUES (?, ?, ?, datetime('now'));`,
            crypto.randomUUID(),
            id,
            tagId
          ).catch(() => {});
        }
      }
    }

    return this.getIntegration(id, tenantId);
  }

  /**
   * Remove uma integração
   */
  async deleteIntegration(id: string, tenantId: string) {
    await this.ensureTables();

    try {
      if ((prisma as any).formIntegration) {
        return await (prisma as any).formIntegration.delete({
          where: { id },
        });
      }
    } catch {}

    await prisma.$executeRawUnsafe(
      `DELETE FROM form_integration_tags WHERE integration_id = ?;`,
      id
    );
    await prisma.$executeRawUnsafe(
      `DELETE FROM form_webhook_events WHERE integration_id = ?;`,
      id
    );
    await prisma.$executeRawUnsafe(
      `DELETE FROM form_integrations WHERE id = ? AND tenant_id = ?;`,
      id,
      tenantId
    );
    return { success: true };
  }

  /**
   * Salva uma amostra do payload para mapeamento visual
   */
  async saveSamplePayload(id: string, payload: any) {
    await this.ensureTables();
    const jsonStr = JSON.stringify(payload);
    try {
      if ((prisma as any).formIntegration) {
        await (prisma as any).formIntegration.update({
          where: { id },
          data: { samplePayload: jsonStr },
        });
        return;
      }
    } catch {}

    await prisma.$executeRawUnsafe(
      `UPDATE form_integrations SET sample_payload = ?, updated_at = datetime('now') WHERE id = ?;`,
      jsonStr,
      id
    );
  }

  /**
   * Busca histórico de eventos de uma integração ou do tenant
   */
  async getEvents(tenantId: string, integrationId?: string, limit = 50) {
    await this.ensureTables();

    try {
      if ((prisma as any).formWebhookEvent) {
        const where: any = { tenantId };
        if (integrationId) where.integrationId = integrationId;

        return await (prisma as any).formWebhookEvent.findMany({
          where,
          take: limit,
          orderBy: { createdAt: 'desc' },
          include: {
            integration: {
              select: { id: true, name: true, platform: true },
            },
          },
        });
      }
    } catch {}

    try {
      let query = `SELECT * FROM form_webhook_events WHERE tenant_id = ?`;
      const params: any[] = [tenantId];
      if (integrationId) {
        query += ` AND integration_id = ?`;
        params.push(integrationId);
      }
      query += ` ORDER BY created_at DESC LIMIT ?;`;
      params.push(limit);

      const rows = (await prisma.$queryRawUnsafe(query, ...params)) as any[];
      return rows.map((r) => ({
        id: r.id,
        tenantId: r.tenant_id,
        integrationId: r.integration_id,
        status: r.status,
        payload: r.payload,
        parsedData: r.parsed_data,
        contactId: r.contact_id,
        contactEmail: r.contact_email,
        contactName: r.contact_name,
        contactPhone: r.contact_phone,
        tagsApplied: r.tags_applied,
        automationsTriggered: r.automations_triggered,
        errorMessage: r.error_message,
        createdAt: r.created_at,
      }));
    } catch {
      return [];
    }
  }
}

export const formService = new FormService();
