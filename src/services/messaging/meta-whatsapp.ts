import { prisma } from '@/lib/prisma';
import { SendWhatsAppParams, SendResult } from './types';

export class MetaWhatsAppService {
  private token: string;
  private phoneNumberId: string;

  constructor() {
    this.token = process.env.META_WHATSAPP_TOKEN || '';
    this.phoneNumberId = process.env.META_WHATSAPP_PHONE_NUMBER_ID || '';
  }

  isConfigured(): boolean {
    return Boolean(this.token && this.phoneNumberId);
  }

  async send(params: SendWhatsAppParams): Promise<SendResult> {
    if (!this.isConfigured()) {
      return {
        success: false,
        messageId: '',
        provider: 'META_CLOUD_API',
        status: 'FAILED',
        error: 'Credenciais da Meta Cloud API não configuradas no arquivo .env (META_WHATSAPP_TOKEN / PHONE_NUMBER_ID)',
      };
    }

    try {
      // Limpeza do número de telefone internacional (ex: +5511999998888 -> 5511999998888)
      const cleanPhone = params.phone.replace(/\D/g, '');

      // Payload da Meta Cloud API v21.0
      let body: any;

      if (params.templateName) {
        // Envio de Template Oficial
        body = {
          messaging_product: 'whatsapp',
          to: cleanPhone,
          type: 'template',
          template: {
            name: params.templateName,
            language: { code: 'pt_BR' },
            components: params.variables
              ? [
                  {
                    type: 'body',
                    parameters: Object.values(params.variables).map((val) => ({
                      type: 'text',
                      text: val,
                    })),
                  },
                ]
              : undefined,
          },
        };
      } else {
        // Envio de mensagem de texto (requer janela de 24h aberta pelo cliente)
        body = {
          messaging_product: 'whatsapp',
          recipient_type: 'individual',
          to: cleanPhone,
          type: 'text',
          text: {
            preview_url: true,
            body: params.text || '',
          },
        };
      }

      const response = await fetch(
        `https://graph.facebook.com/v21.0/${this.phoneNumberId}/messages`,
        {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${this.token}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify(body),
        }
      );

      const data = await response.json();

      if (!response.ok) {
        const errorMsg = data?.error?.message || 'Falha na API da Meta';
        await prisma.messageLog.create({
          data: {
            tenantId: params.tenantId,
            contactId: params.contactId,
            channel: 'WHATSAPP',
            provider: 'META_CLOUD_API',
            recipient: params.phone,
            content: params.text || params.templateName || '',
            status: 'FAILED',
            error: errorMsg,
          },
        });

        return {
          success: false,
          messageId: '',
          provider: 'META_CLOUD_API',
          status: 'FAILED',
          error: errorMsg,
        };
      }

      const externalId = data?.messages?.[0]?.id || `meta_${Date.now()}`;

      const log = await prisma.messageLog.create({
        data: {
          tenantId: params.tenantId,
          contactId: params.contactId,
          channel: 'WHATSAPP',
          provider: 'META_CLOUD_API',
          recipient: params.phone,
          templateName: params.templateName,
          content: params.text || `Template: ${params.templateName}`,
          status: 'SENT',
          externalMessageId: externalId,
          costEstimate: 0.0625, // Meta Marketing conversation fee
        },
      });

      return {
        success: true,
        messageId: log.id,
        provider: 'META_CLOUD_API',
        status: 'SENT',
      };
    } catch (err: any) {
      return {
        success: false,
        messageId: '',
        provider: 'META_CLOUD_API',
        status: 'FAILED',
        error: err.message,
      };
    }
  }
}
