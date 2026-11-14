import { NextResponse } from 'next/server';
import { getActiveTenantId } from '@/lib/tenancy';
import { messageManager } from '@/services/messaging';

/**
 * POST /api/whatsapp/disconnect
 * Desconecta uma instância específica ({ instanceId }) ou padrão
 */
export async function POST(request: Request) {
  try {
    const tenantId = await getActiveTenantId();
    const body = await request.json().catch(() => ({}));
    const targetId = body.instanceId || tenantId;

    await messageManager.evolutionApi.disconnect(targetId);
    return NextResponse.json({ success: true, status: 'DISCONNECTED' });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
