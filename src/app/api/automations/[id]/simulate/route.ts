import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { getActiveTenantId } from '@/lib/tenancy';
import { WorkflowNode, WorkflowEdge } from '@/services/automation/types';

export async function POST(request: Request, { params }: { params: { id: string } }) {
  try {
    const tenantId = await getActiveTenantId();
    const { contactTags = ['Inscrito'], isClient = false, hasGeneratedPix = false } = await request.json();

    const automation = await prisma.automation.findFirst({
      where: { id: params.id, tenantId },
    });

    if (!automation) {
      return NextResponse.json({ error: 'Automação não encontrada' }, { status: 404 });
    }

    const nodes: WorkflowNode[] = JSON.parse(automation.nodes || '[]');
    const edges: WorkflowEdge[] = JSON.parse(automation.edges || '[]');

    const triggerNode = nodes.find((n) => n.data.type === 'trigger') || nodes[0];
    if (!triggerNode) {
      return NextResponse.json({ error: 'Fluxo sem nós definidos' }, { status: 400 });
    }

    // Trajeto simulado
    const steps: Array<{
      nodeId: string;
      label: string;
      type: string;
      action: string;
      result: string;
      details: string;
    }> = [];

    let currentNodes = [triggerNode];
    const visited = new Set<string>();

    while (currentNodes.length > 0) {
      const node = currentNodes.shift()!;
      if (visited.has(node.id)) continue;
      visited.add(node.id);

      const type = node.data.type;
      const subtype = node.data.subtype;
      const config = node.data.config || {};
      let chosenHandle: string | null = null;
      let details = '';

      if (type === 'trigger') {
        details = `Gatilho acionado: ${node.data.label}`;
      } else if (type === 'action') {
        if (subtype === 'SEND_EMAIL') {
          details = `Simulado: Enviar E-mail "${config.subject || 'Assunto'}"`;
        } else if (subtype === 'SEND_WHATSAPP') {
          details = `Simulado: Mensagem WhatsApp para o lead`;
        } else if (subtype === 'ADD_TAG') {
          details = `Simulado: Tag "${config.tagName}" adicionada ao lead`;
        } else if (subtype === 'CANCEL_OTHER_FLOWS') {
          details = `Simulado: Outros fluxos de vendas e cobrança cancelados`;
        } else {
          details = `Ação executada: ${subtype}`;
        }
      } else if (type === 'condition') {
        if (subtype === 'HAS_TAG') {
          const expected = config.tagName;
          const matches = contactTags.includes(expected) || (expected === 'Cliente' && isClient) || (expected === 'Pix Gerado' && hasGeneratedPix);
          chosenHandle = matches ? 'yes' : 'no';
          details = `Condição (Possui Tag "${expected}")? -> ${matches ? 'SIM (Ramo Verde)' : 'NÃO (Ramo Vermelho)'}`;
        } else {
          chosenHandle = 'yes';
          details = `Condição avaliada como SIM`;
        }
      } else if (type === 'delay') {
        details = `Temporizador: Aguardar ${config.days || 1} dias (Condição de cancelamento ativa: ${config.cancelCondition || 'Nenhuma'})`;
      }

      steps.push({
        nodeId: node.id,
        label: node.data.label,
        type,
        action: subtype || type,
        result: 'SUCESSO',
        details,
      });

      // Próximos nós
      let nextEdges: WorkflowEdge[] = [];
      if (type === 'condition' && chosenHandle) {
        nextEdges = edges.filter((e) => e.source === node.id && (e.sourceHandle === chosenHandle || !e.sourceHandle));
      } else {
        nextEdges = edges.filter((e) => e.source === node.id);
      }

      for (const edge of nextEdges) {
        const nextNode = nodes.find((n) => n.id === edge.target);
        if (nextNode && !visited.has(nextNode.id)) {
          currentNodes.push(nextNode);
        }
      }
    }

    return NextResponse.json({
      success: true,
      automationName: automation.name,
      stepsCount: steps.length,
      steps,
    });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
