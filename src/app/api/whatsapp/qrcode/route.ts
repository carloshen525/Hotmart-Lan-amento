import { NextResponse } from 'next/server';
import { getActiveTenantId } from '@/lib/tenancy';
import { messageManager } from '@/services/messaging';

/**
 * GET /api/whatsapp/qrcode
 * Retorna exclusivamente o QR Code da instância do usuário/tenant logado
 */
export async function GET() {
  try {
    const tenantId = await getActiveTenantId();
    const result = await messageManager.evolutionApi.getOrCreateConnection(tenantId);
    return NextResponse.json({
      qrcode: result.qrcode || null,
      status: result.status,
      connected: result.connected,
    });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
