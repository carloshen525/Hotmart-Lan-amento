import { prisma } from '@/lib/prisma';
import { SendEmailParams, SendResult } from './types';

export class EmailProviderService {
  private apiKey: string;
  private defaultFrom: string;

  constructor() {
    this.apiKey = process.env.RESEND_API_KEY || '';
    this.defaultFrom = process.env.EMAIL_FROM || 'suporte@expertlaunch.com.br';
  }

  isConfigured(): boolean {
    return Boolean(this.apiKey);
  }

  async send(params: SendEmailParams): Promise<SendResult> {
    // Interpolação de variáveis: {{nome}}, {{email}}
    let processedContent = params.content;
    if (params.variables) {
      for (const [key, value] of Object.entries(params.variables)) {
        processedContent = processedContent.replace(new RegExp(`{{${key}}}`, 'g'), value);
      }
    }

    // Rodapé de opt-out LGPD
    const appUrl = process.env.APP_URL || 'http://localhost:3000';
    const unsubscribeLink = `${appUrl}/api/contacts/unsubscribe?email=${encodeURIComponent(params.email)}&tenant=${params.tenantId}`;
    const footerHtml = `
      <div style="margin-top: 32px; padding-top: 16px; border-top: 1px solid #e2e8f0; font-size: 12px; color: #64748b; text-align: center;">
        <p>Você recebeu este e-mail porque se cadastrou em nossa lista de novidades.</p>
        <p><a href="${unsubscribeLink}" style="color: #6366f1; text-decoration: underline;">Clique aqui para cancelar o recebimento</a> de nossas mensagens a qualquer momento.</p>
      </div>
    `;

    const fullHtml = `
      <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; max-width: 600px; margin: 0 auto; padding: 24px; color: #1e293b; line-height: 1.6;">
        ${processedContent}
        ${footerHtml}
      </div>
    `;

    if (!this.isConfigured()) {
      // Fallback para log no banco
      const log = await prisma.messageLog.create({
        data: {
          tenantId: params.tenantId,
          contactId: params.contactId,
          channel: 'EMAIL',
          provider: 'SIMULATED',
          recipient: params.email,
          subject: params.subject,
          content: fullHtml,
          status: 'DELIVERED',
          costEstimate: 0.001,
          externalMessageId: `sim_email_${Date.now()}`,
          deliveredAt: new Date(),
        },
      });

      return {
        success: true,
        messageId: log.id,
        provider: 'SIMULATED',
        status: 'DELIVERED',
        costEstimate: 0.001,
      };
    }

    try {
      const response = await fetch('https://api.resend.com/emails', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${this.apiKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          from: this.defaultFrom,
          to: [params.email],
          subject: params.subject,
          html: fullHtml,
        }),
      });

      const data = await response.json();

      if (!response.ok) {
        const errorMsg = data?.message || 'Falha ao enviar e-mail via Resend';
        await prisma.messageLog.create({
          data: {
            tenantId: params.tenantId,
            contactId: params.contactId,
            channel: 'EMAIL',
            provider: 'RESEND',
            recipient: params.email,
            subject: params.subject,
            content: fullHtml,
            status: 'FAILED',
            error: errorMsg,
          },
        });

        return {
          success: false,
          messageId: '',
          provider: 'RESEND',
          status: 'FAILED',
          error: errorMsg,
        };
      }

      const log = await prisma.messageLog.create({
        data: {
          tenantId: params.tenantId,
          contactId: params.contactId,
          channel: 'EMAIL',
          provider: 'RESEND',
          recipient: params.email,
          subject: params.subject,
          content: fullHtml,
          status: 'SENT',
          externalMessageId: data.id,
          costEstimate: 0.001,
        },
      });

      return {
        success: true,
        messageId: log.id,
        provider: 'RESEND',
        status: 'SENT',
      };
    } catch (err: any) {
      return {
        success: false,
        messageId: '',
        provider: 'RESEND',
        status: 'FAILED',
        error: err.message,
      };
    }
  }
}
