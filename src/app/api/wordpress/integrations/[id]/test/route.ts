import { NextResponse } from 'next/server';
import { getActiveTenantId } from '@/lib/tenancy';
import { formWebhookProcessor } from '@/services/wordpress';

export async function POST(
  request: Request,
  { params }: { params: { id: string } }
) {
  try {
    const tenantId = await getActiveTenantId();
    if (!tenantId) {
      return NextResponse.json({ error: 'Tenant não encontrado ou não autenticado' }, { status: 401 });
    }

    const body = await request.json();
    const forceRealTest = Boolean(body.forceRealTest);
    const simulated = !forceRealTest;

    const payload = body.payload || {
      nome: body.name || 'Lead Teste Elementor',
      email: body.email || 'lead.teste@elementor.com',
      telefone: body.phone || '+5511999998888',
      utm_source: body.utmSource || 'instagram_ads',
      utm_medium: body.utmMedium || 'stories',
      utm_campaign: body.utmCampaign || 'workshop_teste',
      page_url: body.pageUrl || 'https://meuexpert.com/inscricao-elementor',
      form_name: 'Formulário de Inscrição VIP',
      form_id: 'elementor_form_test',
    };

    const result = await formWebhookProcessor.process({
      integrationId: params.id,
      payload,
      simulated,
      forceRealTest,
    });

    return NextResponse.json({ success: true, result });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
