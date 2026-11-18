import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { requireAuth } from '@/lib/auth';

export async function GET(
  request: Request,
  { params }: { params: { id: string } }
) {
  try {
    const session = await requireAuth();

    const ticket = await prisma.supportTicket.findUnique({
      where: { id: params.id },
      include: {
        messages: {
          orderBy: { createdAt: 'asc' },
        },
      },
    });

    if (!ticket) {
      return NextResponse.json({ error: 'Ticket não encontrado' }, { status: 404 });
    }

    // Valida que o ticket pertence a este usuário ou cliente
    if (ticket.userId !== session.userId && ticket.clientId !== session.clientId && session.globalRole !== 'SUPER_ADMIN' && session.globalRole !== 'ADMIN') {
      return NextResponse.json({ error: 'Acesso negado' }, { status: 403 });
    }

    return NextResponse.json({ ticket });
  } catch (err: any) {
    const status = err.message === 'Não autenticado' ? 401 : 500;
    return NextResponse.json({ error: err.message }, { status });
  }
}

export async function POST(
  request: Request,
  { params }: { params: { id: string } }
) {
  try {
    const session = await requireAuth();
    const body = await request.json();
    const { message, attachmentUrl } = body;

    if (!message || !message.trim()) {
      return NextResponse.json({ error: 'Mensagem é obrigatória' }, { status: 400 });
    }

    const ticket = await prisma.supportTicket.findUnique({
      where: { id: params.id },
    });

    if (!ticket) {
      return NextResponse.json({ error: 'Ticket não encontrado' }, { status: 404 });
    }

    if (ticket.userId !== session.userId && ticket.clientId !== session.clientId && session.globalRole !== 'SUPER_ADMIN' && session.globalRole !== 'ADMIN') {
      return NextResponse.json({ error: 'Acesso negado' }, { status: 403 });
    }

    // Se o ticket estava resolvido, reabre como OPEN
    const newStatus = ticket.status === 'RESOLVED' ? 'OPEN' : ticket.status;

    const [supportMsg] = await prisma.$transaction([
      prisma.supportMessage.create({
        data: {
          ticketId: ticket.id,
          senderId: session.userId,
          senderName: session.name,
          senderRole: session.globalRole || 'USUARIO',
          message: message.trim(),
          attachmentUrl: attachmentUrl || undefined,
        },
      }),
      prisma.supportTicket.update({
        where: { id: ticket.id },
        data: {
          status: newStatus,
          updatedAt: new Date(),
        },
      }),
    ]);

    return NextResponse.json({ success: true, message: supportMsg });
  } catch (err: any) {
    const status = err.message === 'Não autenticado' ? 401 : 500;
    return NextResponse.json({ error: err.message }, { status });
  }
}
