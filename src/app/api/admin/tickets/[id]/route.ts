import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { requireSuperAdmin } from '@/lib/auth';
import { logSaasAudit } from '@/lib/saas-audit';

export async function GET(
  request: Request,
  { params }: { params: { id: string } }
) {
  try {
    await requireSuperAdmin();

    const ticket = await prisma.supportTicket.findUnique({
      where: { id: params.id },
      include: {
        client: true,
        user: { select: { id: true, name: true, email: true } },
        messages: {
          orderBy: { createdAt: 'asc' },
          include: {
            sender: { select: { id: true, name: true, email: true, role: true } },
          },
        },
      },
    });

    if (!ticket) {
      return NextResponse.json({ error: 'Ticket não encontrado' }, { status: 404 });
    }

    return NextResponse.json({ ticket });
  } catch (err: any) {
    const status = err.message?.includes('Acesso negado') ? 403 : err.message?.includes('Não autenticado') ? 401 : 500;
    return NextResponse.json({ error: err.message }, { status });
  }
}

export async function POST(
  request: Request,
  { params }: { params: { id: string } }
) {
  try {
    const session = await requireSuperAdmin();
    const body = await request.json();
    const { message, status, attachmentUrl } = body;

    if (!message || !message.trim()) {
      return NextResponse.json({ error: 'Mensagem é obrigatória' }, { status: 400 });
    }

    const ticket = await prisma.supportTicket.findUnique({
      where: { id: params.id },
    });

    if (!ticket) {
      return NextResponse.json({ error: 'Ticket não encontrado' }, { status: 404 });
    }

    const newStatus = status || (ticket.status === 'OPEN' ? 'IN_PROGRESS' : ticket.status);

    const [supportMsg] = await prisma.$transaction([
      prisma.supportMessage.create({
        data: {
          ticketId: ticket.id,
          senderId: session.userId,
          senderName: session.name || 'Suporte LaunchFlow',
          senderRole: 'SUPER_ADMIN',
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

    await logSaasAudit({
      clientId: ticket.clientId,
      userId: session.userId,
      userEmail: session.email,
      userName: session.name,
      action: 'TICKET_REPLIED',
      entityType: 'TICKET',
      entityId: ticket.id,
      description: `Super Admin ${session.name} respondeu ao ticket "${ticket.subject}" (Status: ${newStatus}).`,
    });

    return NextResponse.json({ success: true, message: supportMsg, ticketStatus: newStatus });
  } catch (err: any) {
    const status = err.message?.includes('Acesso negado') ? 403 : err.message?.includes('Não autenticado') ? 401 : 500;
    return NextResponse.json({ error: err.message }, { status });
  }
}

export async function PUT(
  request: Request,
  { params }: { params: { id: string } }
) {
  try {
    const session = await requireSuperAdmin();
    const body = await request.json();
    const { status, priority } = body;

    const ticket = await prisma.supportTicket.findUnique({ where: { id: params.id } });
    if (!ticket) {
      return NextResponse.json({ error: 'Ticket não encontrado' }, { status: 404 });
    }

    const updateData: any = {};
    if (status) updateData.status = status;
    if (priority) updateData.priority = priority;

    const updated = await prisma.supportTicket.update({
      where: { id: params.id },
      data: updateData,
    });

    return NextResponse.json({ success: true, ticket: updated });
  } catch (err: any) {
    const status = err.message?.includes('Acesso negado') ? 403 : err.message?.includes('Não autenticado') ? 401 : 500;
    return NextResponse.json({ error: err.message }, { status });
  }
}
