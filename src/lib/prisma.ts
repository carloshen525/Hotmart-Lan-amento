import { PrismaClient } from '@prisma/client';
import { ensureDatabaseSchema } from './db-init';

const globalForPrisma = global as unknown as { prisma?: PrismaClient; dbEnsured?: boolean };

function createPrismaClient(): PrismaClient {
  const client = new PrismaClient({
    log: process.env.NODE_ENV === 'development' ? ['warn', 'error'] : ['error'],
  });

  if (!globalForPrisma.dbEnsured) {
    globalForPrisma.dbEnsured = true;
    ensureDatabaseSchema(client).catch((e) => {
      console.warn('[Prisma Init] Aviso ao garantir schema inicial:', e.message);
    });
  }

  return client;
}

function getClient(): PrismaClient {
  if (!globalForPrisma.prisma) {
    globalForPrisma.prisma = createPrismaClient();
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
