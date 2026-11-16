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
