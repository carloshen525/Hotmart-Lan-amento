import { NextResponse } from 'next/server';
import { getActiveTenantId } from '@/lib/tenancy';
import { BulkContactService } from '@/services/contact/bulk.service';

async function handleDelete(request: Request) {
  try {
    const tenantId = await getActiveTenantId();
    if (!tenantId) {
      return NextResponse.json({ error: 'Tenant não autenticado' }, { status: 401 });
    }

    const body = await request.json();
    const { leadIds, contactIds } = body;

    const ids = leadIds || contactIds || [];
    if (!Array.isArray(ids) || ids.length === 0) {
      return NextResponse.json(
        { error: 'Informe uma lista de IDs de contatos para exclusão.' },
        { status: 400 }
      );
    }

    const result = await BulkContactService.deleteContacts({
      tenantId,
      leadIds: ids,
    });

    return NextResponse.json(result);
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

export async function DELETE(request: Request) {
  return handleDelete(request);
}

export async function POST(request: Request) {
  return handleDelete(request);
}
