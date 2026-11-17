import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { getActiveTenantId } from '@/lib/tenancy';
import { automationEngine } from '@/services/automation/engine';

/**
 * Autenticação por token para a API Pública de Leads
 */
async function resolveTenantFromRequest(request: Request): Promise<string | null> {
  // 1. Tenta autenticação de sessão do painel
  const sessionTenant = await getActiveTenantId();
  if (sessionTenant) return sessionTenant;

  // 2. Extrai token dos headers ou query string
  const authHeader = request.headers.get('authorization') || '';
  const apiKey = request.headers.get('x-api-key') || '';
  const intToken = request.headers.get('x-integration-token') || '';
  const url = new URL(request.url);
  const queryToken = url.searchParams.get('token') || '';

  const rawToken = (
    authHeader.replace(/^Bearer\s+/i, '') ||
    apiKey ||
    intToken ||
    queryToken
  ).trim();

  if (!rawToken) return null;

  // 3. Verifica se o token pertence a alguma integração cadastrada
  const integration = await prisma.checkoutIntegration.findFirst({
    where: {
      OR: [
        { secretKey: rawToken },
        { id: rawToken },
      ],
      status: 'ACTIVE',
    },
    select: { tenantId: true },
  });

  if (integration) return integration.tenantId;

  // 4. Verifica se o token é o Hottok ou token do próprio Tenant
  const tenant = await prisma.tenant.findFirst({
    where: {
      OR: [
        { hotmartHottok: rawToken },
        { id: rawToken },
      ],
    },
    select: { id: true },
  });

  return tenant?.id || null;
}

export async function GET(request: Request) {
  try {
    const tenantId = await resolveTenantFromRequest(request);
    if (!tenantId) {
      return NextResponse.json(
        { error: 'Não autorizado. Forneça o token via cabeçalho Authorization: Bearer <token> ou x-api-key.' },
        { status: 401 }
      );
    }

    const { searchParams } = new URL(request.url);
    const search = searchParams.get('search') || '';
    const limit = Math.min(Number(searchParams.get('limit')) || 50, 100);

    const where: any = { tenantId, status: { not: 'UNSUBSCRIBED' } };
    if (search) {
      where.OR = [
        { name: { contains: search } },
        { email: { contains: search } },
        { phone: { contains: search } },
      ];
    }

    const leads = await prisma.contact.findMany({
      where,
      take: limit,
      orderBy: { createdAt: 'desc' },
      include: {
        tags: {
          include: { tag: true },
        },
      },
    });

    return NextResponse.json({
      success: true,
      total: leads.length,
      leads: leads.map((l) => ({
        id: l.id,
        name: l.name,
        email: l.email,
        phone: l.phone,
        status: l.status,
        tags: l.tags.map((t) => t.tag.name),
        createdAt: l.createdAt,
      })),
    });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const tenantId = await resolveTenantFromRequest(request);
    if (!tenantId) {
      return NextResponse.json(
        { error: 'Não autorizado. Forneça o token via cabeçalho Authorization: Bearer <token> ou x-api-key.' },
        { status: 401 }
      );
    }

    const body = await request.json();
    const {
      name,
      email,
      phone,
      document,
      tags = [],
      targetAutomationId,
      metadata,
      source = 'API Pública',
    } = body;

    // Normalização dos campos
    const cleanEmail = email ? String(email).trim().toLowerCase() : null;
    let cleanPhone = phone ? String(phone).replace(/\D/g, '') : null;
    if (cleanPhone && cleanPhone.length === 10 || cleanPhone?.length === 11) {
      cleanPhone = `55${cleanPhone}`;
    }

    if (!cleanEmail && !cleanPhone) {
      return NextResponse.json(
        { error: 'É obrigatório informar ao menos o email ou telefone do lead.' },
        { status: 400 }
      );
    }

    const leadName = name ? String(name).trim() : 'Lead';

    // 1. Controle de Duplicidade: busca lead existente
    let contact: any = null;

    if (cleanPhone) {
      contact = await prisma.contact.findFirst({
        where: { tenantId, phone: cleanPhone },
      });
    }

    if (!contact && cleanEmail) {
      contact = await prisma.contact.findFirst({
        where: { tenantId, email: cleanEmail },
      });
    }

    // 2. Cria ou Atualiza o Lead
    if (contact) {
      contact = await prisma.contact.update({
        where: { id: contact.id },
        data: {
          name: leadName || contact.name,
          email: cleanEmail || contact.email,
          phone: cleanPhone || contact.phone,
          status: 'ACTIVE',
        },
      });
    } else {
      const emailToUse = cleanEmail || `lead_${Date.now()}_${Math.random().toString(36).substring(2, 6)}@placeholder.local`;
      contact = await prisma.contact.create({
        data: {
          tenantId,
          name: leadName,
          email: emailToUse,
          phone: cleanPhone,
          status: 'ACTIVE',
        },
      });
    }

    // 3. Aplica as Tags solicitadas
    const tagNamesList: string[] = Array.isArray(tags) ? tags : typeof tags === 'string' ? [tags] : [];
    const appliedTags: string[] = [];

    for (const rawTag of tagNamesList) {
      const tagName = String(rawTag).replace(/^#/, '').trim();
      if (!tagName) continue;

      let tag = await prisma.tag.findFirst({
        where: { tenantId, name: tagName },
      });

      if (!tag) {
        tag = await prisma.tag.create({
          data: {
            tenantId,
            name: tagName,
            color: '#10b981',
          },
        });
      }

      await prisma.contactTag.upsert({
        where: {
          contactId_tagId: {
            contactId: contact.id,
            tagId: tag.id,
          },
        },
        create: {
          contactId: contact.id,
          tagId: tag.id,
        },
        update: {},
      });

      appliedTags.push(tag.name);
    }

    // 4. Disparo de Automações
    if (targetAutomationId) {
      automationEngine.enrollContact(targetAutomationId, contact.id, {
        source,
        metadata,
      }).catch((err) => {
        console.error('[API Leads] Erro ao inscrever em automação específica:', err);
      });
    } else if (appliedTags.length > 0) {
      // Dispara o motor de automação (gatilhos de entrada e transições de saída por tag)
      for (const tName of appliedTags) {
        await automationEngine.handleContactTagAdded(tenantId, contact.id, tName).catch((err) => {
          console.error('[API Leads] Erro em handleContactTagAdded:', err);
        });
      }

      // Dispara automações ativas que escutam qualquer uma dessas tags
      const activeAutomations = await prisma.automation.findMany({
        where: {
          tenantId,
          status: 'ACTIVE',
          targetType: 'INDIVIDUAL',
        },
        select: { id: true, nodes: true },
      });

      for (const auto of activeAutomations) {
        let hasTagTrigger = false;
        try {
          const nodes = JSON.parse(auto.nodes || '[]');
          for (const n of nodes) {
            if (n.type === 'tag' || n.type === 'trigger') {
              const cfg = n.data?.config || {};
              const tList: string[] =
                cfg.entryTags || cfg.tagNames || (cfg.tagName ? [cfg.tagName] : (n.data as any)?.tagName ? [(n.data as any).tagName] : []) || [];
              if (tList.some((t) => appliedTags.some((at) => at.toLowerCase() === t.toLowerCase()))) {
                hasTagTrigger = true;
                break;
              }
            }
          }
        } catch {}

        if (hasTagTrigger) {
          automationEngine.enrollContact(auto.id, contact.id, {
            source,
            triggeredByTag: appliedTags[0],
          }).catch((err) => {
            console.error('[API Leads] Erro ao disparar automação por tag:', err);
          });
        }
      }
    }

    return NextResponse.json({
      success: true,
      action: contact ? 'updated' : 'created',
      lead: {
        id: contact.id,
        name: contact.name,
        email: contact.email,
        phone: contact.phone,
        status: contact.status,
        tags: appliedTags,
        createdAt: contact.createdAt,
      },
    }, { status: 201 });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
