import { NextResponse } from 'next/server';
import { getActiveTenantId, ensureTenantAccess } from '@/lib/tenancy';
import { getCurrentSession } from '@/lib/auth';
import { messageManager } from '@/services/messaging';

/**
 * GET /api/whatsapp/qrcode
 * Retorna o QR Code da instância selecionada (?instanceId=...) ou padrão com isolamento de tenant
 */
export async function GET(request: Request) {
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

    const { searchParams } = new URL(request.url);
    const instanceId = searchParams.get('instanceId') || undefined;

    const result = await messageManager.evolutionApi.getOrCreateConnection({
      tenantId,
      userId: session.userId,
      instanceId,
    });

    return NextResponse.json({
      qrcode: result.qrcode || null,
      status: result.status,
      connected: result.connected,
      instanceId: result.instanceId,
      instanceName: result.instanceName,
    });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
