import { NextResponse } from 'next/server';
import { getActiveTenantId, ensureTenantAccess } from '@/lib/tenancy';
import { getCurrentSession } from '@/lib/auth';
import { messageManager } from '@/services/messaging';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

/**
 * GET /api/whatsapp
 * Retorna o status de todas as instâncias do WhatsApp pertencentes ao Tenant autenticado.
 * A Evolution API NÃO é autoridade de visibilidade: apenas as instâncias vinculadas a este tenant
 * no banco de dados são consultadas e retornadas.
 */
export async function GET(request: Request) {
  try {
    const session = await getCurrentSession();
    if (!session) {
      return NextResponse.json({ error: 'Não autenticado' }, { status: 401 });
    }

    const tenantId = await getActiveTenantId();
    if (!tenantId) {
      return NextResponse.json({
        hasInstance: false,
        connected: false,
        status: 'DISCONNECTED',
        instances: [],
      });
    }

    await ensureTenantAccess(tenantId, session.userId, session.globalRole);

    const { searchParams } = new URL(request.url);
    const instanceId = searchParams.get('instanceId') || undefined;

    const status = await messageManager.evolutionApi.getStatus(tenantId, instanceId);
    const response = NextResponse.json(status);
    response.headers.set('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
    response.headers.set('Pragma', 'no-cache');
    response.headers.set('Expires', '0');
    return response;
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
