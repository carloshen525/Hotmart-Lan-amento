const { PrismaClient } = require('@prisma/client');
const bcrypt = require('bcryptjs');

async function migrateSaas() {
  const prisma = new PrismaClient();
  console.log('[MIGRATION SAAS] Verificando e aplicando colunas e tabelas do SaaS...');

  try {
    // 1. Colunas na tabela User
    const userColumns = await prisma.$queryRawUnsafe('PRAGMA table_info("User");');
    const userColNames = Array.isArray(userColumns) ? userColumns.map((c) => c.name) : [];

    if (!userColNames.includes('phone')) {
      console.log('[MIGRATION SAAS] Adicionando coluna "phone" na tabela User...');
      await prisma.$executeRawUnsafe('ALTER TABLE "User" ADD COLUMN "phone" TEXT;');
    }
    if (!userColNames.includes('status')) {
      console.log('[MIGRATION SAAS] Adicionando coluna "status" na tabela User...');
      await prisma.$executeRawUnsafe('ALTER TABLE "User" ADD COLUMN "status" TEXT NOT NULL DEFAULT \'ACTIVE\';');
    }
    if (!userColNames.includes('clientId')) {
      console.log('[MIGRATION SAAS] Adicionando coluna "clientId" na tabela User...');
      await prisma.$executeRawUnsafe('ALTER TABLE "User" ADD COLUMN "clientId" TEXT;');
    }

    // 2. Coluna na tabela Tenant
    const tenantColumns = await prisma.$queryRawUnsafe('PRAGMA table_info("Tenant");');
    const tenantColNames = Array.isArray(tenantColumns) ? tenantColumns.map((c) => c.name) : [];

    if (!tenantColNames.includes('clientId')) {
      console.log('[MIGRATION SAAS] Adicionando coluna "clientId" na tabela Tenant...');
      await prisma.$executeRawUnsafe('ALTER TABLE "Tenant" ADD COLUMN "clientId" TEXT;');
    }

    // 3. Coluna na tabela WhatsappInstance
    const instanceColumns = await prisma.$queryRawUnsafe('PRAGMA table_info("WhatsappInstance");');
    const instanceColNames = Array.isArray(instanceColumns) ? instanceColumns.map((c) => c.name) : [];

    if (!instanceColNames.includes('userId')) {
      console.log('[MIGRATION SAAS] Adicionando coluna "userId" na tabela WhatsappInstance...');
      await prisma.$executeRawUnsafe('ALTER TABLE "WhatsappInstance" ADD COLUMN "userId" TEXT;');
    }

    // 3.1. Colunas na tabela whatsapp_groups para Comunidades
    const groupColumns = await prisma.$queryRawUnsafe('PRAGMA table_info("whatsapp_groups");').catch(() => []);
    const groupColNames = Array.isArray(groupColumns) ? groupColumns.map((c) => c.name) : [];

    if (!groupColNames.includes('is_community')) {
      console.log('[MIGRATION SAAS] Adicionando coluna "is_community" na tabela whatsapp_groups...');
      await prisma.$executeRawUnsafe('ALTER TABLE "whatsapp_groups" ADD COLUMN "is_community" BOOLEAN NOT NULL DEFAULT 0;');
    }
    if (!groupColNames.includes('is_community_announce')) {
      console.log('[MIGRATION SAAS] Adicionando coluna "is_community_announce" na tabela whatsapp_groups...');
      await prisma.$executeRawUnsafe('ALTER TABLE "whatsapp_groups" ADD COLUMN "is_community_announce" BOOLEAN NOT NULL DEFAULT 0;');
    }
    if (!groupColNames.includes('parent_community_jid')) {
      console.log('[MIGRATION SAAS] Adicionando coluna "parent_community_jid" na tabela whatsapp_groups...');
      await prisma.$executeRawUnsafe('ALTER TABLE "whatsapp_groups" ADD COLUMN "parent_community_jid" TEXT;');
    }
    if (!groupColNames.includes('description')) {
      console.log('[MIGRATION SAAS] Adicionando coluna "description" na tabela whatsapp_groups...');
      await prisma.$executeRawUnsafe('ALTER TABLE "whatsapp_groups" ADD COLUMN "description" TEXT;');
    }

    // 4. Criação da tabela saas_clients se não existir
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

    // 5. Criação da tabela support_tickets se não existir
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

    // 6. Criação da tabela support_messages se não existir
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

    // 7. Criação da tabela saas_audit_logs se não existir
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

    // 8. Garante o usuário Super Admin
    const adminEmail = 'carloshenrq1245@gmail.com';
    const passwordHash = await bcrypt.hash('12277891', 10);
    const existing = await prisma.user.findUnique({ where: { email: adminEmail } });

    if (existing) {
      await prisma.user.update({
        where: { email: adminEmail },
        data: {
          passwordHash,
          role: 'SUPER_ADMIN',
          status: 'ACTIVE',
        },
      });
      console.log('[MIGRATION SAAS] Usuário Super Admin atualizado com sucesso:', adminEmail);
    } else {
      await prisma.user.create({
        data: {
          name: 'Carlos Henrique',
          email: adminEmail,
          passwordHash,
          role: 'SUPER_ADMIN',
          status: 'ACTIVE',
        },
      });
      console.log('[MIGRATION SAAS] Usuário Super Admin criado com sucesso:', adminEmail);
    }

    console.log('[MIGRATION SAAS] Migração do SaaS finalizada com 100% de sucesso.');
  } catch (err) {
    console.error('[MIGRATION SAAS] Erro durante a migração:', err.message);
  } finally {
    await prisma.$disconnect();
  }
}

if (require.main === module) {
  migrateSaas();
}

module.exports = { migrateSaas };
