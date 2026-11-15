import { NextResponse } from 'next/server';
import { getActiveTenantId } from '@/lib/tenancy';
import { messageManager } from '@/services/messaging';

/**
 * POST /api/whatsapp/connect
 * Conecta ou cria uma instância de WhatsApp (com suporte a múltiplos números e apelido)
 */
export async function POST(request: Request) {
  try {
    const tenantId = await getActiveTenantId();
    if (!tenantId) {
      return NextResponse.json({ error: 'Tenant não autenticado' }, { status: 401 });
    }
    const body = await request.json().catch(() => ({}));

    const result = await messageManager.evolutionApi.getOrCreateConnection({
      tenantId,
      instanceId: body.instanceId,
      name: body.name,
      forceNew: !!body.forceNew,
      isNew: !!body.isNew,
    });

    return NextResponse.json(result);
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
