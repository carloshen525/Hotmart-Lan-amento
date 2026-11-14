import nodemailer, { Transporter } from 'nodemailer';
import { EmailProvider } from '../provider.interface';
import { EmailOptions, EmailResult, EmailSettingsData, VerifyResult } from '../types';

export class SMTPProvider implements EmailProvider {
  private transporter: Transporter;
  private settings: EmailSettingsData;

  constructor(settings: EmailSettingsData) {
    this.settings = settings;

    this.transporter = nodemailer.createTransport({
      host: settings.smtpHost,
      port: settings.smtpPort,
      secure: settings.smtpSecure, // true para porta 465, false para 587/STARTTLS
      auth: {
        user: settings.smtpUsername,
        pass: settings.smtpPassword || '',
      },
      tls: {
        rejectUnauthorized: false, // Compatibilidade com servidores que possuem certificados auto-assinados
      },
      connectionTimeout: 12000, // 12 segundos timeout
      greetingTimeout: 12000,
    });
  }

  /**
   * Converte erros técnicos do Nodemailer em mensagens amigáveis e claras para o usuário
   */
  private formatFriendlyError(err: any): string {
    const msg = (err?.message || '').toLowerCase();
    const code = (err?.code || '').toUpperCase();
    const response = (err?.response || '').toLowerCase();

    // 1. Erro de autenticação (usuário ou senha incorretos)
    if (
      code === 'EAUTH' ||
      msg.includes('invalid login') ||
      msg.includes('badcredentials') ||
      msg.includes('535') ||
      msg.includes('authentication failed') ||
      response.includes('535') ||
      msg.includes('username and password not accepted')
    ) {
      if (
        this.settings.smtpHost.includes('google') ||
        this.settings.smtpHost.includes('gmail')
      ) {
        return 'Usuário ou Senha SMTP inválidos. No Gmail / Google Workspace, é obrigatório gerar uma "Senha de Aplicativo" de 16 caracteres em sua Conta Google (com verificação em 2 etapas ativa). Não utilize sua senha pessoal.';
      }
      return 'Usuário ou Senha SMTP inválidos. O servidor recusou a autenticação. Verifique se o e-mail e a senha digitados estão corretos.';
    }

    // 2. Erro de conexão / timeout / host não encontrado
    if (
      code === 'ETIMEDOUT' ||
      code === 'ECONNREFUSED' ||
      code === 'ENOTFOUND' ||
      msg.includes('timeout') ||
      msg.includes('getaddrinfo')
    ) {
      return `Não foi possível conectar ao servidor SMTP (${this.settings.smtpHost}:${this.settings.smtpPort}). Verifique se o Servidor (Host) e a Porta estão corretos.`;
    }

    // 3. Erro de porta ou SSL/TLS
    if (
      msg.includes('wrong version number') ||
      msg.includes('ssl routines') ||
      msg.includes('upgrade to starttls') ||
      msg.includes('handshake failure')
    ) {
      return 'Porta SMTP ou Tipo de Segurança divergente. Para porta 465, ative "Conexão Segura SSL/TLS". Para porta 587, deixe desmarcado (STARTTLS).';
    }

    // 4. Erro de remetente rejeitado
    if (
      code === 'EENVELOPE' ||
      response.includes('550') ||
      response.includes('553') ||
      msg.includes('sender address rejected')
    ) {
      return `O servidor recusou o endereço de envio (${this.settings.fromEmail}). Verifique se o e-mail de envio informado é o mesmo da conta autenticada.`;
    }

    return err.message || 'Falha ao conectar ou autenticar no servidor SMTP.';
  }

  async verify(): Promise<VerifyResult> {
    try {
      await this.transporter.verify();
      return { success: true };
    } catch (err: any) {
      return {
        success: false,
        error: this.formatFriendlyError(err),
      };
    }
  }

  async send(options: EmailOptions): Promise<EmailResult> {
    try {
      const fromName = options.fromName || this.settings.fromName;
      const fromEmail = options.fromEmail || this.settings.fromEmail;
      const fromHeader = `"${fromName}" <${fromEmail}>`;
      const replyToHeader = options.replyTo || this.settings.replyTo || fromEmail;

      const info = await this.transporter.sendMail({
        from: fromHeader,
        to: options.to,
        replyTo: replyToHeader,
        subject: options.subject,
        html: options.html,
        text: options.text,
      });

      return {
        success: true,
        messageId: info.messageId,
        provider: 'SMTP',
        status: 'SENT',
      };
    } catch (err: any) {
      return {
        success: false,
        provider: 'SMTP',
        status: 'FAILED',
        error: this.formatFriendlyError(err),
      };
    }
  }
}
