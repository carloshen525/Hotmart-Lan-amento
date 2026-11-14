import { BaseCheckoutAdapter } from './base.adapter';
import {
  CheckoutPlatformId,
  StandardCheckoutEvent,
  StandardCheckoutEventType,
} from '../types';

export class CustomWebhookAdapter extends BaseCheckoutAdapter {
  readonly platform: CheckoutPlatformId = 'CUSTOM';

  canHandle(): boolean {
    return true; // Fallback universal
  }

  normalize(payload: any): StandardCheckoutEvent {
    const rawEvent = String(
      payload?.event ||
      payload?.action ||
      payload?.status ||
      payload?.type ||
      ''
    ).toLowerCase();

    let standardEvent: StandardCheckoutEventType = 'unknown';

    if (
      rawEvent.includes('approved') ||
      rawEvent.includes('aprovad') ||
      rawEvent.includes('pago') ||
      rawEvent.includes('paid') ||
      rawEvent.includes('success')
    ) {
      standardEvent = 'purchase_approved';
    } else if (rawEvent.includes('pix')) {
      standardEvent = 'pix_generated';
    } else if (rawEvent.includes('boleto') || rawEvent.includes('billet')) {
      standardEvent = 'billet_printed';
    } else if (rawEvent.includes('waiting') || rawEvent.includes('pending') || rawEvent.includes('aguardando')) {
      standardEvent = 'purchase_waiting_payment';
    } else if (rawEvent.includes('abandon') || rawEvent.includes('carrinho')) {
      standardEvent = 'cart_abandoned';
    } else if (rawEvent.includes('refund') || rawEvent.includes('reembols')) {
      standardEvent = 'refunded';
    } else if (rawEvent.includes('cancel')) {
      standardEvent = 'canceled';
    } else if (rawEvent.includes('chargeback') || rawEvent.includes('disputa')) {
      standardEvent = 'chargeback';
    }

    const name =
      payload?.name ||
      payload?.customer?.name ||
      payload?.buyer?.name ||
      payload?.lead?.name ||
      payload?.client_name ||
      'Lead / Cliente';

    const email = this.sanitizeEmail(
      payload?.email ||
      payload?.customer?.email ||
      payload?.buyer?.email ||
      payload?.lead?.email ||
      payload?.client_email
    );

    const phone = this.sanitizePhone(
      payload?.phone ||
      payload?.telefone ||
      payload?.celular ||
      payload?.whatsapp ||
      payload?.customer?.phone ||
      payload?.buyer?.phone
    );

    const productName =
      payload?.product_name ||
      payload?.product?.name ||
      payload?.product ||
      payload?.course_name ||
      'Produto';

    const productId = String(
      payload?.product_id ||
      payload?.product?.id ||
      payload?.productId ||
      ''
    );

    const paymentType = String(
      payload?.payment_type ||
      payload?.paymentMethod ||
      payload?.forma_pagamento ||
      'OTHER'
    ).toUpperCase();

    return {
      event: standardEvent,
      customer: { name, email, phone },
      product: {
        id: productId,
        name: productName,
      },
      platform: 'CUSTOM',
      transactionId: payload?.transaction_id || payload?.id || `custom_${Date.now()}`,
      orderId: payload?.order_id || payload?.id,
      payment: {
        type: paymentType,
        amount: Number(payload?.amount || payload?.value || payload?.price || 0),
        currency: 'BRL',
      },
      rawPayload: payload,
      timestamp: new Date(),
    };
  }
}
