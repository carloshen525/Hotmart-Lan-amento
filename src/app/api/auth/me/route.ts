import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { getCurrentSession, isSuperAdmin } from '@/lib/auth';
import { prisma } from '@/lib/prisma';

export async function GET() {
  try {
    const session = await getCurrentSession();
    if (!session) {
      return NextResponse.json({ authenticated: false, message: 'Não autenticado' }, { status: 401 });
    }

    const userWithTenants = await prisma.user.findUnique({
      where: { id: session.userId },
      include: { memberships: { include: { tenant: true } } },
    });

    const activeTenantId = cookies().get('launch_active_tenant_id')?.value || session.tenantId;
    let activeTenant = userWithTenants?.memberships.find((m) => m.tenantId === activeTenantId)?.tenant;

    if (!activeTenant && userWithTenants?.memberships.length) {
      activeTenant = userWithTenants.memberships[0].tenant;
    }

    return NextResponse.json({
      authenticated: true,
      isSuperAdmin: isSuperAdmin(session.globalRole),
      user: {
        id: session.userId,
        name: session.name,
        email: session.email,
        role: session.globalRole,
        clientId: session.clientId,
      },
      activeTenant,
      allTenants: userWithTenants?.memberships.map((m) => m.tenant) || [],
    });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
