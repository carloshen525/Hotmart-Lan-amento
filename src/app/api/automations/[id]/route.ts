import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { getActiveTenantId } from '@/lib/tenancy';

export async function GET(request: Request, { params }: { params: { id: string } }) {
  try {
    const tenantId = await getActiveTenantId();
    const automation = await prisma.automation.findFirst({
      where: { id: params.id, tenantId },
      include: {
        _count: {
          select: {
            enrollments: true,
            scheduledJobs: true,
          },
        },
        enrollments: {
          take: 10,
          orderBy: { enteredAt: 'desc' },
          include: { contact: true },
        },
      },
    });

    if (!automation) {
      return NextResponse.json({ error: 'Automação não encontrada' }, { status: 404 });
    }

    return NextResponse.json({
      automation: {
        ...automation,
        nodes: JSON.parse(automation.nodes || '[]'),
        edges: JSON.parse(automation.edges || '[]'),
      },
    });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

export async function PUT(request: Request, { params }: { params: { id: string } }) {
  try {
    const tenantId = await getActiveTenantId();
    const body = await request.json();

    const updateData: any = {};
    if (body.name !== undefined) updateData.name = body.name;
    if (body.description !== undefined) updateData.description = body.description;
    if (body.status !== undefined) updateData.status = body.status;
    if (body.triggerType !== undefined) updateData.triggerType = body.triggerType;
    if (body.nodes !== undefined) updateData.nodes = JSON.stringify(body.nodes);
    if (body.edges !== undefined) updateData.edges = JSON.stringify(body.edges);

    const automation = await prisma.automation.update({
      where: { id: params.id },
      data: updateData,
    });

    return NextResponse.json({ success: true, automation });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

export async function DELETE(request: Request, { params }: { params: { id: string } }) {
  try {
    await prisma.automation.delete({
      where: { id: params.id },
    });
    return NextResponse.json({ success: true });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
