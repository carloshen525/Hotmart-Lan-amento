import { prisma } from '@/lib/prisma';
import crypto from 'crypto';
import fs from 'fs';
import path from 'path';
import { SendWhatsAppParams, SendResult } from './types';

export class EvolutionApiService {
  private apiUrl: string;
  private apiKey: string;

  constructor() {
    this.apiUrl = (process.env.EVOLUTION_API_URL || '').replace(/\/$/, '');
    this.apiKey = process.env.EVOLUTION_API_KEY || '';
  }

  isConfigured(): boolean {
    return Boolean(this.apiUrl && this.apiKey);
  }

  /**
   * Obtém a instância do WhatsApp vinculada a este Tenant/Expert no banco
   */
  async getTenantInstance(tenantId: string) {
    return prisma.whatsappInstance.findUnique({
      where: { tenantId },
    });
  }

  /**
   * Obtém um QR Code FRESCO em tempo real direto da Evolution API
   * Se o socket do Baileys estiver travado ou a contagem muito alta, reinicia para garantir leitura imediata
   */
  async getFreshQrCode(instanceName: string): Promise<{ qrcode?: string; state: string; error?: string }> {
    try {
      // 1. Consulta o estado da conexão
      const stateRes = await fetch(
        `${this.apiUrl}/instance/connectionState/${encodeURIComponent(instanceName)}`,
        { headers: { apikey: this.apiKey } }
      );
      const stateData = await stateRes.json().catch(() => ({}));
      const state = stateData?.instance?.state || stateData?.state || 'close';

      if (state === 'open') {
        return { state: 'open' };
      }

      // 2. Solicita o QR Code em tempo real
      let connectRes = await fetch(
        `${this.apiUrl}/instance/connect/${encodeURIComponent(instanceName)}`,
        { headers: { apikey: this.apiKey } }
      );
      let connectData = await connectRes.json().catch(() => ({}));

      // Se a contagem de tentativas for alta (> 8), reseta o socket para um QR Code zerado
      if (connectData?.count && connectData.count > 8) {
        await fetch(`${this.apiUrl}/instance/restart/${encodeURIComponent(instanceName)}`, {
          method: 'POST',
          headers: { apikey: this.apiKey },
        });
        await new Promise((r) => setTimeout(r, 1200));

        connectRes = await fetch(
          `${this.apiUrl}/instance/connect/${encodeURIComponent(instanceName)}`,
          { headers: { apikey: this.apiKey } }
        );
        connectData = await connectRes.json().catch(() => ({}));
      }

      const qrcode =
        connectData?.base64 ||
        connectData?.qrcode?.base64 ||
        connectData?.code ||
        null;

      return {
        state: connectData?.instance?.state || state,
        qrcode: qrcode || undefined,
      };
    } catch (err: any) {
      return { state: 'error', error: err.message };
    }
  }

  /**
   * Cria ou conecta a instância do WhatsApp exclusiva para o Tenant/Expert
   * forceNew: Se true, remove qualquer instância anterior e gera uma nova do zero
   */
  async getOrCreateConnection(tenantId: string, forceNew = false): Promise<{
    connected: boolean;
    status: string;
    phone?: string;
    profileName?: string;
    qrcode?: string;
    error?: string;
  }> {
    if (!this.isConfigured()) {
      return {
        connected: false,
        status: 'DISCONNECTED',
        error: 'Evolution API não configurada no servidor (EVOLUTION_API_URL e EVOLUTION_API_KEY)',
      };
    }

    let instance = await this.getTenantInstance(tenantId);

    // Se o usuário pediu para gerar uma nova instância, remove a antiga antes de criar
    if (forceNew && instance) {
      try {
        await fetch(`${this.apiUrl}/instance/delete/${encodeURIComponent(instance.instanceName)}`, {
          method: 'DELETE',
          headers: { apikey: this.apiKey },
        });
      } catch {}

      await prisma.whatsappInstance.deleteMany({ where: { tenantId } });
      instance = null;
    }

    // 1. Se a instância ainda não existe no banco, cria nova na Evolution API
    if (!instance) {
      const tenant = await prisma.tenant.findUnique({ where: { id: tenantId } });
      const cleanSlug = (tenant?.slug || 'expert').replace(/[^a-z0-9]/g, '').slice(0, 10);
      const uniqueSuffix = crypto.randomBytes(4).toString('hex');
      const instanceName = `inst_${cleanSlug}_${uniqueSuffix}`;
      const instanceToken = crypto.randomUUID();

      try {
        const createRes = await fetch(`${this.apiUrl}/instance/create`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            apikey: this.apiKey,
          },
          body: JSON.stringify({
            instanceName,
            token: instanceToken,
            qrcode: true,
            integration: 'WHATSAPP-BAILEYS',
          }),
        });

        const createData = await createRes.json().catch(() => ({}));

        const qrcodeBase64 =
          createData?.qrcode?.base64 ||
          createData?.base64 ||
          null;

        instance = await prisma.whatsappInstance.create({
          data: {
            tenantId,
            instanceName,
            instanceToken,
            status: 'CONNECTING',
            qrcode: qrcodeBase64,
          },
        });

        if (qrcodeBase64) {
          return {
            connected: false,
            status: 'CONNECTING',
            qrcode: qrcodeBase64,
          };
        }
      } catch (err: any) {
        return {
          connected: false,
          status: 'DISCONNECTED',
          error: `Falha ao criar instância: ${err.message}`,
        };
      }
    }

    // 2. A instância já existe: busca um QR Code FRESCO em tempo real
    const fresh = await this.getFreshQrCode(instance.instanceName);

    if (fresh.state === 'open') {
      const updated = await prisma.whatsappInstance.update({
        where: { id: instance.id },
        data: {
          status: 'CONNECTED',
          lastConnectedAt: new Date(),
          qrcode: null,
        },
      });

      return {
        connected: true,
        status: 'CONNECTED',
        phone: updated.phone || undefined,
        profileName: updated.profileName || undefined,
      };
    }

    if (fresh.qrcode) {
      await prisma.whatsappInstance.update({
        where: { id: instance.id },
        data: { status: 'CONNECTING', qrcode: fresh.qrcode },
      });

      return {
        connected: false,
        status: 'CONNECTING',
        qrcode: fresh.qrcode,
      };
    }

    return {
      connected: false,
      status: 'DISCONNECTED',
      error: fresh.error || 'Aguardando inicialização do QR Code',
    };
  }

  /**
   * Consulta o status da conexão exclusivamente do Tenant logado
   * Se estiver em espera de QR Code, busca o QR Code vivo para evitar expiração
   */
  async getStatus(tenantId: string) {
    const instance = await this.getTenantInstance(tenantId);
    if (!instance) {
      return {
        hasInstance: false,
        connected: false,
        status: 'DISCONNECTED',
        phone: null,
        profileName: null,
      };
    }

    try {
      const stateRes = await fetch(
        `${this.apiUrl}/instance/connectionState/${encodeURIComponent(instance.instanceName)}`,
        { headers: { apikey: this.apiKey } }
      );

      const stateData = await stateRes.json().catch(() => ({}));
      const state = stateData?.instance?.state || stateData?.state || 'close';
      const isConnected = state === 'open';

      if (isConnected) {
        let phone = instance.phone;
        let profileName = instance.profileName;

        if (!phone) {
          // Tenta extrair o número ativo da instância
          const infoRes = await fetch(
            `${this.apiUrl}/instance/fetchInstances?instanceName=${encodeURIComponent(instance.instanceName)}`,
            { headers: { apikey: this.apiKey } }
          );
          const infoData = await infoRes.json().catch(() => ([]));
          const target = Array.isArray(infoData)
            ? infoData.find((i: any) => i.name === instance.instanceName)
            : null;

          if (target?.ownerJid) {
            phone = '+' + target.ownerJid.replace(/@.*$/, '');
            profileName = target.profileName || 'WhatsApp Conectado';
          }
        }

        const updated = await prisma.whatsappInstance.update({
          where: { id: instance.id },
          data: {
            status: 'CONNECTED',
            phone: phone || instance.phone,
            profileName: profileName || instance.profileName,
            lastConnectedAt: new Date(),
            qrcode: null,
          },
        });

        return {
          hasInstance: true,
          connected: true,
          status: 'CONNECTED',
          phone: updated.phone,
          profileName: updated.profileName,
          lastConnectedAt: updated.lastConnectedAt,
          qrcode: null,
        };
      }

      // Se não está conectado e estava conectando, busca QR code fresco
      let freshQr = instance.qrcode;
      if (instance.status === 'CONNECTING') {
        const fresh = await this.getFreshQrCode(instance.instanceName);
        if (fresh.qrcode) freshQr = fresh.qrcode;
      }

      return {
        hasInstance: true,
        connected: false,
        status: isConnected ? 'CONNECTED' : instance.status,
        phone: instance.phone,
        profileName: instance.profileName,
        lastConnectedAt: instance.lastConnectedAt,
        qrcode: freshQr,
      };
    } catch {
      return {
        hasInstance: true,
        connected: instance.status === 'CONNECTED',
        status: instance.status,
        phone: instance.phone,
        profileName: instance.profileName,
        lastConnectedAt: instance.lastConnectedAt,
        qrcode: instance.qrcode,
      };
    }
  }



  /**
   * Desconecta exclusivamente a instância do Tenant logado
   */
  async disconnect(tenantId: string): Promise<boolean> {
    const instance = await this.getTenantInstance(tenantId);
    if (!instance) return true;

    try {
      await fetch(`${this.apiUrl}/instance/logout/${encodeURIComponent(instance.instanceName)}`, {
        method: 'DELETE',
        headers: { apikey: this.apiKey },
      });
    } catch {}

    await prisma.whatsappInstance.update({
      where: { id: instance.id },
      data: {
        status: 'DISCONNECTED',
        qrcode: null,
      },
    });

    return true;
  }

  /**
   * Reinicia a instância do Tenant logado e gera novo QR Code limpo
   */
  async reconnect(tenantId: string) {
    const instance = await this.getTenantInstance(tenantId);
    if (!instance) return this.getOrCreateConnection(tenantId);

    try {
      await fetch(`${this.apiUrl}/instance/restart/${encodeURIComponent(instance.instanceName)}`, {
        method: 'POST',
        headers: { apikey: this.apiKey },
      });
    } catch {}

    await new Promise((r) => setTimeout(r, 1500));
    return this.getOrCreateConnection(tenantId);
  }

  /**
   * Disparo seguro de mensagens nas automações utilizando a instância própria do Tenant
   * Suporta Texto, Imagem, Vídeo e Áudio PTT (gravação de voz)
   */
  async send(params: SendWhatsAppParams): Promise<SendResult> {
    if (!this.isConfigured()) {
      return {
        success: false,
        messageId: '',
        provider: 'EVOLUTION_API',
        status: 'FAILED',
        error: 'Evolution API não configurada no servidor',
      };
    }

    const instance = await this.getTenantInstance(params.tenantId);
    if (!instance || instance.status !== 'CONNECTED') {
      const errorMsg = 'WhatsApp deste expert não está conectado. Acesse o menu WhatsApp para escanear o QR Code.';
      return {
        success: false,
        messageId: '',
        provider: 'EVOLUTION_API',
        status: 'FAILED',
        error: errorMsg,
      };
    }

    try {
      const cleanPhone = params.phone.replace(/\D/g, '');

      // Substituição de variáveis
      let messageText = params.text || '';
      let formattedCaption = params.caption || '';
      if (params.variables) {
        for (const [key, value] of Object.entries(params.variables)) {
          const regex = new RegExp(`{{${key}}}`, 'g');
          if (messageText) messageText = messageText.replace(regex, value);
          if (formattedCaption) formattedCaption = formattedCaption.replace(regex, value);
        }
      }

      const messageType = params.messageType || (params.mediaUrl ? 'image' : 'text');

      // Se for envio de mídia (imagem, vídeo ou áudio)
      if (messageType !== 'text' && (params.mediaUrl || params.mediaBase64)) {
        // Resolve payload de mídia (URL ou Base64)
        let mediaPayload = params.mediaBase64 || params.mediaUrl || '';

        // Se o arquivo for local (/uploads/...), lemos do disco e convertemos para Data URI
        // para garantir que a Evolution API receba o arquivo mesmo se estiver em Docker ou outra rede
        if (params.mediaUrl && (params.mediaUrl.startsWith('/uploads/') || params.mediaUrl.startsWith('uploads/'))) {
          try {
            const localRelative = params.mediaUrl.replace(/^\//, '');
            const localPath = path.join(process.cwd(), 'public', localRelative);
            if (fs.existsSync(localPath)) {
              const fileBuf = fs.readFileSync(localPath);
              const fallbackMime = messageType === 'audio' ? 'audio/mpeg' : messageType === 'video' ? 'video/mp4' : 'image/jpeg';
              const mime = params.mediaMimeType || fallbackMime;
              mediaPayload = `data:${mime};base64,${fileBuf.toString('base64')}`;
            }
          } catch (readErr) {
            console.error('[EvolutionApi] Erro ao ler arquivo de mídia local do disco:', readErr);
          }
        }

        let response: Response;
        let responseData: any = {};
        let logContent = '';

        if (messageType === 'audio') {
          // Envio de áudio / mensagem de voz
          logContent = `[🎙️ Áudio] ${params.mediaFileName || 'audio'}`;
          const audioUrl = `${this.apiUrl}/message/sendWhatsAppAudio/${encodeURIComponent(instance.instanceName)}`;
          response = await fetch(audioUrl, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              apikey: this.apiKey,
            },
            body: JSON.stringify({
              number: cleanPhone,
              audio: mediaPayload,
              options: {
                delay: 1200,
                presence: 'recording',
                encoding: true,
              },
            }),
          });
          responseData = await response.json().catch(() => ({}));

          // Fallback para sendMedia caso o endpoint de áudio nativo retorne erro
          if (!response.ok) {
            const fallbackUrl = `${this.apiUrl}/message/sendMedia/${encodeURIComponent(instance.instanceName)}`;
            response = await fetch(fallbackUrl, {
              method: 'POST',
              headers: {
                'Content-Type': 'application/json',
                apikey: this.apiKey,
              },
              body: JSON.stringify({
                number: cleanPhone,
                mediatype: 'audio',
                mimetype: params.mediaMimeType || 'audio/mp3',
                media: mediaPayload,
                fileName: params.mediaFileName || 'audio.mp3',
              }),
            });
            responseData = await response.json().catch(() => ({}));
          }
        } else {
          // Envio de Imagem ou Vídeo com legenda
          const mediaKind = messageType === 'video' ? 'video' : 'image';
          const defaultMime = messageType === 'video' ? 'video/mp4' : 'image/jpeg';
          const defaultName = messageType === 'video' ? 'video.mp4' : 'imagem.jpg';
          logContent = `[${messageType === 'video' ? '🎥 Vídeo' : '📷 Imagem'}] ${formattedCaption ? `Legenda: ${formattedCaption}` : params.mediaFileName || ''}`;

          const mediaUrl = `${this.apiUrl}/message/sendMedia/${encodeURIComponent(instance.instanceName)}`;
          response = await fetch(mediaUrl, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              apikey: this.apiKey,
            },
            body: JSON.stringify({
              number: cleanPhone,
              mediatype: mediaKind,
              mimetype: params.mediaMimeType || defaultMime,
              caption: formattedCaption || undefined,
              media: mediaPayload,
              fileName: params.mediaFileName || defaultName,
              options: {
                delay: 1200,
                presence: 'composing',
              },
            }),
          });
          responseData = await response.json().catch(() => ({}));
        }

        if (!response.ok) {
          const errorMsg = responseData?.message || responseData?.error || `Falha no envio de mídia (HTTP ${response.status})`;
          await prisma.messageLog.create({
            data: {
              tenantId: params.tenantId,
              contactId: params.contactId,
              channel: 'WHATSAPP',
              provider: 'EVOLUTION_API',
              recipient: params.phone,
              content: logContent,
              status: 'FAILED',
              error: String(errorMsg),
            },
          });

          return {
            success: false,
            messageId: '',
            provider: 'EVOLUTION_API',
            status: 'FAILED',
            error: String(errorMsg),
          };
        }

        const externalMessageId = responseData?.key?.id || `evo_${Date.now()}`;
        const log = await prisma.messageLog.create({
          data: {
            tenantId: params.tenantId,
            contactId: params.contactId,
            channel: 'WHATSAPP',
            provider: 'EVOLUTION_API',
            recipient: params.phone,
            templateName: params.templateName,
            content: logContent,
            status: 'SENT',
            externalMessageId,
            costEstimate: 0.0,
          },
        });

        return {
          success: true,
          messageId: log.id,
          provider: 'EVOLUTION_API',
          status: 'SENT',
          costEstimate: 0.0,
        };
      }

      // Envio de Texto padrão
      const finalMessageText = messageText || `Mensagem: ${params.templateName || 'aviso'}`;
      const url = `${this.apiUrl}/message/sendText/${encodeURIComponent(instance.instanceName)}`;

      const response = await fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          apikey: this.apiKey,
        },
        body: JSON.stringify({
          number: cleanPhone,
          text: finalMessageText,
          options: {
            delay: 1200,
            presence: 'composing',
            linkPreview: true,
          },
        }),
      });

      const data = await response.json().catch(() => ({}));

      if (!response.ok) {
        const errorMsg = data?.message || data?.error || `Falha no envio (HTTP ${response.status})`;
        await prisma.messageLog.create({
          data: {
            tenantId: params.tenantId,
            contactId: params.contactId,
            channel: 'WHATSAPP',
            provider: 'EVOLUTION_API',
            recipient: params.phone,
            content: finalMessageText,
            status: 'FAILED',
            error: String(errorMsg),
          },
        });

        return {
          success: false,
          messageId: '',
          provider: 'EVOLUTION_API',
          status: 'FAILED',
          error: String(errorMsg),
        };
      }

      const externalMessageId = data?.key?.id || `evo_${Date.now()}`;

      const log = await prisma.messageLog.create({
        data: {
          tenantId: params.tenantId,
          contactId: params.contactId,
          channel: 'WHATSAPP',
          provider: 'EVOLUTION_API',
          recipient: params.phone,
          templateName: params.templateName,
          content: finalMessageText,
          status: 'SENT',
          externalMessageId,
          costEstimate: 0.0,
        },
      });

      return {
        success: true,
        messageId: log.id,
        provider: 'EVOLUTION_API',
        status: 'SENT',
        costEstimate: 0.0,
      };
    } catch (err: any) {
      return {
        success: false,
        messageId: '',
        provider: 'EVOLUTION_API',
        status: 'FAILED',
        error: err.message,
      };
    }
  }
}
