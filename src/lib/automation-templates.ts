// Templates e utilitários de compartilhamento via Código para Automações LaunchFlow

export interface AutomationTemplate {
  id: string;
  name: string;
  description: string;
  category: 'Lançamento' | 'Recuperação' | 'Nutrição' | 'Vendas';
  triggerType: string;
  triggerConfig: any;
  nodes: any[];
  edges: any[];
}

export const PRESET_TEMPLATES: AutomationTemplate[] = [
  {
    id: 'meteoric-launch',
    name: 'Lançamento Meteórico (Grupo VIP WhatsApp)',
    description: 'Funil para conduzir leads ao grupo VIP com mensagens de aquecimento, lembrete e abertura de carrinho.',
    category: 'Lançamento',
    triggerType: 'TAG_ADDED',
    triggerConfig: { tagName: 'VIP', tagColor: '#8b5cf6' },
    nodes: [
      {
        id: 'node_1',
        type: 'trigger',
        position: { x: 260, y: 50 },
        data: {
          label: 'Gatilho: Tag "VIP"',
          type: 'trigger',
          subtype: 'TAG_ADDED',
          config: { tagName: 'VIP', tagColor: '#8b5cf6', leadsCount: 0 },
        },
      },
      {
        id: 'node_2',
        type: 'action',
        position: { x: 260, y: 180 },
        data: {
          label: 'WhatsApp: Boas-vindas ao VIP',
          type: 'action',
          subtype: 'SEND_WHATSAPP',
          config: {
            message: 'Fala {{nome}}! 🚀 Seja muito bem-vindo ao grupo VIP oficial do nosso lançamento! Fique atento pois os avisos mais importantes serão enviados aqui.',
          },
        },
      },
      {
        id: 'node_3',
        type: 'delay',
        position: { x: 260, y: 310 },
        data: {
          label: 'Aguardar 24 Horas',
          type: 'delay',
          config: {
            delayHours: 24,
            delayUnit: 'hours',
            cancelCondition: 'PURCHASE_APPROVED',
          },
        },
      },
      {
        id: 'node_4',
        type: 'action',
        position: { x: 260, y: 440 },
        data: {
          label: 'WhatsApp: Oportunidade Liberada',
          type: 'action',
          subtype: 'SEND_WHATSAPP',
          config: {
            message: '{{nome}}, as inscrições foram oficialmente abertas com condição especial para o Grupo VIP! Garanta sua vaga pelo link antes que o lote vire.',
          },
        },
      },
    ],
    edges: [
      { id: 'e1-2', source: 'node_1', target: 'node_2' },
      { id: 'e2-3', source: 'node_2', target: 'node_3' },
      { id: 'e3-4', source: 'node_3', target: 'node_4' },
    ],
  },
  {
    id: 'hotmart-recovery',
    name: 'Recuperação de Vendas Hotmart (Pix e Boleto)',
    description: 'Resgate automático de carrinhos e compras pendentes na Hotmart via WhatsApp instantâneo.',
    category: 'Recuperação',
    triggerType: 'HOTMART_EVENT',
    triggerConfig: { webhookEvent: 'PURCHASE_WAITING_PAYMENT', webhookTag: 'Pix Gerado' },
    nodes: [
      {
        id: 'node_1',
        type: 'trigger',
        position: { x: 260, y: 50 },
        data: {
          label: 'Gatilho: Webhook (Pix Gerado)',
          type: 'trigger',
          subtype: 'HOTMART_EVENT',
          config: {
            webhookEvent: 'PURCHASE_WAITING_PAYMENT',
            webhookTag: 'Pix Gerado',
          },
        },
      },
      {
        id: 'node_2',
        type: 'action',
        position: { x: 260, y: 180 },
        data: {
          label: 'WhatsApp: Envio Código Pix / Boleto',
          type: 'action',
          subtype: 'SEND_WHATSAPP',
          config: {
            message: 'Olá {{nome}}! Notamos que você gerou seu Pix para garantir seu acesso. O código de pagamento foi enviado ao seu e-mail, ou responda aqui caso precise de ajuda!',
          },
        },
      },
      {
        id: 'node_3',
        type: 'delay',
        position: { x: 260, y: 310 },
        data: {
          label: 'Aguardar 2 Horas (Cancela se pagar)',
          type: 'delay',
          config: {
            delayHours: 2,
            delayUnit: 'hours',
            cancelCondition: 'PURCHASE_APPROVED',
          },
        },
      },
      {
        id: 'node_4',
        type: 'condition',
        position: { x: 260, y: 440 },
        data: {
          label: 'Já virou Cliente?',
          type: 'condition',
          subtype: 'CHECK_TAG',
          config: {
            tagName: 'Cliente',
          },
        },
      },
      {
        id: 'node_5',
        type: 'action',
        position: { x: 420, y: 580 },
        data: {
          label: 'WhatsApp: Dúvidas com Pagamento?',
          type: 'action',
          subtype: 'SEND_WHATSAPP',
          config: {
            message: 'Oi {{nome}}, teve alguma dificuldade com a liberação do seu Pix? Posso te ajudar por aqui!',
          },
        },
      },
    ],
    edges: [
      { id: 'e1-2', source: 'node_1', target: 'node_2' },
      { id: 'e2-3', source: 'node_2', target: 'node_3' },
      { id: 'e3-4', source: 'node_3', target: 'node_4' },
      { id: 'e4-5', source: 'node_4', target: 'node_5', sourceHandle: 'false' },
    ],
  },
  {
    id: 'lead-magnet',
    name: 'Entrega de Isca Digital e Boas-Vindas',
    description: 'Entrega imediata de material rico (e-book, aula, checklist) com sequência de valor em seguida.',
    category: 'Nutrição',
    triggerType: 'TAG_ADDED',
    triggerConfig: { tagName: 'Inscrito', tagColor: '#10b981' },
    nodes: [
      {
        id: 'node_1',
        type: 'trigger',
        position: { x: 260, y: 50 },
        data: {
          label: 'Gatilho: Tag "Inscrito"',
          type: 'trigger',
          subtype: 'TAG_ADDED',
          config: { tagName: 'Inscrito', tagColor: '#10b981', leadsCount: 0 },
        },
      },
      {
        id: 'node_2',
        type: 'action',
        position: { x: 260, y: 180 },
        data: {
          label: 'WhatsApp: Link do Material Prometido',
          type: 'action',
          subtype: 'SEND_WHATSAPP',
          config: {
            message: 'Olá {{nome}}! Conforme prometido, aqui está o seu material gratuito para download: [Insira seu Link]',
          },
        },
      },
      {
        id: 'node_3',
        type: 'delay',
        position: { x: 260, y: 310 },
        data: {
          label: 'Aguardar 4 Horas',
          type: 'delay',
          config: {
            delayHours: 4,
            delayUnit: 'hours',
            cancelCondition: 'NONE',
          },
        },
      },
      {
        id: 'node_4',
        type: 'action',
        position: { x: 260, y: 440 },
        data: {
          label: 'WhatsApp: Feedback e Próximo Passo',
          type: 'action',
          subtype: 'SEND_WHATSAPP',
          config: {
            message: 'E aí {{nome}}, deu tempo de conferir o material? Me conta o que achou!',
          },
        },
      },
    ],
    edges: [
      { id: 'e1-2', source: 'node_1', target: 'node_2' },
      { id: 'e2-3', source: 'node_2', target: 'node_3' },
      { id: 'e3-4', source: 'node_3', target: 'node_4' },
    ],
  },
  {
    id: 'flash-offer',
    name: 'Reengajamento de Base (Oferta Relâmpago)',
    description: 'Ativação de leads inativos ou interessados com uma condição única por tempo limitado.',
    category: 'Vendas',
    triggerType: 'TAG_ADDED',
    triggerConfig: { tagName: 'Interessado', tagColor: '#f59e0b' },
    nodes: [
      {
        id: 'node_1',
        type: 'trigger',
        position: { x: 260, y: 50 },
        data: {
          label: 'Gatilho: Tag "Interessado"',
          type: 'trigger',
          subtype: 'TAG_ADDED',
          config: { tagName: 'Interessado', tagColor: '#f59e0b', leadsCount: 0 },
        },
      },
      {
        id: 'node_2',
        type: 'action',
        position: { x: 260, y: 180 },
        data: {
          label: 'WhatsApp: Oferta Exclusiva 24h',
          type: 'action',
          subtype: 'SEND_WHATSAPP',
          config: {
            message: 'Oi {{nome}}! Liberamos uma condição imperdível e exclusiva para você hoje. Válida somente até às 23:59!',
          },
        },
      },
    ],
    edges: [{ id: 'e1-2', source: 'node_1', target: 'node_2' }],
  },
];

// Gera um código portátil compacto a partir de uma automação
export function generateShareCode(automation: {
  id?: string;
  name: string;
  triggerType?: string;
  triggerConfig?: any;
  nodes: any;
  edges: any;
}): string {
  try {
    const rawNodes = typeof automation.nodes === 'string' ? JSON.parse(automation.nodes) : automation.nodes;
    const rawEdges = typeof automation.edges === 'string' ? JSON.parse(automation.edges) : automation.edges;
    const rawTriggerConfig = typeof automation.triggerConfig === 'string' ? JSON.parse(automation.triggerConfig) : automation.triggerConfig;

    const payload = {
      v: 1,
      name: automation.name,
      triggerType: automation.triggerType || 'TAG_ADDED',
      triggerConfig: rawTriggerConfig || {},
      nodes: rawNodes || [],
      edges: rawEdges || [],
    };

    const jsonStr = JSON.stringify(payload);
    // Base64 encoding compatível tanto com browser quanto Node.js
    let b64: string;
    if (typeof Buffer !== 'undefined') {
      b64 = Buffer.from(jsonStr, 'utf-8').toString('base64url');
    } else {
      b64 = btoa(encodeURIComponent(jsonStr)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
    }

    return `LF-${b64}`;
  } catch (err) {
    return automation.id ? `LF-${automation.id}` : 'LF-ERROR';
  }
}

// Decodifica um código de automação compartilhado
export function parseShareCode(code: string): {
  name: string;
  triggerType: string;
  triggerConfig: any;
  nodes: any[];
  edges: any[];
} | null {
  if (!code || typeof code !== 'string') return null;

  const cleanCode = code.trim();
  if (!cleanCode.startsWith('LF-')) return null;

  const token = cleanCode.replace(/^LF-/, '').trim();
  if (!token) return null;

  try {
    let jsonStr = '';
    if (typeof Buffer !== 'undefined') {
      jsonStr = Buffer.from(token, 'base64url').toString('utf-8');
    } else {
      const standardB64 = token.replace(/-/g, '+').replace(/_/g, '/');
      jsonStr = decodeURIComponent(atob(standardB64));
    }

    const parsed = JSON.parse(jsonStr);
    if (parsed && Array.isArray(parsed.nodes) && Array.isArray(parsed.edges)) {
      return {
        name: parsed.name || 'Fluxo Importado',
        triggerType: parsed.triggerType || 'TAG_ADDED',
        triggerConfig: parsed.triggerConfig || {},
        nodes: parsed.nodes,
        edges: parsed.edges,
      };
    }
  } catch {
    // Se falhar a decodificação base64, o código pode ser um ID direto no banco
    return null;
  }

  return null;
}
