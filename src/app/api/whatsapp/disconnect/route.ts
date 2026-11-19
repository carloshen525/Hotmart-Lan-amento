import { NextResponse } from 'next/server';
import { getActiveTenantId, ensureTenantAccess } from '@/lib/tenancy';
import { getCurrentSession } from '@/lib/auth';
import { messageManager } from '@/services/messaging';
import { automationEngine } from '@/services/automation/engine';
import { prisma } from '@/lib/prisma';

/**
 * POST /api/whatsapp/disconnect
 * Desconecta uma instância específica ({ instanceId }) ou padrão com validação estrita de tenant
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
    const targetId = body.instanceId || tenantId;

    const inst = await prisma.whatsappInstance.findFirst({
      where: {
        OR: [{ id: targetId }, { instanceName: targetId }],
        tenantId,
      },
    });

    if (inst?.provider === 'META_CLOUD') {
      await prisma.whatsappInstance.update({
        where: { id: inst.id },
        data: { status: 'DISCONNECTED' },
      });
    } else {
      await messageManager.evolutionApi.disconnect(targetId, tenantId);
    }

    // REGRA DE OURO: Caso o número configurado seja desconectado, o fluxo deve ser pausado imediatamente!
    try {
      const activeAutos = await prisma.automation.findMany({
        where: {
          tenantId,
          status: 'ACTIVE',
        },
        select: { id: true, name: true, whatsappInstanceId: true, triggerConfig: true, nodes: true },
      });

      for (const auto of activeAutos) {
        let usesThis = auto.whatsappInstanceId === targetId;
        if (!usesThis && auto.triggerConfig) {
          usesThis = (typeof auto.triggerConfig === 'string' ? auto.triggerConfig : JSON.stringify(auto.triggerConfig)).includes(targetId);
        }
        if (!usesThis && auto.nodes) {
          usesThis = (typeof auto.nodes === 'string' ? auto.nodes : JSON.stringify(auto.nodes)).includes(targetId);
        }

        if (usesThis) {
          console.warn(`[Disconnect] 🛑 Pausando automação ativa "${auto.name}" pois a instância ${targetId} foi desconectada.`);
          await automationEngine.pauseAutomationDueToDisconnectedWhatsapp(
            auto.id,
            tenantId,
            `Instância de WhatsApp ${targetId} desconectada pelo usuário`
          );
        }
      }
    } catch (e) {
      console.error('[Disconnect] Erro ao pausar automações afetadas pela desconexão:', e);
    }

    return NextResponse.json({ success: true, status: 'DISCONNECTED' });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
