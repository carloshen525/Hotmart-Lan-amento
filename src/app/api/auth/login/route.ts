import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { verifyPassword, signToken } from '@/lib/auth';
import { healDatabaseSchemaIfNeeded } from '@/lib/db-healing';

export async function POST(request: Request) {
  try {
    const { email, password } = await request.json();

    if (!email || !password) {
      return NextResponse.json({ error: 'E-mail e senha são obrigatórios' }, { status: 400 });
    }

    let user;
    try {
      user = await prisma.user.findUnique({
        where: { email: email.toLowerCase().trim() },
        include: {
          memberships: {
            include: { tenant: true },
          },
        },
      });
    } catch (err: any) {
      if (err.message?.includes('User.phone') || err.message?.includes('does not exist')) {
        await healDatabaseSchemaIfNeeded();
        user = await prisma.user.findUnique({
          where: { email: email.toLowerCase().trim() },
          include: {
            memberships: {
              include: { tenant: true },
            },
          },
        });
      } else {
        throw err;
      }
    }

    if (!user) {
      return NextResponse.json({ error: 'Credenciais inválidas' }, { status: 401 });
    }

    const isValid = await verifyPassword(password, user.passwordHash);
    if (!isValid) {
      return NextResponse.json({ error: 'Credenciais inválidas' }, { status: 401 });
    }

    const defaultTenant = user.memberships[0]?.tenant;
    const token = signToken({
      userId: user.id,
      email: user.email,
      name: user.name,
      role: user.role,
    });

    const response = NextResponse.json({
      success: true,
      user: {
        id: user.id,
        name: user.name,
        email: user.email,
        role: user.role,
      },
      activeTenant: defaultTenant || null,
      tenants: user.memberships.map((m) => m.tenant),
    });

    response.cookies.set('launch_auth_token', token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      path: '/',
      maxAge: 7 * 24 * 60 * 60,
    });

    if (defaultTenant) {
      response.cookies.set('launch_active_tenant_id', defaultTenant.id, {
        path: '/',
        maxAge: 30 * 24 * 60 * 60,
      });
    }

    return response;
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
