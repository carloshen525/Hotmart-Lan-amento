import { NextResponse } from 'next/server';
import { getActiveTenantId } from '@/lib/tenancy';
import { formService } from '@/services/wordpress';

export async function GET(
  request: Request,
  { params }: { params: { id: string } }
) {
  try {
    const tenantId = await getActiveTenantId();
    if (!tenantId) {
      return NextResponse.json({ error: 'Tenant não encontrado ou não autenticado' }, { status: 401 });
    }

    const integration = await formService.getIntegration(params.id, tenantId);
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
      return NextResponse.json({ error: 'Tenant não encontrado ou não autenticado' }, { status: 401 });
    }

    const body = await request.json();
    const updated = await formService.updateIntegration(params.id, tenantId, {
      name: body.name?.trim(),
      platform: body.platform,
      status: body.status,
      secretKey: body.secretKey,
      allowReentry: body.allowReentry,
      targetAutomationId: body.targetAutomationId,
      fieldMapping: body.fieldMapping,
      samplePayload: body.samplePayload,
      tagIds: body.tagIds,
    });

    return NextResponse.json({ success: true, integration: updated });
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
      return NextResponse.json({ error: 'Tenant não encontrado ou não autenticado' }, { status: 401 });
    }

    await formService.deleteIntegration(params.id, tenantId);
    return NextResponse.json({ success: true, message: 'Integração excluída com sucesso' });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
