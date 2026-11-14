export type EmailProviderType = 'SMTP' | 'RESEND' | 'SES' | 'MAILGUN' | 'BREVO';

export interface EmailSettingsData {
  id?: string;
  tenantId: string;
  provider: EmailProviderType;
  smtpHost: string;
  smtpPort: number;
  smtpSecure: boolean;
  smtpUsername: string;
  smtpPassword?: string;
  fromName: string;
  fromEmail: string;
  replyTo?: string | null;
  createdAt?: Date;
  updatedAt?: Date;
}

export interface EmailOptions {
  to: string;
  subject: string;
  html: string;
  text?: string;
  fromName?: string;
  fromEmail?: string;
  replyTo?: string;
  variables?: Record<string, string>;
  contactId?: string;
  metadata?: Record<string, any>;
  immediate?: boolean; // Se true, envia diretamente sem passar pela fila (ex: teste de conexão)
  scheduledAt?: Date;  // Data agendada para envio na fila
}

export interface EmailResult {
  success: boolean;
  messageId?: string;
  queueId?: string;
  provider: string;
  status: 'SENT' | 'FAILED' | 'QUEUED';
  error?: string;
}

export interface VerifyResult {
  success: boolean;
  error?: string;
}
