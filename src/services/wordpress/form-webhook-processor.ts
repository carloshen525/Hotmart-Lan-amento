import { prisma } from '@/lib/prisma';
import { formService } from './form-service';
import { automationEngine } from '@/services/automation/engine';
import {
  FormFieldCandidate,
  ProcessFormWebhookResult,
  STANDARD_FORM_FIELDS,
} from './types';
import crypto from 'crypto';

export class FormWebhookProcessor {
  /**
   * Normaliza um telefone para o formato padrão com código de país (+55...)
   */
  normalizePhone(rawPhone?: string | null): string | undefined {
    if (!rawPhone) return undefined;
    const digits = rawPhone.replace(/\D/g, '');
    if (!digits) return undefined;

    // Se já começa com DDI 55 e tem 12 ou 13 dígitos
    if (digits.startsWith('55') && (digits.length === 12 || digits.length === 13)) {
      return `+${digits}`;
    }

    // Se tem 10 ou 11 dígitos (DDD + número), assume Brasil (+55)
    if (digits.length === 10 || digits.length === 11) {
      return `+55${digits}`;
    }

    // Caso já tenha o sinal de mais no início original
    if (rawPhone.trim().startsWith('+')) {
      return `+${digits}`;
    }

    return digits.length >= 8 ? `+${digits}` : undefined;
  }

  /**
   * Achata payloads complexos (como form_fields[nome] ou objetos aninhados do Elementor)
   */
  flattenPayload(data: any): Record<string, any> {
    const flat: Record<string, any> = {};

    if (!data || typeof data !== 'object') {
      return flat;
    }

    const recurse = (obj: any, prefix = '') => {
      for (const key of Object.keys(obj)) {
        const val = obj[key];
        const fullKey = prefix ? `${prefix}.${key}` : key;

        if (val !== null && typeof val === 'object' && !Array.isArray(val)) {
          recurse(val, fullKey);
        } else {
          flat[fullKey] = val;

          // Extrai chave interna de form_fields[...] ou fields[...]
          const bracketMatch = key.match(/^(?:form_fields|fields)\[(.*?)\]$/);
          if (bracketMatch && bracketMatch[1]) {
            const innerKey = bracketMatch[1];
            if (flat[innerKey] === undefined) {
              flat[innerKey] = val;
            }
          }

          // Se a chave direta ainda não existe no flat
          if (flat[key] === undefined) {
            flat[key] = val;
          }
        }
      }
    };

    recurse(data);

    // Também combina com as chaves de primeiro nível para acesso direto
    return { ...data, ...flat };
  }

  /**
   * Extrai parâmetros UTM da URL da página caso não venham explicitamente nos campos
   */
  extractUtmFromUrl(urlStr?: string): Record<string, string> {
    const utms: Record<string, string> = {};
    if (!urlStr) return utms;

    try {
      const parsedUrl = new URL(urlStr.includes('://') ? urlStr : `https://${urlStr}`);
      const params = parsedUrl.searchParams;
      if (params.get('utm_source')) utms.utmSource = params.get('utm_source')!;
      if (params.get('utm_medium')) utms.utmMedium = params.get('utm_medium')!;
      if (params.get('utm_campaign')) utms.utmCampaign = params.get('utm_campaign')!;
      if (params.get('utm_content')) utms.utmContent = params.get('utm_content')!;
      if (params.get('utm_term')) utms.utmTerm = params.get('utm_term')!;
    } catch {}

    return utms;
  }

  /**
   * Mapeia os campos brutos do formulário para os campos padrão do LaunchFlow
   */
  mapFields(
    rawFlat: Record<string, any>,
    userMapping: Record<string, string> = {}
  ): Record<string, any> {
    const mapped: Record<string, any> = {};

    // 1. Aplica mapeamentos manuais configurados pelo usuário
    for (const [standardKey, payloadKey] of Object.entries(userMapping)) {
      if (payloadKey && rawFlat[payloadKey] !== undefined && rawFlat[payloadKey] !== '') {
        mapped[standardKey] = rawFlat[payloadKey];
      }
    }

    // 2. Para os campos ainda não mapeados, aplica reconhecimento heurístico automático
    for (const field of STANDARD_FORM_FIELDS) {
      if (mapped[field.key] !== undefined && mapped[field.key] !== '') {
        continue;
      }

      // Procura primeiro correspondência exata ou em aliases
      for (const alias of field.aliases) {
        if (rawFlat[alias] !== undefined && rawFlat[alias] !== '') {
          mapped[field.key] = rawFlat[alias];
          break;
        }

        // Tenta também insensível a maiúsculas/minúsculas
        const lowerAlias = alias.toLowerCase();
        const foundKey = Object.keys(rawFlat).find(
          (k) => k.toLowerCase() === lowerAlias || k.toLowerCase().endsWith(`[${lowerAlias}]`)
        );
        if (foundKey && rawFlat[foundKey] !== undefined && rawFlat[foundKey] !== '') {
          mapped[field.key] = rawFlat[foundKey];
          break;
        }
      }
    }

    // 3. Fallbacks inteligentes:
    // Se não houver nome completo, mas houver primeiro nome
    if (!mapped.name && mapped.firstName) {
      mapped.name = String(mapped.firstName).trim();
    }
    // Se não houver primeiro nome, mas houver nome completo
    if (!mapped.firstName && mapped.name) {
      const parts = String(mapped.name).trim().split(/\s+/);
      mapped.firstName = parts[0] || '';
    }

    // Se houver URL da página mas faltarem UTMs, extrai da querystring da URL
    if (mapped.pageUrl) {
      const utmsFromUrl = this.extractUtmFromUrl(String(mapped.pageUrl));
      if (!mapped.utmSource && utmsFromUrl.utmSource) mapped.utmSource = utmsFromUrl.utmSource;
      if (!mapped.utmMedium && utmsFromUrl.utmMedium) mapped.utmMedium = utmsFromUrl.utmMedium;
      if (!mapped.utmCampaign && utmsFromUrl.utmCampaign) mapped.utmCampaign = utmsFromUrl.utmCampaign;
      if (!mapped.utmContent && utmsFromUrl.utmContent) mapped.utmContent = utmsFromUrl.utmContent;
      if (!mapped.utmTerm && utmsFromUrl.utmTerm) mapped.utmTerm = utmsFromUrl.utmTerm;
    }

    return mapped;
  }

  /**
   * Processa o webhook de inscrição de formulário (Elementor / WordPress)
   */
  async process(options: {
    integrationId: string;
    payload: any;
    headers?: Record<string, string>;
    querySecret?: string;
    ipAddress?: string;
    userAgent?: string;
    simulated?: boolean;
    forceRealTest?: boolean;
  }): Promise<ProcessFormWebhookResult> {
    await formService.ensureTables();

    const {
      integrationId,
      payload,
      headers = {},
      querySecret,
      ipAddress,
      userAgent,
      simulated = false,
      forceRealTest = false,
    } = options;

    // 1. Busca a integração exclusiva pelo ID
    const integration = await prisma.formIntegration.findUnique({
      where: { id: integrationId },
      include: {
        tenant: true,
        integrationTags: {
          include: { tag: true },
        },
      },
    }).catch(async () => {
      // Fallback para query direta
      const rows = (await prisma.$queryRawUnsafe(
        `SELECT * FROM form_integrations WHERE id = ? LIMIT 1;`,
        integrationId
      ).catch(() => [])) as any[];
      if (!rows || rows.length === 0) return null;
      const r = rows[0];
      const tags = (await prisma.$queryRawUnsafe(
        `SELECT fit.tag_id, t.name, t.color FROM form_integration_tags fit
         JOIN Tag t ON t.id = fit.tag_id WHERE fit.integration_id = ?;`,
        r.id
      ).catch(() => [])) as any[];
      const tenant = await prisma.tenant.findUnique({ where: { id: r.tenant_id } });
      return {
        ...r,
        tenantId: r.tenant_id,
        targetAutomationId: r.target_automation_id,
        allowReentry: r.allow_reentry,
        fieldMapping: r.field_mapping,
        secretKey: r.secret_key,
        tenant,
        integrationTags: tags.map((t) => ({ tag: { name: t.name, color: t.color } })),
      };
    });

    if (!integration) {
      return {
        success: false,
        tagsApplied: [],
        automationsTriggered: [],
        actionSummary: 'Integração de formulário não encontrada para o ID fornecido.',
        error: 'Integração inexistente ou ID inválido',
      };
    }

    if (integration.status === 'INACTIVE' && !simulated && !forceRealTest) {
      return {
        success: false,
        integrationId: integration.id,
        tagsApplied: [],
        automationsTriggered: [],
        actionSummary: 'Esta integração está pausada / inativa.',
        error: 'Integração inativa',
      };
    }

    // 2. Validação de Segurança (Chave secreta quando configurada)
    if (integration.secretKey && integration.secretKey.trim() !== '') {
      const headerSecret =
        headers['x-webhook-secret'] ||
        headers['x-elementor-secret'] ||
        headers['webhook-secret'] ||
        headers['authorization']?.replace(/^Bearer\s+/i, '');

      const providedSecret = headerSecret || querySecret;

      // Se for teste do painel da LaunchFlow, aceita com validação
      const isInternalTesting = simulated || forceRealTest;

      if (!isInternalTesting && providedSecret && providedSecret.trim() !== integration.secretKey.trim()) {
        return {
          success: false,
          integrationId: integration.id,
          tagsApplied: [],
          automationsTriggered: [],
          actionSummary: 'Chave secreta de autenticação inválida.',
          error: 'Chave secreta não confere (401 Unauthorized)',
        };
      }
    }

    // 3. Salva payload de exemplo para facilitar o mapeamento visual no painel
    await formService.saveSamplePayload(integration.id, payload).catch(() => {});

    // 4. Achata e mapeia campos
    const flat = this.flattenPayload(payload);

    let userMapping: Record<string, string> = {};
    try {
      if (integration.fieldMapping) {
        userMapping =
          typeof integration.fieldMapping === 'string'
            ? JSON.parse(integration.fieldMapping)
            : integration.fieldMapping;
      }
    } catch {}

    const mapped = this.mapFields(flat, userMapping);

    // 5. Validação dos campos essenciais
    const email = mapped.email ? String(mapped.email).toLowerCase().trim() : '';
    const name = mapped.name ? String(mapped.name).trim() : 'Lead WordPress';
    const phone = this.normalizePhone(mapped.phone);

    if (!email || !email.includes('@')) {
      const errorMsg = 'E-mail do lead não foi encontrado ou está em formato inválido no formulário.';
      // Registra evento de falha
      if (!simulated) {
        await this.logEvent({
          tenantId: integration.tenantId,
          integrationId: integration.id,
          status: 'FAILED',
          payload,
          parsedData: mapped,
          errorMessage: errorMsg,
          ipAddress,
          userAgent,
        });
      }

      return {
        success: false,
        integrationId: integration.id,
        parsedFields: mapped,
        tagsApplied: [],
        automationsTriggered: [],
        actionSummary: errorMsg,
        error: errorMsg,
      };
    }

    // 6. MODO SIMULAÇÃO (Sem alterar o banco de contatos e sem disparar mensagens)
    if (simulated && !forceRealTest) {
      const prospectiveTags = (integration.integrationTags || []).map(
        (it: any) => it.tag?.name || it.name
      ).filter(Boolean);

      const prospectiveAutomations: string[] = [];
      if (integration.targetAutomationId) {
        const auto = await prisma.automation.findUnique({
          where: { id: integration.targetAutomationId },
        }).catch(() => null);
        if (auto) prospectiveAutomations.push(auto.name);
      }

      return {
        success: true,
        simulated: true,
        integrationId: integration.id,
        contactEmail: email,
        contactName: name,
        contactPhone: phone,
        parsedFields: mapped,
        tagsApplied: prospectiveTags,
        automationsTriggered: prospectiveAutomations,
        actionSummary: `[SIMULAÇÃO BEM-SUCEDIDA] Campos interpretados com sucesso. O contato ${email} seria cadastrado e receberia ${prospectiveTags.length} tag(s).`,
      };
    }

    // 7. CADASTRO / ATUALIZAÇÃO NO CRM COM ISOLAMENTO DE EXPERT (TENANT)
    const tenantId = integration.tenantId;

    const existingContact = await prisma.contact.findUnique({
      where: {
        tenantId_email: {
          tenantId,
          email,
        },
      },
    }).catch(() => null);

    const isNewContact = !existingContact;
    let contact: any;

    if (isNewContact) {
      contact = await prisma.contact.create({
        data: {
          tenantId,
          name,
          email,
          phone: phone || undefined,
          utmSource: mapped.utmSource || 'wordpress_elementor',
          utmMedium: mapped.utmMedium || undefined,
          utmCampaign: mapped.utmCampaign || undefined,
          utmContent: mapped.utmContent || undefined,
          utmTerm: mapped.utmTerm || undefined,
          consentGiven: Boolean(mapped.consent ?? true),
          status: 'ACTIVE',
        },
      });
    } else {
      // Atualiza sem sobrescrever dados válidos com campos vazios
      const updateData: any = {
        updatedAt: new Date(),
      };
      if (name && name !== 'Lead WordPress') {
        updateData.name = name;
      }
      if (phone && !existingContact.phone) {
        updateData.phone = phone;
      }
      if (mapped.utmSource && !existingContact.utmSource) {
        updateData.utmSource = mapped.utmSource;
      }
      if (mapped.utmCampaign && !existingContact.utmCampaign) {
        updateData.utmCampaign = mapped.utmCampaign;
      }
      if (mapped.consent !== undefined) {
        updateData.consentGiven = Boolean(mapped.consent);
      }

      contact = await prisma.contact.update({
        where: { id: existingContact.id },
        data: updateData,
      });
    }

    // 8. Aplicação automática das Tags configuradas
    const tagsApplied: string[] = [];
    const rawTags = (integration.integrationTags || []).map((it: any) => it.tag?.name).filter(Boolean);

    for (const tagName of rawTags) {
      try {
        let tag = await prisma.tag.findUnique({
          where: { tenantId_name: { tenantId, name: tagName } },
        });
        if (!tag) {
          tag = await prisma.tag.create({
            data: { tenantId, name: tagName, color: '#0ea5e9' },
          });
        }

        await prisma.contactTag.upsert({
          where: { contactId_tagId: { contactId: contact.id, tagId: tag.id } },
          create: { contactId: contact.id, tagId: tag.id },
          update: {},
        });

        tagsApplied.push(tagName);

        // Dispara gatilho do motor de automação por adição de tag
        await automationEngine.handleContactTagAdded(tenantId, contact.id, tagName).catch(() => {});
      } catch (err: any) {
        console.error(`Erro ao aplicar tag ${tagName}:`, err);
      }
    }

    // 9. Acionamento direto de automação se configurada na integração
    const automationsTriggered: string[] = [];
    if (integration.targetAutomationId) {
      try {
        const allowReentry = integration.allowReentry !== 'NEVER';
        if (allowReentry || isNewContact) {
          await automationEngine.enrollContact(integration.targetAutomationId, contact.id);
          const auto = await prisma.automation.findUnique({
            where: { id: integration.targetAutomationId },
          }).catch(() => null);
          if (auto) automationsTriggered.push(auto.name);
        }
      } catch (err: any) {
        console.error(`Erro ao matricular contato na automação ${integration.targetAutomationId}:`, err);
      }
    }

    // 10. Atualiza estatísticas da integração
    try {
      if ((prisma as any).formIntegration) {
        await (prisma as any).formIntegration.update({
          where: { id: integration.id },
          data: {
            totalEvents: { increment: 1 },
            newContacts: isNewContact ? { increment: 1 } : undefined,
            updatedContacts: !isNewContact ? { increment: 1 } : undefined,
            lastEventAt: new Date(),
          },
        });
      } else {
        await prisma.$executeRawUnsafe(
          `UPDATE form_integrations
           SET total_events = total_events + 1,
               ${isNewContact ? 'new_contacts = new_contacts + 1,' : 'updated_contacts = updated_contacts + 1,'}
               last_event_at = datetime('now'),
               updated_at = datetime('now')
           WHERE id = ?;`,
          integration.id
        );
      }
    } catch {}

    // 11. Registra log detalhado do evento no histórico
    await this.logEvent({
      tenantId,
      integrationId: integration.id,
      status: 'PROCESSED',
      payload,
      parsedData: mapped,
      contactId: contact.id,
      contactEmail: contact.email,
      contactName: contact.name,
      contactPhone: contact.phone,
      tagsApplied,
      automationsTriggered,
      ipAddress,
      userAgent,
    });

    const actionSummary = isNewContact
      ? `Novo lead criado com sucesso (${contact.email}). Tags aplicadas: ${tagsApplied.join(', ') || 'nenhuma'}.`
      : `Lead existente atualizado (${contact.email}). Tags aplicadas: ${tagsApplied.join(', ') || 'nenhuma'}.`;

    return {
      success: true,
      integrationId: integration.id,
      contactId: contact.id,
      isNewContact,
      contactEmail: contact.email,
      contactName: contact.name,
      contactPhone: contact.phone,
      parsedFields: mapped,
      tagsApplied,
      automationsTriggered,
      actionSummary,
    };
  }

  /**
   * Registra log de evento no banco com proteção de dados
   */
  private async logEvent(data: {
    tenantId: string;
    integrationId?: string;
    status: 'PROCESSED' | 'FAILED' | 'SIMULATED';
    payload: any;
    parsedData?: any;
    contactId?: string;
    contactEmail?: string;
    contactName?: string;
    contactPhone?: string;
    tagsApplied?: string[];
    automationsTriggered?: string[];
    errorMessage?: string;
    ipAddress?: string;
    userAgent?: string;
  }) {
    try {
      const payloadStr = JSON.stringify(data.payload);
      const parsedDataStr = data.parsedData ? JSON.stringify(data.parsedData) : null;
      const tagsAppliedStr = data.tagsApplied ? JSON.stringify(data.tagsApplied) : null;
      const automationsTriggeredStr = data.automationsTriggered
        ? JSON.stringify(data.automationsTriggered)
        : null;

      if ((prisma as any).formWebhookEvent) {
        await (prisma as any).formWebhookEvent.create({
          data: {
            id: crypto.randomUUID(),
            tenantId: data.tenantId,
            integrationId: data.integrationId || null,
            status: data.status,
            payload: payloadStr,
            parsedData: parsedDataStr,
            contactId: data.contactId || null,
            contactEmail: data.contactEmail || null,
            contactName: data.contactName || null,
            contactPhone: data.contactPhone || null,
            tagsApplied: tagsAppliedStr,
            automationsTriggered: automationsTriggeredStr,
            errorMessage: data.errorMessage || null,
            ipAddress: data.ipAddress || null,
            userAgent: data.userAgent || null,
          },
        });
      } else {
        await prisma.$executeRawUnsafe(
          `INSERT INTO form_webhook_events
           (id, tenant_id, integration_id, status, payload, parsed_data, contact_id, contact_email, contact_name, contact_phone, tags_applied, automations_triggered, error_message, ip_address, user_agent, created_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'));`,
          crypto.randomUUID(),
          data.tenantId,
          data.integrationId || null,
          data.status,
          payloadStr,
          parsedDataStr,
          data.contactId || null,
          data.contactEmail || null,
          data.contactName || null,
          data.contactPhone || null,
          tagsAppliedStr,
          automationsTriggeredStr,
          data.errorMessage || null,
          data.ipAddress || null,
          data.userAgent || null
        );
      }
    } catch (err) {
      console.error('Erro ao registrar log de form webhook:', err);
    }
  }
}

export const formWebhookProcessor = new FormWebhookProcessor();
