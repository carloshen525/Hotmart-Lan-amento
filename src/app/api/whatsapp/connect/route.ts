import { NextResponse } from 'next/server';
import { getActiveTenantId, checkCanCreateWhatsappInstance, ensureTenantAccess } from '@/lib/tenancy';
import { getCurrentSession, isSuperAdmin } from '@/lib/auth';
import { messageManager } from '@/services/messaging';
import { prisma } from '@/lib/prisma';

/**
 * POST /api/whatsapp/connect
 * Conecta ou cria uma instância de WhatsApp com vínculo permanente ao Tenant e ao Usuário criador.
 */
export async function POST(request: Request) {
  try {
    const session = await getCurrentSession();
    if (!session) {
      return NextResponse.json({ error: 'Não autenticado' }, { status: 401 });
    }

    const tenantId = await getActiveTenantId();
    if (!tenantId) {
      return NextResponse.json({ error: 'Tenant não autenticado' }, { status: 401 });
    }

    await ensureTenantAccess(tenantId, session.userId, session.globalRole);

    const body = await request.json().catch(() => ({}));

    // Se estiver criando uma nova instância (e não for Super Admin), valida limite do plano
    if ((!body.instanceId || body.forceNew || body.isNew) && !isSuperAdmin(session.globalRole)) {
      await checkCanCreateWhatsappInstance(tenantId);
    }

    const result = await messageManager.evolutionApi.getOrCreateConnection({
      tenantId,
      userId: session.userId,
      instanceId: body.instanceId,
      name: body.name,
      forceNew: !!body.forceNew,
      isNew: !!body.isNew,
    });

    // Garante que o vínculo da instância com o tenant e com o userId do criador está gravado no banco
    if (result?.instanceId) {
      await prisma.whatsappInstance.update({
        where: { id: result.instanceId },
        data: {
          tenantId,
          userId: session.userId,
        },
      }).catch(() => {});
    }

    return NextResponse.json(result);
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 400 });
  }
}
