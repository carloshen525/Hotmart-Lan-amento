import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { getActiveTenantId } from '@/lib/tenancy';

export async function GET(request: Request, { params }: { params: { id: string } }) {
  try {
    const tenantId = await getActiveTenantId();
    const contact = await prisma.contact.findFirst({
      where: { id: params.id, tenantId },
      include: {
        tags: { include: { tag: true } },
        enrollments: {
          include: {
            automation: true,
            stepLogs: { orderBy: { executedAt: 'desc' } },
          },
          orderBy: { enteredAt: 'desc' },
        },
        messageLogs: {
          orderBy: { sentAt: 'desc' },
        },
        scheduledJobs: {
          where: { status: 'PENDING' },
          orderBy: { executeAt: 'asc' },
        },
      },
    });

    if (!contact) {
      return NextResponse.json({ error: 'Contato não encontrado' }, { status: 404 });
    }

    return NextResponse.json({ contact });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

export async function PATCH(request: Request, { params }: { params: { id: string } }) {
  try {
    const tenantId = await getActiveTenantId();
    const body = await request.json();

    const contact = await prisma.contact.update({
      where: { id: params.id },
      data: {
        name: body.name !== undefined ? body.name : undefined,
        phone: body.phone !== undefined ? body.phone : undefined,
        status: body.status !== undefined ? body.status : undefined,
      },
    });

    return NextResponse.json({ success: true, contact });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

export async function DELETE(request: Request, { params }: { params: { id: string } }) {
  try {
    const tenantId = await getActiveTenantId();
    await prisma.contact.delete({
      where: { id: params.id },
    });

    await prisma.auditLog.create({
      data: {
        tenantId,
        action: 'CONTACT_DELETED',
        resource: 'Contact',
        details: JSON.stringify({ contactId: params.id }),
      },
    });

    return NextResponse.json({ success: true });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
