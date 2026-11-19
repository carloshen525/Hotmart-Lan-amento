import { prisma } from '@/lib/prisma';
import { IWhatsAppProvider } from './provider.interface';
import { EvolutionProvider } from './evolution.provider';
import { MetaCloudProvider } from './meta-cloud.provider';

export class WhatsAppProviderFactory {
  /**
   * Obtém a instância do provedor correspondente (Evolution ou Meta Cloud API)
   * baseado no registro da WhatsappInstance no banco de dados.
   */
  static async getProvider(
    instanceOrId: string | any,
    tenantId?: string
  ): Promise<IWhatsAppProvider | null> {
    let instanceRecord: any = null;

    if (typeof instanceOrId === 'string') {
      instanceRecord = await prisma.whatsappInstance.findFirst({
        where: {
          id: instanceOrId,
          ...(tenantId ? { tenantId } : {}),
        },
      });

      if (!instanceRecord && tenantId) {
        // Fallback para a instância padrão do tenant
        instanceRecord = await prisma.whatsappInstance.findFirst({
          where: { tenantId, isDefault: true },
        }) || await prisma.whatsappInstance.findFirst({
          where: { tenantId },
          orderBy: { createdAt: 'desc' },
        });
      }
    } else if (instanceOrId && typeof instanceOrId === 'object') {
      instanceRecord = instanceOrId;
    }

    if (!instanceRecord) {
      return null;
    }

    const providerType = (instanceRecord.provider || 'EVOLUTION').toUpperCase();

    if (providerType === 'META_CLOUD') {
      return new MetaCloudProvider(instanceRecord);
    }

    return new EvolutionProvider(instanceRecord);
  }

  /**
   * Localiza o provedor Meta Cloud API pelo Phone Number ID recebido em webhooks
   */
  static async getMetaProviderByPhoneNumberId(phoneNumberId: string): Promise<MetaCloudProvider | null> {
    const cleanId = phoneNumberId.trim();
    const instance = await prisma.whatsappInstance.findFirst({
      where: {
        phoneNumberId: cleanId,
        provider: 'META_CLOUD',
      },
    });

    if (!instance) return null;
    return new MetaCloudProvider(instance);
  }

  /**
   * Localiza o provedor Meta Cloud API pelo WABA ID recebido em webhooks
   */
  static async getMetaProviderByWabaId(wabaId: string): Promise<MetaCloudProvider | null> {
    const cleanId = wabaId.trim();
    const instance = await prisma.whatsappInstance.findFirst({
      where: {
        wabaId: cleanId,
        provider: 'META_CLOUD',
      },
    });

    if (!instance) return null;
    return new MetaCloudProvider(instance);
  }

  /**
   * Lista todos os canais de WhatsApp de um tenant, higienizando tokens e credenciais
   * de segurança para nunca expô-los ao frontend.
   */
  static async listChannels(tenantId: string) {
    const instances = await prisma.whatsappInstance.findMany({
      where: { tenantId },
      orderBy: [{ isDefault: 'desc' }, { createdAt: 'desc' }],
    });

    return instances.map((inst) => {
      const isMeta = inst.provider === 'META_CLOUD';
      return {
        id: inst.id,
        name: inst.name || (isMeta ? 'WhatsApp Oficial (Meta)' : inst.instanceName),
        instanceName: inst.instanceName,
        phone: inst.phone,
        profileName: inst.profileName,
        profilePicUrl: inst.profilePicUrl,
        status: inst.status,
        connected: inst.status === 'CONNECTED',
        isDefault: inst.isDefault,
        provider: inst.provider || 'EVOLUTION',
        wabaId: inst.wabaId || undefined,
        phoneNumberId: inst.phoneNumberId || undefined,
        businessAccountId: inst.businessAccountId || undefined,
        qualityRating: inst.qualityRating || undefined,
        verifiedName: inst.verifiedName || undefined,
        hasAccessToken: Boolean(inst.accessToken),
        fixedDelaySeconds: inst.fixedDelaySeconds,
        useRandomDelay: inst.useRandomDelay,
        minDelaySeconds: inst.minDelaySeconds,
        maxDelaySeconds: inst.maxDelaySeconds,
        lastConnectedAt: inst.lastConnectedAt,
        createdAt: inst.createdAt,
        qrcode: isMeta ? null : inst.qrcode,
      };
    });
  }
}
