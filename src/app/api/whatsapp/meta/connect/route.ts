import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { getCurrentSession } from '@/lib/auth';
import { getActiveTenantId, ensureTenantAccess } from '@/lib/tenancy';
import crypto from 'crypto';

export const dynamic = 'force-dynamic';

export async function POST(request: Request) {
  try {
    const session = await getCurrentSession();
    if (!session) {
      return NextResponse.json({ error: 'Não autenticado' }, { status: 401 });
    }

    const tenantId = await getActiveTenantId();
    if (!tenantId) {
      return NextResponse.json({ error: 'Nenhum tenant ativo selecionado' }, { status: 400 });
    }

    await ensureTenantAccess(tenantId, session.userId, session.globalRole);

    const body = await request.json().catch(() => ({}));
    const {
      name,
      phoneNumberId,
      wabaId,
      accessToken,
      businessAccountId,
      webhookVerifyToken,
      appId,
    } = body;

    if (!phoneNumberId || !phoneNumberId.trim()) {
      return NextResponse.json({ error: 'O Phone Number ID da Meta é obrigatório' }, { status: 400 });
    }

    if (!accessToken || !accessToken.trim()) {
      return NextResponse.json({ error: 'O Access Token da Meta é obrigatório' }, { status: 400 });
    }

    const cleanPhoneNumberId = phoneNumberId.trim();
    const cleanAccessToken = accessToken.trim();
    const cleanWabaId = wabaId ? wabaId.trim() : null;

    // 1. Validação em tempo real junto à Meta Graph API
    let metaPhoneData: any = null;
    try {
      const metaRes = await fetch(
        `https://graph.facebook.com/v21.0/${cleanPhoneNumberId}?fields=verified_name,code_verification_status,display_phone_number,quality_rating,status`,
        {
          headers: {
            Authorization: `Bearer ${cleanAccessToken}`,
          },
        }
      );

      const metaJson = await metaRes.json().catch(() => ({}));

      if (!metaRes.ok) {
        const errorMsg =
          metaJson?.error?.message ||
          'Falha ao validar credenciais com a Meta. Verifique se o Phone Number ID e o Access Token estão corretos.';
        return NextResponse.json({ error: errorMsg, details: metaJson?.error }, { status: 400 });
      }

      metaPhoneData = metaJson;
    } catch (err: any) {
      return NextResponse.json(
        { error: `Erro de comunicação com a Meta Graph API: ${err.message}` },
        { status: 502 }
      );
    }

    // 2. Garante unicidade e isolamento multi-tenant
    const instanceName = `meta_${cleanPhoneNumberId}`;
    const generatedVerifyToken = webhookVerifyToken && webhookVerifyToken.trim()
      ? webhookVerifyToken.trim()
      : `meta_${crypto.randomUUID().slice(0, 16)}`;

    // Verifica se este número já está conectado neste ou em outro tenant
    const existingInstance = await prisma.whatsappInstance.findFirst({
      where: {
        OR: [
          { phoneNumberId: cleanPhoneNumberId },
          { instanceName },
        ],
      },
    });

    if (existingInstance && existingInstance.tenantId !== tenantId && session.globalRole !== 'SUPER_ADMIN') {
      return NextResponse.json(
        { error: 'Este número de WhatsApp da Meta já está conectado em outro cliente.' },
        { status: 409 }
      );
    }

    const friendlyName = name?.trim() || metaPhoneData?.verified_name || metaPhoneData?.display_phone_number || 'WhatsApp Oficial Meta';

    let instance;
    if (existingInstance) {
      instance = await prisma.whatsappInstance.update({
        where: { id: existingInstance.id },
        data: {
          tenantId,
          userId: session.userId,
          name: friendlyName,
          provider: 'META_CLOUD',
          phoneNumberId: cleanPhoneNumberId,
          wabaId: cleanWabaId,
          accessToken: cleanAccessToken,
          businessAccountId: businessAccountId ? businessAccountId.trim() : null,
          webhookVerifyToken: generatedVerifyToken,
          appId: appId ? appId.trim() : null,
          phone: metaPhoneData?.display_phone_number || null,
          verifiedName: metaPhoneData?.verified_name || null,
          qualityRating: metaPhoneData?.quality_rating || null,
          status: 'CONNECTED',
          lastConnectedAt: new Date(),
        },
      });
    } else {
      const existingCount = await prisma.whatsappInstance.count({ where: { tenantId } });

      instance = await prisma.whatsappInstance.create({
        data: {
          tenantId,
          userId: session.userId,
          name: friendlyName,
          instanceName,
          instanceToken: crypto.randomUUID(),
          provider: 'META_CLOUD',
          phoneNumberId: cleanPhoneNumberId,
          wabaId: cleanWabaId,
          accessToken: cleanAccessToken,
          businessAccountId: businessAccountId ? businessAccountId.trim() : null,
          webhookVerifyToken: generatedVerifyToken,
          appId: appId ? appId.trim() : null,
          phone: metaPhoneData?.display_phone_number || null,
          verifiedName: metaPhoneData?.verified_name || null,
          qualityRating: metaPhoneData?.quality_rating || null,
          status: 'CONNECTED',
          isDefault: existingCount === 0,
          lastConnectedAt: new Date(),
        },
      });
    }

    // Retorna os dados higienizados para o frontend (NUNCA exponha o accessToken!)
    return NextResponse.json({
      success: true,
      message: 'Canal WhatsApp Business Cloud API conectado com sucesso!',
      instance: {
        id: instance.id,
        name: instance.name,
        provider: 'META_CLOUD',
        status: instance.status,
        connected: true,
        phone: instance.phone,
        verifiedName: instance.verifiedName,
        qualityRating: instance.qualityRating,
        phoneNumberId: instance.phoneNumberId,
        wabaId: instance.wabaId,
        webhookVerifyToken: instance.webhookVerifyToken,
        isDefault: instance.isDefault,
        lastConnectedAt: instance.lastConnectedAt,
      },
    });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
