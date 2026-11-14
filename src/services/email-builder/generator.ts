import { EmailDocument, EmailBlock, EmailDesignConfig } from './types';

/**
 * Utilitário para extrair ID do vídeo do YouTube para gerar capa automática
 */
export function extractYouTubeId(url: string): string | null {
  if (!url) return null;
  const match = url.match(
    /(?:youtu\.be\/|youtube\.com\/(?:embed\/|v\/|watch\?v=|watch\?.+&v=))([\w-]{11})/
  );
  return match ? match[1] : null;
}

/**
 * Substitui tags dinâmicas como {{nome}}, {{primeiro_nome}}, {{email}}
 */
export function replaceVariables(text: string, variables?: Record<string, string>): string {
  if (!text || !variables) return text || '';
  let result = text;
  for (const [key, value] of Object.entries(variables)) {
    result = result.replace(new RegExp(`{{${key}}}`, 'g'), value || '');
  }
  return result;
}

/**
 * Renderiza um bloco individual em HTML compatível com clientes de e-mail
 */
export function renderBlockToHtml(
  block: EmailBlock,
  settings: EmailDesignConfig,
  variables?: Record<string, string>
): string {
  switch (block.type) {
    case 'header': {
      const bg = block.bg || 'transparent';
      const align = block.align || 'center';
      const title = replaceVariables(block.title || '', variables);
      const subtitle = replaceVariables(block.subtitle || '', variables);
      const textColor = block.textColor || settings.textColor;

      return `
        <table role="presentation" border="0" cellpadding="0" cellspacing="0" width="100%" style="background-color: ${bg}; padding: 24px 20px; text-align: ${align}; border-radius: ${settings.borderRadius}px ${settings.borderRadius}px 0 0;">
          <tr>
            <td align="${align}">
              ${
                block.logoUrl
                  ? `<img src="${block.logoUrl}" alt="Logo" width="${block.logoWidth || 140}" style="display: inline-block; max-width: 100%; height: auto; margin-bottom: ${title ? '16px' : '0'}; border: 0;" />`
                  : ''
              }
              ${
                title
                  ? `<h1 style="margin: 0; font-family: ${settings.fontFamily}; font-size: 24px; font-weight: bold; color: ${textColor}; line-height: 1.3;">${title}</h1>`
                  : ''
              }
              ${
                subtitle
                  ? `<p style="margin: 8px 0 0 0; font-family: ${settings.fontFamily}; font-size: 14px; color: ${textColor}; opacity: 0.85; line-height: 1.4;">${subtitle}</p>`
                  : ''
              }
            </td>
          </tr>
        </table>
      `;
    }

    case 'text': {
      const content = replaceVariables(block.content || '', variables)
        .replace(/\n/g, '<br />');
      const fontSize = block.fontSize || 16;
      const color = block.color || settings.textColor;
      const align = block.align || 'left';
      const lineHeight = block.lineHeight || 1.6;
      const paddingY = block.paddingY !== undefined ? block.paddingY : 12;

      return `
        <table role="presentation" border="0" cellpadding="0" cellspacing="0" width="100%">
          <tr>
            <td style="padding: ${paddingY}px 24px; text-align: ${align}; font-family: ${settings.fontFamily}; font-size: ${fontSize}px; line-height: ${lineHeight}; color: ${color}; ${block.bold ? 'font-weight: bold;' : ''} ${block.italic ? 'font-style: italic;' : ''}">
              ${content}
            </td>
          </tr>
        </table>
      `;
    }

    case 'image': {
      const align = block.align || 'center';
      const width = block.width ? `${block.width}%` : '100%';
      const radius = block.borderRadius !== undefined ? block.borderRadius : 8;

      const imgTag = `<img src="${block.url}" alt="${block.alt || 'Imagem'}" style="display: inline-block; width: 100%; max-width: 100%; height: auto; border-radius: ${radius}px; border: 0; outline: none; text-decoration: none;" />`;

      return `
        <table role="presentation" border="0" cellpadding="0" cellspacing="0" width="100%">
          <tr>
            <td align="${align}" style="padding: 12px 24px;">
              <table role="presentation" border="0" cellpadding="0" cellspacing="0" width="${width}" style="max-width: 100%;">
                <tr>
                  <td align="${align}">
                    ${block.linkUrl ? `<a href="${block.linkUrl}" target="_blank" style="text-decoration: none; display: block;">${imgTag}</a>` : imgTag}
                  </td>
                </tr>
              </table>
            </td>
          </tr>
        </table>
      `;
    }

    case 'video': {
      const align = block.align || 'center';
      const ytId = extractYouTubeId(block.videoUrl);
      const cover = block.coverUrl || (ytId ? `https://img.youtube.com/vi/${ytId}/hqdefault.jpg` : '');
      const link = block.videoUrl || '#';
      const title = replaceVariables(block.title || '', variables);

      return `
        <table role="presentation" border="0" cellpadding="0" cellspacing="0" width="100%">
          <tr>
            <td align="${align}" style="padding: 16px 24px;">
              <a href="${link}" target="_blank" style="text-decoration: none; display: block; position: relative; max-width: 520px; margin: 0 auto; border-radius: 8px; overflow: hidden; background-color: #000;">
                <div style="position: relative; text-align: center;">
                  <img src="${cover || 'https://images.unsplash.com/photo-1618005182384-a83a8bd57fbe?w=800&auto=format&fit=crop'}" alt="${title || 'Assistir Vídeo'}" style="width: 100%; height: auto; display: block; border: 0; opacity: 0.9;" />
                  <div style="position: absolute; top: 50%; left: 50%; transform: translate(-50%, -50%); width: 64px; height: 64px; background-color: rgba(220, 38, 38, 0.9); border-radius: 50%; display: flex; align-items: center; justify-content: center; box-shadow: 0 4px 14px rgba(0,0,0,0.4);">
                    <div style="width: 0; height: 0; border-top: 10px solid transparent; border-bottom: 10px solid transparent; border-left: 18px solid #ffffff; margin-left: 4px;"></div>
                  </div>
                </div>
                ${title ? `<p style="margin: 8px 0 0 0; text-align: center; font-family: ${settings.fontFamily}; font-size: 13px; color: ${settings.textColor}; font-weight: 500;">${title}</p>` : ''}
              </a>
            </td>
          </tr>
        </table>
      `;
    }

    case 'button': {
      const align = block.align || 'center';
      const bg = block.bg || '#4f46e5';
      const color = block.color || '#ffffff';
      const fontSize = block.fontSize || 16;
      const radius = block.borderRadius !== undefined ? block.borderRadius : 8;
      const padY = block.paddingY !== undefined ? block.paddingY : 14;
      const padX = block.paddingX !== undefined ? block.paddingX : 28;
      const text = replaceVariables(block.text || 'Clique Aqui', variables);
      const url = replaceVariables(block.url || '#', variables);
      const fullWidth = block.fullWidth;

      return `
        <table role="presentation" border="0" cellpadding="0" cellspacing="0" width="100%">
          <tr>
            <td align="${align}" style="padding: 18px 24px;">
              <table role="presentation" border="0" cellpadding="0" cellspacing="0" ${fullWidth ? 'width="100%"' : ''} style="${fullWidth ? 'width: 100%;' : ''}">
                <tr>
                  <td align="center" bgcolor="${bg}" style="border-radius: ${radius}px; background-color: ${bg};">
                    <a href="${url}" target="_blank" style="display: block; padding: ${padY}px ${padX}px; font-family: ${settings.fontFamily}; font-size: ${fontSize}px; font-weight: bold; color: ${color}; text-decoration: none; border-radius: ${radius}px; text-align: center; box-shadow: 0 4px 10px rgba(0,0,0,0.12);">
                      ${text}
                    </a>
                  </td>
                </tr>
              </table>
            </td>
          </tr>
        </table>
      `;
    }

    case 'spacer': {
      const height = block.height || 20;
      return `
        <table role="presentation" border="0" cellpadding="0" cellspacing="0" width="100%">
          <tr>
            <td height="${height}" style="font-size: 0px; line-height: 0px; height: ${height}px;">&nbsp;</td>
          </tr>
        </table>
      `;
    }

    case 'divider': {
      const color = block.color || '#e2e8f0';
      const thickness = block.thickness || 1;
      const style = block.style || 'solid';
      const marginY = block.marginY !== undefined ? block.marginY : 16;

      return `
        <table role="presentation" border="0" cellpadding="0" cellspacing="0" width="100%">
          <tr>
            <td style="padding: ${marginY}px 24px;">
              <hr style="border: 0; border-top: ${thickness}px ${style} ${color}; margin: 0; width: 100%;" />
            </td>
          </tr>
        </table>
      `;
    }

    case 'columns': {
      const split = block.split || '50-50';
      const leftWidth = split === '60-40' ? '60%' : split === '40-60' ? '40%' : '50%';
      const rightWidth = split === '60-40' ? '40%' : split === '40-60' ? '60%' : '50%';

      const leftHtml = (block.leftContent || [])
        .map((b) => renderBlockToHtml(b, settings, variables))
        .join('');
      const rightHtml = (block.rightContent || [])
        .map((b) => renderBlockToHtml(b, settings, variables))
        .join('');

      return `
        <table role="presentation" border="0" cellpadding="0" cellspacing="0" width="100%">
          <tr>
            <td style="padding: 12px 20px;">
              <table role="presentation" border="0" cellpadding="0" cellspacing="0" width="100%">
                <tr>
                  <td class="mobile-col" width="${leftWidth}" valign="top" style="padding: 6px;">
                    ${leftHtml}
                  </td>
                  <td class="mobile-col" width="${rightWidth}" valign="top" style="padding: 6px;">
                    ${rightHtml}
                  </td>
                </tr>
              </table>
            </td>
          </tr>
        </table>
      `;
    }

    case 'social': {
      const align = block.align || 'center';
      const links = block.links || {};

      const icons: { key: keyof typeof links; label: string; icon: string; bg: string }[] = [
        { key: 'instagram', label: 'Instagram', bg: '#E4405F', icon: '📸' },
        { key: 'youtube', label: 'YouTube', bg: '#FF0000', icon: '▶️' },
        { key: 'whatsapp', label: 'WhatsApp', bg: '#25D366', icon: '💬' },
        { key: 'facebook', label: 'Facebook', bg: '#1877F2', icon: '👤' },
        { key: 'linkedin', label: 'LinkedIn', bg: '#0A66C2', icon: '💼' },
      ];

      const activeIcons = icons.filter((i) => Boolean(links[i.key]));
      if (activeIcons.length === 0) return '';

      return `
        <table role="presentation" border="0" cellpadding="0" cellspacing="0" width="100%">
          <tr>
            <td align="${align}" style="padding: 16px 24px;">
              <table role="presentation" border="0" cellpadding="0" cellspacing="0" style="display: inline-block;">
                <tr>
                  ${activeIcons
                    .map(
                      (item) => `
                    <td style="padding: 0 6px;">
                      <a href="${links[item.key]}" target="_blank" style="text-decoration: none; display: inline-block; width: 36px; height: 36px; line-height: 36px; text-align: center; border-radius: 50%; background-color: ${item.bg}; color: #ffffff; font-size: 14px; font-weight: bold;">
                        ${item.icon}
                      </a>
                    </td>
                  `
                    )
                    .join('')}
                </tr>
              </table>
            </td>
          </tr>
        </table>
      `;
    }

    case 'footer': {
      const color = block.color || '#64748b';
      const fontSize = block.fontSize || 12;
      const text = replaceVariables(block.text || 'Você recebeu este e-mail porque está cadastrado em nosso lançamento.', variables);
      const company = block.companyName || 'Todos os direitos reservados.';
      const unsubText = block.unsubscribeText || 'Descadastrar deste e-mail';
      const unsubUrl = block.unsubscribeUrl || '{{optout_url}}';

      return `
        <table role="presentation" border="0" cellpadding="0" cellspacing="0" width="100%" style="border-top: 1px solid #e2e8f0; margin-top: 20px;">
          <tr>
            <td style="padding: 24px 24px 32px 24px; text-align: center; font-family: ${settings.fontFamily}; font-size: ${fontSize}px; line-height: 1.5; color: ${color};">
              <p style="margin: 0 0 8px 0;">${text}</p>
              <p style="margin: 0 0 12px 0; font-weight: 600;">${company}</p>
              <p style="margin: 0;">
                <a href="${unsubUrl}" target="_blank" style="color: ${color}; text-decoration: underline;">
                  ${unsubText}
                </a>
              </p>
            </td>
          </tr>
        </table>
      `;
    }

    default:
      return '';
  }
}

/**
 * Converte o documento JSON completo do construtor visual em HTML Responsivo Bulletproof
 */
export function generateResponsiveEmailHtml(
  doc: EmailDocument,
  variables?: Record<string, string>
): string {
  const { settings, blocks } = doc;
  const contentWidth = settings.contentWidth || 600;
  const bodyBg = settings.bodyBg || '#f1f5f9';
  const contentBg = settings.contentBg || '#ffffff';
  const fontFamily = settings.fontFamily || 'Arial, sans-serif';
  const borderRadius = settings.borderRadius !== undefined ? settings.borderRadius : 12;

  const innerHtml = blocks
    .map((block) => renderBlockToHtml(block, settings, variables))
    .join('\n');

  return `<!DOCTYPE html PUBLIC "-//W3C//DTD XHTML 1.0 Transitional//EN" "http://www.w3.org/TR/xhtml1/DTD/xhtml1-transitional.dtd">
<html xmlns="http://www.w3.org/1999/xhtml" lang="pt-BR">
<head>
  <meta http-equiv="Content-Type" content="text/html; charset=UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <meta name="x-apple-disable-message-reformatting" />
  <title>${doc.subject || 'E-mail do Lançamento'}</title>
  <!--[if mso]>
  <noscript>
    <xml>
      <o:OfficeDocumentSettings>
        <o:PixelsPerInch>96</o:PixelsPerInch>
      </o:OfficeDocumentSettings>
    </xml>
  </noscript>
  <![endif]-->
  <style type="text/css">
    body, table, td, a { -webkit-text-size-adjust: 100%; -ms-text-size-adjust: 100%; }
    table, td { mso-table-lspace: 0pt; mso-table-rspace: 0pt; }
    img { -ms-interpolation-mode: bicubic; border: 0; outline: none; text-decoration: none; }
    table { border-collapse: collapse !important; }
    body { margin: 0 !important; padding: 0 !important; width: 100% !important; background-color: ${bodyBg}; font-family: ${fontFamily}; }
    @media only screen and (max-width: 620px) {
      .email-container { width: 100% !important; max-width: 100% !important; border-radius: 0px !important; }
      .mobile-col { display: block !important; width: 100% !important; box-sizing: border-box !important; }
      .mobile-center { text-align: center !important; }
      .mobile-p-10 { padding: 10px !important; }
    }
  </style>
</head>
<body style="margin: 0; padding: 24px 0; background-color: ${bodyBg}; font-family: ${fontFamily};">
  <center style="width: 100%; background-color: ${bodyBg};">
    <!--[if mso]>
    <table role="presentation" border="0" cellpadding="0" cellspacing="0" width="${contentWidth}" align="center">
    <tr>
    <td>
    <![endif]-->
    <div style="max-width: ${contentWidth}px; margin: 0 auto;" class="email-container">
      <table role="presentation" border="0" cellpadding="0" cellspacing="0" width="100%" style="background-color: ${contentBg}; border-radius: ${borderRadius}px; box-shadow: 0 4px 20px rgba(0, 0, 0, 0.06); overflow: hidden;">
        <tr>
          <td style="padding: 0;">
            ${innerHtml}
          </td>
        </tr>
      </table>
    </div>
    <!--[if mso]>
    </td>
    </tr>
    </table>
    <![endif]-->
  </center>
</body>
</html>`;
}
