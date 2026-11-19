import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { WhatsAppProviderFactory } from '@/services/whatsapp/providers';

export const dynamic = 'force-dynamic';

/**
 * GET /api/webhooks/whatsapp/meta
 * Verificação oficial de Webhook exigida pela Meta (Hub Challenge)
 */
export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const mode = searchParams.get('hub.mode');
    const token = searchParams.get('hub.verify_token');
    const challenge = searchParams.get('hub.challenge');

    if (mode !== 'subscribe' || !token) {
      return new Response('Modo ou token de verificação inválido', { status: 400 });
    }

    const acceptedTokens = [
      'launchflow_meta_verify_token',
      'meta_webhook_verify_token_123',
      process.env.META_WEBHOOK_VERIFY_TOKEN,
    ].filter(Boolean);

    // 1. Verifica tokens conhecidos do sistema
    if (acceptedTokens.includes(token)) {
      return new Response(challenge || '', {
        status: 200,
        headers: { 'Content-Type': 'text/plain' },
      });
    }

    // 2. Ou verifica se o token pertence a qualquer instância Meta Cloud cadastrada
    const instance = await prisma.whatsappInstance.findFirst({
      where: {
        provider: 'META_CLOUD',
        webhookVerifyToken: token,
      },
    });

    if (instance) {
      return new Response(challenge || '', {
        status: 200,
        headers: { 'Content-Type': 'text/plain' },
      });
    }

    return new Response('Token de verificação não corresponde a nenhum canal cadastrado', {
      status: 403,
    });
  } catch (err: any) {
    return new Response(err.message || 'Erro interno na verificação do webhook', { status: 500 });
  }
}

/**
 * POST /api/webhooks/whatsapp/meta
 * Recebimento de eventos da WhatsApp Business Cloud API (mensagens recebidas, status de leitura e entrega)
 */
export async function POST(request: Request) {
  try {
    const body = await request.json().catch(() => null);
    if (!body || body.object !== 'whatsapp_business_account') {
      return NextResponse.json({ status: 'ignored', reason: 'Not a whatsapp business event' }, { status: 200 });
    }

    // Extrai o phoneNumberId ou wabaId da entrada para identificar automaticamente o Tenant proprietário
    const entry = body.entry?.[0];
    const change = entry?.changes?.[0];
    const val = change?.value;
    const phoneNumberId = val?.metadata?.phone_number_id;
    const wabaId = entry?.id;

    let provider = null;
    if (phoneNumberId) {
      provider = await WhatsAppProviderFactory.getMetaProviderByPhoneNumberId(phoneNumberId);
    }
    if (!provider && wabaId) {
      provider = await WhatsAppProviderFactory.getMetaProviderByWabaId(wabaId);
    }

    if (provider) {
      const result = await provider.handleWebhook(body);
      return NextResponse.json({ success: true, processed: result.processed, eventType: result.eventType });
    }

    // Fallback: se nenhuma instância específica foi encontrada pelo ID, tenta a primeira instância Meta do sistema
    const fallbackInstance = await prisma.whatsappInstance.findFirst({
      where: { provider: 'META_CLOUD' },
    });

    if (fallbackInstance) {
      const fallbackProvider = await WhatsAppProviderFactory.getProvider(fallbackInstance);
      if (fallbackProvider) {
        await fallbackProvider.handleWebhook(body);
      }
    }

    return NextResponse.json({ success: true, status: 'received' });
  } catch (err: any) {
    console.error('[Meta Webhook] Erro ao processar evento:', err);
    // Sempre retorne 200 para a Meta não suspender o webhook por falhas transitórias
    return NextResponse.json({ success: false, error: err.message }, { status: 200 });
  }
}
