import { NextResponse } from 'next/server';
import { getActiveTenantId, ensureTenantAccess } from '@/lib/tenancy';
import { getCurrentSession } from '@/lib/auth';
import { messageManager } from '@/services/messaging';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

/**
 * POST /api/whatsapp/sync
 * Sincroniza em tempo real o status das instâncias cadastradas deste Tenant ativo com a Evolution API.
 * A Evolution API NÃO controla visibilidade: somente as instâncias do tenant no SQLite são atualizadas.
 */
export async function POST(request: Request) {
  try {
    const session = await getCurrentSession();
    if (!session) {
      return NextResponse.json({ error: 'Não autenticado' }, { status: 401 });
    }

    const tenantId = await getActiveTenantId();
    if (!tenantId) {
      return NextResponse.json({
        success: true,
        instances: [],
        hasInstance: false,
        connected: false,
        status: 'DISCONNECTED',
      });
    }

    await ensureTenantAccess(tenantId, session.userId, session.globalRole);

    // 1. Sincroniza SOMENTE as instâncias cadastradas deste tenant
    const syncResult = await messageManager.evolutionApi.syncAllFromEvolutionApi(tenantId);

    // 2. Obtém a lista atualizada de instâncias deste tenant
    const status = await messageManager.evolutionApi.getStatus(tenantId);

    const response = NextResponse.json({
      success: true,
      syncResult,
      ...status,
    });
    response.headers.set('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
    response.headers.set('Pragma', 'no-cache');
    response.headers.set('Expires', '0');
    return response;
  } catch (err: any) {
    return NextResponse.json({ success: false, error: err.message }, { status: 500 });
  }
}

export async function GET(request: Request) {
  return POST(request);
}
