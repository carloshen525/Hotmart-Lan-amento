import { NextResponse } from 'next/server';
import { getActiveTenantId } from '@/lib/tenancy';
import { messageManager } from '@/services/messaging';
import { prisma } from '@/lib/prisma';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

/**
 * POST /api/whatsapp/sync
 * Sincroniza em tempo real todas as instâncias conectadas na Evolution API
 * com o banco de dados do Tenant ativo e retorna a listagem atualizada.
 */
export async function POST(request: Request) {
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

    // 1. Força a sincronização na Evolution API
    const syncResult = await messageManager.evolutionApi.syncAllFromEvolutionApi(tenantId);

    // 2. Obtém a lista atualizada de instâncias
    const status = await messageManager.evolutionApi.getStatus(tenantId);

    const response = NextResponse.json({
      success: true,
      syncResult,
      ...status,
    });
    response.headers.set('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
    response.headers.set('Pragma', 'no-cache');
    response.headers.set('Expires', '0');
    return response;
  } catch (err: any) {
    return NextResponse.json({ success: false, error: err.message }, { status: 500 });
  }
}

export async function GET(request: Request) {
  return POST(request);
}
