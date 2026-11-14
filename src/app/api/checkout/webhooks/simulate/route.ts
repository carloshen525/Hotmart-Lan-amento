import { NextResponse } from 'next/server';
import { getActiveTenantId } from '@/lib/tenancy';
import { checkoutWebhookProcessor, CheckoutPlatformId } from '@/services/checkout';

export async function POST(request: Request) {
  try {
    const tenantId = await getActiveTenantId();
    if (!tenantId) {
      return NextResponse.json({ error: 'Tenant não autenticado' }, { status: 401 });
    }

    const body = await request.json();
    const {
      platform = 'HOTMART',
      eventType = 'purchase_approved',
      buyerEmail,
      buyerName = 'Cliente Simulação',
      buyerPhone = '+5511999990000',
      productName = 'Curso Lançamento 2026',
      paymentType = 'PIX',
      priceValue = 497.00,
      integrationId,
    } = body;

    if (!buyerEmail) {
      return NextResponse.json(
        { error: 'E-mail do comprador é obrigatório para simulação.' },
        { status: 400 }
      );
    }

    // Monta payload de exemplo de acordo com a plataforma escolhida
    let simulatedPayload: any = {};
    const pId = (platform as string).toUpperCase() as CheckoutPlatformId;
    const txId = `sim_${Date.now()}_${Math.floor(Math.random() * 1000)}`;

    switch (pId) {
      case 'KIWIFY': {
        simulatedPayload = {
          order_id: txId,
          order_status:
            eventType === 'purchase_approved'
              ? 'paid'
              : eventType === 'pix_generated'
              ? 'waiting_payment'
              : eventType === 'cart_abandoned'
              ? 'cart_abandonment'
              : eventType,
          payment_method: paymentType.toLowerCase(),
          order_value: priceValue,
          Customer: {
            full_name: buyerName,
            email: buyerEmail,
            mobile: buyerPhone,
          },
          Product: {
            product_id: 'prod_kw_1',
            product_name: productName,
          },
        };
        break;
      }
      case 'CAKTO': {
        simulatedPayload = {
          event:
            eventType === 'purchase_approved'
              ? 'paid'
              : eventType === 'pix_generated'
              ? 'waiting_payment'
              : eventType,
          transaction_id: txId,
          payment_method: paymentType.toLowerCase(),
          amount: priceValue,
          customer: {
            name: buyerName,
            email: buyerEmail,
            phone: buyerPhone,
          },
          product: {
            id: 'prod_ck_1',
            name: productName,
          },
        };
        break;
      }
      case 'MONETIZZE': {
        simulatedPayload = {
          tipoPost: eventType === 'purchase_approved' ? '2' : '1',
          codigo_venda: txId,
          dados: {
            comprador: {
              nome: buyerName,
              email: buyerEmail,
              telefone: buyerPhone,
            },
            produto: {
              codigo: 'prod_mz_1',
              nome: productName,
            },
            venda: {
              codigo: txId,
              status: eventType === 'purchase_approved' ? 'Finalizada' : 'Aguardando pagamento',
              formaPagamento: paymentType,
              valor: priceValue,
            },
          },
        };
        break;
      }
      case 'PERFECTPAY': {
        simulatedPayload = {
          event:
            eventType === 'purchase_approved'
              ? 'sale_approved'
              : eventType === 'pix_generated'
              ? 'waiting_payment'
              : eventType,
          customer: {
            full_name: buyerName,
            email: buyerEmail,
            phone_number: buyerPhone,
          },
          product: {
            code: 'prod_pp_1',
            name: productName,
          },
          sale: {
            code: txId,
            amount: priceValue,
            payment_type: paymentType.toLowerCase(),
          },
        };
        break;
      }
      case 'EDUZZ': {
        simulatedPayload = {
          trans_status: eventType === 'purchase_approved' ? '3' : '1',
          trans_cod: txId,
          trans_value: priceValue,
          trans_pagform: paymentType === 'PIX' ? '10' : '2',
          cus_name: buyerName,
          cus_email: buyerEmail,
          cus_cel: buyerPhone,
          pro_name: productName,
          pro_cod: 'prod_ed_1',
        };
        break;
      }
      case 'BRAIP': {
        simulatedPayload = {
          event:
            eventType === 'purchase_approved'
              ? 'PAYMENT_APPROVED'
              : eventType === 'pix_generated'
              ? 'WAITING_PAYMENT'
              : eventType.toUpperCase(),
          trans_key: txId,
          total_value: priceValue,
          payment_type: paymentType,
          client_name: buyerName,
          client_email: buyerEmail,
          client_telephone: buyerPhone,
          product_name: productName,
        };
        break;
      }
      case 'HOTMART':
      default: {
        simulatedPayload = {
          id: txId,
          event:
            eventType === 'purchase_approved'
              ? 'PURCHASE_APPROVED'
              : eventType === 'pix_generated'
              ? 'PURCHASE_WAITING_PAYMENT'
              : eventType === 'cart_abandoned'
              ? 'PURCHASE_OUT_OF_SHOPPING_CART'
              : 'PURCHASE_APPROVED',
          data: {
            buyer: {
              name: buyerName,
              email: buyerEmail,
              checkout_phone: buyerPhone,
            },
            purchase: {
              transaction: txId,
              payment: { type: paymentType },
              price: { value: priceValue, currency_value: 'BRL' },
            },
            product: {
              id: 999999,
              name: productName,
            },
          },
        };
        break;
      }
    }

    const result = await checkoutWebhookProcessor.process({
      payload: simulatedPayload,
      headers: {},
      integrationId,
      expectedTenantId: tenantId,
      overridePlatform: pId,
    });

    return NextResponse.json({
      success: result.success,
      duplicate: result.duplicate,
      ignored: result.ignored,
      eventType: result.eventType,
      platform: result.platform,
      actionSummary: result.actionSummary,
      error: result.error,
      simulatedPayload,
    });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
