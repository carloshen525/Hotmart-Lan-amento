import { NextResponse } from 'next/server';
import { getActiveTenantId } from '@/lib/tenancy';
import { messageManager } from '@/services/messaging';

/**
 * GET /api/whatsapp
 * Retorna o status de todas as instâncias do sistema ou de uma instância específica (?instanceId=...)
 * Compartilhado entre todos os experts
 */
export async function GET(request: Request) {
  try {
    const tenantId = await getActiveTenantId();
    const { searchParams } = new URL(request.url);
    const instanceId = searchParams.get('instanceId') || undefined;

    const status = await messageManager.evolutionApi.getStatus(tenantId, instanceId);
    return NextResponse.json(status);
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
