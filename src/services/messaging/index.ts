import { SimulatedMessageService } from './simulated';
import { MetaWhatsAppService } from './meta-whatsapp';
import { EvolutionApiService } from './evolution-api';
import { EmailProviderService } from './email-provider';
import { SendEmailParams, SendWhatsAppParams, SendResult } from './types';

export class MessageManager {
  private simulated = new SimulatedMessageService();
  private metaWhatsApp = new MetaWhatsAppService();
  public evolutionApi = new EvolutionApiService();
  private emailProvider = new EmailProviderService();

  async sendWhatsApp(params: SendWhatsAppParams): Promise<SendResult> {
    const mode = process.env.WHATSAPP_PROVIDER_MODE;

    // 1. Prioriza Evolution API se o modo for EVOLUTION_API
    if (mode === 'EVOLUTION_API') {
      if (this.evolutionApi.isConfigured()) {
        return this.evolutionApi.send(params);
      }
      return {
        success: false,
        messageId: '',
        provider: 'EVOLUTION_API',
        status: 'FAILED',
        error: 'Modo EVOLUTION_API selecionado, mas variáveis não configuradas no .env (EVOLUTION_API_URL, EVOLUTION_API_KEY, EVOLUTION_INSTANCE_NAME)',
      };
    }

    // 2. Meta Cloud API oficial
    if (mode === 'META_CLOUD_API' && this.metaWhatsApp.isConfigured()) {
      return this.metaWhatsApp.send(params);
    }

    // 3. Fallback seguro: Provedor Simulado
    return this.simulated.sendWhatsApp(params);
  }

  async sendEmail(params: SendEmailParams): Promise<SendResult> {
    const mode = process.env.EMAIL_PROVIDER_MODE;
    if (mode === 'RESEND' && this.emailProvider.isConfigured()) {
      return this.emailProvider.send(params);
    }
    return this.simulated.sendEmail(params);
  }
}

export const messageManager = new MessageManager();
