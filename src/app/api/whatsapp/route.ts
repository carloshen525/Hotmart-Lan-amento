import { NextResponse } from 'next/server';
import { getActiveTenantId } from '@/lib/tenancy';
import { messageManager } from '@/services/messaging';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

/**
 * GET /api/whatsapp
 * Retorna o status de todas as instâncias do WhatsApp pertencentes ao Tenant autenticado
 */
export async function GET(request: Request) {
  try {
    const tenantId = await getActiveTenantId();
    if (!tenantId) {
      return NextResponse.json({ error: 'Tenant não autenticado' }, { status: 401 });
    }
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
