import { prisma } from './prisma';
import { ensureDatabaseSchema } from './db-init';

let healed = false;

export async function healDatabaseSchemaIfNeeded(): Promise<void> {
  if (healed) return;
  try {
    // Garante inicialização central e síncrona
    await ensureDatabaseSchema(prisma as any);
    // 1. Colunas na tabela User (executa seguro e direto)
    await prisma.$executeRawUnsafe('ALTER TABLE "User" ADD COLUMN "phone" TEXT;').catch(() => {});
    await prisma.$executeRawUnsafe('ALTER TABLE "User" ADD COLUMN "status" TEXT NOT NULL DEFAULT \'ACTIVE\';').catch(() => {});
    await prisma.$executeRawUnsafe('ALTER TABLE "User" ADD COLUMN "clientId" TEXT;').catch(() => {});

    // 2. Coluna na tabela Tenant
    await prisma.$executeRawUnsafe('ALTER TABLE "Tenant" ADD COLUMN "clientId" TEXT;').catch(() => {});

    // 3. Coluna na tabela WhatsappInstance
    await prisma.$executeRawUnsafe('ALTER TABLE "WhatsappInstance" ADD COLUMN "userId" TEXT;').catch(() => {});

    // 4. Colunas na tabela whatsapp_groups
    await prisma.$executeRawUnsafe('ALTER TABLE "whatsapp_groups" ADD COLUMN "is_community" BOOLEAN NOT NULL DEFAULT 0;').catch(() => {});
    await prisma.$executeRawUnsafe('ALTER TABLE "whatsapp_groups" ADD COLUMN "is_community_announce" BOOLEAN NOT NULL DEFAULT 0;').catch(() => {});
    await prisma.$executeRawUnsafe('ALTER TABLE "whatsapp_groups" ADD COLUMN "parent_community_jid" TEXT;').catch(() => {});
    await prisma.$executeRawUnsafe('ALTER TABLE "whatsapp_groups" ADD COLUMN "description" TEXT;').catch(() => {});

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
