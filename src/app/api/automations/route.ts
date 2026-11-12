import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { getActiveTenantId } from '@/lib/tenancy';

export async function GET() {
  try {
    const tenantId = await getActiveTenantId();
    if (!tenantId) {
      return NextResponse.json({ automations: [] });
    }

    const automations = await prisma.automation.findMany({
      where: { tenantId },
      include: {
        _count: {
          select: {
            enrollments: true,
            scheduledJobs: true,
          },
        },
      },
      orderBy: { updatedAt: 'desc' },
    });

    return NextResponse.json({ automations });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const tenantId = await getActiveTenantId();
    const { name, description, triggerType, triggerConfig, nodes, edges } = await request.json();

    if (!name) {
      return NextResponse.json({ error: 'Nome da automação é obrigatório' }, { status: 400 });
    }

    const defaultNodes = [
      {
        id: 'node_1',
        type: 'trigger',
        position: { x: 250, y: 50 },
        data: {
          label: 'Gatilho: Tag Inscrito',
          type: 'trigger',
          subtype: triggerType || 'TAG_ADDED',
          config: triggerConfig || { tagName: 'Inscrito' },
        },
      },
      {
        id: 'node_2',
        type: 'action',
        position: { x: 250, y: 180 },
        data: {
          label: 'Enviar E-mail de Boas-vindas',
          type: 'action',
          subtype: 'SEND_EMAIL',
          config: {
            subject: 'Bem-vindo ao Lançamento!',
            content: '<p>Olá {{nome}}, sua inscrição foi confirmada com sucesso!</p>',
          },
        },
      },
    ];

    const defaultEdges = [{ id: 'e1-2', source: 'node_1', target: 'node_2' }];

    const automation = await prisma.automation.create({
      data: {
        tenantId,
        name,
        description,
        status: 'DRAFT',
        triggerType: triggerType || 'TAG_ADDED',
        triggerConfig: JSON.stringify(triggerConfig || {}),
        nodes: JSON.stringify(nodes || defaultNodes),
        edges: JSON.stringify(edges || defaultEdges),
      },
    });

    return NextResponse.json({ success: true, automation }, { status: 201 });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
