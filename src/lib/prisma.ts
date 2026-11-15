import { PrismaClient } from '@prisma/client';

const globalForPrisma = global as unknown as { prisma?: PrismaClient };

function createPrismaClient(): PrismaClient {
  return new PrismaClient({
    log: process.env.NODE_ENV === 'development' ? ['warn', 'error'] : ['error'],
  });
}

let dbMigrationDone = false;
async function ensureDbColumns(client: PrismaClient) {
  if (dbMigrationDone) return;
  dbMigrationDone = true;
  try {
    await client.$executeRawUnsafe(`ALTER TABLE "WhatsappInstance" ADD COLUMN "name" TEXT;`).catch(() => {});
    await client.$executeRawUnsafe(`ALTER TABLE "WhatsappInstance" ADD COLUMN "isDefault" BOOLEAN DEFAULT 0;`).catch(() => {});
    await client.$executeRawUnsafe(`DROP INDEX IF EXISTS "WhatsappInstance_tenantId_key";`).catch(() => {});
    await client.$executeRawUnsafe(`CREATE INDEX IF NOT EXISTS "WhatsappInstance_tenantId_idx" ON "WhatsappInstance"("tenantId");`).catch(() => {});
  } catch {}
}

function getClient(): PrismaClient {
  if (!globalForPrisma.prisma) {
    globalForPrisma.prisma = createPrismaClient();
    ensureDbColumns(globalForPrisma.prisma);
  }
  return globalForPrisma.prisma;
}

export const prisma = new Proxy({} as PrismaClient, {
  get(target, prop, receiver) {
    let client = getClient();
    
    // Se a propriedade acessada (como checkoutIntegration, emailSettings, etc) não existir ou for undefined, recria o client
    if (
      typeof prop === 'string' &&
      prop !== 'then' &&
      prop !== 'catch' &&
      (!Reflect.has(client, prop) || Reflect.get(client, prop) === undefined)
    ) {
      globalForPrisma.prisma = createPrismaClient();
      client = globalForPrisma.prisma;
    }

    const val = Reflect.get(client, prop, receiver);
    if (typeof val === 'function') {
      return val.bind(client);
    }
    return val;
  },
});
