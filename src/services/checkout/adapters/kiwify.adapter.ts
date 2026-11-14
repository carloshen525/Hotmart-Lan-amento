import { BaseCheckoutAdapter } from './base.adapter';
import {
  CheckoutPlatformId,
  StandardCheckoutEvent,
  StandardCheckoutEventType,
} from '../types';

export class KiwifyAdapter extends BaseCheckoutAdapter {
  readonly platform: CheckoutPlatformId = 'KIWIFY';

  canHandle(payload: any, headers?: Record<string, string>): boolean {
    if (payload?.order_id && (payload?.Customer || payload?.Product)) return true;
    if (payload?.signature || headers?.['x-kiwify-signature']) return true;
    if (typeof payload?.order_status === 'string') return true;
    return false;
  }

  normalize(payload: any): StandardCheckoutEvent {
    const rawStatus = (payload?.order_status || payload?.event || '').toLowerCase();
    const paymentMethod = (payload?.payment_method || '').toLowerCase();

    let standardEvent: StandardCheckoutEventType = 'unknown';

    if (rawStatus === 'paid' || rawStatus === 'order_approved') {
      standardEvent = 'purchase_approved';
    } else if (rawStatus === 'waiting_payment') {
      if (paymentMethod === 'pix') {
        standardEvent = 'pix_generated';
      } else if (paymentMethod === 'boleto') {
        standardEvent = 'billet_printed';
      } else {
        standardEvent = 'purchase_waiting_payment';
      }
    } else if (rawStatus === 'refunded' || rawStatus === 'order_refunded') {
      standardEvent = 'refunded';
    } else if (rawStatus === 'chargedback') {
      standardEvent = 'chargeback';
    } else if (rawStatus === 'canceled') {
      standardEvent = 'canceled';
    } else if (rawStatus.includes('abandon') || rawStatus === 'cart_abandonment') {
      standardEvent = 'cart_abandoned';
    } else if (rawStatus.includes('billet') || rawStatus.includes('boleto')) {
      standardEvent = 'billet_printed';
    } else if (rawStatus.includes('pix')) {
      standardEvent = 'pix_generated';
    }

    const customer = payload?.Customer || payload?.customer || {};
    const product = payload?.Product || payload?.product || {};

    const name = customer.full_name || customer.name || 'Cliente Kiwify';
    const email = this.sanitizeEmail(customer.email);
    const phone = this.sanitizePhone(customer.mobile || customer.phone);

    // Kiwify costuma enviar valores em centavos se for número inteiro alto
    let amount = Number(payload?.order_value || payload?.order_amount || 0);
    if (amount > 1000 && !Number.isInteger(amount / 100)) {
      amount = amount / 100;
    }

    let pType = 'OTHER';
    if (paymentMethod === 'pix') pType = 'PIX';
    else if (paymentMethod === 'boleto') pType = 'BILLET';
    else if (paymentMethod.includes('credit') || paymentMethod.includes('card')) pType = 'CREDIT_CARD';

    return {
      event: standardEvent,
      customer: { name, email, phone },
      product: {
        id: String(product.product_id || product.id || ''),
        name: product.product_name || product.name || 'Produto Kiwify',
      },
      platform: 'KIWIFY',
      transactionId: payload?.order_id || `kw_${Date.now()}`,
      orderId: payload?.order_id,
      payment: {
        type: pType,
        amount,
        currency: 'BRL',
        installments: Number(payload?.installments || 1),
        pixCode: payload?.pix_code,
        pixQrCode: payload?.pix_qrcode,
        billetUrl: payload?.billet_url || payload?.boleto_url,
      },
      rawPayload: payload,
      timestamp: new Date(payload?.created_at || Date.now()),
    };
  }
}
