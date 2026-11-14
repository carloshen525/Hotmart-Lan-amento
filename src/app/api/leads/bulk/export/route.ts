import { NextResponse } from 'next/server';
import { getActiveTenantId } from '@/lib/tenancy';
import { BulkContactService } from '@/services/contact/bulk.service';

export async function POST(request: Request) {
  try {
    const tenantId = await getActiveTenantId();
    if (!tenantId) {
      return NextResponse.json({ error: 'Tenant não autenticado' }, { status: 401 });
    }

    const body = await request.json().catch(() => ({}));
    const { leadIds, search, tag, format } = body;

    const exportRes = await BulkContactService.exportContacts({
      tenantId,
      leadIds: Array.isArray(leadIds) ? leadIds : undefined,
      search,
      tag,
      format,
    });

    return new NextResponse(exportRes.csvContent, {
      status: 200,
      headers: {
        'Content-Type': 'text/csv; charset=utf-8',
        'Content-Disposition': `attachment; filename="${exportRes.filename}"`,
        'X-Total-Count': String(exportRes.totalContacts),
      },
    });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

export async function GET(request: Request) {
  try {
    const tenantId = await getActiveTenantId();
    if (!tenantId) {
      return NextResponse.json({ error: 'Tenant não autenticado' }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const search = searchParams.get('search') || undefined;
    const tag = searchParams.get('tag') || undefined;
    const idsParam = searchParams.get('ids');
    const leadIds = idsParam ? idsParam.split(',').filter(Boolean) : undefined;

    const exportRes = await BulkContactService.exportContacts({
      tenantId,
      leadIds,
      search,
      tag,
    });

    return new NextResponse(exportRes.csvContent, {
      status: 200,
      headers: {
        'Content-Type': 'text/csv; charset=utf-8',
        'Content-Disposition': `attachment; filename="${exportRes.filename}"`,
        'X-Total-Count': String(exportRes.totalContacts),
      },
    });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
