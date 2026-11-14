import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { getActiveTenantId } from '@/lib/tenancy';
import { generateResponsiveEmailHtml } from '@/services/email-builder/generator';

export async function GET(
  _request: Request,
  { params }: { params: { id: string } }
) {
  try {
    const tenantId = await getActiveTenantId();
    const template = await prisma.emailTemplate.findFirst({
      where: { id: params.id, tenantId },
    });

    if (!template) {
      return NextResponse.json({ success: false, error: 'Template não encontrado' }, { status: 404 });
    }

    return NextResponse.json({ success: true, template });
  } catch (error: any) {
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}

export async function PUT(
  request: Request,
  { params }: { params: { id: string } }
) {
  try {
    const tenantId = await getActiveTenantId();
    const body = await request.json();

    const existing = await prisma.emailTemplate.findFirst({
      where: { id: params.id, tenantId },
    });

    if (!existing) {
      return NextResponse.json({ success: false, error: 'Template não encontrado' }, { status: 404 });
    }

    const { name, subject, contentJson, category } = body;
    let generatedHtml = existing.generatedHtml;

    if (contentJson) {
      const parsedDoc = typeof contentJson === 'string' ? JSON.parse(contentJson) : contentJson;
      generatedHtml = generateResponsiveEmailHtml(parsedDoc);
    }

    const updated = await prisma.emailTemplate.update({
      where: { id: params.id },
      data: {
        name: name !== undefined ? name : existing.name,
        subject: subject !== undefined ? subject : existing.subject,
        contentJson: contentJson
          ? typeof contentJson === 'string'
            ? contentJson
            : JSON.stringify(contentJson)
          : existing.contentJson,
        generatedHtml,
        category: category !== undefined ? category : existing.category,
      },
    });

    return NextResponse.json({ success: true, template: updated });
  } catch (error: any) {
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}

export async function DELETE(
  _request: Request,
  { params }: { params: { id: string } }
) {
  try {
    const tenantId = await getActiveTenantId();
    const existing = await prisma.emailTemplate.findFirst({
      where: { id: params.id, tenantId },
    });

    if (!existing) {
      return NextResponse.json({ success: false, error: 'Template não encontrado' }, { status: 404 });
    }

    await prisma.emailTemplate.delete({
      where: { id: params.id },
    });

    return NextResponse.json({ success: true, message: 'Template excluído com sucesso' });
  } catch (error: any) {
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}
