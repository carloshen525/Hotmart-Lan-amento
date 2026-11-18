import { PrismaClient } from '@prisma/client';

let isMigrating = false;
let isMigrated = false;

async function getExistingColumns(prisma: PrismaClient, table: string): Promise<Set<string>> {
  try {
    const cols: any = await prisma.$queryRawUnsafe(`PRAGMA table_info("${table}");`);
    if (Array.isArray(cols)) {
      return new Set(cols.map((c: any) => c.name));
    }
  } catch {}
  return new Set();
}

/**
 * Auto-healing para o banco de dados (SQLite / Multi-tenant / SaaS).
 * Garante que todas as colunas e tabelas essenciais (como User.phone, saas_clients, etc.)
 * existam mesmo que o container tenha sido iniciado sem rodar prisma db push manualmente.
 */
export async function ensureDatabaseSchema(prisma: PrismaClient): Promise<void> {
  if (isMigrated || isMigrating) return;
  isMigrating = true;

  try {
    // 1. Colunas na tabela User
    const userCols = await getExistingColumns(prisma, 'User');
    if (!userCols.has('phone')) {
      try { await prisma.$executeRawUnsafe('ALTER TABLE "User" ADD COLUMN "phone" TEXT;'); } catch {}
    }
    if (!userCols.has('status')) {
      try { await prisma.$executeRawUnsafe('ALTER TABLE "User" ADD COLUMN "status" TEXT NOT NULL DEFAULT \'ACTIVE\';'); } catch {}
    }
    if (!userCols.has('clientId')) {
      try { await prisma.$executeRawUnsafe('ALTER TABLE "User" ADD COLUMN "clientId" TEXT;'); } catch {}
    }

    // 2. Coluna na tabela Tenant
    const tenantCols = await getExistingColumns(prisma, 'Tenant');
    if (!tenantCols.has('clientId')) {
      try { await prisma.$executeRawUnsafe('ALTER TABLE "Tenant" ADD COLUMN "clientId" TEXT;'); } catch {}
    }

    // 3. Coluna na tabela WhatsappInstance
    const instCols = await getExistingColumns(prisma, 'WhatsappInstance');
    if (!instCols.has('userId')) {
      try { await prisma.$executeRawUnsafe('ALTER TABLE "WhatsappInstance" ADD COLUMN "userId" TEXT;'); } catch {}
    }

    // 4. Colunas na tabela whatsapp_groups
    const groupCols = await getExistingColumns(prisma, 'whatsapp_groups');
    if (!groupCols.has('is_community')) {
      try { await prisma.$executeRawUnsafe('ALTER TABLE "whatsapp_groups" ADD COLUMN "is_community" BOOLEAN NOT NULL DEFAULT 0;'); } catch {}
    }
    if (!groupCols.has('is_community_announce')) {
      try { await prisma.$executeRawUnsafe('ALTER TABLE "whatsapp_groups" ADD COLUMN "is_community_announce" BOOLEAN NOT NULL DEFAULT 0;'); } catch {}
    }
    if (!groupCols.has('parent_community_jid')) {
      try { await prisma.$executeRawUnsafe('ALTER TABLE "whatsapp_groups" ADD COLUMN "parent_community_jid" TEXT;'); } catch {}
    }
    if (!groupCols.has('description')) {
      try { await prisma.$executeRawUnsafe('ALTER TABLE "whatsapp_groups" ADD COLUMN "description" TEXT;'); } catch {}
    }

    // 5. Criação da tabela saas_clients se não existir
    try {
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
      `);
    } catch {}

    // 6. Criação de tabelas de suporte se não existirem
    try {
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
      `);
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
      `);
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
      `);
    } catch {}

    isMigrated = true;
  } catch (err: any) {
    console.warn('[DB Init] Aviso na verificação de schema:', err.message);
  } finally {
    isMigrating = false;
  }
}
