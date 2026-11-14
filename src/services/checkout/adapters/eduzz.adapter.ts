import { BaseCheckoutAdapter } from './base.adapter';
import {
  CheckoutPlatformId,
  StandardCheckoutEvent,
  StandardCheckoutEventType,
} from '../types';

export class EduzzAdapter extends BaseCheckoutAdapter {
  readonly platform: CheckoutPlatformId = 'EDUZZ';

  canHandle(payload: any, headers?: Record<string, string>): boolean {
    if (payload?.eduzz_event || payload?.trans_status || payload?.pro_cod) return true;
    if (payload?.event?.startsWith?.('invoice.') || payload?.event === 'abandoned_cart') return true;
    return false;
  }

  normalize(payload: any): StandardCheckoutEvent {
    const transStatus = String(payload?.trans_status || payload?.status || payload?.event || '');
    const pagForm = String(payload?.trans_pagform || payload?.payment_method || '').toLowerCase();

    let standardEvent: StandardCheckoutEventType = 'unknown';

    if (transStatus === '3' || transStatus === 'invoice.paid' || transStatus.includes('paid')) {
      standardEvent = 'purchase_approved';
    } else if (transStatus === '1' || transStatus === '10' || transStatus === 'invoice.waiting_payment') {
      if (pagForm === '10' || pagForm.includes('pix')) standardEvent = 'pix_generated';
      else if (pagForm === '1' || pagForm.includes('boleto')) standardEvent = 'billet_printed';
      else standardEvent = 'purchase_waiting_payment';
    } else if (transStatus === '4' || transStatus.includes('cancel')) {
      standardEvent = 'canceled';
    } else if (transStatus === '7' || transStatus.includes('refund')) {
      standardEvent = 'refunded';
    } else if (transStatus === 'abandoned_cart' || transStatus.includes('abandon')) {
      standardEvent = 'cart_abandoned';
    }

    const name = payload?.cus_name || payload?.customer?.name || 'Cliente Eduzz';
    const email = this.sanitizeEmail(payload?.cus_email || payload?.customer?.email);
    const phone = this.sanitizePhone(payload?.cus_cel || payload?.cus_tel || payload?.customer?.phone);

    let pType = 'OTHER';
    if (pagForm === '10' || pagForm.includes('pix')) pType = 'PIX';
    else if (pagForm === '1' || pagForm.includes('boleto')) pType = 'BILLET';
    else if (pagForm === '2' || pagForm.includes('cartao') || pagForm.includes('card')) pType = 'CREDIT_CARD';

    return {
      event: standardEvent,
      customer: { name, email, phone },
      product: {
        id: String(payload?.pro_cod || payload?.product?.id || ''),
        name: payload?.pro_name || payload?.product?.name || 'Produto Eduzz',
      },
      platform: 'EDUZZ',
      transactionId: String(payload?.trans_cod || payload?.trans_id || `ed_${Date.now()}`),
      orderId: String(payload?.trans_cod || ''),
      payment: {
        type: pType,
        amount: Number(payload?.trans_value || payload?.amount || 0),
        currency: 'BRL',
        installments: Number(payload?.trans_installment || 1),
      },
      rawPayload: payload,
      timestamp: new Date(payload?.trans_createdate || Date.now()),
    };
  }
}
