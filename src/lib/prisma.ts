import { PrismaClient } from '@prisma/client';

const globalForPrisma = global as unknown as { prisma?: PrismaClient };

function createPrismaClient(): PrismaClient {
  return new PrismaClient({
    log: process.env.NODE_ENV === 'development' ? ['warn', 'error'] : ['error'],
  });
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
