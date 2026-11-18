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
    const statusFilter = searchParams.get('status') || '';
    const priorityFilter = searchParams.get('priority') || '';

    const where: any = {};
    if (statusFilter && statusFilter !== 'ALL') {
      where.status = statusFilter;
    }
    if (priorityFilter && priorityFilter !== 'ALL') {
      where.priority = priorityFilter;
    }

    const tickets = await prisma.supportTicket.findMany({
      where,
      include: {
        client: {
          select: { id: true, name: true, company: true, email: true },
        },
        user: {
          select: { id: true, name: true, email: true },
        },
        messages: {
          orderBy: { createdAt: 'asc' },
        },
      },
      orderBy: [{ status: 'asc' }, { updatedAt: 'desc' }],
    });

    return NextResponse.json({ tickets });
  } catch (err: any) {
    const status = err.message?.includes('Acesso negado') ? 403 : err.message?.includes('Não autenticado') ? 401 : 500;
    return NextResponse.json({ error: err.message }, { status });
  }
}
