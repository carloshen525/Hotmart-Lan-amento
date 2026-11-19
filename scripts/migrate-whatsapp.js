const { PrismaClient } = require('@prisma/client');

async function migrateWhatsappMultiTenant() {
  const prisma = new PrismaClient();
  console.log('[MIGRATION] Verificando schema do banco e integridade das tabelas...');

  try {
    // 1. Verifica se a tabela WhatsappInstance existe
    const tables = await prisma.$queryRawUnsafe(
      "SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'WhatsappInstance';"
    );

    if (Array.isArray(tables) && tables.length > 0) {
      // 2. Verifica se a tabela ainda possui constraint UNIQUE em tenantId
      const tableInfo = await prisma.$queryRawUnsafe(
        "SELECT sql FROM sqlite_master WHERE type = 'table' AND name = 'WhatsappInstance';"
      );
      const sqlText = tableInfo[0]?.sql || '';
      const hasUniqueTenantConstraint =
        sqlText.includes('UNIQUE ("tenantId")') ||
        sqlText.includes('"tenantId" TEXT NOT NULL UNIQUE') ||
        sqlText.includes('UNIQUE(tenantId)');

      const uniqueIndexes = await prisma.$queryRawUnsafe(
        "SELECT name FROM sqlite_master WHERE type = 'index' AND tbl_name = 'WhatsappInstance' AND name = 'WhatsappInstance_tenantId_key';"
      );
      const hasUniqueTenantIndex = Array.isArray(uniqueIndexes) && uniqueIndexes.length > 0;

      if (hasUniqueTenantConstraint || hasUniqueTenantIndex) {
        console.log('[MIGRATION] Constraint UNIQUE em tenantId detectada. Iniciando reconstrução da tabela...');
        await prisma.$executeRawUnsafe('PRAGMA foreign_keys = OFF;');

        let defaultTenantId = 'cmwdefault0000tenant0000000001';
        try {
          const tenants = await prisma.$queryRawUnsafe("SELECT id FROM Tenant ORDER BY createdAt ASC LIMIT 1;");
          if (Array.isArray(tenants) && tenants.length > 0 && tenants[0].id) {
            defaultTenantId = tenants[0].id;
          }
        } catch {}

        await prisma.$executeRawUnsafe('DROP TABLE IF EXISTS "new_WhatsappInstance";');

        await prisma.$executeRawUnsafe(`
          CREATE TABLE "new_WhatsappInstance" (
            "id" TEXT NOT NULL PRIMARY KEY,
            "tenantId" TEXT NOT NULL,
            "name" TEXT,
            "instanceName" TEXT NOT NULL,
            "instanceToken" TEXT NOT NULL,
            "phone" TEXT,
            "profileName" TEXT,
            "profilePicUrl" TEXT,
            "status" TEXT NOT NULL DEFAULT 'DISCONNECTED',
            "qrcode" TEXT,
            "isDefault" BOOLEAN NOT NULL DEFAULT 0,
            "lastConnectedAt" DATETIME,
            "fixed_delay_seconds" INTEGER NOT NULL DEFAULT 30,
            "use_random_delay" BOOLEAN NOT NULL DEFAULT 1,
            "min_delay_seconds" INTEGER NOT NULL DEFAULT 20,
            "max_delay_seconds" INTEGER NOT NULL DEFAULT 45,
            "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
            "updatedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
            CONSTRAINT "WhatsappInstance_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant" ("id") ON DELETE CASCADE ON UPDATE CASCADE
          );
        `);

        // Verifica quais colunas existem na tabela atual antes de copiar
        const currCols = await prisma.$queryRawUnsafe('PRAGMA table_info("WhatsappInstance");');
        const currColNames = new Set((currCols || []).map((c) => c.name));

        const hasFixed = currColNames.has('fixed_delay_seconds');
        const hasRand = currColNames.has('use_random_delay');
        const hasMin = currColNames.has('min_delay_seconds');
        const hasMax = currColNames.has('max_delay_seconds');

        await prisma.$executeRawUnsafe(`
          INSERT OR IGNORE INTO "new_WhatsappInstance" (
            "id", "tenantId", "name", "instanceName", "instanceToken", 
            "phone", "profileName", "profilePicUrl", "status", "qrcode", 
            "isDefault", "lastConnectedAt", "fixed_delay_seconds", "use_random_delay",
            "min_delay_seconds", "max_delay_seconds", "createdAt", "updatedAt"
          )
          SELECT 
            "id", 
            COALESCE(NULLIF("tenantId", ''), '${defaultTenantId}'), 
            "name", 
            "instanceName", 
            COALESCE("instanceToken", 'token_' || "id"), 
            "phone", 
            "profileName", 
            "profilePicUrl", 
            COALESCE("status", 'DISCONNECTED'), 
            "qrcode", 
            CASE 
              WHEN "isDefault" IN (1, '1', 'true', 'TRUE') THEN 1 
              ELSE 0 
            END, 
            "lastConnectedAt", 
            ${hasFixed ? 'COALESCE("fixed_delay_seconds", 30)' : '30'},
            ${hasRand ? 'COALESCE("use_random_delay", 1)' : '1'},
            ${hasMin ? 'COALESCE("min_delay_seconds", 20)' : '20'},
            ${hasMax ? 'COALESCE("max_delay_seconds", 45)' : '45'},
            COALESCE("createdAt", CURRENT_TIMESTAMP), 
            COALESCE("updatedAt", CURRENT_TIMESTAMP)
          FROM "WhatsappInstance"
          WHERE "id" != 'id' AND "instanceName" != 'instanceName' AND "isDefault" != 'isDefault';
        `);

        await prisma.$executeRawUnsafe('DROP TABLE "WhatsappInstance";');
        await prisma.$executeRawUnsafe('ALTER TABLE "new_WhatsappInstance" RENAME TO "WhatsappInstance";');

        try {
          await prisma.$executeRawUnsafe('DROP INDEX IF EXISTS "WhatsappInstance_tenantId_key";');
        } catch {}

        await prisma.$executeRawUnsafe(
          'CREATE UNIQUE INDEX IF NOT EXISTS "WhatsappInstance_instanceName_key" ON "WhatsappInstance"("instanceName");'
        );
        await prisma.$executeRawUnsafe(
          'CREATE INDEX IF NOT EXISTS "WhatsappInstance_tenantId_idx" ON "WhatsappInstance"("tenantId");'
        );

        await prisma.$executeRawUnsafe('PRAGMA foreign_keys = ON;');
        console.log('[MIGRATION] Tabela WhatsappInstance reconstruída com sucesso sem constraint UNIQUE.');
      } else {
        console.log('[MIGRATION] Tabela WhatsappInstance já está configurada para Multi-Tenant.');
      }

      // Garante que as colunas de delay existem na WhatsappInstance atual
      const cols = await prisma.$queryRawUnsafe('PRAGMA table_info("WhatsappInstance");');
      const colSet = new Set((cols || []).map((c) => c.name));

      if (!colSet.has('provider')) {
        await prisma.$executeRawUnsafe('ALTER TABLE "WhatsappInstance" ADD COLUMN "provider" TEXT NOT NULL DEFAULT \'EVOLUTION\';');
        console.log('[MIGRATION] Coluna provider adicionada com sucesso.');
      }
      if (!colSet.has('wabaId')) {
        await prisma.$executeRawUnsafe('ALTER TABLE "WhatsappInstance" ADD COLUMN "wabaId" TEXT;');
        console.log('[MIGRATION] Coluna wabaId adicionada com sucesso.');
      }
      if (!colSet.has('phoneNumberId')) {
        await prisma.$executeRawUnsafe('ALTER TABLE "WhatsappInstance" ADD COLUMN "phoneNumberId" TEXT;');
        console.log('[MIGRATION] Coluna phoneNumberId adicionada com sucesso.');
      }
      if (!colSet.has('accessToken')) {
        await prisma.$executeRawUnsafe('ALTER TABLE "WhatsappInstance" ADD COLUMN "accessToken" TEXT;');
        console.log('[MIGRATION] Coluna accessToken adicionada com sucesso.');
      }
      if (!colSet.has('businessAccountId')) {
        await prisma.$executeRawUnsafe('ALTER TABLE "WhatsappInstance" ADD COLUMN "businessAccountId" TEXT;');
        console.log('[MIGRATION] Coluna businessAccountId adicionada com sucesso.');
      }
      if (!colSet.has('webhookVerifyToken')) {
        await prisma.$executeRawUnsafe('ALTER TABLE "WhatsappInstance" ADD COLUMN "webhookVerifyToken" TEXT;');
        console.log('[MIGRATION] Coluna webhookVerifyToken adicionada com sucesso.');
      }
      if (!colSet.has('appId')) {
        await prisma.$executeRawUnsafe('ALTER TABLE "WhatsappInstance" ADD COLUMN "appId" TEXT;');
        console.log('[MIGRATION] Coluna appId adicionada com sucesso.');
      }
      if (!colSet.has('appSecret')) {
        await prisma.$executeRawUnsafe('ALTER TABLE "WhatsappInstance" ADD COLUMN "appSecret" TEXT;');
        console.log('[MIGRATION] Coluna appSecret adicionada com sucesso.');
      }
      if (!colSet.has('qualityRating')) {
        await prisma.$executeRawUnsafe('ALTER TABLE "WhatsappInstance" ADD COLUMN "qualityRating" TEXT;');
        console.log('[MIGRATION] Coluna qualityRating adicionada com sucesso.');
      }
      if (!colSet.has('verifiedName')) {
        await prisma.$executeRawUnsafe('ALTER TABLE "WhatsappInstance" ADD COLUMN "verifiedName" TEXT;');
        console.log('[MIGRATION] Coluna verifiedName adicionada com sucesso.');
      }
      if (!colSet.has('name')) {
        await prisma.$executeRawUnsafe('ALTER TABLE "WhatsappInstance" ADD COLUMN "name" TEXT;');
        console.log('[MIGRATION] Coluna name adicionada com sucesso.');
      }
      if (!colSet.has('userId')) {
        await prisma.$executeRawUnsafe('ALTER TABLE "WhatsappInstance" ADD COLUMN "userId" TEXT;');
        console.log('[MIGRATION] Coluna userId adicionada com sucesso.');
      }

      if (!colSet.has('fixed_delay_seconds')) {
        await prisma.$executeRawUnsafe('ALTER TABLE "WhatsappInstance" ADD COLUMN "fixed_delay_seconds" INTEGER NOT NULL DEFAULT 30;');
        console.log('[MIGRATION] Coluna fixed_delay_seconds adicionada com sucesso.');
      }
      if (!colSet.has('use_random_delay')) {
        await prisma.$executeRawUnsafe('ALTER TABLE "WhatsappInstance" ADD COLUMN "use_random_delay" BOOLEAN NOT NULL DEFAULT 1;');
        console.log('[MIGRATION] Coluna use_random_delay adicionada com sucesso.');
      }
      if (!colSet.has('min_delay_seconds')) {
        await prisma.$executeRawUnsafe('ALTER TABLE "WhatsappInstance" ADD COLUMN "min_delay_seconds" INTEGER NOT NULL DEFAULT 20;');
        console.log('[MIGRATION] Coluna min_delay_seconds adicionada com sucesso.');
      }
      if (!colSet.has('max_delay_seconds')) {
        await prisma.$executeRawUnsafe('ALTER TABLE "WhatsappInstance" ADD COLUMN "max_delay_seconds" INTEGER NOT NULL DEFAULT 45;');
        console.log('[MIGRATION] Coluna max_delay_seconds adicionada com sucesso.');
      }
    }

    // Auto-healing para tabelas essenciais caso o prisma db push tenha falhado em produção
    // 1. EmailSettings
    await prisma.$executeRawUnsafe(`
      CREATE TABLE IF NOT EXISTS "EmailSettings" (
        "id" TEXT NOT NULL PRIMARY KEY,
        "tenantId" TEXT NOT NULL,
        "provider" TEXT NOT NULL DEFAULT 'SMTP',
        "smtpHost" TEXT NOT NULL,
        "smtpPort" INTEGER NOT NULL DEFAULT 587,
        "smtpSecure" BOOLEAN NOT NULL DEFAULT 0,
        "smtpUsername" TEXT NOT NULL,
        "smtpPassword" TEXT NOT NULL,
        "fromName" TEXT NOT NULL,
        "fromEmail" TEXT NOT NULL,
        "replyTo" TEXT,
        "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
        "updatedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
        CONSTRAINT "EmailSettings_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant" ("id") ON DELETE CASCADE ON UPDATE CASCADE
      );
    `);
    await prisma.$executeRawUnsafe(
      'CREATE UNIQUE INDEX IF NOT EXISTS "EmailSettings_tenantId_key" ON "EmailSettings"("tenantId");'
    );

    // 2. EmailLog
    await prisma.$executeRawUnsafe(`
      CREATE TABLE IF NOT EXISTS "EmailLog" (
        "id" TEXT NOT NULL PRIMARY KEY,
        "tenantId" TEXT NOT NULL,
        "to" TEXT NOT NULL,
        "subject" TEXT NOT NULL,
        "status" TEXT NOT NULL DEFAULT 'SENT',
        "provider" TEXT NOT NULL DEFAULT 'SMTP',
        "errorMessage" TEXT,
        "messageId" TEXT,
        "metadata" TEXT,
        "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
        CONSTRAINT "EmailLog_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant" ("id") ON DELETE CASCADE ON UPDATE CASCADE
      );
    `);
    await prisma.$executeRawUnsafe(
      'CREATE INDEX IF NOT EXISTS "EmailLog_tenantId_createdAt_idx" ON "EmailLog"("tenantId", "createdAt");'
    );
    await prisma.$executeRawUnsafe(
      'CREATE INDEX IF NOT EXISTS "EmailLog_tenantId_status_idx" ON "EmailLog"("tenantId", "status");'
    );

    // 3. email_queue
    await prisma.$executeRawUnsafe(`
      CREATE TABLE IF NOT EXISTS "email_queue" (
        "id" TEXT NOT NULL PRIMARY KEY,
        "tenantId" TEXT NOT NULL,
        "to_email" TEXT NOT NULL,
        "subject" TEXT NOT NULL,
        "html_content" TEXT NOT NULL,
        "status" TEXT NOT NULL DEFAULT 'PENDING',
        "attempts" INTEGER NOT NULL DEFAULT 0,
        "max_attempts" INTEGER NOT NULL DEFAULT 3,
        "error_message" TEXT,
        "scheduled_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
        "sent_at" DATETIME,
        "created_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
        "updated_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
        CONSTRAINT "email_queue_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant" ("id") ON DELETE CASCADE ON UPDATE CASCADE
      );
    `);
    await prisma.$executeRawUnsafe(
      'CREATE INDEX IF NOT EXISTS "email_queue_tenantId_status_idx" ON "email_queue"("tenantId", "status");'
    );
    await prisma.$executeRawUnsafe(
      'CREATE INDEX IF NOT EXISTS "email_queue_status_scheduled_at_idx" ON "email_queue"("status", "scheduled_at");'
    );

    // 4. whatsapp_queue
    await prisma.$executeRawUnsafe(`
      CREATE TABLE IF NOT EXISTS "whatsapp_queue" (
        "id" TEXT NOT NULL PRIMARY KEY,
        "tenant_id" TEXT NOT NULL,
        "whatsapp_instance_id" TEXT,
        "contact_id" TEXT,
        "phone" TEXT NOT NULL,
        "contact_name" TEXT,
        "message_type" TEXT NOT NULL DEFAULT 'text',
        "text" TEXT,
        "media_url" TEXT,
        "media_base64" TEXT,
        "media_mime_type" TEXT,
        "media_file_name" TEXT,
        "media_size" INTEGER,
        "caption" TEXT,
        "recipient_type" TEXT NOT NULL DEFAULT 'INDIVIDUAL',
        "group_jid" TEXT,
        "group_enrollment_id" TEXT,
        "status" TEXT NOT NULL DEFAULT 'PENDING',
        "attempts" INTEGER NOT NULL DEFAULT 0,
        "max_attempts" INTEGER NOT NULL DEFAULT 3,
        "error_message" TEXT,
        "scheduled_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
        "sent_at" DATETIME,
        "created_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
        "updated_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
      );
    `);
    await prisma.$executeRawUnsafe(
      'CREATE INDEX IF NOT EXISTS "idx_whatsapp_queue_tenant_status" ON "whatsapp_queue"("tenant_id", "status");'
    );
    await prisma.$executeRawUnsafe(
      'CREATE INDEX IF NOT EXISTS "idx_whatsapp_queue_status_sched" ON "whatsapp_queue"("status", "scheduled_at");'
    );
    await prisma.$executeRawUnsafe(
      'CREATE INDEX IF NOT EXISTS "idx_whatsapp_queue_inst_status" ON "whatsapp_queue"("whatsapp_instance_id", "status");'
    );

    // 4.1. Garante novas colunas em whatsapp_queue se a tabela já existia
    try {
      const qCols = await prisma.$queryRawUnsafe('PRAGMA table_info("whatsapp_queue");');
      const qColNames = new Set((qCols || []).map((c) => c.name));
      if (!qColNames.has('recipient_type')) {
        await prisma.$executeRawUnsafe('ALTER TABLE "whatsapp_queue" ADD COLUMN "recipient_type" TEXT NOT NULL DEFAULT \'INDIVIDUAL\';');
      }
      if (!qColNames.has('group_jid')) {
        await prisma.$executeRawUnsafe('ALTER TABLE "whatsapp_queue" ADD COLUMN "group_jid" TEXT;');
      }
      if (!qColNames.has('group_enrollment_id')) {
        await prisma.$executeRawUnsafe('ALTER TABLE "whatsapp_queue" ADD COLUMN "group_enrollment_id" TEXT;');
      }
    } catch {}

    // 4.2. Garante novas colunas em Automation se a tabela já existia
    try {
      const aCols = await prisma.$queryRawUnsafe('PRAGMA table_info("Automation");');
      const aColNames = new Set((aCols || []).map((c) => c.name));
      if (!aColNames.has('targetType')) {
        await prisma.$executeRawUnsafe('ALTER TABLE "Automation" ADD COLUMN "targetType" TEXT NOT NULL DEFAULT \'INDIVIDUAL\';');
      }
      if (!aColNames.has('targetGroupTags')) {
        await prisma.$executeRawUnsafe('ALTER TABLE "Automation" ADD COLUMN "targetGroupTags" TEXT;');
      }
      if (!aColNames.has('targetGroupIds')) {
        await prisma.$executeRawUnsafe('ALTER TABLE "Automation" ADD COLUMN "targetGroupIds" TEXT;');
      }
      if (!aColNames.has('whatsappInstanceId')) {
        await prisma.$executeRawUnsafe('ALTER TABLE "Automation" ADD COLUMN "whatsappInstanceId" TEXT;');
      }
      if (!aColNames.has('delayBetweenGroups')) {
        await prisma.$executeRawUnsafe('ALTER TABLE "Automation" ADD COLUMN "delayBetweenGroups" INTEGER NOT NULL DEFAULT 30;');
      }
      if (!aColNames.has('useRandomDelay')) {
        await prisma.$executeRawUnsafe('ALTER TABLE "Automation" ADD COLUMN "useRandomDelay" BOOLEAN NOT NULL DEFAULT 1;');
      }
      if (!aColNames.has('minDelaySeconds')) {
        await prisma.$executeRawUnsafe('ALTER TABLE "Automation" ADD COLUMN "minDelaySeconds" INTEGER NOT NULL DEFAULT 20;');
      }
      if (!aColNames.has('maxDelaySeconds')) {
        await prisma.$executeRawUnsafe('ALTER TABLE "Automation" ADD COLUMN "maxDelaySeconds" INTEGER NOT NULL DEFAULT 45;');
      }
    } catch {}

    // 5. whatsapp_groups
    await prisma.$executeRawUnsafe(`
      CREATE TABLE IF NOT EXISTS "whatsapp_groups" (
        "id" TEXT NOT NULL PRIMARY KEY,
        "tenant_id" TEXT NOT NULL,
        "whatsapp_instance_id" TEXT NOT NULL,
        "jid" TEXT NOT NULL,
        "name" TEXT NOT NULL,
        "picture_url" TEXT,
        "participants_count" INTEGER NOT NULL DEFAULT 0,
        "is_admin" BOOLEAN NOT NULL DEFAULT 0,
        "admin_role" TEXT,
        "status" TEXT NOT NULL DEFAULT 'ACTIVE',
        "is_eligible" BOOLEAN NOT NULL DEFAULT 0,
        "metadata" TEXT,
        "last_synced_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
        "created_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
        "updated_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
        CONSTRAINT "whatsapp_groups_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "Tenant" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
        CONSTRAINT "whatsapp_groups_whatsapp_instance_id_fkey" FOREIGN KEY ("whatsapp_instance_id") REFERENCES "WhatsappInstance" ("id") ON DELETE CASCADE ON UPDATE CASCADE
      );
    `);
    await prisma.$executeRawUnsafe(
      'CREATE UNIQUE INDEX IF NOT EXISTS "whatsapp_groups_whatsapp_instance_id_jid_key" ON "whatsapp_groups"("whatsapp_instance_id", "jid");'
    );
    await prisma.$executeRawUnsafe(
      'CREATE INDEX IF NOT EXISTS "whatsapp_groups_tenant_id_is_eligible_idx" ON "whatsapp_groups"("tenant_id", "is_eligible");'
    );
    await prisma.$executeRawUnsafe(
      'CREATE INDEX IF NOT EXISTS "whatsapp_groups_tenant_id_status_idx" ON "whatsapp_groups"("tenant_id", "status");'
    );

    // 6. group_tags
    await prisma.$executeRawUnsafe(`
      CREATE TABLE IF NOT EXISTS "group_tags" (
        "id" TEXT NOT NULL PRIMARY KEY,
        "tenant_id" TEXT NOT NULL,
        "name" TEXT NOT NULL,
        "color" TEXT NOT NULL DEFAULT '#10b981',
        "description" TEXT,
        "created_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
        CONSTRAINT "group_tags_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "Tenant" ("id") ON DELETE CASCADE ON UPDATE CASCADE
      );
    `);
    await prisma.$executeRawUnsafe(
      'CREATE UNIQUE INDEX IF NOT EXISTS "group_tags_tenant_id_name_key" ON "group_tags"("tenant_id", "name");'
    );

    // 7. group_tag_on_groups
    await prisma.$executeRawUnsafe(`
      CREATE TABLE IF NOT EXISTS "group_tag_on_groups" (
        "id" TEXT NOT NULL PRIMARY KEY,
        "group_id" TEXT NOT NULL,
        "tag_id" TEXT NOT NULL,
        "added_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
        CONSTRAINT "group_tag_on_groups_group_id_fkey" FOREIGN KEY ("group_id") REFERENCES "whatsapp_groups" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
        CONSTRAINT "group_tag_on_groups_tag_id_fkey" FOREIGN KEY ("tag_id") REFERENCES "group_tags" ("id") ON DELETE CASCADE ON UPDATE CASCADE
      );
    `);
    await prisma.$executeRawUnsafe(
      'CREATE UNIQUE INDEX IF NOT EXISTS "group_tag_on_groups_group_id_tag_id_key" ON "group_tag_on_groups"("group_id", "tag_id");'
    );

    // 8. automation_group_enrollments
    await prisma.$executeRawUnsafe(`
      CREATE TABLE IF NOT EXISTS "automation_group_enrollments" (
        "id" TEXT NOT NULL PRIMARY KEY,
        "automation_id" TEXT NOT NULL,
        "group_id" TEXT NOT NULL,
        "tenant_id" TEXT NOT NULL,
        "current_node_id" TEXT,
        "status" TEXT NOT NULL DEFAULT 'ACTIVE',
        "entered_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
        "completed_at" DATETIME,
        "metadata" TEXT,
        CONSTRAINT "automation_group_enrollments_automation_id_fkey" FOREIGN KEY ("automation_id") REFERENCES "Automation" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
        CONSTRAINT "automation_group_enrollments_group_id_fkey" FOREIGN KEY ("group_id") REFERENCES "whatsapp_groups" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
        CONSTRAINT "automation_group_enrollments_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "Tenant" ("id") ON DELETE CASCADE ON UPDATE CASCADE
      );
    `);
    await prisma.$executeRawUnsafe(
      'CREATE UNIQUE INDEX IF NOT EXISTS "automation_group_enrollments_automation_id_group_id_key" ON "automation_group_enrollments"("automation_id", "group_id");'
    );
    await prisma.$executeRawUnsafe(
      'CREATE INDEX IF NOT EXISTS "automation_group_enrollments_tenant_id_status_idx" ON "automation_group_enrollments"("tenant_id", "status");'
    );

    // 9. automation_group_step_logs
    await prisma.$executeRawUnsafe(`
      CREATE TABLE IF NOT EXISTS "automation_group_step_logs" (
        "id" TEXT NOT NULL PRIMARY KEY,
        "enrollment_id" TEXT NOT NULL,
        "group_id" TEXT NOT NULL,
        "tenant_id" TEXT NOT NULL,
        "node_id" TEXT NOT NULL,
        "node_type" TEXT NOT NULL,
        "action" TEXT NOT NULL,
        "status" TEXT NOT NULL DEFAULT 'SUCCESS',
        "details" TEXT,
        "executed_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
        CONSTRAINT "automation_group_step_logs_enrollment_id_fkey" FOREIGN KEY ("enrollment_id") REFERENCES "automation_group_enrollments" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
        CONSTRAINT "automation_group_step_logs_group_id_fkey" FOREIGN KEY ("group_id") REFERENCES "whatsapp_groups" ("id") ON DELETE CASCADE ON UPDATE CASCADE
      );
    `);
    await prisma.$executeRawUnsafe(
      'CREATE INDEX IF NOT EXISTS "automation_group_step_logs_enrollment_id_idx" ON "automation_group_step_logs"("enrollment_id");'
    );
    await prisma.$executeRawUnsafe(
      'CREATE INDEX IF NOT EXISTS "automation_group_step_logs_group_id_idx" ON "automation_group_step_logs"("group_id");'
    );

    console.log('[MIGRATION] Verificação de integridade e auto-healing concluídos com sucesso.');
  } catch (err) {
    console.error('[MIGRATION] Erro controlado durante verificação:', err.message);
  } finally {
    await prisma.$disconnect();
  }
}

if (require.main === module) {
  migrateWhatsappMultiTenant()
    .then(() => process.exit(0))
    .catch((err) => {
      console.error('[MIGRATION] Falha fatal controlada:', err.message);
      process.exit(0);
    });
}

module.exports = { migrateWhatsappMultiTenant };
