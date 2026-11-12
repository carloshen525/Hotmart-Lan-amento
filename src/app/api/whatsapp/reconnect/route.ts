import { NextResponse } from 'next/server';
import { getActiveTenantId } from '@/lib/tenancy';
import { messageManager } from '@/services/messaging';

/**
 * POST /api/whatsapp/reconnect
 * Reconecta ou reinicia exclusivamente a instância do usuário logado
 */
export async function POST() {
  try {
    const tenantId = await getActiveTenantId();
    const result = await messageManager.evolutionApi.reconnect(tenantId);
    return NextResponse.json(result);
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
