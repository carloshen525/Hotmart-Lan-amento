'use client';

import { useState, useEffect } from 'react';
import {
  Headphones,
  Plus,
  MessageSquare,
  Clock,
  CheckCircle2,
  AlertCircle,
  Send,
  Paperclip,
  ChevronRight,
  RefreshCw,
} from 'lucide-react';

interface SupportMessage {
  id: string;
  senderName: string;
  senderRole: string;
  message: string;
  attachmentUrl?: string;
  createdAt: string;
}

interface SupportTicket {
  id: string;
  subject: string;
  message: string;
  priority: 'LOW' | 'MEDIUM' | 'HIGH' | 'URGENT';
  status: 'OPEN' | 'IN_PROGRESS' | 'RESOLVED';
  attachmentUrl?: string;
  createdAt: string;
  updatedAt: string;
  messages: SupportMessage[];
}

export default function ClientSupportPage() {
  const [tickets, setTickets] = useState<SupportTicket[]>([]);
  const [selectedTicket, setSelectedTicket] = useState<SupportTicket | null>(null);
  const [loading, setLoading] = useState(true);
  const [isModalOpen, setIsModalOpen] = useState(false);

  // Form novo ticket
  const [subject, setSubject] = useState('');
  const [message, setMessage] = useState('');
  const [priority, setPriority] = useState<'LOW' | 'MEDIUM' | 'HIGH' | 'URGENT'>('MEDIUM');
  const [attachmentUrl, setAttachmentUrl] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [replyText, setReplyText] = useState('');
  const [sendingReply, setSendingReply] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);

  const fetchTickets = async () => {
    try {
      setLoading(true);
      const res = await fetch('/api/support/tickets');
      if (res.ok) {
        const data = await res.json();
        setTickets(data.tickets || []);
        if (selectedTicket) {
          const fresh = data.tickets.find((t: any) => t.id === selectedTicket.id);
          if (fresh) setSelectedTicket(fresh);
        }
      }
    } catch {} finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchTickets();
  }, []);

  const handleCreateTicket = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!subject.trim() || !message.trim()) return;
    setSubmitting(true);
    setNotice(null);

    try {
      const res = await fetch('/api/support/tickets', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          subject: subject.trim(),
          message: message.trim(),
          priority,
          attachmentUrl: attachmentUrl.trim() || undefined,
        }),
      });

      if (res.ok) {
        setSubject('');
        setMessage('');
        setAttachmentUrl('');
        setPriority('MEDIUM');
        setIsModalOpen(false);
        setNotice('Chamado de suporte aberto com sucesso! Nossa equipe responderá em breve.');
        setTimeout(() => setNotice(null), 5000);
        await fetchTickets();
      } else {
        const data = await res.json().catch(() => ({}));
        alert(data.error || 'Erro ao abrir chamado');
      }
    } catch {
      alert('Erro de conexão ao abrir chamado');
    } finally {
      setSubmitting(false);
    }
  };

  const handleSendReply = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedTicket || !replyText.trim() || sendingReply) return;
    setSendingReply(true);

    try {
      const res = await fetch(`/api/support/tickets/${selectedTicket.id}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message: replyText.trim() }),
      });

      if (res.ok) {
        setReplyText('');
        await fetchTickets();
      }
    } catch {} finally {
      setSendingReply(false);
    }
  };

  const getPriorityBadge = (p: string) => {
    switch (p) {
      case 'URGENT':
        return <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-rose-500/20 text-rose-400 border border-rose-500/30">Urgente</span>;
      case 'HIGH':
        return <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-orange-500/20 text-orange-400 border border-orange-500/30">Alta</span>;
      case 'LOW':
        return <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-slate-500/20 text-slate-400 border border-slate-500/30">Baixa</span>;
      default:
        return <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-amber-500/20 text-amber-400 border border-amber-500/30">Média</span>;
    }
  };

  const getStatusBadge = (s: string) => {
    switch (s) {
      case 'RESOLVED':
        return <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-emerald-500/20 text-emerald-400 border border-emerald-500/30 flex items-center gap-1">✔ Resolvido</span>;
      case 'IN_PROGRESS':
        return <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-blue-500/20 text-blue-400 border border-blue-500/30 flex items-center gap-1">⏱ Em Atendimento</span>;
      default:
        return <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-amber-500/20 text-amber-300 border border-amber-500/30 flex items-center gap-1">● Aberto</span>;
    }
  };

  return (
    <div className="space-y-6 max-w-7xl mx-auto">
      {/* Cabeçalho */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-2xl font-bold text-slate-900 dark:text-white tracking-tight flex items-center gap-2">
              <Headphones className="w-6 h-6 text-indigo-600 dark:text-indigo-400" />
              Central de Suporte & Atendimento
            </h1>
          </div>
          <p className="text-sm text-slate-500 dark:text-slate-400 mt-1">
            Tire dúvidas, relate problemas técnicos ou solicite suporte prioritário para a nossa equipe.
          </p>
        </div>

        <div className="flex items-center gap-3">
          <button
            onClick={fetchTickets}
            disabled={loading}
            className="p-2.5 rounded-xl border border-slate-200 dark:border-slate-800 hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-600 dark:text-slate-300 transition-colors"
            title="Atualizar lista"
          >
            <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
          </button>
          <button
            onClick={() => setIsModalOpen(true)}
            className="px-4 py-2.5 bg-indigo-600 hover:bg-indigo-500 text-white rounded-xl text-sm font-semibold shadow-lg shadow-indigo-600/20 flex items-center gap-2 transition-all cursor-pointer"
          >
            <Plus className="w-4 h-4" />
            <span>Enviar mensagem para suporte</span>
          </button>
        </div>
      </div>

      {notice && (
        <div className="p-3.5 rounded-xl bg-emerald-50 dark:bg-emerald-950/40 border border-emerald-200 dark:border-emerald-500/30 text-emerald-800 dark:text-emerald-300 text-xs font-medium flex items-center gap-2 animate-in fade-in">
          <CheckCircle2 className="w-4 h-4 shrink-0 text-emerald-600 dark:text-emerald-400" />
          <span>{notice}</span>
        </div>
      )}

      {/* Grid: Lista de Tickets + Visualização do Chat */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* Coluna da Esquerda: Lista de Chamados */}
        <div className="lg:col-span-5 space-y-3">
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-4 shadow-sm">
            <h2 className="text-xs font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider mb-3">
              Seus Chamados ({tickets.length})
            </h2>

            {loading && tickets.length === 0 ? (
              <div className="py-8 text-center text-xs text-slate-400">Carregando chamados...</div>
            ) : tickets.length === 0 ? (
              <div className="py-12 text-center text-slate-400">
                <MessageSquare className="w-8 h-8 mx-auto mb-2 opacity-40" />
                <p className="text-xs font-medium">Nenhum chamado de suporte aberto.</p>
                <p className="text-[11px] text-slate-500 mt-1">Clique em "Enviar mensagem para suporte" para iniciar um atendimento.</p>
              </div>
            ) : (
              <div className="space-y-2 max-h-[600px] overflow-y-auto pr-1">
                {tickets.map((t) => {
                  const isSelected = selectedTicket?.id === t.id;
                  const lastMsg = t.messages[t.messages.length - 1];

                  return (
                    <div
                      key={t.id}
                      onClick={() => setSelectedTicket(t)}
                      className={`p-3.5 rounded-xl border transition-all cursor-pointer ${
                        isSelected
                          ? 'bg-indigo-50/80 dark:bg-indigo-950/30 border-indigo-300 dark:border-indigo-500/50 shadow-sm'
                          : 'bg-slate-50/50 dark:bg-slate-950/30 border-slate-200/80 dark:border-slate-800 hover:border-slate-300 dark:hover:border-slate-700'
                      }`}
                    >
                      <div className="flex items-start justify-between gap-2 mb-1.5">
                        <span className="font-semibold text-xs text-slate-900 dark:text-slate-100 line-clamp-1">
                          {t.subject}
                        </span>
                        {getStatusBadge(t.status)}
                      </div>

                      <p className="text-[11px] text-slate-500 dark:text-slate-400 line-clamp-2 mb-2">
                        {lastMsg?.message || t.message}
                      </p>

                      <div className="flex items-center justify-between text-[10px] text-slate-400 pt-1 border-t border-slate-200/50 dark:border-slate-800/50">
                        <div className="flex items-center gap-1.5">
                          {getPriorityBadge(t.priority)}
                          <span className="flex items-center gap-1 text-slate-400">
                            <Clock className="w-3 h-3" />
                            {new Date(t.createdAt).toLocaleDateString()}
                          </span>
                        </div>
                        <span className="text-indigo-600 dark:text-indigo-400 font-medium flex items-center gap-0.5">
                          Ver conversa <ChevronRight className="w-3 h-3" />
                        </span>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>

        {/* Coluna da Direita: Painel de Conversa do Ticket Selecionado */}
        <div className="lg:col-span-7">
          {selectedTicket ? (
            <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl flex flex-col h-[650px] shadow-sm overflow-hidden">
              {/* Header da Conversa */}
              <div className="p-4 border-b border-slate-200 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-950/40 flex items-center justify-between">
                <div>
                  <h3 className="font-bold text-sm text-slate-900 dark:text-white leading-tight">
                    {selectedTicket.subject}
                  </h3>
                  <div className="flex items-center gap-2 mt-1">
                    {getStatusBadge(selectedTicket.status)}
                    {getPriorityBadge(selectedTicket.priority)}
                    <span className="text-[11px] text-slate-400">
                      Aberto em {new Date(selectedTicket.createdAt).toLocaleDateString()} às {new Date(selectedTicket.createdAt).toLocaleTimeString().slice(0, 5)}
                    </span>
                  </div>
                </div>
              </div>

              {/* Histórico de Mensagens */}
              <div className="flex-1 p-4 overflow-y-auto space-y-3 bg-slate-50/30 dark:bg-slate-950/20">
                {selectedTicket.messages.map((m) => {
                  const isStaff = m.senderRole === 'SUPER_ADMIN' || m.senderRole === 'ADMIN';

                  return (
                    <div
                      key={m.id}
                      className={`flex flex-col ${isStaff ? 'items-start' : 'items-end'}`}
                    >
                      <div className="flex items-center gap-1.5 text-[10px] text-slate-400 mb-1 px-1">
                        <span className="font-semibold text-slate-700 dark:text-slate-300">
                          {isStaff ? '⭐ ' + (m.senderName || 'Suporte LaunchFlow') : m.senderName}
                        </span>
                        {isStaff && (
                          <span className="px-1.5 py-0.2 rounded bg-amber-500/20 text-amber-400 font-bold text-[9px] border border-amber-500/30">
                            Equipe
                          </span>
                        )}
                        <span>• {new Date(m.createdAt).toLocaleTimeString().slice(0, 5)}</span>
                      </div>

                      <div
                        className={`max-w-[85%] rounded-2xl px-4 py-3 text-xs leading-relaxed ${
                          isStaff
                            ? 'bg-white dark:bg-slate-800 text-slate-800 dark:text-slate-100 border border-slate-200 dark:border-slate-700 shadow-sm'
                            : 'bg-indigo-600 text-white rounded-br-none shadow-md shadow-indigo-600/20'
                        }`}
                      >
                        <p className="whitespace-pre-wrap">{m.message}</p>
                        {m.attachmentUrl && (
                          <div className="mt-2 pt-2 border-t border-slate-200/40 dark:border-slate-700/40">
                            <a
                              href={m.attachmentUrl}
                              target="_blank"
                              rel="noreferrer"
                              className="inline-flex items-center gap-1 text-[11px] underline opacity-90 hover:opacity-100"
                            >
                              <Paperclip className="w-3 h-3" />
                              Ver anexo / print
                            </a>
                          </div>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>

              {/* Caixa de Resposta */}
              <form onSubmit={handleSendReply} className="p-3 border-t border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 flex items-center gap-2">
                <input
                  type="text"
                  value={replyText}
                  onChange={(e) => setReplyText(e.target.value)}
                  placeholder="Digite sua resposta para o suporte..."
                  className="flex-1 bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-xl px-4 py-2.5 text-xs text-slate-900 dark:text-white focus:outline-none focus:border-indigo-500"
                />
                <button
                  type="submit"
                  disabled={!replyText.trim() || sendingReply}
                  className="px-4 py-2.5 bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 text-white rounded-xl text-xs font-semibold flex items-center gap-1.5 shadow-md shadow-indigo-600/20 cursor-pointer"
                >
                  <Send className="w-3.5 h-3.5" />
                  <span>Responder</span>
                </button>
              </form>
            </div>
          ) : (
            <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl h-[650px] flex flex-col items-center justify-center p-8 text-center text-slate-400">
              <Headphones className="w-12 h-12 mb-3 opacity-30 text-indigo-400" />
              <h3 className="font-semibold text-sm text-slate-700 dark:text-slate-300">Nenhum chamado selecionado</h3>
              <p className="text-xs text-slate-500 mt-1 max-w-sm">
                Selecione um chamado na lista ao lado para visualizar a conversa e as respostas da nossa equipe de suporte.
              </p>
            </div>
          )}
        </div>
      </div>

      {/* Modal: Enviar mensagem para suporte */}
      {isModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4 animate-in fade-in">
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl w-full max-w-lg p-6 shadow-2xl space-y-4">
            <div className="flex items-center justify-between pb-3 border-b border-slate-200 dark:border-slate-800">
              <div className="flex items-center gap-2">
                <div className="w-8 h-8 rounded-lg bg-indigo-50 dark:bg-indigo-950/60 border border-indigo-200 dark:border-indigo-500/30 flex items-center justify-center text-indigo-600 dark:text-indigo-400">
                  <Headphones className="w-4 h-4" />
                </div>
                <div>
                  <h3 className="font-bold text-base text-slate-900 dark:text-white">Novo Chamado de Suporte</h3>
                  <p className="text-[11px] text-slate-500 dark:text-slate-400">Descreva sua solicitação com o máximo de detalhes.</p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setIsModalOpen(false)}
                className="text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 text-lg leading-none cursor-pointer"
              >
                ✕
              </button>
            </div>

            <form onSubmit={handleCreateTicket} className="space-y-4 text-xs">
              <div>
                <label className="block text-slate-700 dark:text-slate-300 font-semibold mb-1">Assunto do Chamado *</label>
                <input
                  type="text"
                  required
                  value={subject}
                  onChange={(e) => setSubject(e.target.value)}
                  placeholder="Ex: Dúvida sobre disparo de WhatsApp em grupos"
                  className="w-full bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-xl px-3 py-2 text-slate-900 dark:text-white focus:outline-none focus:border-indigo-500"
                />
              </div>

              <div>
                <label className="block text-slate-700 dark:text-slate-300 font-semibold mb-1">Prioridade</label>
                <select
                  value={priority}
                  onChange={(e) => setPriority(e.target.value as any)}
                  className="w-full bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-xl px-3 py-2 text-slate-900 dark:text-white focus:outline-none focus:border-indigo-500 cursor-pointer"
                >
                  <option value="LOW">Baixa (Dúvida simples ou melhoria)</option>
                  <option value="MEDIUM">Média (Funcionamento normal)</option>
                  <option value="HIGH">Alta (Problema no fluxo ou automação)</option>
                  <option value="URGENT">Urgente (Sistema parado em lançamento)</option>
                </select>
              </div>

              <div>
                <label className="block text-slate-700 dark:text-slate-300 font-semibold mb-1">Mensagem Detalhada *</label>
                <textarea
                  rows={4}
                  required
                  value={message}
                  onChange={(e) => setMessage(e.target.value)}
                  placeholder="Explique o que aconteceu, qual o fluxo ou lead afetado..."
                  className="w-full bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-xl px-3 py-2 text-slate-900 dark:text-white focus:outline-none focus:border-indigo-500 resize-none"
                />
              </div>

              <div>
                <label className="block text-slate-700 dark:text-slate-300 font-semibold mb-1">Link de Imagem / Print / Anexo (Opcional)</label>
                <input
                  type="url"
                  value={attachmentUrl}
                  onChange={(e) => setAttachmentUrl(e.target.value)}
                  placeholder="https://imgur.com/... ou link de print"
                  className="w-full bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-xl px-3 py-2 text-slate-900 dark:text-white focus:outline-none focus:border-indigo-500"
                />
              </div>

              <div className="pt-2 flex items-center justify-end gap-2 border-t border-slate-200 dark:border-slate-800">
                <button
                  type="button"
                  onClick={() => setIsModalOpen(false)}
                  className="px-4 py-2 rounded-xl text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800 font-medium cursor-pointer"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={submitting || !subject.trim() || !message.trim()}
                  className="px-5 py-2 bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 text-white rounded-xl font-semibold shadow-lg shadow-indigo-600/30 flex items-center gap-1.5 cursor-pointer"
                >
                  {submitting ? 'Enviando...' : 'Abrir Chamado'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
