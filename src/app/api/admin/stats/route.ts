import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { requireSuperAdmin } from '@/lib/auth';
import { healDatabaseSchemaIfNeeded } from '@/lib/db-healing';

export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    await requireSuperAdmin();
    await healDatabaseSchemaIfNeeded();

    const now = new Date();
    const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
    const sevenDaysFromNow = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000);

    const [
      allClients,
      totalUsers,
      totalTenants,
      totalInstances,
      connectedInstances,
      totalMessageLogs,
      sentQueueLogs,
      totalAutomations,
      openTicketsCount,
    ] = await Promise.all([
      prisma.saasClient.findMany({
        orderBy: { expiresAt: 'asc' },
        include: {
          _count: {
            select: {
              users: true,
              tenants: true,
            },
          },
        },
      }),
      prisma.user.count(),
      prisma.tenant.count(),
      prisma.whatsappInstance.count(),
      prisma.whatsappInstance.count({ where: { status: 'CONNECTED' } }),
      prisma.messageLog.count(),
      prisma.whatsappQueue.count({ where: { status: 'SENT' } }),
      prisma.automation.count(),
      prisma.supportTicket.count({ where: { status: { in: ['OPEN', 'IN_PROGRESS'] } } }),
    ]);

    // Métricas de Clientes
    const totalClients = allClients.length;
    const activeClientsList = allClients.filter(
      (c) => c.status === 'ACTIVE' && new Date(c.expiresAt).getTime() > now.getTime()
    );
    const activeClients = activeClientsList.length;
    const blockedClients = allClients.filter((c) => c.status === 'BLOCKED').length;
    const expiredClients = allClients.filter(
      (c) => c.status !== 'BLOCKED' && new Date(c.expiresAt).getTime() <= now.getTime()
    ).length;
    const newClientsPeriod = allClients.filter(
      (c) => new Date(c.createdAt).getTime() >= thirtyDaysAgo.getTime()
    ).length;

    const expiringSoonList = allClients.filter((c) => {
      const exp = new Date(c.expiresAt).getTime();
      return c.status === 'ACTIVE' && exp > now.getTime() && exp <= sevenDaysFromNow.getTime();
    });

    // Métricas Financeiras
    const mrr = activeClientsList.reduce((acc, c) => acc + (c.monthlyPrice || 0), 0);
    const arr = mrr * 12;
    const averageTicket = activeClients > 0 ? mrr / activeClients : 0;

    // Próximos vencimentos ordenados
    const upcomingExpirations = allClients
      .filter((c) => c.status === 'ACTIVE')
      .slice(0, 8)
      .map((c) => {
        const daysLeft = Math.max(
          0,
          Math.ceil((new Date(c.expiresAt).getTime() - now.getTime()) / (1000 * 60 * 60 * 24))
        );
        return {
          id: c.id,
          name: c.name,
          company: c.company || c.name,
          email: c.email,
          plan: c.plan,
          monthlyPrice: c.monthlyPrice,
          expiresAt: c.expiresAt,
          daysLeft,
        };
      });

    return NextResponse.json({
      clients: {
        total: totalClients,
        active: activeClients,
        blocked: blockedClients,
        expired: expiredClients,
        newInPeriod: newClientsPeriod,
        expiringSoon: expiringSoonList.length,
      },
      financial: {
        mrr,
        arr,
        averageTicket,
        defaultingCount: expiredClients,
        upcomingExpirations,
      },
      usage: {
        totalUsers,
        totalTenants,
        totalInstances,
        connectedInstances,
        totalMessages: totalMessageLogs + sentQueueLogs,
        totalAutomations,
        openTicketsCount,
      },
    });
  } catch (err: any) {
    const status = err.message?.includes('Acesso negado') ? 403 : err.message?.includes('Não autenticado') ? 401 : 500;
    return NextResponse.json({ error: err.message }, { status });
  }
}
