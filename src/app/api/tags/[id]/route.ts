import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { getActiveTenantId } from '@/lib/tenancy';

export async function PUT(
  request: Request,
  { params }: { params: { id: string } }
) {
  try {
    const tenantId = await getActiveTenantId();
    const tagId = params.id;
    const { name, color, description } = await request.json();

    const existingTag = await prisma.tag.findFirst({
      where: { id: tagId, tenantId },
    });

    if (!existingTag) {
      return NextResponse.json({ error: 'Tag não encontrada' }, { status: 404 });
    }

    const updatedTag = await prisma.tag.update({
      where: { id: tagId },
      data: {
        name: name ? name.trim() : existingTag.name,
        color: color || existingTag.color,
        description: description !== undefined ? description : existingTag.description,
      },
    });

    return NextResponse.json({ success: true, tag: updatedTag });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

export async function DELETE(
  request: Request,
  { params }: { params: { id: string } }
) {
  try {
    const tenantId = await getActiveTenantId();
    const tagId = params.id;

    const existingTag = await prisma.tag.findFirst({
      where: { id: tagId, tenantId },
    });

    if (!existingTag) {
      return NextResponse.json({ error: 'Tag não encontrada' }, { status: 404 });
    }

    // Remove vínculos da tag com contatos antes de deletar
    await prisma.contactTag.deleteMany({ where: { tagId } });
    await prisma.tag.delete({ where: { id: tagId } });

    return NextResponse.json({ success: true });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
