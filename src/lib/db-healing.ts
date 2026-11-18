import { prisma } from './prisma';

let healed = false;

export async function healDatabaseSchemaIfNeeded(): Promise<void> {
  if (healed) return;
  try {
    // 1. Colunas na tabela User
    const userColumns: any = await prisma.$queryRawUnsafe('PRAGMA table_info("User");').catch(() => []);
    if (Array.isArray(userColumns)) {
      const names = userColumns.map((c: any) => c.name);
      if (!names.includes('phone')) {
        await prisma.$executeRawUnsafe('ALTER TABLE "User" ADD COLUMN "phone" TEXT;').catch(() => {});
      }
      if (!names.includes('status')) {
        await prisma.$executeRawUnsafe('ALTER TABLE "User" ADD COLUMN "status" TEXT NOT NULL DEFAULT \'ACTIVE\';').catch(() => {});
      }
      if (!names.includes('clientId')) {
        await prisma.$executeRawUnsafe('ALTER TABLE "User" ADD COLUMN "clientId" TEXT;').catch(() => {});
      }
    }

    // 2. Coluna na tabela Tenant
    const tenantColumns: any = await prisma.$queryRawUnsafe('PRAGMA table_info("Tenant");').catch(() => []);
    if (Array.isArray(tenantColumns)) {
      const tnames = tenantColumns.map((c: any) => c.name);
      if (!tnames.includes('clientId')) {
        await prisma.$executeRawUnsafe('ALTER TABLE "Tenant" ADD COLUMN "clientId" TEXT;').catch(() => {});
      }
    }

    // 3. Coluna na tabela WhatsappInstance
    const instanceColumns: any = await prisma.$queryRawUnsafe('PRAGMA table_info("WhatsappInstance");').catch(() => []);
    if (Array.isArray(instanceColumns)) {
      const inames = instanceColumns.map((c: any) => c.name);
      if (!inames.includes('userId')) {
        await prisma.$executeRawUnsafe('ALTER TABLE "WhatsappInstance" ADD COLUMN "userId" TEXT;').catch(() => {});
      }
    }

    // 4. Colunas na tabela whatsapp_groups
    const groupColumns: any = await prisma.$queryRawUnsafe('PRAGMA table_info("whatsapp_groups");').catch(() => []);
    if (Array.isArray(groupColumns)) {
      const gnames = groupColumns.map((c: any) => c.name);
      if (!gnames.includes('is_community')) {
        await prisma.$executeRawUnsafe('ALTER TABLE "whatsapp_groups" ADD COLUMN "is_community" BOOLEAN NOT NULL DEFAULT 0;').catch(() => {});
      }
      if (!gnames.includes('is_community_announce')) {
        await prisma.$executeRawUnsafe('ALTER TABLE "whatsapp_groups" ADD COLUMN "is_community_announce" BOOLEAN NOT NULL DEFAULT 0;').catch(() => {});
      }
      if (!gnames.includes('parent_community_jid')) {
        await prisma.$executeRawUnsafe('ALTER TABLE "whatsapp_groups" ADD COLUMN "parent_community_jid" TEXT;').catch(() => {});
      }
      if (!gnames.includes('description')) {
        await prisma.$executeRawUnsafe('ALTER TABLE "whatsapp_groups" ADD COLUMN "description" TEXT;').catch(() => {});
      }
    }

    // 5. Tabela saas_clients
    await prisma.$executeRawUnsafe(`
      CREATE TABLE IF NOT EXISTS "saas_clients" (
        "id" TEXT NOT NULL PRIMARY KEY,
        "name" TEXT NOT NULL,
        "company" TEXT,
        "email" TEXT NOT NULL UNIQUE,
        "phone" TEXT,
        "status" TEXT NOT NULL DEFAULT 'ACTIVE',
        "plan" TEXT NOT NULL DEFAULT 'Pro',
        "monthlyPrice" REAL NOT NULL DEFAULT 197.0,
        "billingCycle" TEXT NOT NULL DEFAULT 'MONTHLY',
        "startDate" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
        "accessDays" INTEGER NOT NULL DEFAULT 30,
        "expiresAt" DATETIME NOT NULL,
        "maxExperts" INTEGER NOT NULL DEFAULT 5,
        "maxWhatsappInstances" INTEGER NOT NULL DEFAULT 3,
        "notes" TEXT,
        "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
        "updatedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
      );
    `).catch(() => {});

    // 6. Tabela support_tickets
    await prisma.$executeRawUnsafe(`
      CREATE TABLE IF NOT EXISTS "support_tickets" (
        "id" TEXT NOT NULL PRIMARY KEY,
        "client_id" TEXT,
        "tenant_id" TEXT,
        "user_id" TEXT NOT NULL,
        "subject" TEXT NOT NULL,
        "message" TEXT NOT NULL,
        "priority" TEXT NOT NULL DEFAULT 'MEDIUM',
        "status" TEXT NOT NULL DEFAULT 'OPEN',
        "attachment_url" TEXT,
        "created_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
        "updated_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
      );
    `).catch(() => {});

    // 7. Tabela support_messages
    await prisma.$executeRawUnsafe(`
      CREATE TABLE IF NOT EXISTS "support_messages" (
        "id" TEXT NOT NULL PRIMARY KEY,
        "ticket_id" TEXT NOT NULL,
        "sender_id" TEXT NOT NULL,
        "sender_name" TEXT NOT NULL,
        "sender_role" TEXT NOT NULL DEFAULT 'USUARIO',
        "message" TEXT NOT NULL,
        "attachment_url" TEXT,
        "created_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
      );
    `).catch(() => {});

    // 8. Tabela saas_audit_logs
    await prisma.$executeRawUnsafe(`
      CREATE TABLE IF NOT EXISTS "saas_audit_logs" (
        "id" TEXT NOT NULL PRIMARY KEY,
        "client_id" TEXT,
        "user_id" TEXT,
        "user_email" TEXT,
        "user_name" TEXT,
        "action" TEXT NOT NULL,
        "entity_type" TEXT NOT NULL,
        "entity_id" TEXT,
        "description" TEXT NOT NULL,
        "before_data" TEXT,
        "after_data" TEXT,
        "ip_address" TEXT,
        "created_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
      );
    `).catch(() => {});

    healed = true;
  } catch (err) {
    // Non-blocking
  }
}
