import { NextResponse } from 'next/server';
import { messageManager } from '@/services/messaging';

/**
 * POST /api/whatsapp/update
 * Atualiza o nome/apelido ou define como número padrão
 */
export async function POST(request: Request) {
  try {
    const body = await request.json().catch(() => ({}));
    if (!body.instanceId) {
      return NextResponse.json({ error: 'instanceId é obrigatório' }, { status: 400 });
    }

    const updated = await messageManager.evolutionApi.updateInstance(body.instanceId, {
      name: body.name,
      isDefault: body.isDefault,
    });

    return NextResponse.json({ success: true, instance: updated });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
