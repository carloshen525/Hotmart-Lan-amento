export type FormPlatformId =
  | 'ELEMENTOR'
  | 'WORDPRESS'
  | 'CONTACT_FORM_7'
  | 'WPFORMS'
  | 'CUSTOM';

export interface FormFieldCandidate {
  key: string;
  label: string;
  description: string;
  required?: boolean;
  aliases: string[];
}

export const STANDARD_FORM_FIELDS: FormFieldCandidate[] = [
  {
    key: 'name',
    label: 'Nome Completo',
    description: 'Nome completo ou principal do lead',
    required: true,
    aliases: ['name', 'nome', 'full_name', 'nome_completo', 'seu_nome', 'first_name', 'form_fields[name]', 'fields[name]'],
  },
  {
    key: 'firstName',
    label: 'Primeiro Nome',
    description: 'Primeiro nome para personalização em mensagens',
    aliases: ['first_name', 'primeiro_nome', 'fname'],
  },
  {
    key: 'email',
    label: 'E-mail',
    description: 'E-mail principal do contato',
    required: true,
    aliases: ['email', 'e-mail', 'mail', 'seu_email', 'form_fields[email]', 'fields[email]'],
  },
  {
    key: 'phone',
    label: 'Telefone / WhatsApp',
    description: 'Número de telefone para disparos no WhatsApp',
    aliases: ['phone', 'telefone', 'whatsapp', 'celular', 'wpp', 'tel', 'mobile', 'form_fields[phone]', 'form_fields[telefone]', 'fields[phone]'],
  },
  {
    key: 'utmSource',
    label: 'UTM Source (Origem)',
    description: 'Origem do tráfego (ex: instagram_ads, google, organico)',
    aliases: ['utm_source', 'source', 'origem', 'src', 'form_fields[utm_source]'],
  },
  {
    key: 'utmMedium',
    label: 'UTM Medium (Mídia)',
    description: 'Meio de marketing (ex: cpc, stories, feed)',
    aliases: ['utm_medium', 'medium', 'meio', 'form_fields[utm_medium]'],
  },
  {
    key: 'utmCampaign',
    label: 'UTM Campaign (Campanha)',
    description: 'Nome da campanha de captação',
    aliases: ['utm_campaign', 'campaign', 'campanha', 'form_fields[utm_campaign]'],
  },
  {
    key: 'utmContent',
    label: 'UTM Content (Conteúdo)',
    description: 'Variação do anúncio ou criativo',
    aliases: ['utm_content', 'content', 'conteudo', 'form_fields[utm_content]'],
  },
  {
    key: 'utmTerm',
    label: 'UTM Term (Termo/Palavra-chave)',
    description: 'Palavra-chave da busca ou público alvo',
    aliases: ['utm_term', 'term', 'termo', 'form_fields[utm_term]'],
  },
  {
    key: 'pageUrl',
    label: 'URL da Página',
    description: 'Endereço da landing page onde o lead se cadastrou',
    aliases: ['page_url', 'url', 'referrer', 'form_url', 'page'],
  },
  {
    key: 'formId',
    label: 'ID do Formulário',
    description: 'Identificador do elemento no Elementor / WordPress',
    aliases: ['form_id', 'formId', 'id'],
  },
  {
    key: 'formName',
    label: 'Nome do Formulário',
    description: 'Nome legível do formulário',
    aliases: ['form_name', 'formName'],
  },
  {
    key: 'consent',
    label: 'Consentimento (LGPD)',
    description: 'Aceite de termos e recebimento de mensagens',
    aliases: ['consent', 'consentimento', 'aceite', 'lgpd', 'terms'],
  },
];

export interface FormIntegrationDTO {
  id?: string;
  tenantId: string;
  name: string;
  platform?: FormPlatformId;
  status?: 'ACTIVE' | 'INACTIVE';
  webhookUrl?: string;
  secretKey?: string;
  allowReentry?: 'ALWAYS' | 'NEVER';
  targetAutomationId?: string | null;
  fieldMapping?: Record<string, string>;
  samplePayload?: Record<string, any>;
  tagIds?: string[];
  customId?: string;
}

export interface ProcessFormWebhookResult {
  success: boolean;
  integrationId?: string;
  contactId?: string;
  isNewContact?: boolean;
  contactEmail?: string;
  contactName?: string;
  contactPhone?: string;
  tagsApplied: string[];
  automationsTriggered: string[];
  actionSummary: string;
  error?: string;
  simulated?: boolean;
  parsedFields?: Record<string, any>;
}
