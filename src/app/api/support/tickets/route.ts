import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { requireAuth } from '@/lib/auth';
import { getActiveTenantId } from '@/lib/tenancy';

export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    const session = await requireAuth();

    // Busca tickets vinculados ao usuário ou ao seu clientId
    const where: any = {
      OR: [
        { userId: session.userId },
        ...(session.clientId ? [{ clientId: session.clientId }] : []),
      ],
    };

    const tickets = await prisma.supportTicket.findMany({
      where,
      include: {
        messages: {
          orderBy: { createdAt: 'asc' },
        },
      },
      orderBy: { updatedAt: 'desc' },
    });

    return NextResponse.json({ tickets });
  } catch (err: any) {
    const status = err.message === 'Não autenticado' ? 401 : 500;
    return NextResponse.json({ error: err.message }, { status });
  }
}

export async function POST(request: Request) {
  try {
    const session = await requireAuth();
    const tenantId = await getActiveTenantId();
    const body = await request.json();

    const { subject, message, priority = 'MEDIUM', attachmentUrl } = body;

    if (!subject || !subject.trim() || !message || !message.trim()) {
      return NextResponse.json({ error: 'Assunto e mensagem são obrigatórios' }, { status: 400 });
    }

    // Identifica o clientId associado
    let clientId = session.clientId;
    if (!clientId && tenantId) {
      const t = await prisma.tenant.findUnique({ where: { id: tenantId }, select: { clientId: true } });
      clientId = t?.clientId || undefined;
    }

    const ticket = await prisma.supportTicket.create({
      data: {
        subject: subject.trim(),
        message: message.trim(),
        priority,
        status: 'OPEN',
        attachmentUrl: attachmentUrl || undefined,
        userId: session.userId,
        clientId: clientId || undefined,
        tenantId: tenantId || undefined,
      },
    });

    // Cria a primeira mensagem do ticket
    await prisma.supportMessage.create({
      data: {
        ticketId: ticket.id,
        senderId: session.userId,
        senderName: session.name,
        senderRole: session.globalRole || 'USUARIO',
        message: message.trim(),
        attachmentUrl: attachmentUrl || undefined,
      },
    });

    return NextResponse.json({ success: true, ticket }, { status: 201 });
  } catch (err: any) {
    const status = err.message === 'Não autenticado' ? 401 : 500;
    return NextResponse.json({ error: err.message }, { status });
  }
}
