import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { getActiveTenantId } from '@/lib/tenancy';
import { PREBUILT_TEMPLATES } from '@/services/email-builder/templates';
import { generateResponsiveEmailHtml } from '@/services/email-builder/generator';

export async function GET() {
  try {
    const tenantId = await getActiveTenantId();

    const customTemplates = await prisma.emailTemplate.findMany({
      where: { tenantId },
      orderBy: { updatedAt: 'desc' },
    });

    return NextResponse.json({
      success: true,
      prebuilt: PREBUILT_TEMPLATES,
      custom: customTemplates,
    });
  } catch (error: any) {
    return NextResponse.json(
      { success: false, error: error.message || 'Falha ao listar templates' },
      { status: 500 }
    );
  }
}

export async function POST(request: Request) {
  try {
    const tenantId = await getActiveTenantId();
    const body = await request.json();

    const { name, subject, contentJson, category } = body;

    if (!name || !contentJson) {
      return NextResponse.json(
        { success: false, error: 'Nome e estrutura JSON são obrigatórios' },
        { status: 400 }
      );
    }

    // Gera o HTML responsivo
    const parsedDoc = typeof contentJson === 'string' ? JSON.parse(contentJson) : contentJson;
    const generatedHtml = generateResponsiveEmailHtml(parsedDoc);

    const template = await prisma.emailTemplate.create({
      data: {
        tenantId,
        name,
        subject: subject || parsedDoc.subject || 'E-mail do Lançamento',
        contentJson: typeof contentJson === 'string' ? contentJson : JSON.stringify(contentJson),
        generatedHtml,
        category: category || 'custom',
      },
    });

    return NextResponse.json({
      success: true,
      template,
    });
  } catch (error: any) {
    return NextResponse.json(
      { success: false, error: error.message || 'Falha ao salvar template' },
      { status: 500 }
    );
  }
}
