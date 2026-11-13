import { NextResponse } from 'next/server';
import { getActiveTenantId } from '@/lib/tenancy';
import { EmailService } from '@/services/email';

export async function POST(request: Request) {
  try {
    const tenantId = await getActiveTenantId();
    if (!tenantId) {
      return NextResponse.json({ error: 'Tenant não autenticado' }, { status: 401 });
    }

    const body = await request.json();
    const {
      testEmail,
      smtpHost,
      smtpPort,
      smtpSecure,
      smtpUsername,
      smtpPassword,
      fromName,
      fromEmail,
      replyTo,
    } = body;

    const result = await EmailService.testConnection(tenantId, testEmail, {
      smtpHost,
      smtpPort,
      smtpSecure,
      smtpUsername,
      smtpPassword,
      fromName,
      fromEmail,
      replyTo,
    });

    if (!result.success) {
      return NextResponse.json(
        {
          success: false,
          error: result.error || 'Falha ao testar conexão com o servidor SMTP.',
        },
        { status: 400 }
      );
    }

    return NextResponse.json({
      success: true,
      message: testEmail
        ? `Conexão SMTP validada e e-mail de teste enviado com sucesso para ${testEmail}!`
        : 'Conexão SMTP com o servidor autenticada com sucesso!',
      messageId: result.messageId,
    });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
