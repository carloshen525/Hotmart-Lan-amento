import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { requireSuperAdmin } from '@/lib/auth';
import { logSaasAudit } from '@/lib/saas-audit';

export async function GET(
  request: Request,
  { params }: { params: { id: string } }
) {
  try {
    await requireSuperAdmin();

    const client = await prisma.saasClient.findUnique({
      where: { id: params.id },
      include: {
        users: {
          select: {
            id: true,
            name: true,
            email: true,
            role: true,
            phone: true,
            status: true,
            createdAt: true,
          },
        },
        tenants: {
          include: {
            whatsappInstances: {
              select: {
                id: true,
                name: true,
                instanceName: true,
                phone: true,
                status: true,
                createdAt: true,
                lastConnectedAt: true,
              },
            },
            _count: {
              select: {
                contacts: true,
                automations: true,
                campaigns: true,
                whatsappGroups: true,
              },
            },
          },
        },
        tickets: {
          orderBy: { createdAt: 'desc' },
          take: 5,
        },
        auditLogs: {
          orderBy: { createdAt: 'desc' },
          take: 10,
        },
      },
    });

    if (!client) {
      return NextResponse.json({ error: 'Cliente não encontrado' }, { status: 404 });
    }

    const now = new Date();
    const expDate = new Date(client.expiresAt);
    const isExpired = expDate.getTime() <= now.getTime();
    const effectiveStatus = client.status === 'BLOCKED' ? 'BLOCKED' : isExpired ? 'EXPIRED' : client.status;
    const daysLeft = Math.max(0, Math.ceil((expDate.getTime() - now.getTime()) / (1000 * 60 * 60 * 24)));

    // Total de instâncias de WhatsApp em todos os experts
    const allInstances = client.tenants.flatMap((t) =>
      t.whatsappInstances.map((i) => ({ ...i, tenantName: t.name, tenantId: t.id }))
    );

    return NextResponse.json({
      client: {
        ...client,
        effectiveStatus,
        daysLeft,
        allInstances,
      },
    });
  } catch (err: any) {
    const status = err.message?.includes('Acesso negado') ? 403 : err.message?.includes('Não autenticado') ? 401 : 500;
    return NextResponse.json({ error: err.message }, { status });
  }
}

export async function PUT(
  request: Request,
  { params }: { params: { id: string } }
) {
  try {
    const session = await requireSuperAdmin();
    const body = await request.json();

    const existing = await prisma.saasClient.findUnique({
      where: { id: params.id },
    });

    if (!existing) {
      return NextResponse.json({ error: 'Cliente não encontrado' }, { status: 404 });
    }

    const now = new Date();
    let newExpiresAt = existing.expiresAt;
    let newAccessDays = existing.accessDays;

    // 1. Liberação de dias de acesso personalizada (Ex: 7, 30, 45, 60, 90, 180, 365)
    if (body.accessDaysToAdd !== undefined) {
      const daysToAdd = Number(body.accessDaysToAdd);
      if (!isNaN(daysToAdd) && daysToAdd !== 0) {
        // Se já estava vencido, conta a partir de agora; se estava ativo, soma à data atual de vencimento
        const baseTime = existing.expiresAt.getTime() > now.getTime()
          ? existing.expiresAt.getTime()
          : now.getTime();

        newExpiresAt = new Date(baseTime + daysToAdd * 24 * 60 * 60 * 1000);
        newAccessDays = Math.max(1, Math.ceil((newExpiresAt.getTime() - existing.startDate.getTime()) / (1000 * 60 * 60 * 24)));
      }
    } else if (body.setExplicitDays !== undefined) {
      const explicitDays = Math.max(1, Number(body.setExplicitDays));
      newExpiresAt = new Date(now.getTime() + explicitDays * 24 * 60 * 60 * 1000);
      newAccessDays = explicitDays;
    } else if (body.expiresAt !== undefined) {
      newExpiresAt = new Date(body.expiresAt);
    }

    // Prepara dados atualizados
    const updateData: any = {};
    if (body.name !== undefined) updateData.name = body.name;
    if (body.company !== undefined) updateData.company = body.company;
    if (body.email !== undefined) updateData.email = body.email.toLowerCase().trim();
    if (body.phone !== undefined) updateData.phone = body.phone;
    if (body.plan !== undefined) updateData.plan = body.plan;
    if (body.monthlyPrice !== undefined) updateData.monthlyPrice = Number(body.monthlyPrice);
    if (body.billingCycle !== undefined) updateData.billingCycle = body.billingCycle;
    if (body.maxExperts !== undefined) updateData.maxExperts = Math.max(1, Number(body.maxExperts));
    if (body.maxWhatsappInstances !== undefined) updateData.maxWhatsappInstances = Math.max(1, Number(body.maxWhatsappInstances));
    if (body.status !== undefined) updateData.status = body.status;
    if (body.notes !== undefined) updateData.notes = body.notes;

    updateData.expiresAt = newExpiresAt;
    updateData.accessDays = newAccessDays;

    // Se o cliente foi desbloqueado e a data estava vencida, pode reativar
    if (body.status === 'ACTIVE' && newExpiresAt.getTime() <= now.getTime()) {
      // Se estava vencido e o admin clicou em Ativar, adiciona 30 dias se não especificado
      if (body.accessDaysToAdd === undefined && body.setExplicitDays === undefined) {
        newExpiresAt = new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000);
        updateData.expiresAt = newExpiresAt;
        updateData.accessDays = 30;
      }
    }

    const updated = await prisma.saasClient.update({
      where: { id: params.id },
      data: updateData,
    });

    // Se o status do cliente foi alterado para BLOCKED, atualiza tenants e usuários vinculados
    if (body.status === 'BLOCKED') {
      await prisma.user.updateMany({
        where: { clientId: params.id },
        data: { status: 'BLOCKED' },
      });
      await prisma.tenant.updateMany({
        where: { clientId: params.id },
        data: { status: 'SUSPENDED' },
      });
    } else if (body.status === 'ACTIVE') {
      await prisma.user.updateMany({
        where: { clientId: params.id },
        data: { status: 'ACTIVE' },
      });
      await prisma.tenant.updateMany({
        where: { clientId: params.id },
        data: { status: 'ACTIVE' },
      });
    }

    // Registra trilha de auditoria detalhada com alterações
    const changes: string[] = [];
    if (existing.plan !== updated.plan) changes.push(`Plano: "${existing.plan}" -> "${updated.plan}"`);
    if (existing.maxExperts !== updated.maxExperts) changes.push(`Limite Experts: ${existing.maxExperts} -> ${updated.maxExperts}`);
    if (existing.maxWhatsappInstances !== updated.maxWhatsappInstances) changes.push(`Limite Instâncias WhatsApp: ${existing.maxWhatsappInstances} -> ${updated.maxWhatsappInstances}`);
    if (existing.status !== updated.status) changes.push(`Status: ${existing.status} -> ${updated.status}`);
    if (existing.expiresAt.getTime() !== updated.expiresAt.getTime()) {
      changes.push(`Vencimento: ${existing.expiresAt.toLocaleDateString()} -> ${updated.expiresAt.toLocaleDateString()}`);
    }

    await logSaasAudit({
      clientId: updated.id,
      userId: session.userId,
      userEmail: session.email,
      userName: session.name,
      action: body.status !== existing.status ? (body.status === 'BLOCKED' ? 'CLIENT_BLOCKED' : 'CLIENT_UNBLOCKED') : 'CLIENT_UPDATED',
      entityType: 'CLIENT',
      entityId: updated.id,
      description: `Super Admin ${session.name} atualizou o cliente ${updated.name}: ${changes.join(', ') || 'Dados cadastrais atualizados'}.`,
      beforeData: {
        plan: existing.plan,
        maxExperts: existing.maxExperts,
        maxWhatsappInstances: existing.maxWhatsappInstances,
        status: existing.status,
        expiresAt: existing.expiresAt,
      },
      afterData: {
        plan: updated.plan,
        maxExperts: updated.maxExperts,
        maxWhatsappInstances: updated.maxWhatsappInstances,
        status: updated.status,
        expiresAt: updated.expiresAt,
      },
    });

    const daysLeft = Math.max(0, Math.ceil((newExpiresAt.getTime() - now.getTime()) / (1000 * 60 * 60 * 24)));

    return NextResponse.json({
      success: true,
      client: {
        ...updated,
        daysLeft,
      },
    });
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

    const client = await prisma.saasClient.findUnique({
      where: { id: params.id },
      include: {
        tenants: { select: { id: true, name: true } },
        users: { select: { id: true, name: true, email: true } },
      },
    });

    if (!client) {
      return NextResponse.json({ error: 'Cliente não encontrado' }, { status: 404 });
    }

    // Exclui com integridade referencial
    await prisma.saasClient.delete({
      where: { id: params.id },
    });

    await logSaasAudit({
      userId: session.userId,
      userEmail: session.email,
      userName: session.name,
      action: 'CLIENT_DELETED',
      entityType: 'CLIENT',
      entityId: params.id,
      description: `Super Admin ${session.name} excluiu permanentemente o cliente ${client.name} (${client.email}).`,
      beforeData: {
        id: client.id,
        name: client.name,
        email: client.email,
        company: client.company,
      },
    });

    return NextResponse.json({ success: true, message: 'Cliente excluído com sucesso' });
  } catch (err: any) {
    const status = err.message?.includes('Acesso negado') ? 403 : err.message?.includes('Não autenticado') ? 401 : 500;
    return NextResponse.json({ error: err.message }, { status });
  }
}
