import { BaseCheckoutAdapter } from './base.adapter';
import {
  CheckoutPlatformId,
  StandardCheckoutEvent,
  StandardCheckoutEventType,
} from '../types';

export class HotmartAdapter extends BaseCheckoutAdapter {
  readonly platform: CheckoutPlatformId = 'HOTMART';

  canHandle(payload: any, headers?: Record<string, string>): boolean {
    if (payload?.hottok || payload?.event?.startsWith?.('PURCHASE_')) return true;
    if (payload?.data?.buyer && payload?.data?.purchase) return true;
    return false;
  }

  normalize(payload: any): StandardCheckoutEvent {
    const rawEvent = (payload?.event || '').toUpperCase();
    const paymentType = (payload?.data?.purchase?.payment?.type || '').toUpperCase();

    let standardEvent: StandardCheckoutEventType = 'unknown';

    switch (rawEvent) {
      case 'PURCHASE_APPROVED':
      case 'PURCHASE_COMPLETE':
        standardEvent = 'purchase_approved';
        break;
      case 'PURCHASE_WAITING_PAYMENT':
        if (paymentType === 'PIX') {
          standardEvent = 'pix_generated';
        } else if (paymentType === 'BILLET' || paymentType === 'BOLETO') {
          standardEvent = 'billet_printed';
        } else {
          standardEvent = 'purchase_waiting_payment';
        }
        break;
      case 'PURCHASE_OUT_OF_SHOPPING_CART':
        standardEvent = 'cart_abandoned';
        break;
      case 'PURCHASE_CANCELED':
      case 'PURCHASE_EXPIRED':
        standardEvent = 'canceled';
        break;
      case 'PURCHASE_REFUNDED':
        standardEvent = 'refunded';
        break;
      case 'PURCHASE_CHARGEBACK':
        standardEvent = 'chargeback';
        break;
      default:
        if (rawEvent.includes('APPROVED')) standardEvent = 'purchase_approved';
        else if (rawEvent.includes('CART')) standardEvent = 'cart_abandoned';
        else standardEvent = 'unknown';
    }

    const buyer = payload?.data?.buyer || {};
    const purchase = payload?.data?.purchase || {};
    const product = payload?.data?.product || {};

    const name = buyer.name || 'Cliente';
    const email = this.sanitizeEmail(buyer.email);
    const phone = this.sanitizePhone(buyer.checkout_phone || buyer.phone);

    return {
      event: standardEvent,
      customer: { name, email, phone },
      product: {
        id: String(product.id || ''),
        name: product.name || 'Produto Hotmart',
      },
      platform: 'HOTMART',
      transactionId: purchase.transaction || payload?.id || `tx_${Date.now()}`,
      orderId: purchase.transaction,
      payment: {
        type: paymentType || 'OTHER',
        amount: Number(purchase.price?.value || 0),
        currency: purchase.price?.currency_value || 'BRL',
        installments: Number(purchase.payment?.installments_number || 1),
      },
      rawPayload: payload,
      timestamp: new Date(payload?.creation_date || Date.now()),
    };
  }
}
