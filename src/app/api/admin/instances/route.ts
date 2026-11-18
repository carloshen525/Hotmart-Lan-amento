import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { requireSuperAdmin } from '@/lib/auth';
import { logSaasAudit } from '@/lib/saas-audit';
import { messageManager } from '@/services/messaging';
import { healDatabaseSchemaIfNeeded } from '@/lib/db-healing';

export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    await requireSuperAdmin();
    await healDatabaseSchemaIfNeeded();

    const instances = await prisma.whatsappInstance.findMany({
      include: {
        tenant: {
          select: {
            id: true,
            name: true,
            slug: true,
            client: {
              select: {
                id: true,
                name: true,
                company: true,
                email: true,
                status: true,
              },
            },
          },
        },
        user: {
          select: {
            id: true,
            name: true,
            email: true,
          },
        },
        _count: {
          select: {
            whatsappQueue: true,
            whatsappGroups: true,
          },
        },
      },
      orderBy: { createdAt: 'desc' },
    });

    const formatted = instances.map((inst) => ({
      id: inst.id,
      name: inst.name || inst.instanceName,
      instanceName: inst.instanceName,
      phone: inst.phone,
      status: inst.status,
      isDefault: inst.isDefault,
      createdAt: inst.createdAt,
      updatedAt: inst.updatedAt,
      lastConnectedAt: inst.lastConnectedAt,
      tenantId: inst.tenantId,
      tenantName: inst.tenant?.name || 'Expert Não Encontrado',
      client: inst.tenant?.client || null,
      ownerUser: inst.user || null,
      totalQueue: inst._count?.whatsappQueue || 0,
      totalGroups: inst._count?.whatsappGroups || 0,
    }));

    return NextResponse.json({ instances: formatted });
  } catch (err: any) {
    const status = err.message?.includes('Acesso negado') ? 403 : err.message?.includes('Não autenticado') ? 401 : 500;
    return NextResponse.json({ error: err.message }, { status });
  }
}
