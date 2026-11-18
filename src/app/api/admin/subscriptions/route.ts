import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { requireSuperAdmin } from '@/lib/auth';
import { logSaasAudit } from '@/lib/saas-audit';

export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    await requireSuperAdmin();

    const now = new Date();

    const clients = await prisma.saasClient.findMany({
      orderBy: { expiresAt: 'asc' },
      select: {
        id: true,
        name: true,
        company: true,
        email: true,
        phone: true,
        plan: true,
        monthlyPrice: true,
        billingCycle: true,
        startDate: true,
        expiresAt: true,
        status: true,
        createdAt: true,
      },
    });

    const enriched = clients.map((c) => {
      const expDate = new Date(c.expiresAt);
      const isExpired = expDate.getTime() <= now.getTime();
      const effectiveStatus = c.status === 'BLOCKED' ? 'BLOCKED' : isExpired ? 'EXPIRED' : c.status;
      const daysLeft = Math.max(0, Math.ceil((expDate.getTime() - now.getTime()) / (1000 * 60 * 60 * 24)));

      return {
        ...c,
        effectiveStatus,
        daysLeft,
      };
    });

    const activeList = enriched.filter((c) => c.effectiveStatus === 'ACTIVE');
    const totalMrr = activeList.reduce((acc, c) => acc + (c.monthlyPrice || 0), 0);
    const totalArr = totalMrr * 12;

    return NextResponse.json({
      summary: {
        totalMrr,
        totalArr,
        activeSubscribers: activeList.length,
        expiredSubscribers: enriched.filter((c) => c.effectiveStatus === 'EXPIRED').length,
        blockedSubscribers: enriched.filter((c) => c.effectiveStatus === 'BLOCKED').length,
        totalSubscribers: enriched.length,
      },
      subscriptions: enriched,
    });
  } catch (err: any) {
    const status = err.message?.includes('Acesso negado') ? 403 : err.message?.includes('Não autenticado') ? 401 : 500;
    return NextResponse.json({ error: err.message }, { status });
  }
}

export async function PUT(request: Request) {
  try {
    const session = await requireSuperAdmin();
    const body = await request.json();
    const { clientId, plan, monthlyPrice, billingCycle, expiresAt, status } = body;

    if (!clientId) {
      return NextResponse.json({ error: 'ID do cliente é obrigatório' }, { status: 400 });
    }

    const existing = await prisma.saasClient.findUnique({
      where: { id: clientId },
    });

    if (!existing) {
      return NextResponse.json({ error: 'Cliente não encontrado' }, { status: 404 });
    }

    const updateData: any = {};
    if (plan !== undefined) updateData.plan = plan;
    if (monthlyPrice !== undefined) updateData.monthlyPrice = Number(monthlyPrice);
    if (billingCycle !== undefined) updateData.billingCycle = billingCycle;
    if (expiresAt !== undefined) updateData.expiresAt = new Date(expiresAt);
    if (status !== undefined) updateData.status = status;

    const updated = await prisma.saasClient.update({
      where: { id: clientId },
      data: updateData,
    });

    await logSaasAudit({
      clientId: updated.id,
      userId: session.userId,
      userEmail: session.email,
      userName: session.name,
      action: 'SUBSCRIPTION_UPDATED',
      entityType: 'SUBSCRIPTION',
      entityId: updated.id,
      description: `Super Admin ${session.name} atualizou a assinatura de ${updated.name}: Plano ${updated.plan}, R$ ${updated.monthlyPrice}/mês.`,
      beforeData: { plan: existing.plan, monthlyPrice: existing.monthlyPrice, status: existing.status },
      afterData: { plan: updated.plan, monthlyPrice: updated.monthlyPrice, status: updated.status },
    });

    return NextResponse.json({ success: true, client: updated });
  } catch (err: any) {
    const status = err.message?.includes('Acesso negado') ? 403 : err.message?.includes('Não autenticado') ? 401 : 500;
    return NextResponse.json({ error: err.message }, { status });
  }
}
