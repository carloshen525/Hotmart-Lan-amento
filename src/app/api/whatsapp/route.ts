import { NextResponse } from 'next/server';
import { getActiveTenantId } from '@/lib/tenancy';
import { messageManager } from '@/services/messaging';

/**
 * GET /api/whatsapp
 * Retorna exclusivamente o status da instância vinculada ao tenant/usuário logado
 */
export async function GET() {
  try {
    const tenantId = await getActiveTenantId();
    const status = await messageManager.evolutionApi.getStatus(tenantId);
    return NextResponse.json(status);
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
