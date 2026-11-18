import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { getCurrentSession, isSuperAdmin } from '@/lib/auth';
import { checkCanCreateExpert } from '@/lib/tenancy';

export async function GET() {
  try {
    const session = await getCurrentSession();
    const where: any = {};

    // Se não for Super Admin, lista apenas os tenants vinculados ao usuário/cliente
    if (session && !isSuperAdmin(session.globalRole)) {
      if (session.clientId) {
        where.OR = [
          { clientId: session.clientId },
          { memberships: { some: { userId: session.userId } } },
        ];
      } else {
        where.memberships = { some: { userId: session.userId } };
      }
    }

    const tenants = await prisma.tenant.findMany({
      where,
      include: {
        client: {
          select: { id: true, name: true, company: true, plan: true },
        },
        _count: {
          select: {
            contacts: true,
            automations: true,
            campaigns: true,
            whatsappInstances: true,
          },
        },
      },
      orderBy: { createdAt: 'desc' },
    });

    return NextResponse.json({ tenants });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const { name, slug, description, emailSender, whatsappNumber, hotmartHottok } = await request.json();

    if (!name || !slug) {
      return NextResponse.json({ error: 'Nome e slug são obrigatórios' }, { status: 400 });
    }

    const session = await getCurrentSession();

    // Validação estrita de limites por plano para usuários que não são Super Admin
    if (session && !isSuperAdmin(session.globalRole)) {
      await checkCanCreateExpert(session.clientId);
    }

    const tenant = await prisma.tenant.create({
      data: {
        name,
        slug: slug.toLowerCase().replace(/\s+/g, '-'),
        description,
        emailSender: emailSender || 'contato@expertlaunch.com.br',
        whatsappNumber,
        hotmartHottok: hotmartHottok || `hottok_${Date.now()}`,
        clientId: session?.clientId || undefined,
      },
    });

    // Se houver usuário logado, associa automaticamente
    if (session) {
      await prisma.tenantMembership.create({
        data: {
          tenantId: tenant.id,
          userId: session.userId,
          role: 'MANAGER',
        },
      });
    }

    return NextResponse.json({ success: true, tenant }, { status: 201 });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 400 });
  }
}
