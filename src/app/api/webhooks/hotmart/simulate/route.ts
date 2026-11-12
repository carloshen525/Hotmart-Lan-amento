import { NextResponse } from 'next/server';
import { getActiveTenant } from '@/lib/tenancy';
import { hotmartWebhookProcessor } from '@/services/hotmart/webhook-processor';

export async function POST(request: Request) {
  try {
    const tenant = await getActiveTenant();
    if (!tenant) {
      return NextResponse.json({ error: 'Nenhum expert ativo selecionado' }, { status: 400 });
    }
    const { eventType, buyerEmail, buyerName, buyerPhone, productName, paymentType, priceValue } = await request.json();

    const simulatedPayload = {
      id: `sim_tx_${Date.now()}`,
      event: eventType || 'PURCHASE_APPROVED',
      hottok: tenant?.hotmartHottok || 'test_token',
      creation_date: Date.now(),
      data: {
        buyer: {
          email: buyerEmail || 'aluno.demo@gmail.com',
          name: buyerName || 'Aluno de Demonstração',
          checkout_phone: buyerPhone || '+5511999998888',
        },
        product: {
          id: 123456,
          name: productName || 'Curso Completo de Lançamentos',
        },
        purchase: {
          transaction: `SIM_${Date.now().toString(36).toUpperCase()}`,
          status: eventType === 'PURCHASE_APPROVED' ? 'COMPLETE' : 'WAITING_PAYMENT',
          price: {
            value: Number(priceValue) || 997.0,
            currency_code: 'BRL',
          },
          payment: {
            type: paymentType || (eventType === 'PURCHASE_WAITING_PAYMENT' ? 'PIX' : 'CREDIT_CARD'),
          },
        },
      },
    };

    const result = await hotmartWebhookProcessor.process(simulatedPayload, tenant.id);
    return NextResponse.json({ success: true, result, payload: simulatedPayload });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
