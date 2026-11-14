import { NextResponse } from 'next/server';
import { getActiveTenantId } from '@/lib/tenancy';
import { BulkContactService } from '@/services/contact/bulk.service';

export async function POST(request: Request) {
  try {
    const tenantId = await getActiveTenantId();
    if (!tenantId) {
      return NextResponse.json({ error: 'Tenant não autenticado' }, { status: 401 });
    }

    const body = await request.json();
    const { leadIds, contactIds, tagIds, tagNames } = body;

    const ids = leadIds || contactIds || [];
    if (!Array.isArray(ids) || ids.length === 0) {
      return NextResponse.json(
        { error: 'Informe uma lista válida de IDs de contatos (leadIds).' },
        { status: 400 }
      );
    }

    const result = await BulkContactService.addTags({
      tenantId,
      leadIds: ids,
      tagIds: Array.isArray(tagIds) ? tagIds : [],
      tagNames: Array.isArray(tagNames) ? tagNames : [],
    });

    return NextResponse.json(result);
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
