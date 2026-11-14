import nodemailer, { Transporter } from 'nodemailer';
import fs from 'fs';
import path from 'path';
import { EmailProvider } from '../provider.interface';
import { EmailOptions, EmailResult, EmailSettingsData, VerifyResult } from '../types';

interface AttachmentItem {
  filename: string;
  content: Buffer;
  cid: string;
  contentType: string;
  contentDisposition?: string;
}

/**
 * Converte imagens Base64 (data:image/...) e arquivos locais (/uploads/...) em anexos inline com CID
 * para que clientes de e-mail (como Gmail e Outlook) exibam as imagens perfeitamente
 * e nunca cortem a mensagem por tamanho excedido (limite de 102KB do Gmail).
 */
export function processHtmlInlineImages(html: string): {
  processedHtml: string;
  attachments: AttachmentItem[];
} {
  const attachments: AttachmentItem[] = [];
  if (!html) return { processedHtml: html || '', attachments };

  let processedHtml = html;
  let counter = 0;
  const timestamp = Date.now();

  // 1. Processa imagens em Base64 (data:image/...;base64,...)
  processedHtml = processedHtml.replace(
    /src=["'](data:image\/([a-zA-Z0-9+.-]+);base64,([A-Za-z0-9+/=\s]+))["']/gi,
    (match, fullDataUri, ext, base64Data) => {
      try {
        const cleanBase64 = base64Data.replace(/\s/g, '');
        const buffer = Buffer.from(cleanBase64, 'base64');
        const cid = `embedded_img_${counter}_${timestamp}`;
        counter++;

        const cleanExt = (ext || 'png').toLowerCase().replace('jpeg', 'jpg');
        attachments.push({
          filename: `imagem_${counter}.${cleanExt}`,
          content: buffer,
          cid,
          contentType: `image/${ext || 'png'}`,
          contentDisposition: 'inline',
        });

        return `src="cid:${cid}"`;
      } catch (err) {
        console.error('[SMTPProvider] Erro ao converter imagem base64 para CID:', err);
        return match;
      }
    }
  );

  // 2. Processa imagens salvas localmente no disco (/uploads/... ou uploads/...)
  processedHtml = processedHtml.replace(
    /src=["'](\/?uploads\/[^"']+)["']/gi,
    (match, localRelPath) => {
      try {
        const cleanPath = localRelPath.replace(/^\//, '');
        const diskPath = path.join(process.cwd(), 'public', cleanPath);

        if (fs.existsSync(diskPath)) {
          const buffer = fs.readFileSync(diskPath);
          const cid = `local_img_${counter}_${timestamp}`;
          counter++;

          const extName = path.extname(diskPath).toLowerCase().replace('.', '') || 'jpg';
          const mimeType =
            extName === 'png'
              ? 'image/png'
              : extName === 'gif'
              ? 'image/gif'
              : extName === 'webp'
              ? 'image/webp'
              : 'image/jpeg';

          attachments.push({
            filename: path.basename(diskPath),
            content: buffer,
            cid,
            contentType: mimeType,
            contentDisposition: 'inline',
          });

          return `src="cid:${cid}"`;
        } else {
          // Se não encontrou no disco, tenta prefixar com APP_URL se configurado
          const appUrl = (process.env.APP_URL || '').replace(/\/$/, '');
          if (appUrl) {
            return `src="${appUrl}/${cleanPath}"`;
          }
        }
      } catch (err) {
        console.error('[SMTPProvider] Erro ao anexar imagem local:', err);
      }
      return match;
    }
  );

  return { processedHtml, attachments };
}

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

      // Converte imagens Base64 e arquivos locais em anexos CID inline para o Gmail renderizar sem cortar
      const { processedHtml, attachments } = processHtmlInlineImages(options.html);
      const allAttachments = [...(options.attachments || []), ...attachments];

      // Injeta token invisível anti-agrupamento no HTML para impedir que o Gmail oculte partes do conteúdo sob reticências (...)
      const uniqueToken = `lf_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
      const antiCollapseToken = `<div style="display:none !important;visibility:hidden;mso-hide:all;font-size:1px;color:#ffffff;line-height:1px;max-height:0px;max-width:0px;opacity:0;overflow:hidden;">&#8203;&zwnj;&nbsp;${uniqueToken}</div>`;

      let finalHtml = processedHtml;
      if (finalHtml.includes('</body>')) {
        finalHtml = finalHtml.replace('</body>', `${antiCollapseToken}</body>`);
      } else {
        finalHtml = `${finalHtml}${antiCollapseToken}`;
      }

      const info = await this.transporter.sendMail({
        from: fromHeader,
        to: options.to,
        replyTo: replyToHeader,
        subject: options.subject,
        html: finalHtml,
        text: options.text,
        headers: {
          'X-Entity-Ref-ID': uniqueToken,
        },
        attachments: allAttachments.length > 0 ? allAttachments : undefined,
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
