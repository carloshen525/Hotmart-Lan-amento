import { BaseCheckoutAdapter } from './base.adapter';
import {
  CheckoutPlatformId,
  StandardCheckoutEvent,
  StandardCheckoutEventType,
} from '../types';

export class PerfectPayAdapter extends BaseCheckoutAdapter {
  readonly platform: CheckoutPlatformId = 'PERFECTPAY';

  canHandle(payload: any, headers?: Record<string, string>): boolean {
    if (payload?.sale_status_enum || payload?.perfectpay_token) return true;
    if (payload?.event?.startsWith?.('sale_') || payload?.sale?.code) return true;
    return false;
  }

  normalize(payload: any): StandardCheckoutEvent {
    const rawEvent = (
      payload?.event ||
      payload?.sale_status_enum ||
      payload?.status ||
      ''
    ).toLowerCase();

    const paymentType = (
      payload?.sale?.payment_type ||
      payload?.payment_type ||
      ''
    ).toLowerCase();

    let standardEvent: StandardCheckoutEventType = 'unknown';

    if (rawEvent.includes('approved') || rawEvent === 'sale_approved') {
      standardEvent = 'purchase_approved';
    } else if (rawEvent.includes('waiting') || rawEvent.includes('pending')) {
      if (paymentType.includes('pix')) standardEvent = 'pix_generated';
      else if (paymentType.includes('billet') || paymentType.includes('boleto')) standardEvent = 'billet_printed';
      else standardEvent = 'purchase_waiting_payment';
    } else if (rawEvent.includes('abandon')) {
      standardEvent = 'cart_abandoned';
    } else if (rawEvent.includes('refund')) {
      standardEvent = 'refunded';
    } else if (rawEvent.includes('chargeback')) {
      standardEvent = 'chargeback';
    } else if (rawEvent.includes('cancel')) {
      standardEvent = 'canceled';
    }

    const customer = payload?.customer || {};
    const product = payload?.product || {};
    const sale = payload?.sale || {};

    const name = customer.full_name || customer.name || 'Cliente PerfectPay';
    const email = this.sanitizeEmail(customer.email);
    const phone = this.sanitizePhone(customer.phone_number || customer.phone || customer.mobile);

    let pType = 'OTHER';
    if (paymentType.includes('pix')) pType = 'PIX';
    else if (paymentType.includes('billet') || paymentType.includes('boleto')) pType = 'BILLET';
    else if (paymentType.includes('card') || paymentType.includes('credit')) pType = 'CREDIT_CARD';

    return {
      event: standardEvent,
      customer: { name, email, phone },
      product: {
        id: String(product.code || product.id || ''),
        name: product.name || 'Produto PerfectPay',
      },
      platform: 'PERFECTPAY',
      transactionId: sale.code || payload?.code || `pp_${Date.now()}`,
      orderId: sale.code,
      payment: {
        type: pType,
        amount: Number(sale.amount || payload?.amount || 0),
        currency: 'BRL',
        installments: Number(sale.installments || 1),
      },
      rawPayload: payload,
      timestamp: new Date(payload?.date || Date.now()),
    };
  }
}
