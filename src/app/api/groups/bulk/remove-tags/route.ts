import { NextResponse } from 'next/server';
import { getActiveTenantId } from '@/lib/tenancy';
import { whatsappGroupService } from '@/services/whatsapp/group.service';

export async function POST(request: Request) {
  try {
    const tenantId = await getActiveTenantId();
    if (!tenantId) {
      return NextResponse.json({ error: 'Nenhum expert ativo selecionado' }, { status: 400 });
    }

    const body = await request.json();
    const { groupIds, tagIds } = body;

    if (!Array.isArray(groupIds) || groupIds.length === 0) {
      return NextResponse.json({ error: 'Nenhum grupo selecionado' }, { status: 400 });
    }

    if (!Array.isArray(tagIds) || tagIds.length === 0) {
      return NextResponse.json({ error: 'Nenhuma tag informada' }, { status: 400 });
    }

    const res = await whatsappGroupService.removeTagsFromGroups(tenantId, groupIds, tagIds);
    return NextResponse.json({ success: true, updated: res.updated });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
