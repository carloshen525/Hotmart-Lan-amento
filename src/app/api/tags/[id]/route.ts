import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { getActiveTenantId } from '@/lib/tenancy';

export async function PUT(
  request: Request,
  { params }: { params: { id: string } }
) {
  try {
    const tenantId = await getActiveTenantId();
    if (!tenantId) {
      return NextResponse.json({ error: 'Tenant não autenticado' }, { status: 401 });
    }

    const tagId = params.id;
    const { name, color, description } = await request.json();

    const existingTag = await prisma.tag.findFirst({
      where: { id: tagId, tenantId },
    });

    if (!existingTag) {
      return NextResponse.json({ error: 'Tag não encontrada' }, { status: 404 });
    }

    const newName = name ? name.trim() : existingTag.name;

    // Se mudou o nome, verifica se já existe outra tag com o mesmo nome para este tenant
    if (newName.toLowerCase() !== existingTag.name.toLowerCase()) {
      const duplicate = await prisma.tag.findFirst({
        where: {
          tenantId,
          name: newName,
          id: { not: tagId },
        },
      });

      if (duplicate) {
        return NextResponse.json(
          { error: `Já existe outra tag com o nome "${newName}".` },
          { status: 400 }
        );
      }
    }

    const updatedTag = await prisma.tag.update({
      where: { id: tagId },
      data: {
        name: newName,
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
    if (!tenantId) {
      return NextResponse.json({ error: 'Tenant não autenticado' }, { status: 401 });
    }

    const tagId = params.id;

    const existingTag = await prisma.tag.findFirst({
      where: { id: tagId, tenantId },
    });

    if (!existingTag) {
      return NextResponse.json({ error: 'Tag não encontrada' }, { status: 404 });
    }

    // Conta quantos contatos serão desvinculados
    const countLinked = await prisma.contactTag.count({ where: { tagId } });

    // Remove apenas os vínculos da tag com os contatos, preservando 100% dos leads
    await prisma.contactTag.deleteMany({ where: { tagId } });
    await prisma.tag.delete({ where: { id: tagId } });

    return NextResponse.json({
      success: true,
      message: `Tag "${existingTag.name}" excluída. ${countLinked} vínculo(s) com contatos removido(s). Nenhum lead foi excluído.`,
    });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
