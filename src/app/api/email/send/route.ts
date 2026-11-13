import { NextResponse } from 'next/server';
import { getActiveTenantId } from '@/lib/tenancy';
import { EmailService } from '@/services/email';

export async function POST(request: Request) {
  try {
    // Identifica estritamente o tenant autenticado via sessão/cookie
    const tenantId = await getActiveTenantId();
    if (!tenantId) {
      return NextResponse.json(
        { error: 'Não autorizado. Autenticação de tenant obrigatória.' },
        { status: 401 }
      );
    }

    const body = await request.json();
    const { to, subject, html, text, variables, contactId } = body;

    if (!to || !subject || !html) {
      return NextResponse.json(
        { error: 'Campos obrigatórios ausentes: "to", "subject" e "html".' },
        { status: 400 }
      );
    }

    // Envio executado estritamente com as credenciais do tenant autenticado
    const result = await EmailService.send(tenantId, {
      to,
      subject,
      html,
      text,
      variables,
      contactId,
    });

    if (!result.success) {
      return NextResponse.json(
        {
          success: false,
          error: result.error,
          provider: result.provider,
        },
        { status: 422 }
      );
    }

    return NextResponse.json({
      success: true,
      messageId: result.messageId,
      provider: result.provider,
      status: result.status,
    });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
