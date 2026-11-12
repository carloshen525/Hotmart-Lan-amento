'use client';

import { Calendar as CalendarIcon, Clock, Mail, MessageSquare } from 'lucide-react';

const scheduleEvents = [
  { day: 'Segunda-feira', time: '09:00', channel: 'EMAIL', title: 'Boas-vindas para novos inscritos', audience: 'Todos os cadastrados' },
  { day: 'Segunda-feira', time: '10:30', channel: 'WHATSAPP', title: 'Link do Grupo VIP com material', audience: 'Inscritos sem WhatsApp' },
  { day: 'Terça-feira', time: '19:00', channel: 'EMAIL', title: 'Aquecimento: Os 3 Maiores Erros na Área', audience: 'Lista Ativa' },
  { day: 'Quarta-feira', time: '19:45', channel: 'WHATSAPP', title: 'Aviso: Entrando ao vivo em 15 minutos', audience: 'Lista Ativa' },
  { day: 'Quinta-feira', time: '09:00', channel: 'EMAIL', title: 'Abertura Oficial de Inscrições com Bônus', audience: 'Super Engajados' },
  { day: 'Quinta-feira', time: '11:00', channel: 'WHATSAPP', title: 'Recuperação de Pix pendente', audience: 'Pix Gerado' },
];

export default function CalendarPage() {
  return (
    <div className="space-y-8 max-w-7xl mx-auto">
      <div>
        <h1 className="text-2xl font-bold text-slate-900 tracking-tight">Calendário de Disparos</h1>
        <p className="text-sm text-slate-500 mt-1">
          Visualização cronológica das mensagens programadas para a semana de lançamento.
        </p>
      </div>

      <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-6">
        <div className="flex items-center gap-2 font-bold text-slate-900 mb-6 text-sm">
          <CalendarIcon className="w-4 h-4 text-indigo-600" />
          <span>Cronograma da Semana de Lançamento</span>
        </div>

        <div className="space-y-3">
          {scheduleEvents.map((evt, idx) => (
            <div
              key={idx}
              className="p-4 rounded-xl bg-slate-50 border border-slate-100 flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs"
            >
              <div className="flex items-center gap-3">
                <div
                  className={`w-8 h-8 rounded-lg flex items-center justify-center font-bold ${
                    evt.channel === 'WHATSAPP'
                      ? 'bg-emerald-100 text-emerald-700'
                      : 'bg-blue-100 text-blue-700'
                  }`}
                >
                  {evt.channel === 'WHATSAPP' ? (
                    <MessageSquare className="w-4 h-4" />
                  ) : (
                    <Mail className="w-4 h-4" />
                  )}
                </div>
                <div>
                  <span className="font-bold text-slate-800 text-sm block">{evt.title}</span>
                  <span className="text-slate-400">Público: {evt.audience}</span>
                </div>
              </div>

              <div className="flex items-center gap-4 text-slate-600">
                <span className="font-medium">{evt.day}</span>
                <span className="px-2.5 py-1 bg-white border border-slate-200 rounded font-mono font-bold text-slate-800">
                  {evt.time}
                </span>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
