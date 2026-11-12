import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { getActiveTenantId } from '@/lib/tenancy';

export async function GET() {
  try {
    const tenantId = await getActiveTenantId();
    if (!tenantId) {
      return NextResponse.json({ tags: [] });
    }

    const tags = await prisma.tag.findMany({
      where: { tenantId },
      include: {
        _count: { select: { contacts: true } },
      },
      orderBy: { name: 'asc' },
    });

    return NextResponse.json({ tags });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const tenantId = await getActiveTenantId();
    const { name, color, description } = await request.json();

    if (!name) {
      return NextResponse.json({ error: 'Nome da tag é obrigatório' }, { status: 400 });
    }

    const tag = await prisma.tag.upsert({
      where: { tenantId_name: { tenantId, name: name.trim() } },
      update: {
        color: color || '#6366f1',
        description: description || undefined,
      },
      create: {
        tenantId,
        name: name.trim(),
        color: color || '#6366f1',
        description,
      },
    });

    return NextResponse.json({ success: true, tag }, { status: 201 });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
