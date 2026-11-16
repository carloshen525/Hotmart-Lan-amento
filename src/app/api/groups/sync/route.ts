import { NextResponse } from 'next/server';
import { getActiveTenantId } from '@/lib/tenancy';
import { whatsappGroupService } from '@/services/whatsapp/group.service';

export async function POST(request: Request) {
  try {
    const tenantId = await getActiveTenantId();
    if (!tenantId) {
      return NextResponse.json({ error: 'Nenhum expert ativo selecionado' }, { status: 400 });
    }

    const body = await request.json().catch(() => ({}));
    const { instanceId } = body;

    const result = await whatsappGroupService.syncGroups(tenantId, instanceId);

    return NextResponse.json({
      success: true,
      message: `Sincronização concluída: ${result.totalSynced} grupos verificados (${result.eligibleCount} elegíveis com permissão de administrador).`,
      result,
    });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
