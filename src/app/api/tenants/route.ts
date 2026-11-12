import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { getCurrentSession } from '@/lib/auth';

export async function GET() {
  try {
    const tenants = await prisma.tenant.findMany({
      include: {
        _count: {
          select: {
            contacts: true,
            automations: true,
            campaigns: true,
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

    const tenant = await prisma.tenant.create({
      data: {
        name,
        slug: slug.toLowerCase().replace(/\s+/g, '-'),
        description,
        emailSender: emailSender || 'contato@expertlaunch.com.br',
        whatsappNumber,
        hotmartHottok: hotmartHottok || `hottok_${Date.now()}`,
      },
    });

    // Se houver usuário logado, associa automaticamente
    const session = await getCurrentSession();
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
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
