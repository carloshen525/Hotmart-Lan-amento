import { NextResponse } from 'next/server';
import { getActiveTenantId } from '@/lib/tenancy';
import { messageManager } from '@/services/messaging';

/**
 * POST /api/whatsapp/disconnect
 * Desconecta exclusivamente a instância do usuário logado
 */
export async function POST() {
  try {
    const tenantId = await getActiveTenantId();
    await messageManager.evolutionApi.disconnect(tenantId);
    return NextResponse.json({ success: true, status: 'DISCONNECTED' });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
