import { NextResponse } from 'next/server';
import { getActiveTenantId } from '@/lib/tenancy';
import { messageManager } from '@/services/messaging';

/**
 * POST /api/whatsapp/update
 * Atualiza o nome/apelido ou define como número padrão com isolamento por tenant
 */
export async function POST(request: Request) {
  try {
    const tenantId = await getActiveTenantId();
    if (!tenantId) {
      return NextResponse.json({ error: 'Tenant não autenticado' }, { status: 401 });
    }
    const body = await request.json().catch(() => ({}));
    if (!body.instanceId) {
      return NextResponse.json({ error: 'instanceId é obrigatório' }, { status: 400 });
    }

    const updated = await messageManager.evolutionApi.updateInstance(body.instanceId, tenantId, {
      name: body.name,
      isDefault: body.isDefault,
    });

    return NextResponse.json({ success: true, instance: updated });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
