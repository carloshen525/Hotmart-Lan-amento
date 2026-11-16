import { NextResponse } from 'next/server';
import { getActiveTenantId } from '@/lib/tenancy';
import { whatsappGroupService } from '@/services/whatsapp/group.service';

export async function DELETE(request: Request, { params }: { params: { id: string } }) {
  try {
    const tenantId = await getActiveTenantId();
    if (!tenantId) {
      return NextResponse.json({ error: 'Nenhum expert ativo selecionado' }, { status: 400 });
    }

    await whatsappGroupService.deleteGroupTag(tenantId, params.id);
    return NextResponse.json({ success: true });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
