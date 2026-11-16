import { NextResponse } from 'next/server';
import { getActiveTenantId } from '@/lib/tenancy';
import { whatsappGroupService } from '@/services/whatsapp/group.service';

export async function GET() {
  try {
    const tenantId = await getActiveTenantId();
    if (!tenantId) {
      return NextResponse.json({ error: 'Nenhum expert ativo selecionado' }, { status: 400 });
    }

    const tags = await whatsappGroupService.getGroupTags(tenantId);
    return NextResponse.json({ tags });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const tenantId = await getActiveTenantId();
    if (!tenantId) {
      return NextResponse.json({ error: 'Nenhum expert ativo selecionado' }, { status: 400 });
    }

    const body = await request.json();
    const { name, color, description } = body;

    if (!name || !name.trim()) {
      return NextResponse.json({ error: 'Nome da tag é obrigatório' }, { status: 400 });
    }

    const tag = await whatsappGroupService.createGroupTag(
      tenantId,
      name.trim(),
      color || '#10b981',
      description
    );

    return NextResponse.json({ success: true, tag }, { status: 201 });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
