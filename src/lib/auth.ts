import jwt from 'jsonwebtoken';
import bcrypt from 'bcryptjs';
import { cookies } from 'next/headers';
import { prisma } from './prisma';

const JWT_SECRET = process.env.JWT_SECRET || 'secret-seguro-jwt-2026';
const COOKIE_NAME = 'launch_auth_token';
const TENANT_COOKIE_NAME = 'launch_active_tenant_id';

export interface UserSession {
  userId: string;
  email: string;
  name: string;
  globalRole: string; // SUPER_ADMIN, ADMIN_CLIENTE, USUARIO (ADMIN, MANAGER, OPERATOR)
  clientId?: string;
  tenantId?: string;
  tenantRole?: string;
}

export async function hashPassword(password: string): Promise<string> {
  return bcrypt.hash(password, 10);
}

export async function verifyPassword(password: string, hash: string): Promise<boolean> {
  return bcrypt.compare(password, hash);
}

export function signToken(payload: object): string {
  return jwt.sign(payload, JWT_SECRET, { expiresIn: '7d' });
}

export function verifyToken(token: string): any {
  try {
    return jwt.verify(token, JWT_SECRET);
  } catch {
    return null;
  }
}

export async function getCurrentSession(): Promise<UserSession | null> {
  try {
    const cookieStore = cookies();
    const token = cookieStore.get(COOKIE_NAME)?.value;
    if (!token) return null;

    const payload = verifyToken(token);
    if (!payload || !payload.userId) return null;

    let user;
    try {
      user = await prisma.user.findUnique({
        where: { id: payload.userId },
        include: {
          memberships: {
            include: { tenant: true },
          },
        },
      });
    } catch (err: any) {
      if (err.message?.includes('User.phone') || err.message?.includes('does not exist')) {
        const { healDatabaseSchemaIfNeeded } = await import('./db-healing');
        await healDatabaseSchemaIfNeeded();
        user = await prisma.user.findUnique({
          where: { id: payload.userId },
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

    if (!user) return null;

    // Verificar se há tenant preferencial no cookie
    const activeTenantId = cookieStore.get(TENANT_COOKIE_NAME)?.value;
    let selectedMembership = user.memberships.find((m) => m.tenantId === activeTenantId);
    if (!selectedMembership && user.memberships.length > 0) {
      selectedMembership = user.memberships[0];
    }

    return {
      userId: user.id,
      email: user.email,
      name: user.name,
      globalRole: user.role,
      clientId: user.clientId || undefined,
      tenantId: selectedMembership?.tenantId,
      tenantRole: selectedMembership?.role || user.role,
    };
  } catch {
    return null;
  }
}

export function isSuperAdmin(role?: string): boolean {
  return role === 'SUPER_ADMIN' || role === 'ADMIN';
}

export async function requireAuth(requiredRoles?: string[]): Promise<UserSession> {
  const session = await getCurrentSession();
  if (!session) {
    throw new Error('Não autenticado');
  }
  if (
    requiredRoles &&
    !requiredRoles.includes(session.globalRole) &&
    (!session.tenantRole || !requiredRoles.includes(session.tenantRole))
  ) {
    throw new Error('Acesso não autorizado');
  }
  return session;
}

export async function requireSuperAdmin(): Promise<UserSession> {
  const session = await getCurrentSession();
  if (!session) {
    throw new Error('Não autenticado');
  }
  if (!isSuperAdmin(session.globalRole)) {
    throw new Error('Acesso negado: Requer privilégios de Super Administrador');
  }
  return session;
}
