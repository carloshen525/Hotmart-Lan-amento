import { NextResponse } from 'next/server';
import { getActiveTenantId } from '@/lib/tenancy';
import { formService } from '@/services/wordpress';

export async function GET() {
  try {
    const tenantId = await getActiveTenantId();
    if (!tenantId) {
      return NextResponse.json({ error: 'Tenant não encontrado ou não autenticado' }, { status: 401 });
    }

    const integrations = await formService.listIntegrations(tenantId);
    return NextResponse.json({ integrations });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const tenantId = await getActiveTenantId();
    if (!tenantId) {
      return NextResponse.json({ error: 'Tenant não encontrado ou não autenticado' }, { status: 401 });
    }

    const body = await request.json();
    if (!body.name || !body.name.trim()) {
      return NextResponse.json({ error: 'O nome da integração é obrigatório' }, { status: 400 });
    }

    const integration = await formService.createIntegration({
      tenantId,
      name: body.name.trim(),
      platform: body.platform || 'ELEMENTOR',
      status: body.status || 'ACTIVE',
      secretKey: body.secretKey,
      allowReentry: body.allowReentry || 'ALWAYS',
      targetAutomationId: body.targetAutomationId || null,
      fieldMapping: body.fieldMapping || undefined,
      tagIds: body.tagIds || [],
      customId: body.customId,
    });

    return NextResponse.json({ success: true, integration }, { status: 201 });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
