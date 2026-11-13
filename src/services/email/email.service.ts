import { prisma } from '@/lib/prisma';
import { encryptSecret, decryptSecret } from '@/lib/crypto';
import { EmailProvider } from './provider.interface';
import { SMTPProvider } from './providers/smtp.provider';
import {
  EmailOptions,
  EmailResult,
  EmailSettingsData,
  VerifyResult,
} from './types';

export class EmailService {
  /**
   * Instancia o provedor apropriado para o tenant com base nas configurações
   */
  private static createProvider(settings: EmailSettingsData): EmailProvider {
    switch (settings.provider) {
      case 'SMTP':
      default:
        return new SMTPProvider(settings);
    }
  }

  /**
   * Obtém as configurações de e-mail de um tenant específico com a senha descriptografada
   */
  static async getSettings(tenantId: string): Promise<EmailSettingsData | null> {
    if (!tenantId) return null;

    const row = await prisma.emailSettings.findUnique({
      where: { tenantId },
    });

    if (!row) return null;

    return {
      id: row.id,
      tenantId: row.tenantId,
      provider: row.provider as any,
      smtpHost: row.smtpHost,
      smtpPort: row.smtpPort,
      smtpSecure: row.smtpSecure,
      smtpUsername: row.smtpUsername,
      smtpPassword: decryptSecret(row.smtpPassword),
      fromName: row.fromName,
      fromEmail: row.fromEmail,
      replyTo: row.replyTo,
      createdAt: row.createdAt,
      updatedAt: row.updatedAt,
    };
  }

  /**
   * Salva ou atualiza as configurações de e-mail do tenant, criptografando a senha
   */
  static async saveSettings(
    tenantId: string,
    data: {
      provider?: string;
      smtpHost: string;
      smtpPort: number;
      smtpSecure: boolean;
      smtpUsername: string;
      smtpPassword?: string;
      fromName: string;
      fromEmail: string;
      replyTo?: string | null;
    }
  ): Promise<EmailSettingsData> {
    if (!tenantId) {
      throw new Error('Tenant ID é obrigatório para salvar configurações de e-mail.');
    }

    // Se a senha não foi informada ou veio como máscara (••••••••), mantém a anterior
    let finalEncryptedPassword = '';
    const existing = await prisma.emailSettings.findUnique({
      where: { tenantId },
    });

    if (data.smtpPassword && !data.smtpPassword.includes('••••')) {
      finalEncryptedPassword = encryptSecret(data.smtpPassword);
    } else if (existing) {
      finalEncryptedPassword = existing.smtpPassword;
    }

    const saved = await prisma.emailSettings.upsert({
      where: { tenantId },
      create: {
        tenantId,
        provider: data.provider || 'SMTP',
        smtpHost: data.smtpHost.trim(),
        smtpPort: Number(data.smtpPort) || 587,
        smtpSecure: Boolean(data.smtpSecure),
        smtpUsername: data.smtpUsername.trim(),
        smtpPassword: finalEncryptedPassword,
        fromName: data.fromName.trim(),
        fromEmail: data.fromEmail.trim(),
        replyTo: data.replyTo?.trim() || null,
      },
      update: {
        provider: data.provider || 'SMTP',
        smtpHost: data.smtpHost.trim(),
        smtpPort: Number(data.smtpPort) || 587,
        smtpSecure: Boolean(data.smtpSecure),
        smtpUsername: data.smtpUsername.trim(),
        smtpPassword: finalEncryptedPassword,
        fromName: data.fromName.trim(),
        fromEmail: data.fromEmail.trim(),
        replyTo: data.replyTo?.trim() || null,
      },
    });

    return {
      id: saved.id,
      tenantId: saved.tenantId,
      provider: saved.provider as any,
      smtpHost: saved.smtpHost,
      smtpPort: saved.smtpPort,
      smtpSecure: saved.smtpSecure,
      smtpUsername: saved.smtpUsername,
      smtpPassword: decryptSecret(saved.smtpPassword),
      fromName: saved.fromName,
      fromEmail: saved.fromEmail,
      replyTo: saved.replyTo,
      createdAt: saved.createdAt,
      updatedAt: saved.updatedAt,
    };
  }

  /**
   * Testa a conexão SMTP e envia um e-mail de teste
   */
  static async testConnection(
    tenantId: string,
    testEmail: string,
    customConfig?: Partial<EmailSettingsData>
  ): Promise<VerifyResult & { messageId?: string }> {
    let settings: EmailSettingsData | null = null;

    if (customConfig && customConfig.smtpHost && customConfig.smtpUsername) {
      // Se a senha veio como máscara, recupera a salva no banco
      let pass = customConfig.smtpPassword || '';
      if (!pass || pass.includes('••••')) {
        const existing = await this.getSettings(tenantId);
        pass = existing?.smtpPassword || '';
      }

      settings = {
        tenantId,
        provider: (customConfig.provider as any) || 'SMTP',
        smtpHost: customConfig.smtpHost,
        smtpPort: Number(customConfig.smtpPort) || 587,
        smtpSecure: Boolean(customConfig.smtpSecure),
        smtpUsername: customConfig.smtpUsername,
        smtpPassword: pass,
        fromName: customConfig.fromName || 'LaunchFlow Teste',
        fromEmail: customConfig.fromEmail || customConfig.smtpUsername,
        replyTo: customConfig.replyTo,
      };
    } else {
      settings = await this.getSettings(tenantId);
    }

    if (!settings || !settings.smtpHost || !settings.smtpUsername) {
      return {
        success: false,
        error: 'Configurações de SMTP incompletas. Preencha Servidor, Usuário e Senha.',
      };
    }

    const provider = this.createProvider(settings);
    const verifyRes = await provider.verify();

    if (!verifyRes.success) {
      return verifyRes;
    }

    // Se o usuário solicitou envio de e-mail de teste para validação completa
    if (testEmail) {
      const html = `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 24px; border: 1px solid #e2e8f0; border-radius: 12px; background: #ffffff;">
          <h2 style="color: #10b981; margin-top: 0;">✔ Conexão SMTP Estabelecida com Sucesso!</h2>
          <p style="color: #334155; font-size: 14px; line-height: 1.6;">
            Este é um e-mail de teste enviado pela plataforma <strong>LaunchFlow</strong> utilizando as credenciais exclusivas do seu expert.
          </p>
          <div style="background: #f8fafc; border: 1px solid #e2e8f0; padding: 14px; border-radius: 8px; margin: 16px 0; font-size: 12px; color: #475569; font-family: monospace;">
            <strong>Servidor:</strong> ${settings.smtpHost}:${settings.smtpPort}<br>
            <strong>Usuário:</strong> ${settings.smtpUsername}<br>
            <strong>Remetente:</strong> ${settings.fromName} &lt;${settings.fromEmail}&gt;<br>
            <strong>Segurança SSL/TLS:</strong> ${settings.smtpSecure ? 'Ativado (SSL)' : 'STARTTLS (Porta 587)'}<br>
            <strong>Data/Hora do Teste:</strong> ${new Date().toLocaleString('pt-BR')}
          </div>
          <p style="color: #64748b; font-size: 12px; margin-bottom: 0;">
            Se você recebeu este e-mail, seu módulo de disparos está 100% pronto para automações de vendas, recuperação de carrinho e campanhas.
          </p>
        </div>
      `;

      const sendRes = await provider.send({
        to: testEmail,
        subject: `[LaunchFlow] Teste de Conexão SMTP - ${new Date().toLocaleTimeString('pt-BR')}`,
        html,
      });

      // Registrar log do teste
      await prisma.emailLog.create({
        data: {
          tenantId,
          to: testEmail,
          subject: '[LaunchFlow] Teste de Conexão SMTP',
          status: sendRes.status,
          provider: 'SMTP',
          errorMessage: sendRes.error || null,
          messageId: sendRes.messageId || null,
          metadata: JSON.stringify({ isTest: true }),
        },
      });

      if (!sendRes.success) {
        return {
          success: false,
          error: `Conectou ao servidor, mas falhou ao entregar o e-mail: ${sendRes.error}`,
        };
      }

      return { success: true, messageId: sendRes.messageId };
    }

    return { success: true };
  }

  /**
   * Envia e-mail utilizando strictly as credenciais do tenant autenticado
   */
  static async send(tenantId: string, options: EmailOptions): Promise<EmailResult> {
    if (!tenantId) {
      throw new Error('Tenant ID não fornecido. O envio de e-mails exige autenticação de tenant.');
    }

    const settings = await this.getSettings(tenantId);
    if (!settings || !settings.smtpHost) {
      const errMsg = 'Configurações de e-mail (SMTP) não encontradas ou incompletas para este expert.';
      await prisma.emailLog.create({
        data: {
          tenantId,
          to: options.to,
          subject: options.subject,
          status: 'FAILED',
          provider: 'SMTP',
          errorMessage: errMsg,
        },
      });
      return {
        success: false,
        provider: 'SMTP',
        status: 'FAILED',
        error: errMsg,
      };
    }

    // Interpolação de variáveis personalizadas (ex: {{nome}}, {{email}})
    let processedHtml = options.html;
    if (options.variables) {
      for (const [key, value] of Object.entries(options.variables)) {
        processedHtml = processedHtml.replace(new RegExp(`{{${key}}}`, 'g'), String(value || ''));
      }
    }

    // Rodapé de opt-out LGPD
    const appUrl = process.env.APP_URL || 'http://localhost:3000';
    const unsubscribeLink = `${appUrl}/api/contacts/unsubscribe?email=${encodeURIComponent(
      options.to
    )}&tenant=${tenantId}`;
    const footerHtml = `
      <div style="margin-top: 32px; padding-top: 16px; border-top: 1px solid #e2e8f0; font-size: 11px; color: #64748b; text-align: center;">
        <p>Você recebeu esta comunicação porque solicitou ou realizou inscrição neste lançamento.</p>
        <p><a href="${unsubscribeLink}" style="color: #6366f1; text-decoration: underline;">Cancelar recebimento</a> a qualquer momento.</p>
      </div>
    `;

    const fullHtml = `
      <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; color: #1e293b; line-height: 1.6;">
        ${processedHtml}
        ${footerHtml}
      </div>
    `;

    const provider = this.createProvider(settings);
    const result = await provider.send({
      ...options,
      html: fullHtml,
    });

    // Registrar na tabela de auditoria email_logs
    await prisma.emailLog.create({
      data: {
        tenantId,
        to: options.to,
        subject: options.subject,
        status: result.status,
        provider: result.provider,
        errorMessage: result.error || null,
        messageId: result.messageId || null,
        metadata: options.metadata ? JSON.stringify(options.metadata) : null,
      },
    });

    // Opcional: registrar também no CRM MessageLog se o lead estiver cadastrado
    if (options.contactId) {
      await prisma.messageLog.create({
        data: {
          tenantId,
          contactId: options.contactId,
          channel: 'EMAIL',
          provider: result.provider,
          recipient: options.to,
          subject: options.subject,
          content: fullHtml,
          status: result.status === 'SENT' ? 'DELIVERED' : 'FAILED',
          externalMessageId: result.messageId,
          deliveredAt: result.status === 'SENT' ? new Date() : null,
          error: result.error,
        },
      }).catch(() => {});
    }

    return result;
  }

  /**
   * Lista o histórico de logs de e-mail do tenant
   */
  static async getLogs(tenantId: string, limit = 50) {
    if (!tenantId) return [];

    return prisma.emailLog.findMany({
      where: { tenantId },
      orderBy: { createdAt: 'desc' },
      take: limit,
    });
  }
}
