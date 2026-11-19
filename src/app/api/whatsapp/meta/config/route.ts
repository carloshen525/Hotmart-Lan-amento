import { NextResponse } from 'next/server';
import { getCurrentSession } from '@/lib/auth';

export const dynamic = 'force-dynamic';

export async function GET(request: Request) {
  try {
    const session = await getCurrentSession();
    if (!session) {
      return NextResponse.json({ error: 'Não autenticado' }, { status: 401 });
    }

    const host = request.headers.get('x-forwarded-host') || request.headers.get('host') || 'localhost:3000';
    const proto = request.headers.get('x-forwarded-proto') || (host.includes('localhost') ? 'http' : 'https');
    const baseUrl = `${proto}://${host}`;

    const activeToken = process.env.META_WEBHOOK_VERIFY_TOKEN || 'meta_webhook_verify_token_123';
    const fallbackToken = 'launchflow_meta_verify_token';

    return NextResponse.json({
      success: true,
      callbackUrl: `${baseUrl}/api/webhooks/whatsapp/meta`,
      verifyToken: activeToken,
      fallbackToken,
      acceptedTokens: [activeToken, fallbackToken],
    });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
