import { NextResponse } from 'next/server';
import { getActiveTenantId } from '@/lib/tenancy';
import { EmailService } from '@/services/email';

export async function GET() {
  try {
    const tenantId = await getActiveTenantId();
    if (!tenantId) {
      return NextResponse.json({ error: 'Tenant não autenticado' }, { status: 401 });
    }

    const settings = await EmailService.getSettings(tenantId);
    if (!settings) {
      return NextResponse.json({
        settings: null,
        configured: false,
      });
    }

    // Mascarar a senha por segurança
    return NextResponse.json({
      configured: Boolean(settings.smtpHost && settings.smtpUsername),
      settings: {
        id: settings.id,
        provider: settings.provider,
        smtpHost: settings.smtpHost,
        smtpPort: settings.smtpPort,
        smtpSecure: settings.smtpSecure,
        smtpUsername: settings.smtpUsername,
        smtpPassword: settings.smtpPassword ? '••••••••••••' : '',
        hasPassword: Boolean(settings.smtpPassword),
        fromName: settings.fromName,
        fromEmail: settings.fromEmail,
        replyTo: settings.replyTo || '',
      },
    });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const tenantId = await getActiveTenantId();
    if (!tenantId) {
      return NextResponse.json({ error: 'Tenant não autenticado' }, { status: 401 });
    }

    const body = await request.json();
    const {
      provider,
      smtpHost,
      smtpPort,
      smtpSecure,
      smtpUsername,
      smtpPassword,
      fromName,
      fromEmail,
      replyTo,
    } = body;

    if (!smtpHost || !smtpUsername || !fromEmail) {
      return NextResponse.json(
        { error: 'Servidor SMTP, Usuário e E-mail de Envio são obrigatórios.' },
        { status: 400 }
      );
    }

    const saved = await EmailService.saveSettings(tenantId, {
      provider: provider || 'SMTP',
      smtpHost,
      smtpPort: Number(smtpPort) || 587,
      smtpSecure: Boolean(smtpSecure),
      smtpUsername,
      smtpPassword,
      fromName: fromName || 'LaunchFlow',
      fromEmail,
      replyTo,
    });

    return NextResponse.json({
      success: true,
      message: 'Configurações de e-mail salvas com sucesso!',
      settings: {
        id: saved.id,
        provider: saved.provider,
        smtpHost: saved.smtpHost,
        smtpPort: saved.smtpPort,
        smtpSecure: saved.smtpSecure,
        smtpUsername: saved.smtpUsername,
        hasPassword: Boolean(saved.smtpPassword),
        fromName: saved.fromName,
        fromEmail: saved.fromEmail,
        replyTo: saved.replyTo || '',
      },
    });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

export async function DELETE() {
  try {
    const tenantId = await getActiveTenantId();
    if (!tenantId) {
      return NextResponse.json({ error: 'Tenant não autenticado' }, { status: 401 });
    }

    await EmailService.deleteSettings(tenantId);
    return NextResponse.json({
      success: true,
      message: 'Conta de e-mail desconectada com sucesso!',
    });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
