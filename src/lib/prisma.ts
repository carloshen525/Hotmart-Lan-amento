import { PrismaClient } from '@prisma/client';
import { ensureDatabaseSchema } from './db-init';

const globalForPrisma = global as unknown as {
  prisma?: PrismaClient;
  dbEnsuredPromise?: Promise<void>;
};

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

function ensureSchema(client: PrismaClient): Promise<void> {
  if (!globalForPrisma.dbEnsuredPromise) {
    globalForPrisma.dbEnsuredPromise = ensureDatabaseSchema(client).catch((e) => {
      console.warn('[Prisma Init] Aviso ao garantir schema inicial:', e.message);
    });
  }
  return globalForPrisma.dbEnsuredPromise;
}

export const prisma = new Proxy({} as PrismaClient, {
  get(target, prop, receiver) {
    let client = getClient();

    // Se a propriedade acessada não existir no client Prisma atual, recria
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

    // Métodos diretos do Prisma ($queryRaw, $executeRaw, $transaction, etc.)
    if (typeof val === 'function') {
      return async (...args: any[]) => {
        await ensureSchema(client);
        return (val as Function).apply(client, args);
      };
    }

    // Delegados de modelo (ex: prisma.user, prisma.saasClient, prisma.tenant, etc.)
    if (typeof val === 'object' && val !== null) {
      return new Proxy(val, {
        get(mTarget, mProp, mReceiver) {
          const mVal = Reflect.get(mTarget, mProp, mReceiver);
          if (typeof mVal === 'function') {
            return async (...args: any[]) => {
              await ensureSchema(client);
              return (mVal as Function).apply(mTarget, args);
            };
          }
          return mVal;
        },
      });
    }

    return val;
  },
});
