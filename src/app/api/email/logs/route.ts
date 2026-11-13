import { NextResponse } from 'next/server';
import { getActiveTenantId } from '@/lib/tenancy';
import { EmailService } from '@/services/email';

export async function GET() {
  try {
    const tenantId = await getActiveTenantId();
    if (!tenantId) {
      return NextResponse.json({ error: 'Tenant não autenticado' }, { status: 401 });
    }

    const logs = await EmailService.getLogs(tenantId, 50);
    return NextResponse.json({ logs });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
