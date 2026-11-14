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

    // 1. Verifica se o contato existe e pertence a este tenant
    const existing = await prisma.contact.findFirst({
      where: { id: params.id, tenantId },
      include: { tags: true },
    });

    if (!existing) {
      return NextResponse.json({ error: 'Contato não encontrado' }, { status: 404 });
    }

    // 2. Se informou e-mail, valida duplicidade no mesmo expert/tenant
    let updatedEmail: string | undefined = undefined;
    if (body.email !== undefined && body.email.trim() !== '') {
      const normalizedEmail = body.email.trim().toLowerCase();
      if (normalizedEmail !== existing.email.toLowerCase()) {
        const duplicate = await prisma.contact.findFirst({
          where: {
            tenantId,
            email: normalizedEmail,
            id: { not: params.id },
          },
        });
        if (duplicate) {
          return NextResponse.json(
            { error: 'Já existe outro contato cadastrado com este e-mail neste ambiente de Expert.' },
            { status: 400 }
          );
        }
        updatedEmail = normalizedEmail;
      }
    }

    // 3. Atualiza os dados cadastrais
    await prisma.contact.update({
      where: { id: params.id },
      data: {
        name: body.name !== undefined ? body.name.trim() : undefined,
        email: updatedEmail,
        phone: body.phone !== undefined ? body.phone.trim() : undefined,
        utmSource: body.utmSource !== undefined ? body.utmSource.trim() : undefined,
        status: body.status !== undefined ? body.status : undefined,
      },
    });

    // 4. Se forneceu lista de tagIds para sincronizar
    if (Array.isArray(body.tagIds)) {
      await prisma.contactTag.deleteMany({
        where: {
          contactId: params.id,
          tagId: { notIn: body.tagIds },
        },
      });

      for (const tId of body.tagIds) {
        await prisma.contactTag.upsert({
          where: {
            contactId_tagId: { contactId: params.id, tagId: tId },
          },
          create: { contactId: params.id, tagId: tId },
          update: {},
        });
      }
    }

    // 5. Retorna o contato completo atualizado
    const updatedContact = await prisma.contact.findUnique({
      where: { id: params.id },
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

    return NextResponse.json({ success: true, contact: updatedContact });
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
