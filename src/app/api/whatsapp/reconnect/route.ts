import { NextResponse } from 'next/server';
import { getActiveTenantId } from '@/lib/tenancy';
import { messageManager } from '@/services/messaging';

/**
 * POST /api/whatsapp/reconnect
 * Reconecta ou reinicia uma instância específica ({ instanceId }) ou padrão
 */
export async function POST(request: Request) {
  try {
    const tenantId = await getActiveTenantId();
    if (!tenantId) {
      return NextResponse.json({ error: 'Tenant não autenticado' }, { status: 401 });
    }
    const body = await request.json().catch(() => ({}));
    const targetId = body.instanceId || tenantId;

    const result = await messageManager.evolutionApi.reconnect(targetId, tenantId);
    return NextResponse.json(result);
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
