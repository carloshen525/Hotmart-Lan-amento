import { NextResponse } from 'next/server';
import { getActiveTenantId, ensureTenantAccess } from '@/lib/tenancy';
import { getCurrentSession } from '@/lib/auth';
import { messageManager } from '@/services/messaging';

/**
 * POST /api/whatsapp/reconnect
 * Reconecta ou reinicia uma instância específica ({ instanceId }) ou padrão com isolamento de tenant
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

    const result = await messageManager.evolutionApi.reconnect(targetId, tenantId);
    return NextResponse.json(result);
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
