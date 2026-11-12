'use client';

import { useState } from 'react';
import { Mail, CheckCircle2, ShieldCheck, FileText, Send } from 'lucide-react';

const emailTemplates = [
  {
    title: 'Boas-vindas e Confirmação de Inscrição',
    subject: 'Sua vaga está garantida no evento ao vivo!',
    preview: 'Olá {{nome}}, parabéns por dar esse passo importante. Segue o cronograma...',
  },
  {
    title: 'Lembrete: Aula Começa em 1 Hora',
    subject: '[AO VIVO] Estamos entrando no ar agora!',
    preview: '{{nome}}, a transmissão da Aula 1 já está aberta. Clique no link para participar...',
  },
  {
    title: 'Oferta: Carrinho Aberto com Bônus',
    subject: 'Inscrições abertas para o Programa Completo',
    preview: 'As vagas com bônus de mentoria individual já estão liberadas por tempo limitado...',
  },
  {
    title: 'Recuperação de Pix Pendente',
    subject: 'Importante: Seu pedido está reservado por algumas horas',
    preview: 'Notamos que você gerou o Pix mas o pagamento ainda não consta em nosso sistema...',
  },
];

export default function EmailsPage() {
  return (
    <div className="space-y-8 max-w-7xl mx-auto">
      <div>
        <h1 className="text-2xl font-bold text-slate-900 tracking-tight">E-mail Marketing & Sequências</h1>
        <p className="text-sm text-slate-500 mt-1">
          Modelos responsivos, variáveis personalizadas e entregabilidade anti-spam.
        </p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {emailTemplates.map((t, idx) => (
          <div
            key={idx}
            className="bg-white rounded-xl border border-slate-200 p-6 shadow-sm flex flex-col justify-between"
          >
            <div>
              <div className="flex items-center gap-2 text-indigo-600 font-bold text-xs mb-2">
                <FileText className="w-4 h-4" />
                <span>Template Estratégico</span>
              </div>
              <h3 className="font-bold text-slate-900 text-base">{t.title}</h3>
              <div className="mt-2 p-2.5 rounded bg-slate-50 border border-slate-100 text-xs font-mono text-slate-700">
                <strong>Assunto:</strong> {t.subject}
              </div>
              <p className="text-xs text-slate-500 mt-2">{t.preview}</p>
            </div>

            <div className="pt-4 mt-4 border-t border-slate-100 flex items-center justify-between">
              <span className="text-[11px] text-emerald-600 font-semibold flex items-center gap-1">
                <CheckCircle2 className="w-3.5 h-3.5" />
                Rodapé LGPD incluso
              </span>
              <a
                href="/automations"
                className="px-3 py-1 bg-indigo-50 hover:bg-indigo-100 text-indigo-700 font-semibold text-xs rounded-lg transition-colors"
              >
                Usar no Fluxo
              </a>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
