import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { requireSuperAdmin } from '@/lib/auth';
import { healDatabaseSchemaIfNeeded } from '@/lib/db-healing';

export const dynamic = 'force-dynamic';

export async function GET(request: Request) {
  try {
    await requireSuperAdmin();
    await healDatabaseSchemaIfNeeded();

    const { searchParams } = new URL(request.url);
    const search = searchParams.get('search')?.toLowerCase().trim() || '';
    const entityType = searchParams.get('entityType') || '';

    const where: any = {};
    if (search) {
      where.OR = [
        { description: { contains: search } },
        { action: { contains: search } },
        { userName: { contains: search } },
        { userEmail: { contains: search } },
      ];
    }
    if (entityType && entityType !== 'ALL') {
      where.entityType = entityType;
    }

    const logs = await prisma.saasAuditLog.findMany({
      where,
      include: {
        client: {
          select: { id: true, name: true, company: true },
        },
      },
      orderBy: { createdAt: 'desc' },
      take: 100,
    });

    return NextResponse.json({ logs });
  } catch (err: any) {
    const status = err.message?.includes('Acesso negado') ? 403 : err.message?.includes('Não autenticado') ? 401 : 500;
    return NextResponse.json({ error: err.message }, { status });
  }
}
