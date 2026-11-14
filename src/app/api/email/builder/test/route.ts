import { NextResponse } from 'next/server';
import { getActiveTenantId } from '@/lib/tenancy';
import { EmailService } from '@/services/email';
import { generateResponsiveEmailHtml } from '@/services/email-builder/generator';
import { EmailDocument } from '@/services/email-builder/types';

export async function POST(request: Request) {
  try {
    const tenantId = await getActiveTenantId();
    const body = await request.json();

    const { to, subject, document, variables } = body;

    if (!to) {
      return NextResponse.json({ success: false, error: 'E-mail de destino obrigatório' }, { status: 400 });
    }

    if (!document) {
      return NextResponse.json({ success: false, error: 'Documento JSON do e-mail obrigatório' }, { status: 400 });
    }

    const doc: EmailDocument = typeof document === 'string' ? JSON.parse(document) : document;

    // Variáveis padrão para teste caso não tenham sido passadas
    const testVars = {
      nome: 'Carlos Henrique (Teste)',
      primeiro_nome: 'Carlos',
      email: to,
      telefone: '+55 (11) 99999-8888',
      optout_url: '#descadastro',
      ...(variables || {}),
    };

    // Gera o HTML compilado com variáveis simuladas
    const html = generateResponsiveEmailHtml(doc, testVars);
    const finalSubject = (subject || doc.subject || 'E-mail de Teste')
      .replace(/{{nome}}/g, testVars.nome)
      .replace(/{{primeiro_nome}}/g, testVars.primeiro_nome);

    // Adiciona timestamp no assunto de teste para evitar que o Gmail agrupe em conversas antigas (Thread)
    // o que causava o Gmail a ocultar o texto e rodapé sob reticências (...)
    const timeNow = new Date().toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
    const testSubject = `[TESTE ${timeNow}] ${finalSubject}`;

    // Envio pelo EmailService do tenant
    const res = await EmailService.send(tenantId, {
      to,
      subject: testSubject,
      html,
      immediate: true, // Disparo direto de validação
    });

    if (!res.success) {
      return NextResponse.json({
        success: false,
        error: res.error || 'Falha ao entregar e-mail de teste no servidor SMTP',
      }, { status: 500 });
    }

    return NextResponse.json({
      success: true,
      message: `E-mail de teste enviado com sucesso para ${to}!`,
      messageId: res.messageId,
    });
  } catch (error: any) {
    return NextResponse.json(
      { success: false, error: error.message || 'Erro inesperado ao enviar teste' },
      { status: 500 }
    );
  }
}
