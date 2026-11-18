import { NextResponse } from 'next/server';
import { getActiveTenantId, ensureTenantAccess } from '@/lib/tenancy';
import { getCurrentSession } from '@/lib/auth';
import { messageManager } from '@/services/messaging';

/**
 * POST /api/whatsapp/disconnect
 * Desconecta uma instância específica ({ instanceId }) ou padrão com validação estrita de tenant
 */
export async function POST(request: Request) {
  try {
    const session = await getCurrentSession();
    if (!session) {
      return NextResponse.json({ error: 'Não autenticado' }, { status: 401 });
    }

    const tenantId = await getActiveTenantId();
    if (!tenantId) {
      return NextResponse.json({ error: 'Tenant não autenticado' }, { status: 401 });
    }

    await ensureTenantAccess(tenantId, session.userId, session.globalRole);

    const body = await request.json().catch(() => ({}));
    const targetId = body.instanceId || tenantId;

    await messageManager.evolutionApi.disconnect(targetId, tenantId);
    return NextResponse.json({ success: true, status: 'DISCONNECTED' });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
