import { NextResponse } from 'next/server';
import { formWebhookProcessor } from '@/services/wordpress';

export async function POST(
  request: Request,
  { params }: { params: { id: string } }
) {
  try {
    const contentType = (request.headers.get('content-type') || '').toLowerCase();
    const url = new URL(request.url);
    const querySecret = url.searchParams.get('secret') || url.searchParams.get('token') || undefined;

    let payload: Record<string, any> = {};

    // 1. Processamento flexível para multipart/form-data (Padrão Elementor Forms)
    if (contentType.includes('multipart/form-data')) {
      try {
        const formData = await request.formData();
        formData.forEach((value, key) => {
          if (typeof value === 'string') {
            payload[key] = value;
          }
        });
      } catch {
        // Fallback para leitura bruta
        const raw = await request.text();
        const searchParams = new URLSearchParams(raw);
        searchParams.forEach((value, key) => {
          payload[key] = value;
        });
      }
    }
    // 2. Processamento para application/x-www-form-urlencoded
    else if (contentType.includes('application/x-www-form-urlencoded')) {
      const raw = await request.text();
      const searchParams = new URLSearchParams(raw);
      searchParams.forEach((value, key) => {
        payload[key] = value;
      });
    }
    // 3. Processamento para application/json ou raw text
    else {
      const raw = await request.text();
      if (!raw || !raw.trim() || raw === '{}') {
        // Ping de verificação do Elementor ou uptime
        return NextResponse.json({
          received: true,
          status: 'online',
          message: 'Endpoint de Webhook WordPress/Elementor validado com sucesso (LaunchFlow)',
        });
      }

      try {
        payload = JSON.parse(raw);
      } catch {
        // Tenta como urlencoded se o JSON falhar
        const searchParams = new URLSearchParams(raw);
        searchParams.forEach((value, key) => {
          payload[key] = value;
        });
      }
    }

    // Se o payload continuar vazio mas houver query params, usa query params como fallback
    if (Object.keys(payload).length === 0 && url.searchParams.size > 0) {
      url.searchParams.forEach((value, key) => {
        if (key !== 'secret' && key !== 'token') {
          payload[key] = value;
        }
      });
    }

    // Headers relevantes para segurança e auditoria
    const headers: Record<string, string> = {};
    request.headers.forEach((value, key) => {
      headers[key.toLowerCase()] = value;
    });

    const ipAddress =
      headers['x-forwarded-for']?.split(',')[0]?.trim() ||
      headers['x-real-ip'] ||
      undefined;
    const userAgent = headers['user-agent'] || undefined;

    const result = await formWebhookProcessor.process({
      integrationId: params.id,
      payload,
      headers,
      querySecret,
      ipAddress,
      userAgent,
    });

    if (!result.success) {
      const status = result.error?.includes('401') ? 401 : 400;
      return NextResponse.json(
        {
          success: false,
          error: result.error,
          summary: result.actionSummary,
        },
        { status }
      );
    }

    return NextResponse.json({
      success: true,
      received: true,
      contactId: result.contactId,
      email: result.contactEmail,
      isNewContact: result.isNewContact,
      tagsApplied: result.tagsApplied,
      automationsTriggered: result.automationsTriggered,
      summary: result.actionSummary,
    });
  } catch (err: any) {
    return NextResponse.json(
      { success: false, error: err.message || 'Erro interno no processamento' },
      { status: 500 }
    );
  }
}

export async function GET(
  request: Request,
  { params }: { params: { id: string } }
) {
  return NextResponse.json({
    status: 'online',
    endpoint: 'LaunchFlow WordPress / Elementor Webhook Receiver',
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
