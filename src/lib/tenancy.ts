import { cookies } from 'next/headers';
import { prisma } from './prisma';
import { getCurrentSession } from './auth';

const TENANT_COOKIE_NAME = 'launch_active_tenant_id';

export async function getActiveTenantId(): Promise<string> {
  const session = await getCurrentSession();

  // 1. Se houver tenantId gravado na sessão JWT
  if (session?.tenantId) {
    if (session.globalRole === 'SUPER_ADMIN' || session.globalRole === 'ADMIN') {
      const exists = await prisma.tenant.findUnique({ where: { id: session.tenantId } });
      if (exists) return exists.id;
    } else if (session.userId) {
      const member = await prisma.tenantMembership.findUnique({
        where: { tenantId_userId: { tenantId: session.tenantId, userId: session.userId } },
      });
      if (member) return member.tenantId;
    }
  }

  // 2. Se houver cookie de tenant selecionado na interface
  const cookieStore = cookies();
  const activeCookie = cookieStore.get(TENANT_COOKIE_NAME)?.value;
  if (activeCookie) {
    if (!session || session.globalRole === 'SUPER_ADMIN' || session.globalRole === 'ADMIN') {
      const exists = await prisma.tenant.findUnique({ where: { id: activeCookie } });
      if (exists) return exists.id;
    } else if (session.userId) {
      const member = await prisma.tenantMembership.findUnique({
        where: { tenantId_userId: { tenantId: activeCookie, userId: session.userId } },
      });
      if (member) return member.tenantId;
    }
  }

  // 3. Se for usuário autenticado (não Super Admin), busca o primeiro tenant do qual ele é membro
  if (session?.userId && session.globalRole !== 'SUPER_ADMIN' && session.globalRole !== 'ADMIN') {
    const userMembership = await prisma.tenantMembership.findFirst({
      where: { userId: session.userId },
      orderBy: { createdAt: 'asc' },
    });
    if (userMembership) {
      return userMembership.tenantId;
    }
    // Usuário sem nenhum tenant: NUNCA vazar dados de outro cliente!
    return '';
  }

  // 4. Fallback para o primeiro tenant cadastrado se existir (somente Super Admin ou inicialização sem sessão)
  let firstTenant = await prisma.tenant.findFirst({
    orderBy: { createdAt: 'asc' },
  });

  if (!firstTenant) {
    try {
      firstTenant = await prisma.tenant.create({
        data: {
          name: 'Meu Expert Principal',
          slug: 'expert-principal',
          status: 'ACTIVE',
        },
      });
    } catch {}
  }

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
  if (userGlobalRole === 'SUPER_ADMIN' || userGlobalRole === 'ADMIN') return true;

  const membership = await prisma.tenantMembership.findUnique({
    where: {
      tenantId_userId: {
        tenantId,
        userId,
      },
    },
    include: {
      tenant: {
        include: { client: true },
      },
    },
  });

  if (!membership) {
    throw new Error('Acesso negado: você não tem permissão para acessar este expert');
  }

  // Verifica se o cliente do tenant está ativo e dentro da validade
  const client = membership.tenant.client;
  if (client) {
    if (client.status === 'BLOCKED') {
      throw new Error('Acesso suspenso: Sua conta de cliente foi bloqueada pelo administrador.');
    }
    if (client.expiresAt && client.expiresAt.getTime() < Date.now()) {
      throw new Error('Acesso expirado: O período de validade do seu plano expirou. Contate o suporte para renovar.');
    }
  }

  return true;
}

/**
 * Valida se o cliente ainda pode criar novos experts de acordo com o plano
 */
export async function checkCanCreateExpert(clientId?: string | null): Promise<void> {
  if (!clientId) return;
  const client = await prisma.saasClient.findUnique({
    where: { id: clientId },
    include: { _count: { select: { tenants: true } } },
  });
  if (!client) return;

  if (client.status === 'BLOCKED') {
    throw new Error('Sua conta está bloqueada pelo administrador.');
  }
  if (client.expiresAt && client.expiresAt.getTime() < Date.now()) {
    throw new Error('Seu plano está expirado. Renove para criar novos experts.');
  }

  const currentCount = client._count.tenants;
  if (currentCount >= client.maxExperts) {
    throw new Error('Você atingiu o limite de experts do seu plano.');
  }
}

/**
 * Valida se o cliente ainda pode conectar novas instâncias de WhatsApp de acordo com o plano
 */
export async function checkCanCreateWhatsappInstance(tenantId: string): Promise<void> {
  const tenant = await prisma.tenant.findUnique({
    where: { id: tenantId },
    include: { client: true },
  });
  if (!tenant || !tenant.clientId || !tenant.client) return;

  const client = tenant.client;
  if (client.status === 'BLOCKED') {
    throw new Error('Sua conta está bloqueada pelo administrador.');
  }
  if (client.expiresAt && client.expiresAt.getTime() < Date.now()) {
    throw new Error('Seu plano está expirado. Renove para conectar novas instâncias.');
  }

  // Conta total de instâncias cadastradas em todos os experts deste cliente
  const currentCount = await prisma.whatsappInstance.count({
    where: { tenant: { clientId: client.id } },
  });

  if (currentCount >= client.maxWhatsappInstances) {
    throw new Error('Você atingiu o limite de instâncias WhatsApp do seu plano.');
  }
}
