import { NextResponse } from 'next/server';
import { getActiveTenantId, ensureTenantAccess } from '@/lib/tenancy';
import { getCurrentSession } from '@/lib/auth';
import { messageManager } from '@/services/messaging';
import { WhatsAppProviderFactory } from '@/services/whatsapp/providers';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

/**
 * GET /api/whatsapp
 * Retorna o status de todos os canais de WhatsApp pertencentes ao Tenant autenticado
 * (incluindo canais Evolution API e WhatsApp Business Cloud API Oficial da Meta).
 */
export async function GET(request: Request) {
  try {
    const session = await getCurrentSession();
    if (!session) {
      return NextResponse.json({ error: 'Não autenticado' }, { status: 401 });
    }

    const tenantId = await getActiveTenantId();
    if (!tenantId) {
      return NextResponse.json({
        hasInstance: false,
        connected: false,
        status: 'DISCONNECTED',
        instances: [],
      });
    }

    await ensureTenantAccess(tenantId, session.userId, session.globalRole);

    const { searchParams } = new URL(request.url);
    const instanceId = searchParams.get('instanceId') || undefined;

    // 1. Obtém todos os canais cadastrados no banco para este tenant (higienizados)
    const allChannels = await WhatsAppProviderFactory.listChannels(tenantId);

    // 2. Para instâncias da Evolution API, consulta o status em tempo real
    let evolutionStatus: any = null;
    try {
      evolutionStatus = await messageManager.evolutionApi.getStatus(tenantId, instanceId);
    } catch {}

    // 3. Mescla o status da Evolution API com os canais do banco
    const mergedChannels = allChannels.map((ch) => {
      if (ch.provider === 'EVOLUTION') {
        const evoItem = evolutionStatus?.instances?.find((i: any) => i.id === ch.id);
        if (evoItem) {
          return {
            ...ch,
            status: evoItem.status,
            connected: evoItem.connected,
            phone: evoItem.phone || ch.phone,
            profileName: evoItem.profileName || ch.profileName,
            profilePicUrl: evoItem.profilePicUrl || ch.profilePicUrl,
            qrcode: evoItem.qrcode || ch.qrcode,
          };
        }
      }
      return ch;
    });

    const filtered = instanceId
      ? mergedChannels.filter((c) => c.id === instanceId)
      : mergedChannels;

    const hasAnyConnected = filtered.some((c) => c.connected);
    const primaryStatus = hasAnyConnected ? 'CONNECTED' : (filtered[0]?.status || 'DISCONNECTED');

    const response = NextResponse.json({
      hasInstance: filtered.length > 0,
      connected: hasAnyConnected,
      status: primaryStatus,
      instances: filtered,
      instance: filtered[0] || null,
    });

    response.headers.set('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
    response.headers.set('Pragma', 'no-cache');
    response.headers.set('Expires', '0');
    return response;
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
