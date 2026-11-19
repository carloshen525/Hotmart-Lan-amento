import { SimulatedMessageService } from './simulated';
import { MetaWhatsAppService } from './meta-whatsapp';
import { EvolutionApiService } from './evolution-api';
import { EmailProviderService } from './email-provider';
import { EmailService } from '../email';
import { SendEmailParams, SendWhatsAppParams, SendResult } from './types';
import { WhatsAppProviderFactory } from '@/services/whatsapp/providers';

export class MessageManager {
  private simulated = new SimulatedMessageService();
  private metaWhatsApp = new MetaWhatsAppService();
  public evolutionApi = new EvolutionApiService();
  private emailProvider = new EmailProviderService();
  private recentSends = new Map<string, number>();

  async sendWhatsApp(params: SendWhatsAppParams): Promise<SendResult> {
    // Guarda de Desduplicação Estrita: impede envio da mesma mensagem para o mesmo telefone/grupo em menos de 120 segundos
    const dest = (params.phone || '').trim();
    const cleanText = (params.text || params.caption || '').trim().slice(0, 100);
    const dedupKey = `${params.tenantId || ''}_${dest}_${cleanText}`;

    const now = Date.now();
    const lastSent = this.recentSends.get(dedupKey);
    if (lastSent && now - lastSent < 120000) {
      console.warn(`[MessageManager] Prevenção de duplicidade: mensagem idêntica para ${dest} ignorada (${now - lastSent}ms atrás)`);
      return {
        success: true,
        messageId: 'dedup_guard_skipped',
        provider: 'DEDUP_GUARD',
        status: 'SENT',
      };
    }
    this.recentSends.set(dedupKey, now);

    // Limpa entradas antigas (> 120 segundos)
    if (this.recentSends.size > 500) {
      for (const [k, time] of this.recentSends.entries()) {
        if (now - time > 120000) this.recentSends.delete(k);
      }
    }

    // 1. Prioriza resolução via Camada Desacoplada de Provedores (Evolution ou Meta Cloud API)
    try {
      const provider = await WhatsAppProviderFactory.getProvider(
        params.whatsappInstanceId,
        params.tenantId
      );

      if (provider) {
        if (params.templateName && provider.sendTemplate) {
          const res = await provider.sendTemplate({
            tenantId: params.tenantId,
            contactId: params.contactId,
            phone: params.phone,
            templateName: params.templateName,
            variables: params.variables,
          });
          return {
            success: res.success,
            messageId: res.messageId,
            provider: res.provider,
            status: res.status as any,
            error: res.error,
          };
        }

        if (params.messageType && params.messageType !== 'text') {
          const res = await provider.sendMedia({
            tenantId: params.tenantId,
            contactId: params.contactId,
            phone: params.phone,
            mediaType: params.messageType,
            mediaUrl: params.mediaUrl,
            mediaBase64: params.mediaBase64,
            mediaMimeType: params.mediaMimeType,
            mediaFileName: params.mediaFileName,
            caption: params.caption || params.text,
            variables: params.variables,
          });
          return {
            success: res.success,
            messageId: res.messageId,
            provider: res.provider,
            status: res.status as any,
            error: res.error,
          };
        }

        const res = await provider.sendText({
          tenantId: params.tenantId,
          contactId: params.contactId,
          phone: params.phone,
          text: params.text || '',
          variables: params.variables,
        });
        return {
          success: res.success,
          messageId: res.messageId,
          provider: res.provider,
          status: res.status as any,
          error: res.error,
        };
      }
    } catch (err: any) {
      console.error('[MessageManager] Erro no provedor de WhatsApp:', err);
    }

    const mode = process.env.WHATSAPP_PROVIDER_MODE;

    // 2. Fallback legado: Evolution API global
    if (mode === 'EVOLUTION_API' || this.evolutionApi.isConfigured()) {
      return this.evolutionApi.send(params);
    }

    // 3. Fallback legado: Meta Cloud API global por variáveis de ambiente
    if (mode === 'META_CLOUD_API' && this.metaWhatsApp.isConfigured()) {
      return this.metaWhatsApp.send(params);
    }

    // 4. Fallback seguro: Provedor Simulado
    return this.simulated.sendWhatsApp(params);
  }

  async sendEmail(params: SendEmailParams): Promise<SendResult> {
    // 1. Prioriza o módulo Multi-Tenant EmailService (com envio pela Email Queue)
    const settings = await EmailService.getSettings(params.tenantId).catch(() => null);
    if (settings && settings.smtpHost) {
      const emailRes = await EmailService.send(params.tenantId, {
        to: params.email,
        subject: params.subject,
        html: params.content,
        variables: params.variables,
        contactId: params.contactId,
      });

      return {
        success: emailRes.success,
        messageId: emailRes.messageId || emailRes.queueId || '',
        provider: emailRes.provider,
        status:
          emailRes.status === 'SENT' || emailRes.status === 'QUEUED'
            ? 'DELIVERED'
            : 'FAILED',
        error: emailRes.error,
      };
    }

    // 2. Provedor legado / Resend se configurado
    const mode = process.env.EMAIL_PROVIDER_MODE;
    if (mode === 'RESEND' && this.emailProvider.isConfigured()) {
      return this.emailProvider.send(params);
    }

    // 3. Fallback Simulado
    return this.simulated.sendEmail(params);
  }
}

export const messageManager = new MessageManager();
