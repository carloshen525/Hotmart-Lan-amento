export type WhatsAppProviderType = 'EVOLUTION' | 'META_CLOUD';

export interface SendTextParams {
  tenantId: string;
  contactId?: string;
  phone: string;
  text: string;
  variables?: Record<string, string>;
  metadata?: Record<string, any>;
}

export interface SendMediaParams {
  tenantId: string;
  contactId?: string;
  phone: string;
  mediaType: 'image' | 'video' | 'audio' | 'document' | 'file';
  mediaUrl?: string;
  mediaBase64?: string;
  mediaMimeType?: string;
  mediaFileName?: string;
  caption?: string;
  variables?: Record<string, string>;
  metadata?: Record<string, any>;
}

export interface SendTemplateParams {
  tenantId: string;
  contactId?: string;
  phone: string;
  templateName: string;
  languageCode?: string;
  components?: Array<{
    type: 'header' | 'body' | 'button';
    sub_type?: string;
    index?: string;
    parameters: Array<{
      type: 'text' | 'image' | 'video' | 'document';
      text?: string;
      image?: { link: string };
      video?: { link: string };
      document?: { link: string; filename?: string };
    }>;
  }>;
  variables?: Record<string, string>;
  metadata?: Record<string, any>;
}

export interface ProviderSendResult {
  success: boolean;
  messageId: string;
  provider: WhatsAppProviderType;
  status: 'SENT' | 'DELIVERED' | 'FAILED' | 'PENDING';
  error?: string;
  timestamp?: Date;
  details?: any;
}

export interface ProviderConnectionStatus {
  connected: boolean;
  status: 'CONNECTED' | 'DISCONNECTED' | 'CONNECTING' | 'ERROR';
  phone?: string | null;
  name?: string | null;
  profileName?: string | null;
  profilePicUrl?: string | null;
  qualityRating?: string | null;
  verifiedName?: string | null;
  error?: string | null;
  provider: WhatsAppProviderType;
  details?: any;
}

export interface WhatsAppTemplateItem {
  id: string;
  name: string;
  status: string; // APPROVED, PENDING, REJECTED
  category: string; // MARKETING, UTILITY, AUTHENTICATION
  language: string;
  components: any[];
}

export interface WebhookProcessResult {
  processed: boolean;
  tenantId?: string;
  eventType?: 'MESSAGE_RECEIVED' | 'STATUS_UPDATE' | 'ACCOUNT_UPDATE' | 'UNKNOWN';
  messageId?: string;
  contactPhone?: string;
  contactName?: string;
  content?: string;
  status?: string;
  error?: string;
}

export interface IWhatsAppProvider {
  readonly providerType: WhatsAppProviderType;
  readonly instanceId: string;
  readonly tenantId: string;

  sendText(params: SendTextParams): Promise<ProviderSendResult>;
  sendMedia(params: SendMediaParams): Promise<ProviderSendResult>;
  sendTemplate?(params: SendTemplateParams): Promise<ProviderSendResult>;
  getTemplates?(): Promise<WhatsAppTemplateItem[]>;
  getConnectionStatus(): Promise<ProviderConnectionStatus>;
  getProfile?(): Promise<any>;
  handleWebhook(payload: any, headers?: Record<string, string>): Promise<WebhookProcessResult>;
}
