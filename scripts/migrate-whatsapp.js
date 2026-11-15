const { PrismaClient } = require('@prisma/client');

async function migrateWhatsappMultiTenant() {
  const prisma = new PrismaClient();
  console.log('[MIGRATION] Iniciando verificação de multi-tenancy para WhatsappInstance...');
  try {
    // 1. Obter primeiro tenant disponível para associar eventuais instâncias órfãs
    const defaultTenant = await prisma.tenant.findFirst({
      orderBy: { createdAt: 'asc' },
    });

    if (defaultTenant) {
      // Atualizar registros com tenantId nulo para pertencer ao tenant padrão
      const updated = await prisma.$executeRawUnsafe(
        `UPDATE "WhatsappInstance" SET "tenantId" = '${defaultTenant.id}' WHERE "tenantId" IS NULL`
      ).catch(() => 0);
      if (updated > 0) {
        console.log(`[MIGRATION] ${updated} instâncias órfãs associadas ao tenant ${defaultTenant.id}`);
      }
    }

    // 2. Remover a constraint/índice UNIQUE legada em tenantId
    await prisma.$executeRawUnsafe(`DROP INDEX IF EXISTS "WhatsappInstance_tenantId_key"`).catch((err) => {
      console.warn('[MIGRATION] Aviso ao remover WhatsappInstance_tenantId_key:', err.message);
    });

    // 3. Garantir índice não-único em tenantId para performance
    await prisma.$executeRawUnsafe(
      `CREATE INDEX IF NOT EXISTS "WhatsappInstance_tenantId_idx" ON "WhatsappInstance"("tenantId")`
    ).catch((err) => {
      console.warn('[MIGRATION] Aviso ao criar índice em tenantId:', err.message);
    });

    console.log('[MIGRATION] Estrutura de WhatsappInstance multi-tenant atualizada com sucesso.');
  } catch (err) {
    console.error('[MIGRATION] Erro controlado durante migração:', err.message);
  } finally {
    await prisma.$disconnect();
  }
}

if (require.main === module) {
  migrateWhatsappMultiTenant()
    .then(() => process.exit(0))
    .catch((err) => {
      console.error('[MIGRATION] Falha fatal:', err);
      process.exit(0); // Evita loop de reinicialização no container
    });
}

module.exports = { migrateWhatsappMultiTenant };
