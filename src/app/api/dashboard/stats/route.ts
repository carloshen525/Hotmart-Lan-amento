import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { getActiveTenantId } from '@/lib/tenancy';

export async function GET() {
  try {
    const tenantId = await getActiveTenantId();

    if (!tenantId) {
      return NextResponse.json({
        stats: {
          totalLeads: 0,
          activeLeads: 0,
          automationsCount: 0,
          activeEnrollments: 0,
          totalRevenue: 0,
          approvedSalesCount: 0,
          pixGeneratedCount: 0,
          whatsappCount: 0,
          emailCount: 0,
          totalMessages: 0,
          totalProviderCost: 0,
          scheduledJobsPending: 0,
        },
        recentEvents: [],
        sourcesGrouped: [],
      });
    }

    const [
      totalLeads,
      activeLeads,
      automationsCount,
      activeEnrollments,
      messagesSent,
      purchasesApproved,
      pixGeneratedCount,
      scheduledJobsPending,
      recentEvents,
      sourcesGrouped,
    ] = await Promise.all([
      prisma.contact.count({ where: { tenantId } }),
      prisma.contact.count({ where: { tenantId, status: 'ACTIVE' } }),
      prisma.automation.count({ where: { tenantId } }),
      prisma.automationEnrollment.count({ where: { automation: { tenantId }, status: 'ACTIVE' } }),
      prisma.messageLog.findMany({ where: { tenantId } }),
      prisma.hotmartWebhookLog.findMany({
        where: {
          tenantId,
          eventType: { in: ['PURCHASE_APPROVED', 'PURCHASE_COMPLETE'] },
        },
      }),
      prisma.hotmartWebhookLog.count({
        where: {
          tenantId,
          eventType: 'PURCHASE_WAITING_PAYMENT',
          paymentType: 'PIX',
        },
      }),
      prisma.scheduledJob.count({ where: { tenantId, status: 'PENDING' } }),
      prisma.hotmartWebhookLog.findMany({
        where: { tenantId },
        orderBy: { receivedAt: 'desc' },
        take: 8,
      }),
      prisma.contact.groupBy({
        by: ['utmSource'],
        where: { tenantId },
        _count: { id: true },
      }),
    ]);

    // Cálculo de receita faturada a partir dos webhooks Hotmart aprovados
    const totalRevenue = purchasesApproved.reduce((acc, curr) => acc + (curr.priceValue || 0), 0);

    // Mensagens por canal
    const whatsappCount = messagesSent.filter((m) => m.channel === 'WHATSAPP').length;
    const emailCount = messagesSent.filter((m) => m.channel === 'EMAIL').length;
    const totalProviderCost = messagesSent.reduce((acc, curr) => acc + (curr.costEstimate || 0), 0);

    return NextResponse.json({
      stats: {
        totalLeads,
        activeLeads,
        automationsCount,
        activeEnrollments,
        totalRevenue,
        approvedSalesCount: purchasesApproved.length,
        pixGeneratedCount,
        whatsappCount,
        emailCount,
        totalMessages: messagesSent.length,
        totalProviderCost,
        scheduledJobsPending,
      },
      recentEvents,
      sourcesGrouped: sourcesGrouped.map((s) => ({
        source: s.utmSource || 'Direto / Desconhecido',
        count: s._count.id,
      })),
    });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
