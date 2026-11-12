import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { getActiveTenantId } from '@/lib/tenancy';

export async function GET() {
  try {
    const tenantId = await getActiveTenantId();
    const campaigns = await prisma.campaign.findMany({
      where: { tenantId },
      orderBy: { createdAt: 'desc' },
    });

    return NextResponse.json({ campaigns });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const tenantId = await getActiveTenantId();
    const { name, modelType, startDate, goalLeads, notes } = await request.json();

    if (!name || !modelType) {
      return NextResponse.json({ error: 'Nome e modelo da campanha são obrigatórios' }, { status: 400 });
    }

    const campaign = await prisma.campaign.create({
      data: {
        tenantId,
        name,
        modelType,
        startDate: startDate ? new Date(startDate) : new Date(),
        goalLeads: Number(goalLeads) || 1000,
        notes,
        status: 'ACTIVE',
      },
    });

    return NextResponse.json({ success: true, campaign }, { status: 201 });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
