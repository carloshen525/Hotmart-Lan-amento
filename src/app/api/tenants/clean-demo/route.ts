import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { cookies } from 'next/headers';

export async function POST() {
  try {
    // Exclui todos os tenants de demonstração
    const deleted = await prisma.tenant.deleteMany({
      where: {
        slug: {
          in: ['dr-marcelo', 'confeitaria-juliana', 'test-expert-unit', 'test-expert-other'],
        },
      },
    });

    // Se ainda restar algum tenant, define como ativo
    const remaining = await prisma.tenant.findFirst({
      orderBy: { createdAt: 'desc' },
    });

    const response = NextResponse.json({
      success: true,
      deletedCount: deleted.count,
      remainingCount: await prisma.tenant.count(),
    });

    if (remaining) {
      response.cookies.set('launch_active_tenant_id', remaining.id, {
        path: '/',
        maxAge: 30 * 24 * 60 * 60,
      });
    } else {
      response.cookies.delete('launch_active_tenant_id');
    }

    return response;
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
