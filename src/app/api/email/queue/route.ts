import { NextResponse } from 'next/server';
import { getActiveTenantId } from '@/lib/tenancy';
import { EmailQueueService } from '@/services/email/queue.service';

export async function GET(request: Request) {
  try {
    const tenantId = await getActiveTenantId();
    if (!tenantId) {
      return NextResponse.json({ error: 'Tenant não autenticado' }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const limit = Number(searchParams.get('limit')) || 50;

    const [stats, items] = await Promise.all([
      EmailQueueService.getQueueStats(tenantId),
      EmailQueueService.listQueue(tenantId, limit),
    ]);

    return NextResponse.json({
      success: true,
      stats,
      queue: items,
    });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const tenantId = await getActiveTenantId();
    if (!tenantId) {
      return NextResponse.json({ error: 'Tenant não autenticado' }, { status: 401 });
    }

    const body = await request.json().catch(() => ({}));
    const { batchSize = 20, delayMs = 300 } = body;

    const result = await EmailQueueService.processBatch({
      batchSize: Number(batchSize) || 20,
      delayMs: Number(delayMs) || 300,
      tenantId,
    });

    return NextResponse.json({ success: true, ...result });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
