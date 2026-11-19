import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { getActiveTenantId } from '@/lib/tenancy';

export const dynamic = 'force-dynamic';

export async function GET(request: Request) {
  try {
    const tenantId = await getActiveTenantId();
    if (!tenantId) {
      return NextResponse.json({ error: 'Não autenticado' }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const tagsParam = searchParams.get('tags') || '';
    const targetType = searchParams.get('targetType') || 'INDIVIDUAL';

    const tags: string[] = tagsParam
      .split(',')
      .map((t) => t.trim())
      .filter(Boolean);

    if (tags.length === 0) {
      return NextResponse.json({ count: 0, success: true });
    }

    const tagAndConditions = tags.map((t) => {
      const trimmed = t.trim();
      const clean = trimmed.replace(/^#/, '');
      const variations = Array.from(
        new Set([
          trimmed,
          clean,
          trimmed.toLowerCase(),
          trimmed.toUpperCase(),
          clean.toLowerCase(),
          clean.toUpperCase(),
          `#${clean}`,
        ])
      );

      return {
        tags: {
          some: {
            tag: {
              OR: [
                { id: trimmed },
                ...variations.map((v) => ({ name: v })),
              ],
            },
          },
        },
      };
    });

    if (targetType === 'GROUP') {
      const count = await prisma.whatsappGroup.count({
        where: {
          tenantId,
          status: { not: 'LEFT' },
          AND: tagAndConditions,
        },
      });
      return NextResponse.json({ count, success: true });
    }

    const count = await prisma.contact.count({
      where: {
        tenantId,
        status: { not: 'UNSUBSCRIBED' },
        AND: tagAndConditions,
      },
    });

    return NextResponse.json({ count, success: true });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
