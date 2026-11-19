import { prisma } from '@/lib/prisma';
import {
  IWhatsAppProvider,
  WhatsAppProviderType,
  SendTextParams,
  SendMediaParams,
  SendTemplateParams,
  ProviderSendResult,
  ProviderConnectionStatus,
  WhatsAppTemplateItem,
  WebhookProcessResult,
} from './provider.interface';

export class MetaCloudProvider implements IWhatsAppProvider {
  readonly providerType: WhatsAppProviderType = 'META_CLOUD';
  readonly instanceId: string;
  readonly tenantId: string;

  private phoneNumberId: string;
  private wabaId?: string;
  private accessToken: string;
  private businessAccountId?: string;
  private baseUrl = 'https://graph.facebook.com/v21.0';

  constructor(instance: {
    id: string;
    tenantId: string;
    phoneNumberId?: string | null;
    wabaId?: string | null;
    accessToken?: string | null;
    businessAccountId?: string | null;
    instanceToken?: string;
  }) {
    this.instanceId = instance.id;
    this.tenantId = instance.tenantId;
    this.phoneNumberId = (instance.phoneNumberId || '').trim();
    this.wabaId = (instance.wabaId || '').trim() || undefined;
    this.accessToken = (instance.accessToken || instance.instanceToken || '').trim();
    this.businessAccountId = (instance.businessAccountId || '').trim() || undefined;
  }

  private cleanPhone(phone: string): string {
    return phone.replace(/\D/g, '');
  }

  private replaceVariables(text: string, variables?: Record<string, string>): string {
    if (!text || !variables) return text || '';
    let result = text;
    for (const [key, val] of Object.entries(variables)) {
      result = result.replace(new RegExp(`{{\\s*${key}\\s*}}`, 'gi'), String(val ?? ''));
    }
    return result;
  }

  /**
   * Envia mensagem de texto pela WhatsApp Business Cloud API Oficial da Meta
   */
  async sendText(params: SendTextParams): Promise<ProviderSendResult> {
    if (!this.phoneNumberId || !this.accessToken) {
      return {
        success: false,
        messageId: '',
        provider: 'META_CLOUD',
        status: 'FAILED',
        error: 'Credenciais da Meta Cloud API incompletas (Phone Number ID ou Access Token ausentes)',
      };
    }

    const cleanPhone = this.cleanPhone(params.phone);
    if (!cleanPhone || cleanPhone.length < 8) {
      return {
        success: false,
        messageId: '',
        provider: 'META_CLOUD',
        status: 'FAILED',
        error: `Número de telefone inválido para envio via Meta Cloud API: "${params.phone}"`,
      };
    }

    const contentText = this.replaceVariables(params.text, params.variables);

    const body = {
      messaging_product: 'whatsapp',
      recipient_type: 'individual',
      to: cleanPhone,
      type: 'text',
      text: {
        preview_url: true,
        body: contentText,
      },
    };

    try {
      const response = await fetch(`${this.baseUrl}/${this.phoneNumberId}/messages`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${this.accessToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(body),
      });

      const data = await response.json().catch(() => ({}));

      if (!response.ok) {
        const errorDetails = data?.error || {};
        let errorMsg = errorDetails.message || 'Falha no envio pela Meta Cloud API';

        // Tratamento da janela de 24 horas da Meta
        if (errorDetails.code === 131047 || (errorMsg && errorMsg.includes('24 hours'))) {
          errorMsg = 'Janela de 24 horas expirada. A Meta exige o uso de um Template Oficial aprovado para iniciar conversas com o cliente após 24h da última resposta.';
        } else if (errorDetails.code === 131026) {
          errorMsg = 'Mensagem não entregue pela Meta. O número do destinatário não está no WhatsApp ou está restrito.';
        } else if (errorDetails.code === 190) {
          errorMsg = 'Token de acesso da Meta expirado ou inválido. Atualize o System User Token no painel de WhatsApp.';
        }

        // Registra histórico de falha no CRM
        if (params.contactId) {
          await prisma.messageLog.create({
            data: {
              tenantId: this.tenantId,
              contactId: params.contactId,
              channel: 'WHATSAPP',
              provider: 'META_CLOUD',
              recipient: params.phone,
              content: contentText,
              status: 'FAILED',
              error: errorMsg,
            },
          }).catch(() => {});
        }

        return {
          success: false,
          messageId: '',
          provider: 'META_CLOUD',
          status: 'FAILED',
          error: errorMsg,
          details: data,
        };
      }

      const messageId = data?.messages?.[0]?.id || '';

      // Registra mensagem enviada com sucesso no histórico unificado do CRM
      if (params.contactId) {
        await prisma.messageLog.create({
          data: {
            tenantId: this.tenantId,
            contactId: params.contactId,
            channel: 'WHATSAPP',
            provider: 'META_CLOUD',
            recipient: params.phone,
            content: contentText,
            status: 'SENT',
            externalMessageId: messageId,
          },
        }).catch(() => {});
      }

      return {
        success: true,
        messageId,
        provider: 'META_CLOUD',
        status: 'SENT',
        timestamp: new Date(),
        details: data,
      };
    } catch (err: any) {
      return {
        success: false,
        messageId: '',
        provider: 'META_CLOUD',
        status: 'FAILED',
        error: err.message || 'Erro de conexão com o servidor da Meta Cloud API',
      };
    }
  }

  /**
   * Envia mídias (imagem, vídeo, áudio, documento) pela WhatsApp Cloud API
   */
  async sendMedia(params: SendMediaParams): Promise<ProviderSendResult> {
    if (!this.phoneNumberId || !this.accessToken) {
      return {
        success: false,
        messageId: '',
        provider: 'META_CLOUD',
        status: 'FAILED',
        error: 'Credenciais da Meta Cloud API incompletas',
      };
    }

    const cleanPhone = this.cleanPhone(params.phone);
    const caption = this.replaceVariables(params.caption || '', params.variables);
    const mediaType = params.mediaType === 'file' ? 'document' : params.mediaType;

    const mediaPayload: any = {
      link: params.mediaUrl,
    };

    if (caption && (mediaType === 'image' || mediaType === 'video' || mediaType === 'document')) {
      mediaPayload.caption = caption;
    }

    if (mediaType === 'document' && params.mediaFileName) {
      mediaPayload.filename = params.mediaFileName;
    }

    const body: any = {
      messaging_product: 'whatsapp',
      recipient_type: 'individual',
      to: cleanPhone,
      type: mediaType,
      [mediaType]: mediaPayload,
    };

    try {
      const response = await fetch(`${this.baseUrl}/${this.phoneNumberId}/messages`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${this.accessToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(body),
      });

      const data = await response.json().catch(() => ({}));

      if (!response.ok) {
        const errorDetails = data?.error || {};
        let errorMsg = errorDetails.message || 'Falha no envio de mídia via Meta Cloud API';

        if (errorDetails.code === 131047 || (errorMsg && errorMsg.includes('24 hours'))) {
          errorMsg = 'Janela de 24 horas expirada. A Meta exige o uso de um Template Oficial para mensagens fora da janela.';
        }

        if (params.contactId) {
          await prisma.messageLog.create({
            data: {
              tenantId: this.tenantId,
              contactId: params.contactId,
              channel: 'WHATSAPP',
              provider: 'META_CLOUD',
              recipient: params.phone,
              content: `[${mediaType.toUpperCase()}] ${params.mediaUrl || ''} ${caption}`,
              status: 'FAILED',
              error: errorMsg,
            },
          }).catch(() => {});
        }

        return {
          success: false,
          messageId: '',
          provider: 'META_CLOUD',
          status: 'FAILED',
          error: errorMsg,
          details: data,
        };
      }

      const messageId = data?.messages?.[0]?.id || '';

      if (params.contactId) {
        await prisma.messageLog.create({
          data: {
            tenantId: this.tenantId,
            contactId: params.contactId,
            channel: 'WHATSAPP',
            provider: 'META_CLOUD',
            recipient: params.phone,
            content: `[${mediaType.toUpperCase()}] ${params.mediaUrl || ''} ${caption}`,
            status: 'SENT',
            externalMessageId: messageId,
          },
        }).catch(() => {});
      }

      return {
        success: true,
        messageId,
        provider: 'META_CLOUD',
        status: 'SENT',
        timestamp: new Date(),
        details: data,
      };
    } catch (err: any) {
      return {
        success: false,
        messageId: '',
        provider: 'META_CLOUD',
        status: 'FAILED',
        error: err.message || 'Erro de conexão com o servidor da Meta Cloud API',
      };
    }
  }

  /**
   * Envia template oficial aprovado da Meta (funciona inclusive fora da janela de 24 horas)
   */
  async sendTemplate(params: SendTemplateParams): Promise<ProviderSendResult> {
    if (!this.phoneNumberId || !this.accessToken) {
      return {
        success: false,
        messageId: '',
        provider: 'META_CLOUD',
        status: 'FAILED',
        error: 'Credenciais da Meta Cloud API incompletas',
      };
    }

    const cleanPhone = this.cleanPhone(params.phone);

    let components = params.components;
    if (!components && params.variables) {
      const paramList = Object.values(params.variables).map((val) => ({
        type: 'text' as const,
        text: String(val ?? ''),
      }));
      if (paramList.length > 0) {
        components = [
          {
            type: 'body',
            parameters: paramList,
          },
        ];
      }
    }

    const body = {
      messaging_product: 'whatsapp',
      recipient_type: 'individual',
      to: cleanPhone,
      type: 'template',
      template: {
        name: params.templateName,
        language: { code: params.languageCode || 'pt_BR' },
        components: components && components.length > 0 ? components : undefined,
      },
    };

    try {
      const response = await fetch(`${this.baseUrl}/${this.phoneNumberId}/messages`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${this.accessToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(body),
      });

      const data = await response.json().catch(() => ({}));

      if (!response.ok) {
        const errorDetails = data?.error || {};
        const errorMsg = errorDetails.message || `Falha no envio do template "${params.templateName}" via Meta Cloud API`;

        if (params.contactId) {
          await prisma.messageLog.create({
            data: {
              tenantId: this.tenantId,
              contactId: params.contactId,
              channel: 'WHATSAPP',
              provider: 'META_CLOUD',
              recipient: params.phone,
              templateName: params.templateName,
              content: `[TEMPLATE: ${params.templateName}]`,
              status: 'FAILED',
              error: errorMsg,
            },
          }).catch(() => {});
        }

        return {
          success: false,
          messageId: '',
          provider: 'META_CLOUD',
          status: 'FAILED',
          error: errorMsg,
          details: data,
        };
      }

      const messageId = data?.messages?.[0]?.id || '';

      if (params.contactId) {
        await prisma.messageLog.create({
          data: {
            tenantId: this.tenantId,
            contactId: params.contactId,
            channel: 'WHATSAPP',
            provider: 'META_CLOUD',
            recipient: params.phone,
            templateName: params.templateName,
            content: `[TEMPLATE: ${params.templateName}]`,
            status: 'SENT',
            externalMessageId: messageId,
          },
        }).catch(() => {});
      }

      return {
        success: true,
        messageId,
        provider: 'META_CLOUD',
        status: 'SENT',
        timestamp: new Date(),
        details: data,
      };
    } catch (err: any) {
      return {
        success: false,
        messageId: '',
        provider: 'META_CLOUD',
        status: 'FAILED',
        error: err.message || 'Erro de conexão com o servidor da Meta Cloud API',
      };
    }
  }

  /**
   * Consulta os templates de mensagem aprovados na conta da Meta (WABA)
   */
  async getTemplates(): Promise<WhatsAppTemplateItem[]> {
    if (!this.wabaId || !this.accessToken) {
      return [];
    }

    try {
      const response = await fetch(
        `${this.baseUrl}/${this.wabaId}/message_templates?fields=name,status,category,language,components&limit=100`,
        {
          headers: {
            Authorization: `Bearer ${this.accessToken}`,
          },
        }
      );

      if (!response.ok) {
        return [];
      }

      const data = await response.json();
      const list = data?.data || [];

      return list.map((item: any) => ({
        id: item.id || item.name,
        name: item.name,
        status: item.status, // APPROVED, PENDING, REJECTED
        category: item.category, // MARKETING, UTILITY, AUTHENTICATION
        language: item.language,
        components: item.components || [],
      }));
    } catch {
      return [];
    }
  }

  /**
   * Consulta o status real da conexão e número de telefone na Meta
   */
  async getConnectionStatus(): Promise<ProviderConnectionStatus> {
    if (!this.phoneNumberId || !this.accessToken) {
      return {
        connected: false,
        status: 'DISCONNECTED',
        provider: 'META_CLOUD',
        error: 'Credenciais ausentes',
      };
    }

    try {
      const response = await fetch(
        `${this.baseUrl}/${this.phoneNumberId}?fields=verified_name,code_verification_status,display_phone_number,quality_rating,status`,
        {
          headers: {
            Authorization: `Bearer ${this.accessToken}`,
          },
        }
      );

      const data = await response.json().catch(() => ({}));

      if (!response.ok) {
        const errorMsg = data?.error?.message || 'Não foi possível verificar status na Meta';
        return {
          connected: false,
          status: 'ERROR',
          provider: 'META_CLOUD',
          error: errorMsg,
          details: data,
        };
      }

      const isConnected = data.status === 'CONNECTED' || Boolean(data.display_phone_number);

      // Atualiza informações no banco de dados se necessário
      await prisma.whatsappInstance.update({
        where: { id: this.instanceId },
        data: {
          phone: data.display_phone_number || undefined,
          verifiedName: data.verified_name || undefined,
          qualityRating: data.quality_rating || undefined,
          status: isConnected ? 'CONNECTED' : 'DISCONNECTED',
          lastConnectedAt: isConnected ? new Date() : undefined,
        },
      }).catch(() => {});

      return {
        connected: isConnected,
        status: isConnected ? 'CONNECTED' : 'DISCONNECTED',
        phone: data.display_phone_number,
        verifiedName: data.verified_name,
        qualityRating: data.quality_rating,
        provider: 'META_CLOUD',
        details: data,
      };
    } catch (err: any) {
      return {
        connected: false,
        status: 'ERROR',
        provider: 'META_CLOUD',
        error: err.message,
      };
    }
  }

  /**
   * Processa webhook oficial da WhatsApp Cloud API (mensagens recebidas e status de entrega)
   */
  async handleWebhook(payload: any): Promise<WebhookProcessResult> {
    if (!payload || payload.object !== 'whatsapp_business_account') {
      return { processed: false, error: 'Objeto de webhook inválido' };
    }

    const entries = payload.entry || [];
    for (const entry of entries) {
      const changes = entry.changes || [];
      for (const change of changes) {
        if (change.field !== 'messages') continue;
        const val = change.value || {};

        // 1. Tratamento de mensagens recebidas
        if (Array.isArray(val.messages) && val.messages.length > 0) {
          const contactInfo = val.contacts?.[0] || {};
          const senderName = contactInfo.profile?.name || 'Contato WhatsApp';

          for (const msg of val.messages) {
            const senderPhone = msg.from;
            let textContent = '';

            if (msg.type === 'text') {
              textContent = msg.text?.body || '';
            } else if (msg.type === 'image') {
              textContent = `[Imagem recebida] ${msg.image?.caption || ''}`;
            } else if (msg.type === 'video') {
              textContent = `[Vídeo recebido] ${msg.video?.caption || ''}`;
            } else if (msg.type === 'audio') {
              textContent = '[Áudio recebido]';
            } else if (msg.type === 'document') {
              textContent = `[Documento recebido: ${msg.document?.filename || 'arquivo'}]`;
            } else {
              textContent = `[Mensagem recebida: ${msg.type}]`;
            }

            // Localiza ou cria o contato no CRM vinculado a este tenant
            let contact = await prisma.contact.findFirst({
              where: {
                tenantId: this.tenantId,
                phone: { in: [senderPhone, `+${senderPhone}`, senderPhone.replace(/^55/, '')] },
              },
            });

            if (!contact) {
              contact = await prisma.contact.create({
                data: {
                  tenantId: this.tenantId,
                  phone: senderPhone,
                  name: senderName,
                  email: `${senderPhone}@whatsapp.temp`,
                  status: 'SUBSCRIBED',
                  consentGiven: true,
                },
              }).catch(() => null);
            }

            if (contact) {
              // Registra histórico no MessageLog unificado
              await prisma.messageLog.create({
                data: {
                  tenantId: this.tenantId,
                  contactId: contact.id,
                  channel: 'WHATSAPP',
                  provider: 'META_CLOUD',
                  recipient: senderPhone,
                  content: textContent,
                  status: 'DELIVERED',
                  externalMessageId: msg.id,
                  deliveredAt: new Date(),
                },
              }).catch(() => {});
            }

            return {
              processed: true,
              tenantId: this.tenantId,
              eventType: 'MESSAGE_RECEIVED',
              messageId: msg.id,
              contactPhone: senderPhone,
              contactName: senderName,
              content: textContent,
            };
          }
        }

        // 2. Tratamento de status de entrega (sent, delivered, read, failed)
        if (Array.isArray(val.statuses) && val.statuses.length > 0) {
          for (const st of val.statuses) {
            const messageId = st.id;
            const newStatus = (st.status || '').toUpperCase(); // SENT, DELIVERED, READ, FAILED

            const updateData: any = {};
            if (newStatus === 'DELIVERED') {
              updateData.status = 'DELIVERED';
              updateData.deliveredAt = new Date();
            } else if (newStatus === 'READ') {
              updateData.status = 'READ';
              updateData.readAt = new Date();
            } else if (newStatus === 'FAILED') {
              updateData.status = 'FAILED';
              const errObj = st.errors?.[0];
              updateData.error = errObj?.message || 'Falha na entrega da mensagem pela Meta';
            }

            if (messageId && Object.keys(updateData).length > 0) {
              await prisma.messageLog.updateMany({
                where: { externalMessageId: messageId },
                data: updateData,
              }).catch(() => {});
            }

            return {
              processed: true,
              tenantId: this.tenantId,
              eventType: 'STATUS_UPDATE',
              messageId,
              status: newStatus,
            };
          }
        }
      }
    }

    return { processed: true, tenantId: this.tenantId, eventType: 'ACCOUNT_UPDATE' };
  }
}
