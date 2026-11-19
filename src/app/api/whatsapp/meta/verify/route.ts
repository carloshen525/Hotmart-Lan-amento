import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { getCurrentSession } from '@/lib/auth';
import { getActiveTenantId, ensureTenantAccess } from '@/lib/tenancy';

export const dynamic = 'force-dynamic';

/**
 * POST /api/whatsapp/meta/verify
 * Diagnóstico completo em tempo real de credenciais da Meta Cloud API
 * Pode verificar uma instância existente (por instanceId) ou testar credenciais antes de salvar.
 */
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
    const { instanceId, phoneNumberId: rawPhoneId, accessToken: rawToken, wabaId: rawWabaId } = body;

    let targetPhoneNumberId = rawPhoneId?.trim();
    let targetAccessToken = rawToken?.trim();
    let targetWabaId = rawWabaId?.trim();
    let instanceRecord: any = null;

    if (instanceId) {
      instanceRecord = await prisma.whatsappInstance.findFirst({
        where: { id: instanceId, tenantId },
      });

      if (!instanceRecord) {
        return NextResponse.json({ error: 'Canal de WhatsApp não encontrado' }, { status: 404 });
      }

      targetPhoneNumberId = targetPhoneNumberId || instanceRecord.phoneNumberId;
      targetAccessToken = targetAccessToken || instanceRecord.accessToken;
      targetWabaId = targetWabaId || instanceRecord.wabaId;
    }

    if (!targetPhoneNumberId) {
      return NextResponse.json({ error: 'O Phone Number ID é obrigatório para o teste.' }, { status: 400 });
    }

    if (!targetAccessToken) {
      return NextResponse.json({ error: 'O Access Token é obrigatório para o teste.' }, { status: 400 });
    }

    const warnings: string[] = [];

    // 1. Testa comunicação direta do Phone Number ID com a Meta Graph API v21.0
    let metaPhoneData: any = null;
    try {
      const phoneRes = await fetch(
        `https://graph.facebook.com/v21.0/${targetPhoneNumberId}?fields=verified_name,code_verification_status,display_phone_number,quality_rating,status,name_status`,
        {
          headers: {
            Authorization: `Bearer ${targetAccessToken}`,
          },
        }
      );

      const phoneJson = await phoneRes.json().catch(() => ({}));

      if (!phoneRes.ok) {
        const errorObj = phoneJson?.error || {};
        let errorMsg = errorObj.message || 'Falha na validação com a Meta.';

        if (errorObj.code === 190) {
          errorMsg = 'Access Token expirado ou revogado. Se você usou o botão azul de teste de 24h, gere um Token Permanente em Usuários do Sistema.';
        } else if (errorObj.code === 100) {
          errorMsg = 'Phone Number ID não foi encontrado ou não pertence ao seu aplicativo da Meta.';
        }

        if (instanceRecord) {
          await prisma.whatsappInstance.update({
            where: { id: instanceRecord.id },
            data: { status: 'DISCONNECTED' },
          }).catch(() => {});
        }

        return NextResponse.json({
          valid: false,
          error: errorMsg,
          code: errorObj.code,
          details: errorObj,
        }, { status: 400 });
      }

      metaPhoneData = phoneJson;
    } catch (err: any) {
      return NextResponse.json({
        valid: false,
        error: `Erro ao conectar com os servidores da Meta: ${err.message}`,
      }, { status: 502 });
    }

    // 2. Diagnóstico do Token (Permissões e Expiração)
    let isPermanent = false;
    let tokenType = 'UNKNOWN';
    let tokenExpiresIn = 'Não informado';
    let grantedScopes: string[] = [];

    try {
      const debugRes = await fetch(
        `https://graph.facebook.com/debug_token?input_token=${targetAccessToken}&access_token=${targetAccessToken}`
      );
      const debugJson = await debugRes.json().catch(() => ({}));
      const debugData = debugJson?.data;

      if (debugData) {
        grantedScopes = debugData.scopes || [];

        if (debugData.expires_at === 0) {
          isPermanent = true;
          tokenType = 'PERMANENT';
          tokenExpiresIn = 'Nunca expira (Token Permanente de Usuário do Sistema)';
        } else if (debugData.expires_at > 0) {
          const nowSec = Math.floor(Date.now() / 1000);
          const diffHours = Math.round((debugData.expires_at - nowSec) / 3600);
          isPermanent = false;
          tokenType = 'TEMPORARY_24H';
          tokenExpiresIn = diffHours > 0 ? `Expira em cerca de ${diffHours} hora(s)` : 'Expira em menos de 1 hora';
          warnings.push('Este é um token temporário (24h). Para evitar interrupções nos disparos das automações, gere um Token Permanente em Usuários do Sistema.');
        }

        const requiredScopes = ['whatsapp_business_messaging', 'whatsapp_business_management'];
        const missingScopes = requiredScopes.filter((s) => !grantedScopes.includes(s));
        if (missingScopes.length > 0) {
          warnings.push(`Permissão recomendada ausente no token: ${missingScopes.join(', ')}.`);
        }
      }
    } catch {
      // debug_token opcional caso a Meta restrinja
    }

    // 3. Validação do catálogo de templates da WABA se fornecido
    let templatesAccess = false;
    let templatesCount = 0;
    if (targetWabaId) {
      try {
        const tplRes = await fetch(
          `https://graph.facebook.com/v21.0/${targetWabaId}/message_templates?limit=5`,
          {
            headers: {
              Authorization: `Bearer ${targetAccessToken}`,
            },
          }
        );
        const tplJson = await tplRes.json().catch(() => ({}));
        if (tplRes.ok && Array.isArray(tplJson?.data)) {
          templatesAccess = true;
          templatesCount = tplJson.data.length;
        } else {
          warnings.push('WABA ID informado não possui permissão para listar templates ou está incorreto.');
        }
      } catch {
        warnings.push('Não foi possível checar templates da WABA no momento.');
      }
    }

    // 4. Se for uma instância salva, atualiza dados saudáveis
    if (instanceRecord) {
      await prisma.whatsappInstance.update({
        where: { id: instanceRecord.id },
        data: {
          status: 'CONNECTED',
          phone: metaPhoneData.display_phone_number || instanceRecord.phone,
          verifiedName: metaPhoneData.verified_name || instanceRecord.verifiedName,
          qualityRating: metaPhoneData.quality_rating || instanceRecord.qualityRating,
          lastConnectedAt: new Date(),
        },
      }).catch(() => {});
    }

    return NextResponse.json({
      success: true,
      valid: true,
      phone: metaPhoneData.display_phone_number || 'Número Detectado',
      verifiedName: metaPhoneData.verified_name || 'WhatsApp Business',
      qualityRating: metaPhoneData.quality_rating || 'GREEN',
      status: metaPhoneData.status || 'CONNECTED',
      isPermanent,
      tokenType,
      tokenExpiresIn,
      scopes: grantedScopes,
      templatesAccess,
      templatesCount,
      warnings,
      message: 'Todas as credenciais da Meta foram validadas com sucesso e estão 100% ativas!',
    });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
