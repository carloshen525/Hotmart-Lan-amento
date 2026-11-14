import { NextResponse } from 'next/server';
import { getActiveTenantId } from '@/lib/tenancy';
import { formService } from '@/services/wordpress';

export async function GET(
  request: Request,
  { params }: { params: { id: string } }
) {
  try {
    const tenantId = await getActiveTenantId();
    if (!tenantId) {
      return NextResponse.json({ error: 'Tenant não encontrado ou não autenticado' }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const limit = parseInt(searchParams.get('limit') || '50', 10);

    const events = await formService.getEvents(tenantId, params.id, limit);
    return NextResponse.json({ events });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
