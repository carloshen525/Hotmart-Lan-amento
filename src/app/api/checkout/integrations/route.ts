import { NextResponse } from 'next/server';
import { getActiveTenantId } from '@/lib/tenancy';
import { checkoutService } from '@/services/checkout';

export async function GET() {
  try {
    const tenantId = await getActiveTenantId();
    if (!tenantId) {
      return NextResponse.json({ error: 'Tenant não autenticado' }, { status: 401 });
    }

    const [integrations, stats] = await Promise.all([
      checkoutService.listIntegrations(tenantId),
      checkoutService.getStats(tenantId),
    ]);

    return NextResponse.json({
      integrations,
      stats,
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

    const body = await request.json();
    const { platform, name, secretKey, allowedEvents, productName, productId, tagIds, customId } = body;

    if (!platform || !name?.trim()) {
      return NextResponse.json(
        { error: 'Plataforma e nome da integração são obrigatórios.' },
        { status: 400 }
      );
    }

    const host = request.headers.get('host') || '';
    const proto = request.headers.get('x-forwarded-proto') || 'http';
    const origin = request.headers.get('origin') || (host ? `${proto}://${host}` : '');

    const integration = await checkoutService.createIntegration({
      tenantId,
      platform,
      name,
      secretKey,
      allowedEvents,
      productName,
      productId,
      tagIds,
      baseUrl: origin,
      customId,
    });

    return NextResponse.json({
      success: true,
      integration,
    });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
