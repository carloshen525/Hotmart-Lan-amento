import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { cookies } from 'next/headers';
import { messageManager } from '@/services/messaging';

export async function DELETE(
  request: Request,
  { params }: { params: { id: string } }
) {
  try {
    const tenantId = params.id;

    // 1. Desconecta o WhatsApp da Evolution se houver
    try {
      await messageManager.evolutionApi.disconnect(tenantId);
    } catch {}

    // 2. Exclui o Tenant (Cascata no Prisma remove contatos, tags, automações e whatsappInstance)
    await prisma.tenant.delete({
      where: { id: tenantId },
    });

    // 3. Se era o tenant ativo no cookie, seleciona outro ou limpa
    const cookieStore = cookies();
    const activeCookie = cookieStore.get('launch_active_tenant_id')?.value;

    const remainingTenant = await prisma.tenant.findFirst({
      orderBy: { createdAt: 'desc' },
    });

    const response = NextResponse.json({
      success: true,
      remainingTenantId: remainingTenant?.id || null,
    });

    if (activeCookie === tenantId) {
      if (remainingTenant) {
        response.cookies.set('launch_active_tenant_id', remainingTenant.id, {
          path: '/',
          maxAge: 30 * 24 * 60 * 60,
        });
      } else {
        response.cookies.delete('launch_active_tenant_id');
      }
    }

    return response;
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

export async function PATCH(
  request: Request,
  { params }: { params: { id: string } }
) {
  try {
    const body = await request.json();
    const tenant = await prisma.tenant.update({
      where: { id: params.id },
      data: {
        name: body.name || undefined,
        description: body.description !== undefined ? body.description : undefined,
        emailSender: body.emailSender || undefined,
        whatsappNumber: body.whatsappNumber !== undefined ? body.whatsappNumber : undefined,
        hotmartHottok: body.hotmartHottok || undefined,
      },
    });

    return NextResponse.json({ success: true, tenant });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
