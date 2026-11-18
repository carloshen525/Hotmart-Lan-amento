import { NextResponse } from 'next/server';
import { getActiveTenantId } from '@/lib/tenancy';
import { whatsappGroupService } from '@/services/whatsapp/group.service';

export async function GET(request: Request) {
  try {
    const tenantId = await getActiveTenantId();
    if (!tenantId) {
      return NextResponse.json({ error: 'Nenhum expert ativo selecionado' }, { status: 400 });
    }

    const { searchParams } = new URL(request.url);
    const search = searchParams.get('search') || undefined;
    const eligibleOnly = searchParams.get('eligibleOnly') === 'true';
    const instanceId = searchParams.get('instanceId') || undefined;
    const tagId = searchParams.get('tagId') || undefined;
    const status = searchParams.get('status') || undefined;

    const groups = await whatsappGroupService.getGroups(tenantId, {
      search,
      eligibleOnly,
      instanceId,
      tagId,
      status,
    });

    const tags = await whatsappGroupService.getGroupTags(tenantId);

    // Métricas para os cards de topo
    const totalGroups = groups.length;
    const eligibleCount = groups.filter((g) => g.isEligible).length;
    const ineligibleCount = groups.filter((g) => !g.isEligible && g.status === 'NOT_ADMIN').length;
    const unverifiedCount = groups.filter((g) => g.status === 'UNVERIFIED').length;
    const leftCount = groups.filter((g) => g.status === 'LEFT').length;
    const communitiesCount = groups.filter((g) => (g as any).isCommunity).length;
    const standardGroupsCount = groups.filter((g) => !(g as any).isCommunity).length;

    return NextResponse.json({
      groups,
      tags,
      stats: {
        totalGroups,
        eligibleCount,
        ineligibleCount,
        unverifiedCount,
        leftCount,
        communitiesCount,
        standardGroupsCount,
      },
    });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
