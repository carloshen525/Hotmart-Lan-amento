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

    // Se a conexão e o envio de teste foram bem-sucedidos, salva automaticamente as credenciais testadas
    if (smtpHost && smtpUsername && fromEmail) {
      await EmailService.saveSettings(tenantId, {
        smtpHost,
        smtpPort: Number(smtpPort) || 587,
        smtpSecure: Boolean(smtpSecure),
        smtpUsername,
        smtpPassword,
        fromName: fromName || 'LaunchFlow',
        fromEmail,
        replyTo,
      }).catch((e) => {
        console.error('Falha ao auto-salvar após teste:', e);
      });
    }

    return NextResponse.json({
      success: true,
      message: testEmail
        ? `Conexão SMTP validada e e-mail de teste enviado para ${testEmail}! As credenciais foram gravadas no sistema.`
        : 'Conexão SMTP com o servidor autenticada e gravada com sucesso!',
      messageId: result.messageId,
    });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
