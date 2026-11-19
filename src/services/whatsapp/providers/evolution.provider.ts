import { prisma } from '@/lib/prisma';
import { messageManager } from '@/services/messaging';
import {
  IWhatsAppProvider,
  WhatsAppProviderType,
  SendTextParams,
  SendMediaParams,
  ProviderSendResult,
  ProviderConnectionStatus,
  WebhookProcessResult,
} from './provider.interface';

export class EvolutionProvider implements IWhatsAppProvider {
  readonly providerType: WhatsAppProviderType = 'EVOLUTION';
  readonly instanceId: string;
  readonly tenantId: string;
  private instanceName: string;

  constructor(instance: {
    id: string;
    tenantId: string;
    instanceName?: string | null;
  }) {
    this.instanceId = instance.id;
    this.tenantId = instance.tenantId;
    this.instanceName = instance.instanceName || '';
  }

  async sendText(params: SendTextParams): Promise<ProviderSendResult> {
    try {
      const res = await messageManager.evolutionApi.send({
        tenantId: this.tenantId,
        contactId: params.contactId || '',
        phone: params.phone,
        whatsappInstanceId: this.instanceId,
        text: params.text,
        variables: params.variables,
      });

      return {
        success: res.success,
        messageId: res.messageId,
        provider: 'EVOLUTION',
        status: res.status as any,
        error: res.error,
      };
    } catch (err: any) {
      return {
        success: false,
        messageId: '',
        provider: 'EVOLUTION',
        status: 'FAILED',
        error: err.message,
      };
    }
  }

  async sendMedia(params: SendMediaParams): Promise<ProviderSendResult> {
    try {
      const res = await messageManager.evolutionApi.send({
        tenantId: this.tenantId,
        contactId: params.contactId || '',
        phone: params.phone,
        whatsappInstanceId: this.instanceId,
        messageType: params.mediaType as any,
        mediaUrl: params.mediaUrl,
        mediaBase64: params.mediaBase64,
        mediaMimeType: params.mediaMimeType,
        mediaFileName: params.mediaFileName,
        caption: params.caption,
        variables: params.variables,
      });

      return {
        success: res.success,
        messageId: res.messageId,
        provider: 'EVOLUTION',
        status: res.status as any,
        error: res.error,
      };
    } catch (err: any) {
      return {
        success: false,
        messageId: '',
        provider: 'EVOLUTION',
        status: 'FAILED',
        error: err.message,
      };
    }
  }

  async getConnectionStatus(): Promise<ProviderConnectionStatus> {
    try {
      const statusRes: any = await messageManager.evolutionApi.getStatus(this.tenantId, this.instanceId);
      const instance = statusRes?.instances?.find((i: any) => i.id === this.instanceId) || statusRes?.instance || statusRes;

      const isConnected = instance?.connected === true || instance?.status === 'CONNECTED';
      return {
        connected: isConnected,
        status: isConnected ? 'CONNECTED' : (instance?.status || 'DISCONNECTED'),
        phone: instance?.phone,
        name: instance?.name,
        profileName: instance?.profileName,
        profilePicUrl: instance?.profilePicUrl,
        provider: 'EVOLUTION',
      };
    } catch (err: any) {
      return {
        connected: false,
        status: 'ERROR',
        provider: 'EVOLUTION',
        error: err.message,
      };
    }
  }

  async handleWebhook(payload: any): Promise<WebhookProcessResult> {
    // Processamento de webhook Evolution API
    return {
      processed: true,
      tenantId: this.tenantId,
      eventType: 'ACCOUNT_UPDATE',
    };
  }
}
