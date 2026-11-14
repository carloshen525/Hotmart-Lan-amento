import { BaseCheckoutAdapter } from './base.adapter';
import {
  CheckoutPlatformId,
  StandardCheckoutEvent,
  StandardCheckoutEventType,
} from '../types';

export class CaktoAdapter extends BaseCheckoutAdapter {
  readonly platform: CheckoutPlatformId = 'CAKTO';

  canHandle(payload: any, headers?: Record<string, string>): boolean {
    if (headers?.['x-cakto-signature'] || payload?.cakto_event) return true;
    if (payload?.event && payload?.customer && (payload?.product || payload?.items)) {
      if (typeof payload?.cakto === 'boolean' || payload?.source === 'cakto') return true;
    }
    return false;
  }

  normalize(payload: any): StandardCheckoutEvent {
    const rawEvent = (payload?.event || payload?.status || '').toLowerCase();
    const paymentMethod = (payload?.payment_method || payload?.paymentMethod || '').toLowerCase();

    let standardEvent: StandardCheckoutEventType = 'unknown';

    if (rawEvent === 'paid' || rawEvent === 'approved' || rawEvent === 'purchase_approved') {
      standardEvent = 'purchase_approved';
    } else if (rawEvent === 'waiting_payment' || rawEvent === 'pending') {
      if (paymentMethod === 'pix') standardEvent = 'pix_generated';
      else if (paymentMethod === 'billet' || paymentMethod === 'boleto') standardEvent = 'billet_printed';
      else standardEvent = 'purchase_waiting_payment';
    } else if (rawEvent.includes('abandon') || rawEvent === 'cart_abandoned') {
      standardEvent = 'cart_abandoned';
    } else if (rawEvent === 'refunded' || rawEvent.includes('refund')) {
      standardEvent = 'refunded';
    } else if (rawEvent === 'chargeback') {
      standardEvent = 'chargeback';
    } else if (rawEvent === 'canceled' || rawEvent === 'cancelled') {
      standardEvent = 'canceled';
    }

    const customer = payload?.customer || payload?.buyer || {};
    const product = payload?.product || payload?.items?.[0] || {};

    const name = customer.name || customer.full_name || 'Cliente Cakto';
    const email = this.sanitizeEmail(customer.email);
    const phone = this.sanitizePhone(customer.phone || customer.cellphone || customer.mobile);

    let pType = 'OTHER';
    if (paymentMethod === 'pix') pType = 'PIX';
    else if (paymentMethod === 'boleto' || paymentMethod === 'billet') pType = 'BILLET';
    else if (paymentMethod.includes('card') || paymentMethod.includes('credito')) pType = 'CREDIT_CARD';

    return {
      event: standardEvent,
      customer: { name, email, phone },
      product: {
        id: String(product.id || product.product_id || ''),
        name: product.name || product.title || 'Produto Cakto',
      },
      platform: 'CAKTO',
      transactionId: payload?.transaction_id || payload?.id || `ck_${Date.now()}`,
      orderId: payload?.order_id || payload?.id,
      payment: {
        type: pType,
        amount: Number(payload?.amount || payload?.value || product?.price || 0),
        currency: 'BRL',
        installments: Number(payload?.installments || 1),
      },
      rawPayload: payload,
      timestamp: new Date(payload?.created_at || Date.now()),
    };
  }
}
