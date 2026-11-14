import { NextResponse } from 'next/server';
import { EmailQueueService } from '@/services/email/queue.service';
import { getActiveTenantId } from '@/lib/tenancy';

export async function POST(request: Request) {
  try {
    const body = await request.json().catch(() => ({}));
    const { batchSize = 20, delayMs = 500, tenantId: bodyTenantId } = body;

    // Se vier tenantId no body ou na sessão, respeita; caso contrário processa lote global
    const activeTenant = await getActiveTenantId().catch(() => null);
    const tenantId = bodyTenantId || activeTenant || undefined;

    const result = await EmailQueueService.processBatch({
      batchSize: Number(batchSize) || 20,
      delayMs: Number(delayMs) || 500,
      tenantId,
    });

    return NextResponse.json({ success: true, ...result });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const tenantId = searchParams.get('tenantId') || undefined;

    const stats = await EmailQueueService.getQueueStats(tenantId);
    return NextResponse.json({ success: true, stats });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
