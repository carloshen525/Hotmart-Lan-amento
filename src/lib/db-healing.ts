import { prisma } from './prisma';

let healed = false;

export async function healDatabaseSchemaIfNeeded(): Promise<void> {
  if (healed) return;
  try {
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

    const tenantColumns: any = await prisma.$queryRawUnsafe('PRAGMA table_info("Tenant");').catch(() => []);
    if (Array.isArray(tenantColumns)) {
      const tnames = tenantColumns.map((c: any) => c.name);
      if (!tnames.includes('clientId')) {
        await prisma.$executeRawUnsafe('ALTER TABLE "Tenant" ADD COLUMN "clientId" TEXT;').catch(() => {});
      }
    }

    const instanceColumns: any = await prisma.$queryRawUnsafe('PRAGMA table_info("WhatsappInstance");').catch(() => []);
    if (Array.isArray(instanceColumns)) {
      const inames = instanceColumns.map((c: any) => c.name);
      if (!inames.includes('userId')) {
        await prisma.$executeRawUnsafe('ALTER TABLE "WhatsappInstance" ADD COLUMN "userId" TEXT;').catch(() => {});
      }
    }

    healed = true;
  } catch (err) {
    // Non-blocking
  }
}
