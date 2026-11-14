export interface SendWhatsAppParams {
  tenantId: string;
  contactId: string;
  phone: string;
  whatsappInstanceId?: string;
  senderPhone?: string;
  templateName?: string;
  text?: string;
  messageType?: 'text' | 'image' | 'video' | 'audio';
  mediaUrl?: string;
  mediaBase64?: string;
  mediaMimeType?: string;
  mediaFileName?: string;
  caption?: string;
  variables?: Record<string, string>;
}

export interface SendEmailParams {
  tenantId: string;
  contactId: string;
  email: string;
  subject: string;
  content: string; // HTML ou texto
  variables?: Record<string, string>;
}

export interface SendResult {
  success: boolean;
  messageId: string;
  provider: string;
  status: 'SENT' | 'DELIVERED' | 'FAILED';
  error?: string;
  costEstimate?: number;
}

export interface IMessageService {
  sendWhatsApp(params: SendWhatsAppParams): Promise<SendResult>;
  sendEmail(params: SendEmailParams): Promise<SendResult>;
}
