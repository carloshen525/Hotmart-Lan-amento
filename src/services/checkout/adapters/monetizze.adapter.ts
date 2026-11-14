import { BaseCheckoutAdapter } from './base.adapter';
import {
  CheckoutPlatformId,
  StandardCheckoutEvent,
  StandardCheckoutEventType,
} from '../types';

export class MonetizzeAdapter extends BaseCheckoutAdapter {
  readonly platform: CheckoutPlatformId = 'MONETIZZE';

  canHandle(payload: any, headers?: Record<string, string>): boolean {
    if (payload?.chave_unica || payload?.tipoPost || payload?.dados?.venda) return true;
    if (payload?.codigo_venda && payload?.comprador) return true;
    return false;
  }

  normalize(payload: any): StandardCheckoutEvent {
    const tipoPost = String(payload?.tipoPost || payload?.tipo_post || '');
    const venda = payload?.dados?.venda || payload?.venda || {};
    const rawStatus = (venda?.status || payload?.status || '').toLowerCase();
    const formaPagamento = (venda?.formaPagamento || venda?.forma_pagamento || '').toLowerCase();

    let standardEvent: StandardCheckoutEventType = 'unknown';

    if (tipoPost === '2' || rawStatus.includes('aprovad') || rawStatus.includes('finalizad')) {
      standardEvent = 'purchase_approved';
    } else if (tipoPost === '1' || rawStatus.includes('aguardando')) {
      if (formaPagamento.includes('pix')) standardEvent = 'pix_generated';
      else if (formaPagamento.includes('boleto')) standardEvent = 'billet_printed';
      else standardEvent = 'purchase_waiting_payment';
    } else if (tipoPost === '3' || rawStatus.includes('cancelad')) {
      standardEvent = 'canceled';
    } else if (tipoPost === '4' || rawStatus.includes('devolvid') || rawStatus.includes('reembols')) {
      standardEvent = 'refunded';
    } else if (tipoPost === '5' || rawStatus.includes('disputa') || rawStatus.includes('chargeback')) {
      standardEvent = 'chargeback';
    }

    const comprador = payload?.dados?.comprador || payload?.comprador || {};
    const produto = payload?.dados?.produto || payload?.produto || {};

    const name = comprador.nome || 'Cliente Monetizze';
    const email = this.sanitizeEmail(comprador.email);
    const phone = this.sanitizePhone(comprador.telefone || comprador.celular);

    let pType = 'OTHER';
    if (formaPagamento.includes('pix')) pType = 'PIX';
    else if (formaPagamento.includes('boleto')) pType = 'BILLET';
    else if (formaPagamento.includes('cartao') || formaPagamento.includes('credito')) pType = 'CREDIT_CARD';

    return {
      event: standardEvent,
      customer: { name, email, phone },
      product: {
        id: String(produto.codigo || produto.id || ''),
        name: produto.nome || 'Produto Monetizze',
      },
      platform: 'MONETIZZE',
      transactionId: venda.codigo || payload?.codigo_venda || `mz_${Date.now()}`,
      orderId: venda.codigo,
      payment: {
        type: pType,
        amount: Number(venda.valor || payload?.valor || 0),
        currency: 'BRL',
        installments: Number(venda.parcelas || 1),
      },
      rawPayload: payload,
      timestamp: new Date(),
    };
  }
}
