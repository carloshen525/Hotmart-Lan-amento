import {
  CheckoutAdapter,
  CheckoutPlatformId,
  StandardCheckoutEvent,
  StandardCheckoutEventType,
} from '../types';

export abstract class BaseCheckoutAdapter implements CheckoutAdapter {
  abstract readonly platform: CheckoutPlatformId;

  abstract canHandle(payload: any, headers?: Record<string, string>): boolean;

  abstract normalize(payload: any, headers?: Record<string, string>): StandardCheckoutEvent;

  verifySignature(
    payload: any,
    headers: Record<string, string> = {},
    secretKey?: string
  ): boolean {
    if (!secretKey) return true; // Se nenhuma chave configurada, aceita
    const headerToken =
      headers['x-secret-key'] ||
      headers['authorization']?.replace(/^Bearer\s+/i, '') ||
      headers['x-webhook-token'] ||
      headers['hottok'] ||
      payload?.hottok ||
      payload?.token ||
      payload?.secret_key;

    if (!headerToken) return true; // Modo permissivo padrão se não enviado
    return headerToken.trim() === secretKey.trim();
  }

  protected sanitizePhone(phone?: string): string | undefined {
    if (!phone) return undefined;
    const digits = phone.replace(/\D/g, '');
    if (!digits) return undefined;
    if (digits.startsWith('55') && digits.length >= 12) return `+${digits}`;
    if (digits.length >= 10 && digits.length <= 11) return `+55${digits}`;
    return `+${digits}`;
  }

  protected sanitizeEmail(email?: string): string {
    if (!email) return '';
    return email.trim().toLowerCase();
  }
}
