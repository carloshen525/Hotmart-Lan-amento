import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { getActiveTenantId } from '@/lib/tenancy';
import { automationEngine } from '@/services/automation/engine';

export async function GET(request: Request) {
  try {
    const tenantId = await getActiveTenantId();
    if (!tenantId) {
      return NextResponse.json({ contacts: [] });
    }

    const { searchParams } = new URL(request.url);
    const search = searchParams.get('search')?.trim();
    const tag = searchParams.get('tag')?.trim();
    const status = searchParams.get('status')?.trim();
    const format = searchParams.get('format');

    const where: any = { tenantId };

    if (search) {
      where.OR = [
        { name: { contains: search } },
        { email: { contains: search } },
        { phone: { contains: search } },
      ];
    }

    if (status) {
      where.status = status;
    }

    if (tag) {
      where.tags = {
        some: {
          tag: { name: tag },
        },
      };
    }

    const contacts = await prisma.contact.findMany({
      where,
      include: {
        tags: {
          include: { tag: true },
        },
        _count: {
          select: {
            enrollments: true,
            messageLogs: true,
          },
        },
      },
      orderBy: { createdAt: 'desc' },
      take: 100,
    });

    // Suporte a Exportação CSV
    if (format === 'csv') {
      const headers = ['ID', 'Nome', 'Email', 'Telefone', 'Status', 'Origem UTM', 'Campanha UTM', 'Tags', 'Data Cadastro'];
      const rows = contacts.map((c) => [
        c.id,
        `"${c.name.replace(/"/g, '""')}"`,
        c.email,
        c.phone || '',
        c.status,
        c.utmSource || '',
        c.utmCampaign || '',
        `"${c.tags.map((t) => t.tag.name).join(', ')}"`,
        c.createdAt.toISOString(),
      ]);

      const csvContent = [headers.join(','), ...rows.map((r) => r.join(','))].join('\n');
      return new NextResponse(csvContent, {
        headers: {
          'Content-Type': 'text/csv; charset=utf-8',
          'Content-Disposition': 'attachment; filename="contatos.csv"',
        },
      });
    }

    return NextResponse.json({ contacts });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const tenantId = await getActiveTenantId();
    const { name, email, phone, utmSource, utmCampaign, tags, triggerAutomation } = await request.json();

    if (!name || !email) {
      return NextResponse.json({ error: 'Nome e e-mail são obrigatórios' }, { status: 400 });
    }

    const contact = await prisma.contact.upsert({
      where: {
        tenantId_email: {
          tenantId,
          email: email.toLowerCase().trim(),
        },
      },
      update: {
        name,
        phone: phone || undefined,
        utmSource: utmSource || undefined,
        utmCampaign: utmCampaign || undefined,
      },
      create: {
        tenantId,
        name,
        email: email.toLowerCase().trim(),
        phone,
        utmSource: utmSource || 'manual_entry',
        utmCampaign: utmCampaign || undefined,
        consentGiven: true,
        status: 'ACTIVE',
      },
    });

    // Atribuir tags
    if (tags && Array.isArray(tags)) {
      for (const tagName of tags) {
        if (!tagName) continue;
        let tag = await prisma.tag.findUnique({
          where: { tenantId_name: { tenantId, name: tagName } },
        });
        if (!tag) {
          tag = await prisma.tag.create({
            data: { tenantId, name: tagName, color: '#6366f1' },
          });
        }
        await prisma.contactTag.upsert({
          where: { contactId_tagId: { contactId: contact.id, tagId: tag.id } },
          create: { contactId: contact.id, tagId: tag.id },
          update: {},
        });
        await automationEngine.handleContactTagAdded(tenantId, contact.id, tagName).catch(() => {});
      }
    }

    // Se solicitado, dispara automação com gatilho CONTACT_CREATED ou TAG_ADDED
    if (triggerAutomation) {
      const automations = await prisma.automation.findMany({
        where: {
          tenantId,
          status: 'ACTIVE',
        },
      });

      for (const auto of automations) {
        if (auto.triggerType === 'CONTACT_CREATED') {
          await automationEngine.enrollContact(auto.id, contact.id);
        }
      }
    }

    return NextResponse.json({ success: true, contact }, { status: 201 });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
