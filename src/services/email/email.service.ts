import { prisma } from '@/lib/prisma';
import { encryptSecret, decryptSecret } from '@/lib/crypto';
import { EmailProvider } from './provider.interface';
import { SMTPProvider } from './providers/smtp.provider';
import { EmailQueueService, EnqueueEmailOptions } from './queue.service';
import {
  EmailOptions,
  EmailResult,
  EmailSettingsData,
  VerifyResult,
} from './types';

export class EmailService {
  /**
   * Garante que as tabelas de e-mail existam no banco SQLite mesmo se o push do Prisma
   * ainda não tiver sido executado no ambiente de produção/deploy (ex: Easypanel/Docker)
   */
  private static async ensureTables(): Promise<void> {
    try {
      await prisma.$executeRawUnsafe(`
        CREATE TABLE IF NOT EXISTS email_settings (
          id TEXT PRIMARY KEY,
          tenantId TEXT UNIQUE NOT NULL,
          provider TEXT NOT NULL DEFAULT 'SMTP',
          smtpHost TEXT NOT NULL,
          smtpPort INTEGER NOT NULL DEFAULT 587,
          smtpSecure INTEGER NOT NULL DEFAULT 0,
          smtpUsername TEXT NOT NULL,
          smtpPassword TEXT NOT NULL,
          fromName TEXT NOT NULL,
          fromEmail TEXT NOT NULL,
          replyTo TEXT,
          createdAt DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
          updatedAt DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
        );
      `);

      await prisma.$executeRawUnsafe(`
        CREATE TABLE IF NOT EXISTS email_logs (
          id TEXT PRIMARY KEY,
          tenantId TEXT NOT NULL,
          "to" TEXT NOT NULL,
          subject TEXT NOT NULL,
          status TEXT NOT NULL DEFAULT 'SENT',
          provider TEXT NOT NULL DEFAULT 'SMTP',
          errorMessage TEXT,
          messageId TEXT,
          metadata TEXT,
          createdAt DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
        );
      `);

      await prisma.$executeRawUnsafe(`
        CREATE TABLE IF NOT EXISTS email_templates (
          id TEXT PRIMARY KEY,
          tenant_id TEXT NOT NULL,
          name TEXT NOT NULL,
          subject TEXT,
          content_json TEXT NOT NULL,
          generated_html TEXT NOT NULL,
          category TEXT DEFAULT 'custom',
          created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
          updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
        );
      `);
    } catch {
      // Ignora erro se já existirem ou se for outro dialeto
    }
  }

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

    try {
      // 1. Tenta via ORM Prisma se o delegate estiver disponível
      if ((prisma as any).emailSettings) {
        const row = await (prisma as any).emailSettings.findUnique({
          where: { tenantId },
        });

        if (!row) return null;

        return {
          id: row.id,
          tenantId: row.tenantId,
          provider: row.provider as any,
          smtpHost: row.smtpHost,
          smtpPort: Number(row.smtpPort) || 587,
          smtpSecure: Boolean(row.smtpSecure),
          smtpUsername: row.smtpUsername,
          smtpPassword: decryptSecret(row.smtpPassword),
          fromName: row.fromName,
          fromEmail: row.fromEmail,
          replyTo: row.replyTo,
          createdAt: row.createdAt,
          updatedAt: row.updatedAt,
        };
      }
    } catch {
      // Fallback para query direta caso o delegate do Prisma não esteja ativo
    }

    // 2. Fallback SQL resiliente
    try {
      await this.ensureTables();
      const rows: any[] = await prisma.$queryRawUnsafe(
        `SELECT * FROM email_settings WHERE tenantId = ? LIMIT 1;`,
        tenantId
      );

      if (!rows || rows.length === 0) return null;
      const row = rows[0];

      return {
        id: row.id,
        tenantId: row.tenantId,
        provider: row.provider || 'SMTP',
        smtpHost: row.smtpHost,
        smtpPort: Number(row.smtpPort) || 587,
        smtpSecure: Boolean(row.smtpSecure === 1 || row.smtpSecure === true),
        smtpUsername: row.smtpUsername,
        smtpPassword: decryptSecret(row.smtpPassword),
        fromName: row.fromName,
        fromEmail: row.fromEmail,
        replyTo: row.replyTo,
        createdAt: new Date(row.createdAt),
        updatedAt: new Date(row.updatedAt),
      };
    } catch {
      return null;
    }
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

    // Obtém configuração atual para manter a senha caso não tenha sido alterada
    const existing = await this.getSettings(tenantId);

    let finalEncryptedPassword = '';
    if (data.smtpPassword && !data.smtpPassword.includes('••••')) {
      finalEncryptedPassword = encryptSecret(data.smtpPassword);
    } else if (existing?.smtpPassword) {
      finalEncryptedPassword = encryptSecret(existing.smtpPassword);
    }

    const providerName = data.provider || 'SMTP';
    const host = data.smtpHost.trim();
    const port = Number(data.smtpPort) || 587;
    const secure = Boolean(data.smtpSecure);
    const user = data.smtpUsername.trim();
    const fromN = data.fromName.trim();
    const fromE = data.fromEmail.trim();
    const reply = data.replyTo?.trim() || null;

    // 1. Tenta persistência via delegate do Prisma
    try {
      if ((prisma as any).emailSettings) {
        const saved = await (prisma as any).emailSettings.upsert({
          where: { tenantId },
          create: {
            tenantId,
            provider: providerName,
            smtpHost: host,
            smtpPort: port,
            smtpSecure: secure,
            smtpUsername: user,
            smtpPassword: finalEncryptedPassword,
            fromName: fromN,
            fromEmail: fromE,
            replyTo: reply,
          },
          update: {
            provider: providerName,
            smtpHost: host,
            smtpPort: port,
            smtpSecure: secure,
            smtpUsername: user,
            smtpPassword: finalEncryptedPassword,
            fromName: fromN,
            fromEmail: fromE,
            replyTo: reply,
          },
        });

        return {
          id: saved.id,
          tenantId: saved.tenantId,
          provider: saved.provider as any,
          smtpHost: saved.smtpHost,
          smtpPort: Number(saved.smtpPort) || 587,
          smtpSecure: Boolean(saved.smtpSecure),
          smtpUsername: saved.smtpUsername,
          smtpPassword: decryptSecret(saved.smtpPassword),
          fromName: saved.fromName,
          fromEmail: saved.fromEmail,
          replyTo: saved.replyTo,
          createdAt: saved.createdAt,
          updatedAt: saved.updatedAt,
        };
      }
    } catch {
      // Falha no delegate, aciona fallback SQL
    }

    // 2. Fallback SQL resiliente para Easypanel / Docker
    await this.ensureTables();
    const existingId = existing?.id || `email_set_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
    const secureInt = secure ? 1 : 0;

    await prisma.$executeRawUnsafe(
      `
      INSERT INTO email_settings (
        id, tenantId, provider, smtpHost, smtpPort, smtpSecure, smtpUsername, smtpPassword, fromName, fromEmail, replyTo, createdAt, updatedAt
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
      ON CONFLICT(tenantId) DO UPDATE SET
        provider = excluded.provider,
        smtpHost = excluded.smtpHost,
        smtpPort = excluded.smtpPort,
        smtpSecure = excluded.smtpSecure,
        smtpUsername = excluded.smtpUsername,
        smtpPassword = excluded.smtpPassword,
        fromName = excluded.fromName,
        fromEmail = excluded.fromEmail,
        replyTo = excluded.replyTo,
        updatedAt = CURRENT_TIMESTAMP;
      `,
      existingId,
      tenantId,
      providerName,
      host,
      port,
      secureInt,
      user,
      finalEncryptedPassword,
      fromN,
      fromE,
      reply
    );

    return {
      id: existingId,
      tenantId,
      provider: providerName as any,
      smtpHost: host,
      smtpPort: port,
      smtpSecure: secure,
      smtpUsername: user,
      smtpPassword: decryptSecret(finalEncryptedPassword),
      fromName: fromN,
      fromEmail: fromE,
      replyTo: reply,
      createdAt: new Date(),
      updatedAt: new Date(),
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

    if (!settings || !settings.smtpHost || !settings.smtpUsername || !settings.smtpPassword) {
      return {
        success: false,
        error: 'Configurações de SMTP incompletas. Informe o Servidor, Usuário e a Senha SMTP (ou Senha de Aplicativo do Gmail).',
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

      // Registrar log do teste de forma resiliente
      await this.recordLog({
        tenantId,
        to: testEmail,
        subject: '[LaunchFlow] Teste de Conexão SMTP',
        status: sendRes.status,
        provider: 'SMTP',
        errorMessage: sendRes.error || null,
        messageId: sendRes.messageId || null,
        metadata: JSON.stringify({ isTest: true }),
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
   * Envia e-mail passando obrigatoriamente pela fila organizada (Email Queue),
   * a menos que seja solicitado envio imediato (ex: testes de conexão)
   */
  static async send(tenantId: string, options: EmailOptions): Promise<EmailResult> {
    if (!tenantId) {
      throw new Error('Tenant ID não fornecido. O envio de e-mails exige autenticação de tenant.');
    }

    // Se solicitado envio imediato explícito (ex: tela de teste)
    if (options.immediate) {
      return this.sendDirect(tenantId, options);
    }

    // Passagem obrigatória pela fila (Email Queue)
    const queueId = await EmailQueueService.enqueue({
      tenantId,
      to: options.to,
      subject: options.subject,
      html: options.html,
      scheduledAt: options.scheduledAt,
      contactId: options.contactId,
      metadata: options.metadata,
    });

    return {
      success: true,
      messageId: queueId,
      queueId,
      provider: 'SMTP',
      status: 'QUEUED',
    };
  }

  /**
   * Envia e-mail de forma direta através do provedor SMTP (utilizado pelo Worker da fila e por testes manuais)
   */
  static async sendDirect(tenantId: string, options: EmailOptions): Promise<EmailResult> {
    if (!tenantId) {
      throw new Error('Tenant ID não fornecido. O envio de e-mails exige autenticação de tenant.');
    }

    const settings = await this.getSettings(tenantId);
    if (!settings || !settings.smtpHost) {
      const errMsg = 'Configurações de e-mail (SMTP) não encontradas ou incompletas para este expert.';
      await this.recordLog({
        tenantId,
        to: options.to,
        subject: options.subject,
        status: 'FAILED',
        provider: 'SMTP',
        errorMessage: errMsg,
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

    const isCompleteDoc = processedHtml.includes('<!DOCTYPE') || processedHtml.includes('<html');
    let finalHtml = processedHtml;

    if (isCompleteDoc) {
      // Já é um e-mail responsivo completo gerado pelo Email Builder: injeta link de opt-out sem quebrar o DOCTYPE
      finalHtml = finalHtml.replace(/{{optout_url}}/g, unsubscribeLink);
    } else {
      // E-mail em fragmento de texto simples: aplica container e rodapé padrão
      finalHtml = `
        <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; color: #1e293b; line-height: 1.6;">
          ${processedHtml}
          ${footerHtml}
        </div>
      `;
    }

    const provider = this.createProvider(settings);
    const result = await provider.send({
      ...options,
      html: finalHtml,
    });

    // Registrar na tabela de auditoria email_logs
    await this.recordLog({
      tenantId,
      to: options.to,
      subject: options.subject,
      status: result.status as any,
      provider: result.provider,
      errorMessage: result.error || null,
      messageId: result.messageId || null,
      metadata: options.metadata ? JSON.stringify(options.metadata) : null,
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
          content: finalHtml,
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
   * Enfileira diretamente na fila de e-mails
   */
  static async enqueue(options: EnqueueEmailOptions): Promise<string> {
    return EmailQueueService.enqueue(options);
  }

  /**
   * Grava log de envio na tabela de auditoria de forma 100% segura e resiliente
   */
  private static async recordLog(data: {
    tenantId: string;
    to: string;
    subject: string;
    status: string;
    provider: string;
    errorMessage?: string | null;
    messageId?: string | null;
    metadata?: string | null;
  }): Promise<void> {
    try {
      if ((prisma as any).emailLog) {
        await (prisma as any).emailLog.create({ data });
        return;
      }
    } catch {}

    // Fallback SQL
    try {
      await this.ensureTables();
      const logId = `elog_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
      await prisma.$executeRawUnsafe(
        `
        INSERT INTO email_logs (id, tenantId, "to", subject, status, provider, errorMessage, messageId, metadata, createdAt)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP);
        `,
        logId,
        data.tenantId,
        data.to,
        data.subject,
        data.status,
        data.provider,
        data.errorMessage || null,
        data.messageId || null,
        data.metadata || null
      );
    } catch (e) {
      console.error('Falha ao gravar log de email (fallback):', e);
    }
  }

  /**
   * Lista o histórico de logs de e-mail do tenant
   */
  static async getLogs(tenantId: string, limit = 50) {
    if (!tenantId) return [];

    try {
      if ((prisma as any).emailLog) {
        return await (prisma as any).emailLog.findMany({
          where: { tenantId },
          orderBy: { createdAt: 'desc' },
          take: limit,
        });
      }
    } catch {}

    // Fallback SQL
    try {
      await this.ensureTables();
      const rows: any[] = await prisma.$queryRawUnsafe(
        `SELECT * FROM email_logs WHERE tenantId = ? ORDER BY createdAt DESC LIMIT ?;`,
        tenantId,
        limit
      );
      return rows.map((r) => ({
        id: r.id,
        tenantId: r.tenantId,
        to: r.to,
        subject: r.subject,
        status: r.status,
        provider: r.provider,
        errorMessage: r.errorMessage,
        messageId: r.messageId,
        metadata: r.metadata,
        createdAt: new Date(r.createdAt),
      }));
    } catch {
      return [];
    }
  }
}
