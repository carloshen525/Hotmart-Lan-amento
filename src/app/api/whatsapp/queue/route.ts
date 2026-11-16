import { NextResponse } from 'next/server';
import { getActiveTenantId } from '@/lib/tenancy';
import { WhatsappQueueService } from '@/services/whatsapp/queue.service';
import { prisma } from '@/lib/prisma';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

export async function GET(request: Request) {
  try {
    let tenantId: string | null = (await getActiveTenantId()) || null;
    if (!tenantId) {
      const defaultTenant = await prisma.tenant.findFirst({ orderBy: { createdAt: 'asc' } });
      tenantId = defaultTenant?.id || null;
    }
    if (!tenantId) {
      return NextResponse.json({ error: 'Tenant não autenticado' }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const instanceId = searchParams.get('instanceId') || undefined;

    const stats = await WhatsappQueueService.getQueueStats(tenantId, instanceId);

    const response = NextResponse.json({
      success: true,
      stats,
    });
    response.headers.set('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
    return response;
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    let tenantId: string | null = (await getActiveTenantId()) || null;
    if (!tenantId) {
      const defaultTenant = await prisma.tenant.findFirst({ orderBy: { createdAt: 'asc' } });
      tenantId = defaultTenant?.id || null;
    }
    if (!tenantId) {
      return NextResponse.json({ error: 'Tenant não autenticado' }, { status: 401 });
    }

    const body = await request.json().catch(() => ({}));
    const { batchSize = 10 } = body;

    const result = await WhatsappQueueService.processBatch({
      batchSize: Number(batchSize) || 10,
      tenantId,
    });

    const stats = await WhatsappQueueService.getQueueStats(tenantId);

    return NextResponse.json({
      success: true,
      ...result,
      stats,
    });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
