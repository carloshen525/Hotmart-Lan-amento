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
      connectionTimeout: 10000, // 10 segundos timeout
      greetingTimeout: 10000,
    });
  }

  async verify(): Promise<VerifyResult> {
    try {
      await this.transporter.verify();
      return { success: true };
    } catch (err: any) {
      return {
        success: false,
        error: err.message || 'Falha ao autenticar no servidor SMTP',
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
        error: err.message || 'Erro desconhecido ao enviar e-mail via SMTP',
      };
    }
  }
}
