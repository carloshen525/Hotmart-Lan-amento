import { NextResponse } from 'next/server';
import { getCurrentSession } from '@/lib/auth';
import { getActiveTenantId, ensureTenantAccess } from '@/lib/tenancy';
import { WhatsAppProviderFactory } from '@/services/whatsapp/providers';

export const dynamic = 'force-dynamic';

export async function GET(request: Request) {
  try {
    const session = await getCurrentSession();
    if (!session) {
      return NextResponse.json({ error: 'Não autenticado' }, { status: 401 });
    }

    const tenantId = await getActiveTenantId();
    if (!tenantId) {
      return NextResponse.json({ error: 'Nenhum tenant ativo' }, { status: 400 });
    }

    await ensureTenantAccess(tenantId, session.userId, session.globalRole);

    const { searchParams } = new URL(request.url);
    const instanceId = searchParams.get('instanceId');

    const provider = await WhatsAppProviderFactory.getProvider(instanceId, tenantId);

    if (!provider || provider.providerType !== 'META_CLOUD') {
      return NextResponse.json(
        { error: 'Canal Meta Cloud API não encontrado ou não configurado' },
        { status: 404 }
      );
    }

    const templates = provider.getTemplates ? await provider.getTemplates() : [];

    return NextResponse.json({
      success: true,
      templates,
    });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
