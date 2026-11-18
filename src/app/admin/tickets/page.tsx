'use client';

import { useState, useEffect } from 'react';
import {
  Headphones,
  Search,
  RefreshCw,
  MessageSquare,
  Clock,
  CheckCircle2,
  AlertCircle,
  Paperclip,
  Send,
  Building,
  User,
  ShieldAlert,
  ArrowRight,
  Filter,
} from 'lucide-react';

interface TicketMessage {
  id: string;
  senderId: string;
  senderName: string;
  senderRole: string;
  message: string;
  attachmentUrl?: string | null;
  createdAt: string;
}

interface SupportTicket {
  id: string;
  subject: string;
  message: string;
  priority: 'LOW' | 'MEDIUM' | 'HIGH' | 'URGENT';
  status: 'OPEN' | 'IN_PROGRESS' | 'RESOLVED' | 'CLOSED';
  attachmentUrl?: string | null;
  createdAt: string;
  updatedAt: string;
  client?: {
    id: string;
    name: string;
    company: string;
    email: string;
  } | null;
  user?: {
    id: string;
    name: string;
    email: string;
  } | null;
  messages: TicketMessage[];
}

export default function AdminTicketsPage() {
  const [tickets, setTickets] = useState<SupportTicket[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedTicket, setSelectedTicket] = useState<SupportTicket | null>(null);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('ALL');
  const [priorityFilter, setPriorityFilter] = useState('ALL');

  // Reply state
  const [replyText, setReplyText] = useState('');
  const [replyAttachment, setReplyAttachment] = useState('');
  const [newStatus, setNewStatus] = useState<'OPEN' | 'IN_PROGRESS' | 'RESOLVED' | 'CLOSED'>('IN_PROGRESS');
  const [submitting, setSubmitting] = useState(false);

  const fetchTickets = async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/admin/tickets');
      if (res.ok) {
        const data = await res.json();
        setTickets(data.tickets || []);
        // update selectedTicket if it is active
        if (selectedTicket) {
          const updated = (data.tickets || []).find((t: SupportTicket) => t.id === selectedTicket.id);
          if (updated) setSelectedTicket(updated);
        }
      }
    } catch (err) {
      console.error('Erro ao buscar tickets:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchTickets();
  }, []);

  const handleSelectTicket = async (ticket: SupportTicket) => {
    setSelectedTicket(ticket);
    setNewStatus(ticket.status === 'OPEN' ? 'IN_PROGRESS' : ticket.status);
    setReplyText('');
    setReplyAttachment('');

    // Fetch full messages
    try {
      const res = await fetch(`/api/admin/tickets/${ticket.id}`);
      if (res.ok) {
        const data = await res.json();
        if (data.ticket) {
          setSelectedTicket(data.ticket);
        }
      }
    } catch (err) {
      console.error('Erro ao detalhar ticket:', err);
    }
  };

  const handleSendReply = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedTicket || !replyText.trim()) return;

    setSubmitting(true);
    try {
      const res = await fetch(`/api/admin/tickets/${selectedTicket.id}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          message: replyText.trim(),
          status: newStatus,
          attachmentUrl: replyAttachment.trim() || undefined,
        }),
      });

      if (res.ok) {
        setReplyText('');
        setReplyAttachment('');
        await fetchTickets();
        const resUpdated = await fetch(`/api/admin/tickets/${selectedTicket.id}`);
        if (resUpdated.ok) {
          const dataUpdated = await resUpdated.json();
          if (dataUpdated.ticket) setSelectedTicket(dataUpdated.ticket);
        }
      } else {
        const err = await res.json();
        alert(err.error || 'Erro ao enviar resposta');
      }
    } catch (err) {
      alert('Falha na comunicação com o servidor');
    } finally {
      setSubmitting(false);
    }
  };

  const handleUpdateStatusOnly = async (status: 'OPEN' | 'IN_PROGRESS' | 'RESOLVED' | 'CLOSED') => {
    if (!selectedTicket) return;
    try {
      const res = await fetch(`/api/admin/tickets/${selectedTicket.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status }),
      });

      if (res.ok) {
        await fetchTickets();
        const resUpdated = await fetch(`/api/admin/tickets/${selectedTicket.id}`);
        if (resUpdated.ok) {
          const dataUpdated = await resUpdated.json();
          if (dataUpdated.ticket) setSelectedTicket(dataUpdated.ticket);
        }
      }
    } catch (err) {
      alert('Falha ao atualizar status');
    }
  };

  const filteredTickets = tickets.filter((t) => {
    const term = search.toLowerCase();
    const matchesSearch =
      t.subject.toLowerCase().includes(term) ||
      t.message.toLowerCase().includes(term) ||
      (t.client?.company && t.client.company.toLowerCase().includes(term)) ||
      (t.user?.name && t.user.name.toLowerCase().includes(term)) ||
      (t.user?.email && t.user.email.toLowerCase().includes(term));

    const matchesStatus = statusFilter === 'ALL' || t.status === statusFilter;
    const matchesPriority = priorityFilter === 'ALL' || t.priority === priorityFilter;

    return matchesSearch && matchesStatus && matchesPriority;
  });

  const countOpen = tickets.filter((t) => t.status === 'OPEN').length;
  const countInProgress = tickets.filter((t) => t.status === 'IN_PROGRESS').length;
  const countResolved = tickets.filter((t) => t.status === 'RESOLVED').length;

  return (
    <div className="p-8 max-w-7xl mx-auto space-y-6">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <span className="p-2 rounded-xl bg-indigo-500/10 text-indigo-400 border border-indigo-500/20">
              <Headphones className="w-6 h-6" />
            </span>
            <h1 className="text-2xl font-bold text-white tracking-tight">Central de Suporte & Chamados</h1>
          </div>
          <p className="text-xs text-slate-400 mt-1">
            Atendimento direto aos clientes do SaaS com histórico de mensagens e anexos.
          </p>
        </div>

        <button
          onClick={fetchTickets}
          disabled={loading}
          className="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-semibold rounded-xl border border-slate-700 flex items-center gap-2 transition-all cursor-pointer"
        >
          <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
          <span>Atualizar Chamados</span>
        </button>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-4 gap-4">
        <div className="bg-slate-900 border border-slate-800 rounded-2xl p-4 shadow-sm">
          <div className="text-xs text-slate-400 font-medium">Chamados Abertos</div>
          <div className="text-2xl font-black text-rose-400 mt-1">{countOpen}</div>
          <div className="text-[11px] text-rose-400/80 mt-0.5">Aguardando resposta do suporte</div>
        </div>
        <div className="bg-slate-900 border border-slate-800 rounded-2xl p-4 shadow-sm">
          <div className="text-xs text-slate-400 font-medium">Em Atendimento</div>
          <div className="text-2xl font-black text-amber-400 mt-1">{countInProgress}</div>
          <div className="text-[11px] text-amber-400/80 mt-0.5">Em análise com a equipe</div>
        </div>
        <div className="bg-slate-900 border border-slate-800 rounded-2xl p-4 shadow-sm">
          <div className="text-xs text-slate-400 font-medium">Resolvidos</div>
          <div className="text-2xl font-black text-emerald-400 mt-1">{countResolved}</div>
          <div className="text-[11px] text-emerald-400/80 mt-0.5">Concluídos com sucesso</div>
        </div>
        <div className="bg-slate-900 border border-slate-800 rounded-2xl p-4 shadow-sm">
          <div className="text-xs text-slate-400 font-medium">Total Geral</div>
          <div className="text-2xl font-black text-white mt-1">{tickets.length}</div>
          <div className="text-[11px] text-slate-400 mt-0.5">Histórico consolidado</div>
        </div>
      </div>

      {/* Main Split Layout */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
        {/* Left Column: Tickets List */}
        <div className="lg:col-span-5 bg-slate-900 border border-slate-800 rounded-2xl p-4 space-y-4">
          <div className="relative">
            <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              placeholder="Buscar chamado..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-full bg-slate-950 border border-slate-800 rounded-xl pl-9 pr-3 py-2 text-xs text-slate-200 placeholder:text-slate-500 focus:outline-none focus:border-indigo-500"
            />
          </div>

          {/* Filters pills */}
          <div className="flex flex-wrap gap-1 text-[11px]">
            <button
              onClick={() => setStatusFilter('ALL')}
              className={`px-2.5 py-1 rounded-lg font-medium transition-all ${
                statusFilter === 'ALL' ? 'bg-indigo-600 text-white' : 'bg-slate-950 text-slate-400 hover:text-white'
              }`}
            >
              Todos
            </button>
            <button
              onClick={() => setStatusFilter('OPEN')}
              className={`px-2.5 py-1 rounded-lg font-medium transition-all ${
                statusFilter === 'OPEN' ? 'bg-rose-600 text-white' : 'bg-slate-950 text-slate-400 hover:text-white'
              }`}
            >
              Abertos ({countOpen})
            </button>
            <button
              onClick={() => setStatusFilter('IN_PROGRESS')}
              className={`px-2.5 py-1 rounded-lg font-medium transition-all ${
                statusFilter === 'IN_PROGRESS' ? 'bg-amber-600 text-white' : 'bg-slate-950 text-slate-400 hover:text-white'
              }`}
            >
              Em Atendimento ({countInProgress})
            </button>
            <button
              onClick={() => setStatusFilter('RESOLVED')}
              className={`px-2.5 py-1 rounded-lg font-medium transition-all ${
                statusFilter === 'RESOLVED' ? 'bg-emerald-600 text-white' : 'bg-slate-950 text-slate-400 hover:text-white'
              }`}
            >
              Resolvidos ({countResolved})
            </button>
          </div>

          {/* List items */}
          <div className="space-y-2 max-h-[600px] overflow-y-auto pr-1">
            {filteredTickets.length === 0 ? (
              <div className="py-12 text-center text-slate-500 text-xs">
                Nenhum chamado encontrado com estes critérios.
              </div>
            ) : (
              filteredTickets.map((ticket) => {
                const isSelected = selectedTicket?.id === ticket.id;
                return (
                  <div
                    key={ticket.id}
                    onClick={() => handleSelectTicket(ticket)}
                    className={`p-3.5 rounded-xl border transition-all cursor-pointer ${
                      isSelected
                        ? 'bg-indigo-600/10 border-indigo-500/50 shadow-sm'
                        : 'bg-slate-950/60 border-slate-800/80 hover:border-slate-700 hover:bg-slate-800/30'
                    }`}
                  >
                    <div className="flex items-start justify-between gap-2 mb-1.5">
                      <span className="font-semibold text-white text-xs line-clamp-1">
                        {ticket.subject}
                      </span>
                      {ticket.priority === 'URGENT' && (
                        <span className="px-1.5 py-0.2 rounded bg-rose-500/20 text-rose-400 text-[9px] font-bold border border-rose-500/30 shrink-0">
                          URGENTE
                        </span>
                      )}
                      {ticket.priority === 'HIGH' && (
                        <span className="px-1.5 py-0.2 rounded bg-amber-500/20 text-amber-400 text-[9px] font-bold border border-amber-500/30 shrink-0">
                          ALTA
                        </span>
                      )}
                    </div>

                    <p className="text-[11px] text-slate-400 line-clamp-2 mb-2">
                      {ticket.message}
                    </p>

                    <div className="flex items-center justify-between text-[10px] text-slate-500">
                      <span className="text-slate-400 font-medium">
                        {ticket.client?.company || ticket.client?.name || ticket.user?.name || 'Cliente'}
                      </span>
                      <div className="flex items-center gap-1.5">
                        {ticket.status === 'OPEN' && (
                          <span className="px-1.5 py-0.2 rounded-full bg-rose-500/20 text-rose-400 font-semibold">
                            Aberto
                          </span>
                        )}
                        {ticket.status === 'IN_PROGRESS' && (
                          <span className="px-1.5 py-0.2 rounded-full bg-amber-500/20 text-amber-400 font-semibold">
                            Em atendimento
                          </span>
                        )}
                        {ticket.status === 'RESOLVED' && (
                          <span className="px-1.5 py-0.2 rounded-full bg-emerald-500/20 text-emerald-400 font-semibold">
                            Resolvido
                          </span>
                        )}
                        {ticket.status === 'CLOSED' && (
                          <span className="px-1.5 py-0.2 rounded-full bg-slate-800 text-slate-400 font-semibold">
                            Fechado
                          </span>
                        )}
                        <span>{new Date(ticket.createdAt).toLocaleDateString('pt-BR')}</span>
                      </div>
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </div>

        {/* Right Column: Ticket Conversation Thread */}
        <div className="lg:col-span-7 bg-slate-900 border border-slate-800 rounded-2xl p-6 min-h-[500px] flex flex-col shadow-sm">
          {selectedTicket ? (
            <div className="flex flex-col h-full space-y-4">
              {/* Ticket Top Info */}
              <div className="border-b border-slate-800 pb-4">
                <div className="flex items-start justify-between gap-4">
                  <div>
                    <div className="flex items-center gap-2 mb-1">
                      <span className="text-xs text-indigo-400 font-bold uppercase tracking-wider">
                        #{selectedTicket.id.slice(-6)}
                      </span>
                      <h2 className="text-base font-bold text-white">{selectedTicket.subject}</h2>
                    </div>
                    <div className="flex flex-wrap items-center gap-3 text-xs text-slate-400">
                      <span className="flex items-center gap-1">
                        <Building className="w-3.5 h-3.5 text-slate-500" />
                        {selectedTicket.client?.company || selectedTicket.client?.name || 'Empresa'}
                      </span>
                      <span>•</span>
                      <span className="flex items-center gap-1">
                        <User className="w-3.5 h-3.5 text-slate-500" />
                        {selectedTicket.user?.name} ({selectedTicket.user?.email})
                      </span>
                    </div>
                  </div>

                  {/* Status Dropdown */}
                  <div className="flex items-center gap-2">
                    <span className="text-[11px] text-slate-400">Status:</span>
                    <select
                      value={selectedTicket.status}
                      onChange={(e) => handleUpdateStatusOnly(e.target.value as any)}
                      className="bg-slate-950 border border-slate-800 rounded-xl px-2.5 py-1.5 text-xs text-white focus:outline-none focus:border-indigo-500 font-medium cursor-pointer"
                    >
                      <option value="OPEN">🔴 Aberto</option>
                      <option value="IN_PROGRESS">🟡 Em Atendimento</option>
                      <option value="RESOLVED">🟢 Resolvido</option>
                      <option value="CLOSED">⚪ Fechado</option>
                    </select>
                  </div>
                </div>
              </div>

              {/* Messages Scroll Area */}
              <div className="flex-1 overflow-y-auto space-y-4 pr-2 max-h-[420px]">
                {/* Initial Ticket Message */}
                <div className="bg-slate-950 border border-slate-800/80 rounded-2xl p-4 space-y-2">
                  <div className="flex items-center justify-between text-xs border-b border-slate-800/50 pb-2">
                    <span className="font-bold text-indigo-300">
                      {selectedTicket.user?.name || 'Cliente'} (Mensagem Inicial)
                    </span>
                    <span className="text-slate-500 text-[10px]">
                      {new Date(selectedTicket.createdAt).toLocaleString('pt-BR')}
                    </span>
                  </div>
                  <p className="text-xs text-slate-200 whitespace-pre-wrap leading-relaxed">
                    {selectedTicket.message}
                  </p>
                  {selectedTicket.attachmentUrl && (
                    <div className="pt-2">
                      <a
                        href={selectedTicket.attachmentUrl}
                        target="_blank"
                        rel="noreferrer"
                        className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-indigo-950/40 border border-indigo-800/50 text-indigo-300 text-xs hover:bg-indigo-900/50 transition-colors"
                      >
                        <Paperclip className="w-3.5 h-3.5" />
                        <span>Ver anexo enviado</span>
                      </a>
                    </div>
                  )}
                </div>

                {/* Follow-up Messages */}
                {selectedTicket.messages &&
                  selectedTicket.messages.map((msg) => {
                    const isStaff = msg.senderRole === 'SUPER_ADMIN' || msg.senderRole === 'ADMIN';
                    return (
                      <div
                        key={msg.id}
                        className={`rounded-2xl p-4 space-y-2 ${
                          isStaff
                            ? 'bg-indigo-950/30 border border-indigo-800/40 ml-6'
                            : 'bg-slate-950 border border-slate-800 mr-6'
                        }`}
                      >
                        <div className="flex items-center justify-between text-xs border-b border-slate-800/40 pb-2">
                          <div className="flex items-center gap-2">
                            <span className={`font-bold ${isStaff ? 'text-indigo-400' : 'text-slate-300'}`}>
                              {msg.senderName}
                            </span>
                            {isStaff && (
                              <span className="px-1.5 py-0.2 rounded bg-indigo-500/20 text-indigo-300 text-[9px] font-bold border border-indigo-500/30">
                                SUPORTE
                              </span>
                            )}
                          </div>
                          <span className="text-slate-500 text-[10px]">
                            {new Date(msg.createdAt).toLocaleString('pt-BR')}
                          </span>
                        </div>
                        <p className="text-xs text-slate-200 whitespace-pre-wrap leading-relaxed">
                          {msg.message}
                        </p>
                        {msg.attachmentUrl && (
                          <div className="pt-2">
                            <a
                              href={msg.attachmentUrl}
                              target="_blank"
                              rel="noreferrer"
                              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-slate-900 border border-slate-700 text-indigo-300 text-xs hover:bg-slate-800"
                            >
                              <Paperclip className="w-3.5 h-3.5" />
                              <span>Ver anexo</span>
                            </a>
                          </div>
                        )}
                      </div>
                    );
                  })}
              </div>

              {/* Reply Box */}
              <form onSubmit={handleSendReply} className="pt-3 border-t border-slate-800 space-y-3">
                <textarea
                  rows={3}
                  placeholder="Escreva a resposta para o cliente..."
                  value={replyText}
                  onChange={(e) => setReplyText(e.target.value)}
                  className="w-full bg-slate-950 border border-slate-800 rounded-xl p-3 text-xs text-white placeholder:text-slate-500 focus:outline-none focus:border-indigo-500 resize-none"
                />

                <div className="flex flex-col sm:flex-row items-center justify-between gap-3">
                  <div className="flex items-center gap-2 w-full sm:w-auto">
                    <input
                      type="url"
                      placeholder="URL de anexo ou imagem (opcional)..."
                      value={replyAttachment}
                      onChange={(e) => setReplyAttachment(e.target.value)}
                      className="bg-slate-950 border border-slate-800 rounded-xl px-3 py-1.5 text-xs text-slate-300 placeholder:text-slate-600 focus:outline-none focus:border-indigo-500 w-full sm:w-72"
                    />
                  </div>

                  <div className="flex items-center gap-3 w-full sm:w-auto justify-end">
                    <select
                      value={newStatus}
                      onChange={(e) => setNewStatus(e.target.value as any)}
                      className="bg-slate-950 border border-slate-800 rounded-xl px-2.5 py-1.5 text-xs text-slate-300 focus:outline-none"
                    >
                      <option value="IN_PROGRESS">Manter: Em atendimento</option>
                      <option value="RESOLVED">Marcar como: Resolvido</option>
                      <option value="CLOSED">Marcar como: Fechado</option>
                    </select>

                    <button
                      type="submit"
                      disabled={submitting || !replyText.trim()}
                      className="px-4 py-1.5 bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-semibold rounded-xl flex items-center gap-1.5 shadow-lg shadow-indigo-600/30 disabled:opacity-50 cursor-pointer"
                    >
                      <Send className="w-3.5 h-3.5" />
                      <span>{submitting ? 'Enviando...' : 'Responder'}</span>
                    </button>
                  </div>
                </div>
              </form>
            </div>
          ) : (
            <div className="flex-1 flex flex-col items-center justify-center text-center text-slate-500 p-8">
              <Headphones className="w-12 h-12 text-slate-700 mb-3" />
              <h3 className="text-sm font-semibold text-slate-400">Nenhum chamado selecionado</h3>
              <p className="text-xs text-slate-600 max-w-xs mt-1">
                Selecione um chamado na lista à esquerda para ler as mensagens e responder ao cliente.
              </p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
