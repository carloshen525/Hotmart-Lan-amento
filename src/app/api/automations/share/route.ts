import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { generateShareCode, parseShareCode } from '@/lib/automation-templates';

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const code = searchParams.get('code');

    if (!code) {
      return NextResponse.json({ error: 'Código de automação não fornecido' }, { status: 400 });
    }

    // 1. Tenta decodificar o token portátil base64url
    const decoded = parseShareCode(code);
    if (decoded) {
      return NextResponse.json({
        success: true,
        source: 'TOKEN',
        automation: decoded,
      });
    }

    // 2. Se não for token ou se for um ID curto/direto, busca no banco
    const cleanId = code.replace(/^LF-/, '').trim();
    const existing = await prisma.automation.findFirst({
      where: {
        OR: [{ id: cleanId }, { id: code }],
      },
    });

    if (existing) {
      return NextResponse.json({
        success: true,
        source: 'DATABASE',
        automation: {
          name: existing.name,
          triggerType: existing.triggerType,
          triggerConfig: existing.triggerConfig ? JSON.parse(existing.triggerConfig) : {},
          nodes: existing.nodes ? JSON.parse(existing.nodes) : [],
          edges: existing.edges ? JSON.parse(existing.edges) : [],
        },
      });
    }

    return NextResponse.json(
      { error: 'Código de automação inválido ou fluxo não encontrado.' },
      { status: 404 }
    );
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const { automationId } = await request.json();
    if (!automationId) {
      return NextResponse.json({ error: 'ID da automação obrigatório' }, { status: 400 });
    }

    const automation = await prisma.automation.findUnique({
      where: { id: automationId },
    });

    if (!automation) {
      return NextResponse.json({ error: 'Automação não encontrada' }, { status: 404 });
    }

    const shareCode = generateShareCode({
      id: automation.id,
      name: automation.name,
      triggerType: automation.triggerType,
      triggerConfig: automation.triggerConfig,
      nodes: automation.nodes,
      edges: automation.edges,
    });

    return NextResponse.json({
      success: true,
      shareCode,
    });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
