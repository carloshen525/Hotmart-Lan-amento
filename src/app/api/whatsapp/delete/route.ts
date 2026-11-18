import { NextResponse } from 'next/server';
import { getActiveTenantId, ensureTenantAccess } from '@/lib/tenancy';
import { getCurrentSession } from '@/lib/auth';
import { messageManager } from '@/services/messaging';

/**
 * POST /api/whatsapp/delete
 * Remove uma instância permanentemente da Evolution API e do banco com isolamento estrito por tenant.
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
    if (!body.instanceId) {
      return NextResponse.json({ error: 'instanceId é obrigatório' }, { status: 400 });
    }

    const success = await messageManager.evolutionApi.deleteInstance(body.instanceId, tenantId);
    return NextResponse.json({ success });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
