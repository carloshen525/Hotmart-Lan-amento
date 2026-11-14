import { NextResponse } from 'next/server';
import { checkoutWebhookProcessor } from '@/services/checkout';

export async function POST(
  request: Request,
  { params }: { params: { id: string } }
) {
  try {
    const rawBody = await request.text();

    // Se for um ping vazio de validação da Hotmart ou uptime
    if (!rawBody || !rawBody.trim() || rawBody === '{}') {
      return NextResponse.json({
        received: true,
        status: 'online',
        message: 'Endpoint de Webhook validado com sucesso (Hotmart/LaunchFlow)',
      });
    }

    let payload: any;

    try {
      payload = JSON.parse(rawBody);
    } catch {
      return NextResponse.json({ error: 'JSON malformado' }, { status: 400 });
    }

    // Extrai headers relevantes para assinatura
    const headers: Record<string, string> = {};
    request.headers.forEach((value, key) => {
      headers[key.toLowerCase()] = value;
    });

    const result = await checkoutWebhookProcessor.process({
      payload,
      headers,
      integrationId: params.id,
    });

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
      ignored: result.ignored,
      eventType: result.eventType,
      platform: result.platform,
      summary: result.actionSummary,
    });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

export async function GET(
  request: Request,
  { params }: { params: { id: string } }
) {
  return NextResponse.json({
    status: 'online',
    endpoint: 'LaunchFlow Multi-Checkout Webhook Receiver',
    integrationId: params.id,
    timestamp: new Date().toISOString(),
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
