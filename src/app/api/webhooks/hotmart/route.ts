import { NextResponse } from 'next/server';
import { hotmartWebhookProcessor } from '@/services/hotmart/webhook-processor';
import { HotmartWebhookPayload } from '@/services/hotmart/types';

export async function POST(request: Request) {
  try {
    const rawBody = await request.text();

    if (!rawBody || !rawBody.trim() || rawBody === '{}') {
      return NextResponse.json({
        received: true,
        status: 'online',
        message: 'Endpoint de Webhook validado com sucesso (Hotmart 2.0)',
      });
    }

    let payload: HotmartWebhookPayload;

    try {
      payload = JSON.parse(rawBody);
    } catch {
      return NextResponse.json({ error: 'JSON malformado' }, { status: 400 });
    }

    const { searchParams } = new URL(request.url);
    const tenantIdParam = searchParams.get('tenant') || undefined;

    const result = await hotmartWebhookProcessor.process(payload, tenantIdParam);

    if (!result.success && !result.duplicate) {
      return NextResponse.json(
        {
          error: result.error,
          summary: result.actionSummary,
        },
        { status: 400 }
      );
    }

    return NextResponse.json({
      received: true,
      duplicate: result.duplicate,
      eventType: result.eventType,
      summary: result.actionSummary,
    });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

// Suporte a verificação de URL da Hotmart (GET de teste)
export async function GET() {
  return NextResponse.json({
    status: 'online',
    endpoint: 'Hotmart 2.0 Webhook Receiver',
    supportedEvents: [
      'PURCHASE_APPROVED',
      'PURCHASE_COMPLETE',
      'PURCHASE_WAITING_PAYMENT',
      'PURCHASE_OUT_OF_SHOPPING_CART',
      'PURCHASE_CANCELED',
      'PURCHASE_REFUNDED',
      'PURCHASE_CHARGEBACK',
      'PURCHASE_EXPIRED',
    ],
  });
}

export async function OPTIONS() {
  return new NextResponse(null, {
    status: 200,
    headers: {
      Allow: 'GET, POST, OPTIONS, HEAD',
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, POST, OPTIONS, HEAD',
      'Access-Control-Allow-Headers': '*',
    },
  });
}

export async function HEAD() {
  return new NextResponse(null, { status: 200 });
}
