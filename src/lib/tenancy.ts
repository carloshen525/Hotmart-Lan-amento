import { cookies } from 'next/headers';
import { prisma } from './prisma';
import { getCurrentSession } from './auth';

const TENANT_COOKIE_NAME = 'launch_active_tenant_id';

export async function getActiveTenantId(): Promise<string> {
  const session = await getCurrentSession();
  if (session?.tenantId) {
    return session.tenantId;
  }

  const cookieStore = cookies();
  const activeCookie = cookieStore.get(TENANT_COOKIE_NAME)?.value;
  if (activeCookie) {
    const exists = await prisma.tenant.findUnique({ where: { id: activeCookie } });
    if (exists) return exists.id;
  }

  // Fallback para o primeiro tenant cadastrado se existir
  const firstTenant = await prisma.tenant.findFirst({
    orderBy: { createdAt: 'desc' },
  });

  if (firstTenant) {
    return firstTenant.id;
  }

  return '';
}

export async function getActiveTenant() {
  const tenantId = await getActiveTenantId();
  if (!tenantId) return null;

  return prisma.tenant.findUnique({
    where: { id: tenantId },
  });
}

export async function ensureTenantAccess(tenantId: string, userId: string, userGlobalRole: string) {
  if (userGlobalRole === 'ADMIN') return true;

  const membership = await prisma.tenantMembership.findUnique({
    where: {
      tenantId_userId: {
        tenantId,
        userId,
      },
    },
  });

  if (!membership) {
    throw new Error('Acesso negado: você não tem permissão para acessar este expert');
  }

  return true;
}
