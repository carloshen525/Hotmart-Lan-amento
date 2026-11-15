import { NextResponse } from 'next/server';
import { getActiveTenantId } from '@/lib/tenancy';
import { messageManager } from '@/services/messaging';
import { prisma } from '@/lib/prisma';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

/**
 * GET /api/whatsapp
 * Retorna o status de todas as instâncias do WhatsApp pertencentes ao Tenant autenticado
 */
export async function GET(request: Request) {
  try {
    let tenantId = await getActiveTenantId();
    if (!tenantId) {
      let defaultTenant = await prisma.tenant.findFirst({ orderBy: { createdAt: 'asc' } });
      if (!defaultTenant) {
        defaultTenant = await prisma.tenant.create({
          data: {
            name: 'Meu Expert Principal',
            slug: 'expert-principal',
            status: 'ACTIVE',
          },
        });
      }
      tenantId = defaultTenant.id;
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
