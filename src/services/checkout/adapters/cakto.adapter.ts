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
    const ua = headers?.['user-agent'] || headers?.['User-Agent'] || '';
    if (ua.toLowerCase().includes('cakto')) return true;
    if (payload?.source === 'cakto' || payload?.platform === 'cakto' || payload?.cakto === true) return true;
    if (payload?.event && (payload?.customer || payload?.data?.customer)) {
      if (typeof payload?.cakto === 'boolean' || payload?.source === 'cakto') return true;
    }
    return false;
  }

  normalize(payload: any): StandardCheckoutEvent {
    const data = payload?.data || payload || {};
    const rawEvent = (payload?.event || data?.event || payload?.status || data?.status || '').toLowerCase();
    const paymentMethod = (
      data?.payment_method ||
      payload?.payment_method ||
      data?.paymentMethod ||
      payload?.paymentMethod ||
      ''
    ).toLowerCase();

    let standardEvent: StandardCheckoutEventType = 'unknown';

    if (
      rawEvent === 'paid' ||
      rawEvent === 'approved' ||
      rawEvent === 'purchase_approved' ||
      rawEvent === 'order_approved' ||
      rawEvent === 'payment_approved'
    ) {
      standardEvent = 'purchase_approved';
    } else if (rawEvent === 'waiting_payment' || rawEvent === 'pending') {
      if (paymentMethod === 'pix' || rawEvent.includes('pix')) standardEvent = 'pix_generated';
      else if (paymentMethod === 'billet' || paymentMethod === 'boleto' || rawEvent.includes('boleto'))
        standardEvent = 'billet_printed';
      else standardEvent = 'purchase_waiting_payment';
    } else if (rawEvent.includes('abandon') || rawEvent === 'cart_abandoned') {
      standardEvent = 'cart_abandoned';
    } else if (rawEvent === 'refunded' || rawEvent.includes('refund')) {
      standardEvent = 'refunded';
    } else if (rawEvent === 'chargeback') {
      standardEvent = 'chargeback';
    } else if (rawEvent === 'canceled' || rawEvent === 'cancelled' || rawEvent === 'refused') {
      standardEvent = 'canceled';
    }

    const customer = data?.customer || payload?.customer || data?.buyer || payload?.buyer || data?.client || {};
    const product =
      data?.product ||
      payload?.product ||
      data?.items?.[0] ||
      payload?.items?.[0] ||
      data?.offer ||
      payload?.offer ||
      {};

    const name = customer.name || customer.full_name || customer.nome || 'Cliente Cakto';
    const email = this.sanitizeEmail(customer.email);
    const phone = this.sanitizePhone(
      customer.phone || customer.cellphone || customer.mobile || customer.whatsapp || customer.telefone
    );

    let pType = 'OTHER';
    if (paymentMethod === 'pix' || rawEvent.includes('pix')) pType = 'PIX';
    else if (paymentMethod === 'boleto' || paymentMethod === 'billet' || rawEvent.includes('boleto'))
      pType = 'BILLET';
    else if (paymentMethod.includes('card') || paymentMethod.includes('credito')) pType = 'CREDIT_CARD';

    return {
      event: standardEvent,
      customer: { name, email, phone },
      product: {
        id: String(product.id || product.product_id || data?.product_id || ''),
        name: product.name || product.title || product.nome || 'Produto Cakto',
      },
      platform: 'CAKTO',
      transactionId: String(data?.transaction_id || payload?.transaction_id || data?.id || payload?.id || `ck_${Date.now()}`),
      orderId: String(data?.order_id || payload?.order_id || data?.id || payload?.id || ''),
      payment: {
        type: pType,
        amount: Number(data?.amount || payload?.amount || data?.value || payload?.value || product?.price || 0),
        currency: 'BRL',
        installments: Number(data?.installments || payload?.installments || 1),
      },
      rawPayload: payload,
      timestamp: new Date(data?.created_at || payload?.created_at || Date.now()),
    };
  }
}
