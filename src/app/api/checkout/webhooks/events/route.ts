import { NextResponse } from 'next/server';
import { getActiveTenantId } from '@/lib/tenancy';
import { checkoutService } from '@/services/checkout';

export async function GET(request: Request) {
  try {
    const tenantId = await getActiveTenantId();
    if (!tenantId) {
      return NextResponse.json({ error: 'Tenant não autenticado' }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const integrationId = searchParams.get('integrationId') || undefined;
    const limit = Number(searchParams.get('limit') || '50');

    const events = await checkoutService.listWebhookEvents(tenantId, limit, integrationId);

    return NextResponse.json({ events });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
