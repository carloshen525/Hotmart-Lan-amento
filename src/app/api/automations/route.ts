import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { getActiveTenantId } from '@/lib/tenancy';
import { parseShareCode } from '@/lib/automation-templates';

export async function GET() {
  try {
    const tenantId = await getActiveTenantId();
    if (!tenantId) {
      return NextResponse.json({ automations: [] });
    }

    // Otimização: Não carregar mídias, mensagens completas ou edges pesadas na listagem.
    // Retorna apenas dados resumidos (id, nome, status, contagem de etapas e leads)
    const rawAutomations = await prisma.automation.findMany({
      where: { tenantId },
      select: {
        id: true,
        name: true,
        description: true,
        status: true,
        triggerType: true,
        targetType: true,
        targetGroupTags: true,
        targetGroupIds: true,
        whatsappInstanceId: true,
        delayBetweenGroups: true,
        useRandomDelay: true,
        updatedAt: true,
        createdAt: true,
        nodes: true,
        _count: {
          select: {
            enrollments: true,
            groupEnrollments: true,
            scheduledJobs: true,
          },
        },
      },
      orderBy: { updatedAt: 'desc' },
    });

    const automations = rawAutomations.map((a) => {
      let stagesCount = 0;
      let mediaCount = 0;
      try {
        if (a.nodes) {
          const parsed = JSON.parse(a.nodes);
          if (Array.isArray(parsed)) {
            stagesCount = parsed.length;
            for (const n of parsed) {
              const blocks = n.data?.config?.blocks;
              if (Array.isArray(blocks)) {
                mediaCount += blocks.filter((b: any) => b.type !== 'text' && (b.mediaUrl || b.mediaFileName)).length;
              } else if (n.data?.config?.mediaUrl || n.data?.config?.mediaType) {
                mediaCount += 1;
              }
              const subNodes = n.data?.subflow?.nodes;
              if (Array.isArray(subNodes)) {
                stagesCount += subNodes.length;
                for (const sn of subNodes) {
                  const sBlocks = sn.data?.config?.blocks;
                  if (Array.isArray(sBlocks)) {
                    mediaCount += sBlocks.filter((b: any) => b.type !== 'text' && (b.mediaUrl || b.mediaFileName)).length;
                  } else if (sn.data?.config?.mediaUrl || sn.data?.config?.mediaType) {
                    mediaCount += 1;
                  }
                }
              }
            }
          }
        }
      } catch {}

      return {
        id: a.id,
        name: a.name,
        description: a.description,
        status: a.status,
        triggerType: a.triggerType,
        targetType: a.targetType || 'INDIVIDUAL',
        targetGroupTags: a.targetGroupTags,
        targetGroupIds: a.targetGroupIds,
        whatsappInstanceId: a.whatsappInstanceId,
        delayBetweenGroups: a.delayBetweenGroups,
        useRandomDelay: a.useRandomDelay,
        updatedAt: a.updatedAt,
        createdAt: a.createdAt,
        stagesCount,
        mediaCount,
        _count: a._count,
      };
    });

    return NextResponse.json({ automations });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const tenantId = await getActiveTenantId();
    const body = await request.json();
    const {
      name,
      description,
      shareCode,
      targetType = 'INDIVIDUAL',
      targetGroupTags,
      targetGroupIds,
      whatsappInstanceId,
      delayBetweenGroups = 30,
      useRandomDelay = true,
      minDelaySeconds = 20,
      maxDelaySeconds = 45,
    } = body;
    let { triggerType, triggerConfig, nodes, edges } = body;

    if (!name) {
      return NextResponse.json({ error: 'Nome da automação é obrigatório' }, { status: 400 });
    }

    // Se informou um código de compartilhamento
    if (shareCode) {
      const decoded = parseShareCode(shareCode);
      if (decoded) {
        triggerType = decoded.triggerType;
        triggerConfig = decoded.triggerConfig;
        nodes = decoded.nodes;
        edges = decoded.edges;
      } else {
        const cleanId = shareCode.replace(/^LF-/, '').trim();
        const existing = await prisma.automation.findFirst({
          where: {
            OR: [{ id: cleanId }, { id: shareCode }],
          },
        });
        if (existing) {
          triggerType = existing.triggerType;
          triggerConfig = existing.triggerConfig ? JSON.parse(existing.triggerConfig) : {};
          nodes = existing.nodes ? JSON.parse(existing.nodes) : [];
          edges = existing.edges ? JSON.parse(existing.edges) : [];
        }
      }
    }

    const defaultIndividualNodes = [
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

    const defaultGroupNodes = [
      {
        id: 'node_1',
        type: 'trigger',
        position: { x: 250, y: 50 },
        data: {
          label: 'Gatilho: Grupos Selecionados',
          type: 'trigger',
          subtype: 'GROUP_TRIGGER',
          config: triggerConfig || { targetTags: targetGroupTags || [] },
        },
      },
      {
        id: 'node_2',
        type: 'whatsapp',
        position: { x: 250, y: 180 },
        data: {
          label: 'Disparo de WhatsApp no Grupo',
          type: 'whatsapp',
          subtype: 'SEND_GROUP_WHATSAPP',
          config: {
            text: 'Olá pessoal! Comunicado importante no grupo.',
            messageType: 'text',
          },
        },
      },
    ];

    const chosenDefaultNodes = targetType === 'GROUP' ? defaultGroupNodes : defaultIndividualNodes;
    const defaultEdges = [{ id: 'e1-2', source: 'node_1', target: 'node_2' }];

    const automation = await prisma.automation.create({
      data: {
        tenantId,
        name,
        description,
        status: 'DRAFT',
        triggerType: triggerType || (targetType === 'GROUP' ? 'GROUP_TRIGGER' : 'TAG_ADDED'),
        triggerConfig: JSON.stringify(triggerConfig || {}),
        targetType,
        targetGroupTags: targetGroupTags ? JSON.stringify(targetGroupTags) : null,
        targetGroupIds: targetGroupIds ? JSON.stringify(targetGroupIds) : null,
        whatsappInstanceId: whatsappInstanceId || null,
        delayBetweenGroups: Number(delayBetweenGroups) || 30,
        useRandomDelay: Boolean(useRandomDelay),
        minDelaySeconds: Number(minDelaySeconds) || 20,
        maxDelaySeconds: Number(maxDelaySeconds) || 45,
        nodes: JSON.stringify(nodes || chosenDefaultNodes),
        edges: JSON.stringify(edges || defaultEdges),
      },
    });

    return NextResponse.json({ success: true, automation }, { status: 201 });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
