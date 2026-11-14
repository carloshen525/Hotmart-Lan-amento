import { NextResponse } from 'next/server';
import { getActiveTenantId } from '@/lib/tenancy';
import { checkoutService } from '@/services/checkout';

export async function GET(
  request: Request,
  { params }: { params: { id: string } }
) {
  try {
    const tenantId = await getActiveTenantId();
    if (!tenantId) {
      return NextResponse.json({ error: 'Tenant não autenticado' }, { status: 401 });
    }

    const integration = await checkoutService.getIntegration(params.id, tenantId);
    if (!integration) {
      return NextResponse.json({ error: 'Integração não encontrada' }, { status: 404 });
    }

    return NextResponse.json({ integration });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

export async function PUT(
  request: Request,
  { params }: { params: { id: string } }
) {
  try {
    const tenantId = await getActiveTenantId();
    if (!tenantId) {
      return NextResponse.json({ error: 'Tenant não autenticado' }, { status: 401 });
    }

    const body = await request.json();
    await checkoutService.updateIntegration(params.id, tenantId, body);

    return NextResponse.json({ success: true });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

export async function DELETE(
  request: Request,
  { params }: { params: { id: string } }
) {
  try {
    const tenantId = await getActiveTenantId();
    if (!tenantId) {
      return NextResponse.json({ error: 'Tenant não autenticado' }, { status: 401 });
    }

    await checkoutService.deleteIntegration(params.id, tenantId);

    return NextResponse.json({ success: true });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
