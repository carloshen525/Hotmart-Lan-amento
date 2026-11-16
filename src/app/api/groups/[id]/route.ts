import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { getActiveTenantId } from '@/lib/tenancy';
import { whatsappGroupService } from '@/services/whatsapp/group.service';

export async function GET(request: Request, { params }: { params: { id: string } }) {
  try {
    const tenantId = await getActiveTenantId();
    if (!tenantId) {
      return NextResponse.json({ error: 'Nenhum expert ativo selecionado' }, { status: 400 });
    }

    // Valida elegibilidade em tempo real com a Evolution API
    const check = await whatsappGroupService.verifyGroupEligibility(tenantId, params.id);

    return NextResponse.json({
      group: check.group,
      eligible: check.eligible,
      reason: check.reason,
    });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

export async function DELETE(request: Request, { params }: { params: { id: string } }) {
  try {
    const tenantId = await getActiveTenantId();
    if (!tenantId) {
      return NextResponse.json({ error: 'Nenhum expert ativo selecionado' }, { status: 400 });
    }

    const group = await prisma.whatsappGroup.findFirst({
      where: { id: params.id, tenantId },
    });

    if (!group) {
      return NextResponse.json({ error: 'Grupo não encontrado' }, { status: 404 });
    }

    await prisma.whatsappGroup.delete({
      where: { id: params.id },
    });

    return NextResponse.json({ success: true });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
