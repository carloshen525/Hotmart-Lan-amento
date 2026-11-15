const { PrismaClient } = require('@prisma/client');

async function migrateWhatsappMultiTenant() {
  const prisma = new PrismaClient();
  console.log('[MIGRATION] Verificando e reconstruindo tabela WhatsappInstance para Multi-Tenant...');

  try {
    // 1. Desativa temporariamente chaves estrangeiras para permitir reconstrução segura de tabela
    await prisma.$executeRawUnsafe('PRAGMA foreign_keys = OFF;');

    // 2. Verifica se a tabela WhatsappInstance existe
    const tables = await prisma.$queryRawUnsafe(
      "SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'WhatsappInstance';"
    );

    if (Array.isArray(tables) && tables.length > 0) {
      console.log('[MIGRATION] Tabela WhatsappInstance encontrada. Iniciando migração de schema...');

      // 3. Localiza um tenant padrão para vincular instâncias órfãs (se houver)
      let defaultTenantId = 'cmwdefault0000tenant0000000001';
      try {
        const tenants = await prisma.$queryRawUnsafe("SELECT id FROM Tenant ORDER BY createdAt ASC LIMIT 1;");
        if (Array.isArray(tenants) && tenants.length > 0 && tenants[0].id) {
          defaultTenantId = tenants[0].id;
        }
      } catch (err) {
        console.warn('[MIGRATION] Tenant padrão não encontrado via SQL:', err.message);
      }

      // 4. Cria tabela temporária 'new_WhatsappInstance' SEM qualquer constraint UNIQUE em tenantId
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
          "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
          "updatedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
          CONSTRAINT "WhatsappInstance_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant" ("id") ON DELETE CASCADE ON UPDATE CASCADE
        );
      `);

      // 5. Copia dados da tabela antiga para a nova tabela
      // Se tenantId for nulo ou vazio, associa ao defaultTenantId
      await prisma.$executeRawUnsafe(`
        INSERT OR IGNORE INTO "new_WhatsappInstance" (
          "id", "tenantId", "name", "instanceName", "instanceToken", 
          "phone", "profileName", "profilePicUrl", "status", "qrcode", 
          "isDefault", "lastConnectedAt", "createdAt", "updatedAt"
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
          COALESCE("isDefault", 0), 
          "lastConnectedAt", 
          COALESCE("createdAt", CURRENT_TIMESTAMP), 
          COALESCE("updatedAt", CURRENT_TIMESTAMP)
        FROM "WhatsappInstance";
      `);

      // 6. Substitui a tabela antiga pela nova (eliminando para sempre o índice UNIQUE embutido)
      await prisma.$executeRawUnsafe('DROP TABLE "WhatsappInstance";');
      await prisma.$executeRawUnsafe('ALTER TABLE "new_WhatsappInstance" RENAME TO "WhatsappInstance";');

      // 7. Remove qualquer índice único residual de tenantId
      try {
        await prisma.$executeRawUnsafe('DROP INDEX IF EXISTS "WhatsappInstance_tenantId_key";');
      } catch {}

      // 8. Recria os índices corretos (instancename único e tenantId indexado)
      await prisma.$executeRawUnsafe(
        'CREATE UNIQUE INDEX IF NOT EXISTS "WhatsappInstance_instanceName_key" ON "WhatsappInstance"("instanceName");'
      );
      await prisma.$executeRawUnsafe(
        'CREATE INDEX IF NOT EXISTS "WhatsappInstance_tenantId_idx" ON "WhatsappInstance"("tenantId");'
      );

      console.log('[MIGRATION] Tabela WhatsappInstance reconstruída com sucesso sem constraint UNIQUE em tenantId.');
    } else {
      console.log('[MIGRATION] Tabela WhatsappInstance ainda não existe. Prisma db push criará a tabela.');
    }

    // 9. Reativa foreign keys
    await prisma.$executeRawUnsafe('PRAGMA foreign_keys = ON;');
  } catch (err) {
    console.error('[MIGRATION] Erro controlado durante reconstrução de tabela:', err.message);
  } finally {
    await prisma.$disconnect();
  }
}

if (require.main === module) {
  migrateWhatsappMultiTenant()
    .then(() => process.exit(0))
    .catch((err) => {
      console.error('[MIGRATION] Falha fatal controlada:', err.message);
      process.exit(0); // Garante que nunca trave o startup do container
    });
}

module.exports = { migrateWhatsappMultiTenant };
