import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { requireSuperAdmin } from '@/lib/auth';
import { logSaasAudit } from '@/lib/saas-audit';

export async function POST(
  request: Request,
  { params }: { params: { id: string } }
) {
  try {
    const session = await requireSuperAdmin();
    const body = await request.json();
    const { action } = body; // 'disconnect' | 'block' | 'unblock'

    const instance = await prisma.whatsappInstance.findUnique({
      where: { id: params.id },
      include: {
        tenant: {
          include: { client: true },
        },
      },
    });

    if (!instance) {
      return NextResponse.json({ error: 'Instância não encontrada' }, { status: 404 });
    }

    if (action === 'disconnect') {
      // Chama a Evolution API para desconectar a sessão
      const apiUrl = process.env.EVOLUTION_API_URL || 'http://localhost:8080';
      const apiKey = process.env.EVOLUTION_API_KEY || 'launchflow_evolution_api_secret_key_2026';

      try {
        await fetch(`${apiUrl}/instance/logout/${encodeURIComponent(instance.instanceName)}`, {
          method: 'DELETE',
          headers: { apikey: apiKey },
        });
      } catch (err) {
        console.warn('[Admin Instances] Falha ao chamar logout na Evolution API:', err);
      }

      await prisma.whatsappInstance.update({
        where: { id: params.id },
        data: { status: 'DISCONNECTED', qrcode: null },
      });

      await logSaasAudit({
        clientId: instance.tenant?.clientId,
        userId: session.userId,
        userEmail: session.email,
        userName: session.name,
        action: 'INSTANCE_DISCONNECTED',
        entityType: 'INSTANCE',
        entityId: instance.id,
        description: `Super Admin ${session.name} forçou a desconexão da instância WhatsApp "${instance.name || instance.instanceName}".`,
      });

      return NextResponse.json({ success: true, message: 'Instância desconectada com sucesso' });
    }

    if (action === 'block' || action === 'unblock') {
      const nextStatus = action === 'block' ? 'BLOCKED' : 'DISCONNECTED';
      await prisma.whatsappInstance.update({
        where: { id: params.id },
        data: { status: nextStatus },
      });

      await logSaasAudit({
        clientId: instance.tenant?.clientId,
        userId: session.userId,
        userEmail: session.email,
        userName: session.name,
        action: action === 'block' ? 'INSTANCE_BLOCKED' : 'INSTANCE_UNBLOCKED',
        entityType: 'INSTANCE',
        entityId: instance.id,
        description: `Super Admin ${session.name} alterou o status da instância "${instance.name || instance.instanceName}" para ${nextStatus}.`,
      });

      return NextResponse.json({ success: true, status: nextStatus });
    }

    return NextResponse.json({ error: 'Ação inválida' }, { status: 400 });
  } catch (err: any) {
    const status = err.message?.includes('Acesso negado') ? 403 : err.message?.includes('Não autenticado') ? 401 : 500;
    return NextResponse.json({ error: err.message }, { status });
  }
}

export async function DELETE(
  request: Request,
  { params }: { params: { id: string } }
) {
  try {
    const session = await requireSuperAdmin();

    const instance = await prisma.whatsappInstance.findUnique({
      where: { id: params.id },
      include: {
        tenant: { include: { client: true } },
      },
    });

    if (!instance) {
      return NextResponse.json({ error: 'Instância não encontrada' }, { status: 404 });
    }

    // Tenta remover na Evolution API
    const apiUrl = process.env.EVOLUTION_API_URL || 'http://localhost:8080';
    const apiKey = process.env.EVOLUTION_API_KEY || 'launchflow_evolution_api_secret_key_2026';

    try {
      await fetch(`${apiUrl}/instance/delete/${encodeURIComponent(instance.instanceName)}`, {
        method: 'DELETE',
        headers: { apikey: apiKey },
      });
    } catch {}

    await prisma.whatsappInstance.delete({
      where: { id: params.id },
    });

    await logSaasAudit({
      clientId: instance.tenant?.clientId,
      userId: session.userId,
      userEmail: session.email,
      userName: session.name,
      action: 'INSTANCE_DELETED',
      entityType: 'INSTANCE',
      entityId: instance.id,
      description: `Super Admin ${session.name} removeu permanentemente a instância WhatsApp "${instance.name || instance.instanceName}".`,
      beforeData: { instanceName: instance.instanceName, phone: instance.phone, tenantId: instance.tenantId },
    });

    return NextResponse.json({ success: true, message: 'Instância removida com sucesso' });
  } catch (err: any) {
    const status = err.message?.includes('Acesso negado') ? 403 : err.message?.includes('Não autenticado') ? 401 : 500;
    return NextResponse.json({ error: err.message }, { status });
  }
}
