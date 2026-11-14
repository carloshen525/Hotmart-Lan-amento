import { BaseCheckoutAdapter } from './base.adapter';
import {
  CheckoutPlatformId,
  StandardCheckoutEvent,
  StandardCheckoutEventType,
} from '../types';

export class BraipAdapter extends BaseCheckoutAdapter {
  readonly platform: CheckoutPlatformId = 'BRAIP';

  canHandle(payload: any, headers?: Record<string, string>): boolean {
    if (payload?.braip_token || payload?.trans_key) return true;
    if (payload?.client_email && payload?.product_name) return true;
    return false;
  }

  normalize(payload: any): StandardCheckoutEvent {
    const rawEvent = (
      payload?.event ||
      payload?.status ||
      payload?.type ||
      ''
    ).toUpperCase();

    const paymentType = (
      payload?.payment_type ||
      payload?.payment_method ||
      ''
    ).toUpperCase();

    let standardEvent: StandardCheckoutEventType = 'unknown';

    if (
      rawEvent.includes('APPROVED') ||
      rawEvent.includes('APROVAD') ||
      rawEvent === 'PAGAMENTO_CONFIRMADO'
    ) {
      standardEvent = 'purchase_approved';
    } else if (
      rawEvent.includes('WAITING') ||
      rawEvent.includes('AGUARDANDO') ||
      rawEvent === 'PENDING'
    ) {
      if (paymentType.includes('PIX')) standardEvent = 'pix_generated';
      else if (paymentType.includes('BILLET') || paymentType.includes('BOLETO')) standardEvent = 'billet_printed';
      else standardEvent = 'purchase_waiting_payment';
    } else if (rawEvent.includes('ABANDON')) {
      standardEvent = 'cart_abandoned';
    } else if (rawEvent.includes('REFUND') || rawEvent.includes('ESTORN')) {
      standardEvent = 'refunded';
    } else if (rawEvent.includes('CHARGEBACK')) {
      standardEvent = 'chargeback';
    } else if (rawEvent.includes('CANCEL')) {
      standardEvent = 'canceled';
    }

    const name = payload?.client_name || payload?.customer_name || 'Cliente Braip';
    const email = this.sanitizeEmail(payload?.client_email || payload?.customer_email);
    const phone = this.sanitizePhone(payload?.client_telephone || payload?.client_cel || payload?.phone);

    let pType = 'OTHER';
    if (paymentType.includes('PIX')) pType = 'PIX';
    else if (paymentType.includes('BOLETO') || paymentType.includes('BILLET')) pType = 'BILLET';
    else if (paymentType.includes('CARD') || paymentType.includes('CARTAO')) pType = 'CREDIT_CARD';

    return {
      event: standardEvent,
      customer: { name, email, phone },
      product: {
        id: String(payload?.product_id || ''),
        name: payload?.product_name || 'Produto Braip',
      },
      platform: 'BRAIP',
      transactionId: payload?.trans_key || payload?.code || `br_${Date.now()}`,
      orderId: payload?.trans_key,
      payment: {
        type: pType,
        amount: Number(payload?.product_value || payload?.total_value || payload?.value || 0),
        currency: 'BRL',
        installments: Number(payload?.installments || 1),
      },
      rawPayload: payload,
      timestamp: new Date(payload?.date || Date.now()),
    };
  }
}
