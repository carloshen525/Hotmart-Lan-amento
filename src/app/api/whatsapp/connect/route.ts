import { NextResponse } from 'next/server';
import { getActiveTenantId, checkCanCreateWhatsappInstance } from '@/lib/tenancy';
import { getCurrentSession, isSuperAdmin } from '@/lib/auth';
import { messageManager } from '@/services/messaging';
import { prisma } from '@/lib/prisma';

/**
 * POST /api/whatsapp/connect
 * Conecta ou cria uma instância de WhatsApp (com suporte a múltiplos números, apelido e validação de limites de plano)
 */
export async function POST(request: Request) {
  try {
    const tenantId = await getActiveTenantId();
    if (!tenantId) {
      return NextResponse.json({ error: 'Tenant não autenticado' }, { status: 401 });
    }
    const session = await getCurrentSession();
    const body = await request.json().catch(() => ({}));

    // Se estiver criando uma nova instância (e não for Super Admin), valida limite do plano
    if ((!body.instanceId || body.forceNew || body.isNew) && (!session || !isSuperAdmin(session.globalRole))) {
      await checkCanCreateWhatsappInstance(tenantId);
    }

    const result = await messageManager.evolutionApi.getOrCreateConnection({
      tenantId,
      instanceId: body.instanceId,
      name: body.name,
      forceNew: !!body.forceNew,
      isNew: !!body.isNew,
    });

    // Vincula o userId do usuário que conectou a instância
    if (result?.instanceId && session?.userId) {
      await prisma.whatsappInstance.update({
        where: { id: result.instanceId },
        data: { userId: session.userId },
      }).catch(() => {});
    }

    return NextResponse.json(result);
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 400 });
  }
}
