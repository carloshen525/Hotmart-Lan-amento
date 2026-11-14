import { NextResponse } from 'next/server';
import { checkoutWebhookProcessor } from '@/services/checkout';

export async function POST(
  request: Request,
  { params }: { params: { id: string } }
) {
  try {
    const rawBody = await request.text();
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
