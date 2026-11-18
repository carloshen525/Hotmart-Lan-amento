import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { requireSuperAdmin, hashPassword } from '@/lib/auth';
import { logSaasAudit } from '@/lib/saas-audit';
import { healDatabaseSchemaIfNeeded } from '@/lib/db-healing';

export const dynamic = 'force-dynamic';

export async function GET(request: Request) {
  try {
    await requireSuperAdmin();
    await healDatabaseSchemaIfNeeded();

    const { searchParams } = new URL(request.url);
    const search = searchParams.get('search')?.toLowerCase().trim() || '';
    const statusFilter = searchParams.get('status') || '';
    const planFilter = searchParams.get('plan') || '';

    const where: any = {};

    if (search) {
      where.OR = [
        { name: { contains: search } },
        { company: { contains: search } },
        { email: { contains: search } },
        { phone: { contains: search } },
      ];
    }

    if (planFilter && planFilter !== 'ALL') {
      where.plan = planFilter;
    }

    const now = new Date();

    const clients = await prisma.saasClient.findMany({
      where,
      include: {
        _count: {
          select: {
            users: true,
            tenants: true,
            tickets: true,
          },
        },
        tenants: {
          select: {
            id: true,
            name: true,
            slug: true,
            _count: {
              select: {
                whatsappInstances: true,
                contacts: true,
                automations: true,
              },
            },
          },
        },
      },
      orderBy: { createdAt: 'desc' },
    });

    const enriched = clients.map((c) => {
      const expDate = new Date(c.expiresAt);
      const isExpired = expDate.getTime() <= now.getTime();
      const effectiveStatus = c.status === 'BLOCKED' ? 'BLOCKED' : isExpired ? 'EXPIRED' : c.status;
      const daysLeft = Math.max(0, Math.ceil((expDate.getTime() - now.getTime()) / (1000 * 60 * 60 * 24)));
      const totalWhatsappInstances = c.tenants.reduce((acc, t) => acc + (t._count?.whatsappInstances || 0), 0);

      return {
        ...c,
        effectiveStatus,
        daysLeft,
        totalWhatsappInstances,
        totalExperts: c._count.tenants,
        totalUsers: c._count.users,
      };
    });

    const filtered = statusFilter && statusFilter !== 'ALL'
      ? enriched.filter((c) => c.effectiveStatus === statusFilter)
      : enriched;

    return NextResponse.json({ clients: filtered });
  } catch (err: any) {
    const status = err.message?.includes('Acesso negado') ? 403 : err.message?.includes('Não autenticado') ? 401 : 500;
    return NextResponse.json({ error: err.message }, { status });
  }
}

export async function POST(request: Request) {
  try {
    const session = await requireSuperAdmin();
    await healDatabaseSchemaIfNeeded();
    const body = await request.json();

    const {
      name,
      company,
      email,
      phone,
      plan = 'Pro',
      monthlyPrice = 197.0,
      billingCycle = 'MONTHLY',
      accessDays = 30,
      maxExperts = 5,
      maxWhatsappInstances = 3,
      notes,
      password,
    } = body;

    if (!name || !email) {
      return NextResponse.json({ error: 'Nome e e-mail são obrigatórios' }, { status: 400 });
    }

    const cleanEmail = email.toLowerCase().trim();

    // Verifica se já existe cliente ou usuário com esse email
    const existingClient = await prisma.saasClient.findUnique({ where: { email: cleanEmail } });
    if (existingClient) {
      return NextResponse.json({ error: 'Já existe um cliente cadastrado com este e-mail' }, { status: 400 });
    }

    const existingUser = await prisma.user.findUnique({ where: { email: cleanEmail } });
    if (existingUser) {
      return NextResponse.json({ error: 'Já existe um usuário com este e-mail no sistema' }, { status: 400 });
    }

    const days = Math.max(1, Number(accessDays) || 30);
    const startDate = new Date();
    const expiresAt = new Date(startDate.getTime() + days * 24 * 60 * 60 * 1000);
    const initialPassword = password || 'senha123';
    const passwordHash = await hashPassword(initialPassword);

    // Slug amigável único para o tenant inicial
    const baseSlug = (company || name)
      .toLowerCase()
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/(^-|-$)+/g, '') || 'expert';
    const slug = `${baseSlug}-${Date.now().toString(36)}`;

    // Transação de provisionamento do cliente SaaS
    const result = await prisma.$transaction(async (tx) => {
      // 1. Cria o Cliente SaaS
      const newClient = await tx.saasClient.create({
        data: {
          name,
          company: company || name,
          email: cleanEmail,
          phone,
          plan,
          monthlyPrice: Number(monthlyPrice) || 197.0,
          billingCycle,
          accessDays: days,
          startDate,
          expiresAt,
          maxExperts: Math.max(1, Number(maxExperts) || 5),
          maxWhatsappInstances: Math.max(1, Number(maxWhatsappInstances) || 3),
          notes,
          status: 'ACTIVE',
        },
      });

      // 2. Cria o Usuário Administrador do Cliente
      const newUser = await tx.user.create({
        data: {
          name,
          email: cleanEmail,
          passwordHash,
          role: 'ADMIN_CLIENTE',
          phone,
          status: 'ACTIVE',
          clientId: newClient.id,
        },
      });

      // 3. Cria o primeiro Tenant (Expert) padrão deste cliente
      const newTenant = await tx.tenant.create({
        data: {
          name: company || `${name} - Expert Principal`,
          slug,
          clientId: newClient.id,
          status: 'ACTIVE',
          emailSender: cleanEmail,
          whatsappNumber: phone,
          hotmartHottok: `hottok_${Date.now().toString(36)}`,
        },
      });

      // 4. Associa o usuário ao Tenant como MANAGER
      await tx.tenantMembership.create({
        data: {
          tenantId: newTenant.id,
          userId: newUser.id,
          role: 'MANAGER',
        },
      });

      return { newClient, newUser, newTenant };
    });

    // Registra log de auditoria
    await logSaasAudit({
      clientId: result.newClient.id,
      userId: session.userId,
      userEmail: session.email,
      userName: session.name,
      action: 'CLIENT_CREATED',
      entityType: 'CLIENT',
      entityId: result.newClient.id,
      description: `Super Admin ${session.name} cadastrou o cliente ${name} (${company || 'S/E'}) com plano ${plan} e ${days} dias de acesso.`,
      afterData: {
        clientId: result.newClient.id,
        name,
        company,
        email: cleanEmail,
        plan,
        accessDays: days,
        expiresAt,
      },
    });

    return NextResponse.json({
      success: true,
      client: result.newClient,
      user: { id: result.newUser.id, email: result.newUser.email },
      tenant: { id: result.newTenant.id, name: result.newTenant.name },
      initialPassword,
    }, { status: 201 });
  } catch (err: any) {
    const status = err.message?.includes('Acesso negado') ? 403 : err.message?.includes('Não autenticado') ? 401 : 500;
    return NextResponse.json({ error: err.message }, { status });
  }
}
