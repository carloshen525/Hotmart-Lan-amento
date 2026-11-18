import { prisma } from './prisma';

export interface LogSaasAuditParams {
  clientId?: string | null;
  userId?: string | null;
  userEmail?: string | null;
  userName?: string | null;
  action: string;
  entityType: 'CLIENT' | 'USER' | 'INSTANCE' | 'SUBSCRIPTION' | 'TICKET' | 'LIMITS' | 'ACCESS';
  entityId?: string | null;
  description: string;
  beforeData?: any;
  afterData?: any;
  ipAddress?: string | null;
}

export async function logSaasAudit(params: LogSaasAuditParams) {
  try {
    return await prisma.saasAuditLog.create({
      data: {
        clientId: params.clientId || undefined,
        userId: params.userId || undefined,
        userEmail: params.userEmail || undefined,
        userName: params.userName || undefined,
        action: params.action,
        entityType: params.entityType,
        entityId: params.entityId || undefined,
        description: params.description,
        beforeData: params.beforeData ? JSON.stringify(params.beforeData) : undefined,
        afterData: params.afterData ? JSON.stringify(params.afterData) : undefined,
        ipAddress: params.ipAddress || undefined,
      },
    });
  } catch (err) {
    console.error('[logSaasAudit] Erro ao gravar log de auditoria SaaS:', err);
    return null;
  }
}
