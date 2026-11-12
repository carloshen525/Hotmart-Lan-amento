import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const email = searchParams.get('email');
  const tenantId = searchParams.get('tenant');

  if (email && tenantId) {
    await prisma.contact.updateMany({
      where: {
        tenantId,
        email: email.toLowerCase().trim(),
      },
      data: {
        status: 'UNSUBSCRIBED',
        consentGiven: false,
      },
    });
  }

  const html = `
    <!DOCTYPE html>
    <html lang="pt-BR">
    <head>
      <meta charset="UTF-8">
      <title>Inscrição Cancelada com Sucesso</title>
      <style>
        body { font-family: -apple-system, sans-serif; display: flex; align-items: center; justify-content: center; height: 100vh; margin: 0; background-color: #f8fafc; }
        .card { background: white; padding: 40px; border-radius: 12px; box-shadow: 0 4px 6px -1px rgba(0,0,0,0.1); max-width: 480px; text-align: center; }
        h1 { color: #1e293b; font-size: 20px; margin-bottom: 12px; }
        p { color: #64748b; font-size: 14px; line-height: 1.5; }
      </style>
    </head>
    <body>
      <div class="card">
        <h1>Inscrição Cancelada</h1>
        <p>Seu e-mail (<strong>${email || ''}</strong>) foi descadastrado com sucesso de nossa lista de comunicações.</p>
        <p>Você não receberá mais e-mails ou mensagens promocionais deste lançamento.</p>
      </div>
    </body>
    </html>
  `;

  return new NextResponse(html, {
    headers: { 'Content-Type': 'text/html; charset=utf-8' },
  });
}
