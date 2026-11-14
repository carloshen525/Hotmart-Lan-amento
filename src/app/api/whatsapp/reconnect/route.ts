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
    const body = await request.json().catch(() => ({}));
    const targetId = body.instanceId || tenantId;

    const result = await messageManager.evolutionApi.reconnect(targetId);
    return NextResponse.json(result);
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
