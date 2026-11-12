import { NextResponse } from 'next/server';
import { getActiveTenantId } from '@/lib/tenancy';
import { messageManager } from '@/services/messaging';

/**
 * POST /api/whatsapp/connect
 * Cria a instância se não existir e retorna o QR Code daquele usuário/tenant
 */
export async function POST(request: Request) {
  try {
    const tenantId = await getActiveTenantId();
    const body = await request.json().catch(() => ({}));
    const forceNew = !!body.forceNew;
    const result = await messageManager.evolutionApi.getOrCreateConnection(tenantId, forceNew);
    return NextResponse.json(result);
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
