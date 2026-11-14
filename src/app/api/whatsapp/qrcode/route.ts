import { NextResponse } from 'next/server';
import { getActiveTenantId } from '@/lib/tenancy';
import { messageManager } from '@/services/messaging';

/**
 * GET /api/whatsapp/qrcode
 * Retorna o QR Code da instância selecionada (?instanceId=...) ou padrão
 */
export async function GET(request: Request) {
  try {
    const tenantId = await getActiveTenantId();
    const { searchParams } = new URL(request.url);
    const instanceId = searchParams.get('instanceId') || undefined;

    const result = await messageManager.evolutionApi.getOrCreateConnection({
      tenantId,
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
