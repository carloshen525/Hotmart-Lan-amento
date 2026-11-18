import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { requireSuperAdmin, hashPassword } from '@/lib/auth';
import { logSaasAudit } from '@/lib/saas-audit';

export const dynamic = 'force-dynamic';

export async function GET(request: Request) {
  try {
    await requireSuperAdmin();

    const { searchParams } = new URL(request.url);
    const search = searchParams.get('search')?.toLowerCase().trim() || '';

    const where: any = {};
    if (search) {
      where.OR = [
        { name: { contains: search } },
        { email: { contains: search } },
      ];
    }

    const users = await prisma.user.findMany({
      where,
      include: {
        client: {
          select: {
            id: true,
            name: true,
            company: true,
            plan: true,
            status: true,
          },
        },
        memberships: {
          include: {
            tenant: {
              select: { id: true, name: true },
            },
          },
        },
      },
      orderBy: { createdAt: 'desc' },
    });

    const formatted = users.map((u) => ({
      id: u.id,
      name: u.name,
      email: u.email,
      role: u.role,
      phone: u.phone,
      status: u.status,
      createdAt: u.createdAt,
      client: u.client || null,
      tenants: u.memberships.map((m) => ({ id: m.tenant.id, name: m.tenant.name, role: m.role })),
    }));

    return NextResponse.json({ users: formatted });
  } catch (err: any) {
    const status = err.message?.includes('Acesso negado') ? 403 : err.message?.includes('Não autenticado') ? 401 : 500;
    return NextResponse.json({ error: err.message }, { status });
  }
}

export async function POST(request: Request) {
  try {
    const session = await requireSuperAdmin();
    const body = await request.json();

    const {
      name,
      email,
      password,
      role = 'USUARIO', // 'SUPER_ADMIN' | 'ADMIN_CLIENTE' | 'USUARIO'
      clientId,
      company,
      phone,
    } = body;

    if (!name || !email || !password) {
      return NextResponse.json({ error: 'Nome, e-mail e senha são obrigatórios' }, { status: 400 });
    }

    const cleanEmail = email.toLowerCase().trim();
    const existing = await prisma.user.findUnique({ where: { email: cleanEmail } });
    if (existing) {
      return NextResponse.json({ error: 'Já existe um usuário com este e-mail' }, { status: 400 });
    }

    const passwordHash = await hashPassword(password);
    let targetClientId = clientId;

    // Se a role for ADMIN_CLIENTE e nenhum clientId foi informado mas foi informada uma empresa:
    // Cria automaticamente o SaasClient e Tenant
    if (role === 'ADMIN_CLIENTE' && !targetClientId) {
      const days = 30;
      const startDate = new Date();
      const expiresAt = new Date(startDate.getTime() + days * 86400000);

      const client = await prisma.saasClient.create({
        data: {
          name,
          company: company || name,
          email: cleanEmail,
          phone,
          plan: 'Pro',
          monthlyPrice: 197.0,
          startDate,
          expiresAt,
          accessDays: days,
          maxExperts: 5,
          maxWhatsappInstances: 3,
          status: 'ACTIVE',
        },
      });
      targetClientId = client.id;

      // Cria o primeiro tenant/expert do cliente
      const baseSlug = (company || name)
        .toLowerCase()
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .replace(/[^a-z0-9]+/g, '-') || 'expert';
      const tenant = await prisma.tenant.create({
        data: {
          name: company || `${name} - Expert Principal`,
          slug: `${baseSlug}-${Date.now().toString(36)}`,
          clientId: client.id,
          status: 'ACTIVE',
          emailSender: cleanEmail,
        },
      });

      const newUser = await prisma.user.create({
        data: {
          name,
          email: cleanEmail,
          passwordHash,
          role,
          phone,
          status: 'ACTIVE',
          clientId: client.id,
        },
      });

      await prisma.tenantMembership.create({
        data: {
          tenantId: tenant.id,
          userId: newUser.id,
          role: 'MANAGER',
        },
      });

      await logSaasAudit({
        clientId: client.id,
        userId: session.userId,
        userEmail: session.email,
        userName: session.name,
        action: 'USER_CREATED',
        entityType: 'USER',
        entityId: newUser.id,
        description: `Super Admin ${session.name} cadastrou usuário ${name} com role ${role} e provisionou cliente/tenant automaticamente.`,
      });

      return NextResponse.json({ success: true, user: newUser, client, tenant }, { status: 201 });
    }

    const newUser = await prisma.user.create({
      data: {
        name,
        email: cleanEmail,
        passwordHash,
        role,
        phone,
        status: 'ACTIVE',
        clientId: targetClientId || undefined,
      },
    });

    // Se foi vinculado a um clientId, associa aos tenants desse cliente
    if (targetClientId) {
      const clientTenants = await prisma.tenant.findMany({
        where: { clientId: targetClientId },
      });
      for (const t of clientTenants) {
        await prisma.tenantMembership.upsert({
          where: { tenantId_userId: { tenantId: t.id, userId: newUser.id } },
          create: {
            tenantId: t.id,
            userId: newUser.id,
            role: role === 'ADMIN_CLIENTE' ? 'MANAGER' : 'OPERATOR',
          },
          update: {},
        });
      }
    }

    await logSaasAudit({
      clientId: targetClientId,
      userId: session.userId,
      userEmail: session.email,
      userName: session.name,
      action: 'USER_CREATED',
      entityType: 'USER',
      entityId: newUser.id,
      description: `Super Admin ${session.name} cadastrou usuário ${name} (${cleanEmail}) com papel ${role}.`,
    });

    return NextResponse.json({ success: true, user: newUser }, { status: 201 });
  } catch (err: any) {
    const status = err.message?.includes('Acesso negado') ? 403 : err.message?.includes('Não autenticado') ? 401 : 500;
    return NextResponse.json({ error: err.message }, { status });
  }
}
