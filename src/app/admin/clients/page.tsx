'use client';

import { useState, useEffect } from 'react';
import {
  Users,
  Plus,
  Search,
  Filter,
  CheckCircle2,
  XCircle,
  AlertTriangle,
  Clock,
  Calendar,
  Lock,
  Unlock,
  Trash2,
  Edit,
  Eye,
  RefreshCw,
  Building,
  Mail,
  Phone,
  Smartphone,
  Workflow,
  Sparkles,
} from 'lucide-react';

interface ClientItem {
  id: string;
  name: string;
  company?: string;
  email: string;
  phone?: string;
  status: 'ACTIVE' | 'BLOCKED' | 'EXPIRED';
  effectiveStatus: 'ACTIVE' | 'BLOCKED' | 'EXPIRED';
  plan: string;
  monthlyPrice: number;
  billingCycle: string;
  startDate: string;
  expiresAt: string;
  accessDays: number;
  daysLeft: number;
  maxExperts: number;
  maxWhatsappInstances: number;
  totalExperts: number;
  totalWhatsappInstances: number;
  totalUsers: number;
  notes?: string;
  createdAt: string;
}

export default function AdminClientsPage() {
  const [clients, setClients] = useState<ClientItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('ALL');
  const [planFilter, setPlanFilter] = useState('ALL');

  // Modais
  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);
  const [isAccessModalOpen, setIsAccessModalOpen] = useState(false);
  const [isEditModalOpen, setIsEditModalOpen] = useState(false);
  const [isDetailsModalOpen, setIsDetailsModalOpen] = useState(false);
  const [selectedClient, setSelectedClient] = useState<ClientItem | null>(null);

  // Form de Criação de Novo Cliente
  const [newClientName, setNewClientName] = useState('');
  const [newClientCompany, setNewClientCompany] = useState('');
  const [newClientEmail, setNewClientEmail] = useState('');
  const [newClientPhone, setNewClientPhone] = useState('');
  const [newClientPassword, setNewClientPassword] = useState('');
  const [newClientPlan, setNewClientPlan] = useState('Pro');
  const [newClientMonthlyPrice, setNewClientMonthlyPrice] = useState(197);
  const [newClientAccessDays, setNewClientAccessDays] = useState(30);
  const [newClientMaxExperts, setNewClientMaxExperts] = useState(5);
  const [newClientMaxWpp, setNewClientMaxWpp] = useState(3);
  const [creating, setCreating] = useState(false);

  // Form de Liberação de Dias de Acesso (Controle Personalizado de Acesso)
  const [customDaysInput, setCustomDaysInput] = useState<number>(30);
  const [savingAccess, setSavingAccess] = useState(false);

  // Form de Edição de Cliente
  const [editName, setEditName] = useState('');
  const [editCompany, setEditCompany] = useState('');
  const [editEmail, setEditEmail] = useState('');
  const [editPhone, setEditPhone] = useState('');
  const [editPlan, setEditPlan] = useState('Pro');
  const [editMonthlyPrice, setEditMonthlyPrice] = useState(197);
  const [editMaxExperts, setEditMaxExperts] = useState(5);
  const [editMaxWpp, setEditMaxWpp] = useState(3);
  const [editNotes, setEditNotes] = useState('');
  const [savingEdit, setSavingEdit] = useState(false);

  const [notice, setNotice] = useState<string | null>(null);

  const fetchClients = async () => {
    try {
      setLoading(true);
      const params = new URLSearchParams();
      if (search) params.set('search', search);
      if (statusFilter !== 'ALL') params.set('status', statusFilter);
      if (planFilter !== 'ALL') params.set('plan', planFilter);

      const res = await fetch(`/api/admin/clients?${params.toString()}`);
      if (res.ok) {
        const data = await res.json();
        setClients(data.clients || []);
      }
    } catch {} finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchClients();
  }, [search, statusFilter, planFilter]);

  // Criação de Cliente
  const handleCreateClient = async (e: React.FormEvent) => {
    e.preventDefault();
    setCreating(true);

    try {
      const res = await fetch('/api/admin/clients', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: newClientName.trim(),
          company: newClientCompany.trim() || undefined,
          email: newClientEmail.trim(),
          phone: newClientPhone.trim() || undefined,
          password: newClientPassword || undefined,
          plan: newClientPlan,
          monthlyPrice: Number(newClientMonthlyPrice),
          accessDays: Number(newClientAccessDays),
          maxExperts: Number(newClientMaxExperts),
          maxWhatsappInstances: Number(newClientMaxWpp),
        }),
      });

      if (res.ok) {
        setIsCreateModalOpen(false);
        setNewClientName('');
        setNewClientCompany('');
        setNewClientEmail('');
        setNewClientPhone('');
        setNewClientPassword('');
        setNotice('Cliente cadastrado com sucesso! Usuário e Expert inicial provisionados.');
        setTimeout(() => setNotice(null), 5000);
        await fetchClients();
      } else {
        const data = await res.json().catch(() => ({}));
        alert(data.error || 'Erro ao cadastrar cliente');
      }
    } catch {
      alert('Erro de conexão ao cadastrar cliente');
    } finally {
      setCreating(false);
    }
  };

  // Bloqueio / Desbloqueio direto em 1 clique
  const handleToggleBlock = async (client: ClientItem) => {
    const isBlocking = client.effectiveStatus !== 'BLOCKED';
    const actionText = isBlocking ? 'bloquear o acesso de' : 'liberar o acesso de';
    if (!confirm(`Tem certeza que deseja ${actionText} "${client.name}"?`)) return;

    try {
      const res = await fetch(`/api/admin/clients/${client.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          status: isBlocking ? 'BLOCKED' : 'ACTIVE',
        }),
      });

      if (res.ok) {
        setNotice(`Cliente "${client.name}" ${isBlocking ? 'bloqueado' : 'liberado'} com sucesso.`);
        setTimeout(() => setNotice(null), 4000);
        await fetchClients();
      }
    } catch {
      alert('Erro ao alterar status do cliente');
    }
  };

  // Liberação de Dias de Acesso (Controle Personalizado de Acesso)
  const handleOpenAccessModal = (client: ClientItem) => {
    setSelectedClient(client);
    setCustomDaysInput(30);
    setIsAccessModalOpen(true);
  };

  const handleApplyDays = async (days: number) => {
    if (!selectedClient) return;
    setSavingAccess(true);

    try {
      const res = await fetch(`/api/admin/clients/${selectedClient.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          accessDaysToAdd: days,
          status: 'ACTIVE',
        }),
      });

      if (res.ok) {
        setIsAccessModalOpen(false);
        setNotice(`Acesso de "${selectedClient.name}" renovado em +${days} dias com sucesso!`);
        setTimeout(() => setNotice(null), 5000);
        await fetchClients();
      } else {
        const data = await res.json().catch(() => ({}));
        alert(data.error || 'Erro ao liberar dias de acesso');
      }
    } catch {
      alert('Erro ao salvar dias de acesso');
    } finally {
      setSavingAccess(false);
    }
  };

  // Abrir Modal de Edição
  const handleOpenEditModal = (client: ClientItem) => {
    setSelectedClient(client);
    setEditName(client.name);
    setEditCompany(client.company || '');
    setEditEmail(client.email);
    setEditPhone(client.phone || '');
    setEditPlan(client.plan);
    setEditMonthlyPrice(client.monthlyPrice);
    setEditMaxExperts(client.maxExperts);
    setEditMaxWpp(client.maxWhatsappInstances);
    setEditNotes(client.notes || '');
    setIsEditModalOpen(true);
  };

  const handleSaveEdit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedClient) return;
    setSavingEdit(true);

    try {
      const res = await fetch(`/api/admin/clients/${selectedClient.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: editName.trim(),
          company: editCompany.trim() || undefined,
          email: editEmail.trim(),
          phone: editPhone.trim() || undefined,
          plan: editPlan,
          monthlyPrice: Number(editMonthlyPrice),
          maxExperts: Number(editMaxExperts),
          maxWhatsappInstances: Number(editMaxWpp),
          notes: editNotes,
        }),
      });

      if (res.ok) {
        setIsEditModalOpen(false);
        setNotice(`Cliente "${editName}" atualizado com sucesso.`);
        setTimeout(() => setNotice(null), 4000);
        await fetchClients();
      } else {
        const data = await res.json().catch(() => ({}));
        alert(data.error || 'Erro ao salvar alterações');
      }
    } catch {
      alert('Erro de conexão ao salvar alterações');
    } finally {
      setSavingEdit(false);
    }
  };

  // Exclusão de Cliente
  const handleDeleteClient = async (client: ClientItem) => {
    if (!confirm(`ATENÇÃO: Deseja realmente excluir permanentemente o cliente "${client.name}"?\n\nIsso removerá seus usuários, experts, automações e instâncias.`)) return;

    try {
      const res = await fetch(`/api/admin/clients/${client.id}`, {
        method: 'DELETE',
      });

      if (res.ok) {
        setNotice(`Cliente "${client.name}" excluído.`);
        setTimeout(() => setNotice(null), 4000);
        await fetchClients();
      } else {
        const data = await res.json().catch(() => ({}));
        alert(data.error || 'Erro ao excluir');
      }
    } catch {
      alert('Erro ao excluir');
    }
  };

  const formatBRL = (val: number) => {
    return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(val || 0);
  };

  return (
    <div className="space-y-6 max-w-7xl mx-auto">
      {/* Top Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-extrabold text-white tracking-tight flex items-center gap-2">
            <Users className="w-6 h-6 text-indigo-400" />
            <span>Gerenciamento de Clientes</span>
          </h1>
          <p className="text-xs text-slate-400 mt-1">
            Cadastre clientes, controle planos, limites de experts e instâncias WhatsApp, e libere acessos personalizados.
          </p>
        </div>

        <div className="flex items-center gap-3">
          <button
            onClick={fetchClients}
            disabled={loading}
            className="p-2.5 rounded-xl border border-slate-800 bg-slate-900 hover:bg-slate-850 text-slate-300 hover:text-white transition-colors"
            title="Atualizar lista"
          >
            <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin text-indigo-400' : ''}`} />
          </button>
          <button
            onClick={() => setIsCreateModalOpen(true)}
            className="px-4 py-2.5 bg-gradient-to-r from-indigo-600 to-indigo-700 hover:from-indigo-500 hover:to-indigo-600 text-white rounded-xl text-xs font-bold shadow-lg shadow-indigo-600/30 flex items-center gap-1.5 transition-all cursor-pointer"
          >
            <Plus className="w-4 h-4" />
            <span>Cadastrar Novo Cliente</span>
          </button>
        </div>
      </div>

      {notice && (
        <div className="p-3.5 rounded-xl bg-emerald-950/40 border border-emerald-500/30 text-emerald-300 text-xs font-semibold flex items-center gap-2 animate-in fade-in">
          <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
          <span>{notice}</span>
        </div>
      )}

      {/* Barra de Filtros e Busca */}
      <div className="bg-slate-900/80 border border-slate-800 rounded-2xl p-4 flex flex-col md:flex-row items-center gap-3">
        <div className="relative flex-1 w-full">
          <Search className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Buscar por nome, empresa, e-mail ou telefone..."
            className="w-full bg-slate-950 border border-slate-800 rounded-xl pl-9 pr-4 py-2 text-xs text-white placeholder-slate-500 focus:outline-none focus:border-indigo-500"
          />
        </div>

        <div className="flex items-center gap-2 w-full md:w-auto">
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            className="bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-xs text-slate-300 focus:outline-none focus:border-indigo-500 cursor-pointer"
          >
            <option value="ALL">Todos os Status</option>
            <option value="ACTIVE">Ativos</option>
            <option value="BLOCKED">Bloqueados</option>
            <option value="EXPIRED">Expirados / Vencidos</option>
          </select>

          <select
            value={planFilter}
            onChange={(e) => setPlanFilter(e.target.value)}
            className="bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-xs text-slate-300 focus:outline-none focus:border-indigo-500 cursor-pointer"
          >
            <option value="ALL">Todos os Planos</option>
            <option value="Starter">Plano Starter</option>
            <option value="Pro">Plano Pro</option>
            <option value="Enterprise">Plano Enterprise</option>
            <option value="VIP">Plano VIP</option>
          </select>
        </div>
      </div>

      {/* Tabela de Clientes */}
      <div className="bg-slate-900/90 border border-slate-800 rounded-2xl shadow-sm overflow-hidden">
        {loading && clients.length === 0 ? (
          <div className="py-12 text-center text-xs text-slate-400">Carregando lista de clientes...</div>
        ) : clients.length === 0 ? (
          <div className="py-16 text-center text-slate-400">
            <Users className="w-10 h-10 mx-auto mb-2 opacity-30 text-indigo-400" />
            <p className="text-sm font-semibold text-white">Nenhum cliente encontrado.</p>
            <p className="text-xs text-slate-500 mt-1">Clique em "Cadastrar Novo Cliente" para adicionar.</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead>
                <tr className="border-b border-slate-800 bg-slate-950/40 text-slate-400 uppercase text-[10px] tracking-wider">
                  <th className="py-3.5 px-4 font-semibold">Cliente & Empresa</th>
                  <th className="py-3.5 px-3 font-semibold">Plano & MRR</th>
                  <th className="py-3.5 px-3 font-semibold">Status</th>
                  <th className="py-3.5 px-3 font-semibold">Vencimento & Dias</th>
                  <th className="py-3.5 px-3 font-semibold text-center">Limites Utilizados</th>
                  <th className="py-3.5 px-4 font-semibold text-right">Ações</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800/60">
                {clients.map((c) => {
                  const isBlocked = c.effectiveStatus === 'BLOCKED';
                  const isExpired = c.effectiveStatus === 'EXPIRED';

                  return (
                    <tr key={c.id} className="hover:bg-slate-850/60 transition-colors">
                      {/* Cliente */}
                      <td className="py-3 px-4">
                        <div className="font-bold text-white text-xs">{c.name}</div>
                        <div className="text-[11px] text-slate-400 flex items-center gap-1.5 mt-0.5">
                          {c.company && <span>🏢 {c.company}</span>}
                          <span>✉ {c.email}</span>
                          {c.phone && <span>📞 {c.phone}</span>}
                        </div>
                      </td>

                      {/* Plano & MRR */}
                      <td className="py-3 px-3">
                        <span className="px-2 py-0.5 rounded bg-indigo-500/20 text-indigo-300 border border-indigo-500/30 font-bold text-[10px]">
                          {c.plan}
                        </span>
                        <div className="font-semibold text-slate-200 mt-1">
                          {formatBRL(c.monthlyPrice)} <span className="text-[10px] text-slate-500 font-normal">/mês</span>
                        </div>
                      </td>

                      {/* Status */}
                      <td className="py-3 px-3">
                        {isBlocked ? (
                          <span className="px-2 py-0.5 rounded bg-rose-500/20 text-rose-400 border border-rose-500/30 font-bold text-[10px] flex items-center gap-1 w-fit">
                            <Lock className="w-2.5 h-2.5" /> Bloqueado
                          </span>
                        ) : isExpired ? (
                          <span className="px-2 py-0.5 rounded bg-amber-500/20 text-amber-300 border border-amber-500/30 font-bold text-[10px] flex items-center gap-1 w-fit">
                            <AlertTriangle className="w-2.5 h-2.5" /> Expirado
                          </span>
                        ) : (
                          <span className="px-2 py-0.5 rounded bg-emerald-500/20 text-emerald-400 border border-emerald-500/30 font-bold text-[10px] flex items-center gap-1 w-fit">
                            <CheckCircle2 className="w-2.5 h-2.5" /> Ativo
                          </span>
                        )}
                      </td>

                      {/* Vencimento & Dias Restantes */}
                      <td className="py-3 px-3">
                        <div className="text-slate-300 font-medium">
                          {new Date(c.expiresAt).toLocaleDateString()}
                        </div>
                        <span className={`text-[10px] font-bold mt-0.5 block ${
                          isBlocked
                            ? 'text-rose-400'
                            : c.daysLeft <= 3
                            ? 'text-rose-400'
                            : c.daysLeft <= 7
                            ? 'text-amber-400'
                            : 'text-emerald-400'
                        }`}>
                          {isBlocked ? 'Acesso suspenso' : `${c.daysLeft} dias restantes`}
                        </span>
                      </td>

                      {/* Limites Utilizados */}
                      <td className="py-3 px-3 text-center">
                        <div className="inline-flex items-center gap-2">
                          <span
                            className={`px-2 py-0.5 rounded text-[10px] font-bold border ${
                              c.totalExperts >= c.maxExperts
                                ? 'bg-amber-500/20 text-amber-300 border-amber-500/30'
                                : 'bg-slate-800 text-slate-300 border-slate-700'
                            }`}
                            title="Quantidade de Experts cadastrados vs limite do plano"
                          >
                            🎯 {c.totalExperts}/{c.maxExperts} Experts
                          </span>

                          <span
                            className={`px-2 py-0.5 rounded text-[10px] font-bold border ${
                              c.totalWhatsappInstances >= c.maxWhatsappInstances
                                ? 'bg-amber-500/20 text-amber-300 border-amber-500/30'
                                : 'bg-slate-800 text-slate-300 border-slate-700'
                            }`}
                            title="Instâncias de WhatsApp conectadas vs limite do plano"
                          >
                            📱 {c.totalWhatsappInstances}/{c.maxWhatsappInstances} Whats
                          </span>
                        </div>
                      </td>

                      {/* Ações */}
                      <td className="py-3 px-4 text-right">
                        <div className="flex items-center justify-end gap-1.5">
                          {/* Botão de Liberar Acesso / Dias */}
                          <button
                            onClick={() => handleOpenAccessModal(c)}
                            title="Liberar dias de acesso"
                            className="px-2 py-1 rounded-lg bg-indigo-600/20 hover:bg-indigo-600/30 text-indigo-300 border border-indigo-500/30 text-[11px] font-bold flex items-center gap-1 cursor-pointer transition-colors"
                          >
                            <Calendar className="w-3 h-3 text-indigo-400" />
                            <span>Liberar Dias</span>
                          </button>

                          {/* Bloquear / Desbloquear */}
                          <button
                            onClick={() => handleToggleBlock(c)}
                            title={isBlocked ? 'Desbloquear acesso do cliente' : 'Bloquear acesso do cliente'}
                            className={`p-1.5 rounded-lg border transition-colors cursor-pointer ${
                              isBlocked
                                ? 'bg-emerald-500/10 hover:bg-emerald-500/20 border-emerald-500/30 text-emerald-400'
                                : 'bg-rose-500/10 hover:bg-rose-500/20 border-rose-500/30 text-rose-400'
                            }`}
                          >
                            {isBlocked ? <Unlock className="w-3.5 h-3.5" /> : <Lock className="w-3.5 h-3.5" />}
                          </button>

                          {/* Editar */}
                          <button
                            onClick={() => handleOpenEditModal(c)}
                            title="Editar plano e limites"
                            className="p-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 border border-slate-700 text-slate-300 hover:text-white transition-colors cursor-pointer"
                          >
                            <Edit className="w-3.5 h-3.5" />
                          </button>

                          {/* Excluir */}
                          <button
                            onClick={() => handleDeleteClient(c)}
                            title="Excluir cliente"
                            className="p-1.5 rounded-lg bg-slate-800 hover:bg-rose-500/20 border border-slate-700 hover:border-rose-500/30 text-slate-400 hover:text-rose-400 transition-colors cursor-pointer"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* ======================================================== */}
      {/* MODAL 1: CADASTRAR NOVO CLIENTE */}
      {/* ======================================================== */}
      {isCreateModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm p-4 animate-in fade-in">
          <div className="bg-slate-900 border border-slate-800 rounded-2xl w-full max-w-xl p-6 shadow-2xl space-y-4">
            <div className="flex items-center justify-between pb-3 border-b border-slate-800">
              <div className="flex items-center gap-2">
                <div className="w-8 h-8 rounded-lg bg-indigo-500/20 border border-indigo-500/40 flex items-center justify-center text-indigo-400">
                  <Plus className="w-4 h-4" />
                </div>
                <div>
                  <h3 className="font-bold text-base text-white">Cadastrar Novo Cliente SaaS</h3>
                  <p className="text-[11px] text-slate-400">Gera automaticamente o tenant, usuário administrador e limites.</p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setIsCreateModalOpen(false)}
                className="text-slate-400 hover:text-white text-lg leading-none cursor-pointer"
              >
                ✕
              </button>
            </div>

            <form onSubmit={handleCreateClient} className="space-y-4 text-xs">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-slate-300 font-semibold mb-1">Nome do Cliente / Responsável *</label>
                  <input
                    type="text"
                    required
                    value={newClientName}
                    onChange={(e) => setNewClientName(e.target.value)}
                    placeholder="Ex: João da Silva"
                    className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-white focus:outline-none focus:border-indigo-500"
                  />
                </div>

                <div>
                  <label className="block text-slate-300 font-semibold mb-1">Nome da Empresa / Marca</label>
                  <input
                    type="text"
                    value={newClientCompany}
                    onChange={(e) => setNewClientCompany(e.target.value)}
                    placeholder="Ex: Agência Escala Digital"
                    className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-white focus:outline-none focus:border-indigo-500"
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-slate-300 font-semibold mb-1">E-mail de Acesso *</label>
                  <input
                    type="email"
                    required
                    value={newClientEmail}
                    onChange={(e) => setNewClientEmail(e.target.value)}
                    placeholder="cliente@empresa.com"
                    className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-white focus:outline-none focus:border-indigo-500"
                  />
                </div>

                <div>
                  <label className="block text-slate-300 font-semibold mb-1">WhatsApp / Telefone</label>
                  <input
                    type="text"
                    value={newClientPhone}
                    onChange={(e) => setNewClientPhone(e.target.value)}
                    placeholder="+5511999999999"
                    className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-white focus:outline-none focus:border-indigo-500"
                  />
                </div>
              </div>

              <div>
                <label className="block text-slate-300 font-semibold mb-1">Senha Inicial de Acesso (Opcional - padrão: senha123)</label>
                <input
                  type="text"
                  value={newClientPassword}
                  onChange={(e) => setNewClientPassword(e.target.value)}
                  placeholder="Defina uma senha ou deixe em branco para 'senha123'"
                  className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-white focus:outline-none focus:border-indigo-500 font-mono"
                />
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 pt-1 border-t border-slate-800">
                <div>
                  <label className="block text-slate-300 font-semibold mb-1">Plano</label>
                  <select
                    value={newClientPlan}
                    onChange={(e) => setNewClientPlan(e.target.value)}
                    className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-white focus:outline-none focus:border-indigo-500 cursor-pointer"
                  >
                    <option value="Starter">Starter</option>
                    <option value="Pro">Pro</option>
                    <option value="Enterprise">Enterprise</option>
                    <option value="VIP">VIP</option>
                  </select>
                </div>

                <div>
                  <label className="block text-slate-300 font-semibold mb-1">Valor Mensal (R$)</label>
                  <input
                    type="number"
                    min="0"
                    step="0.01"
                    value={newClientMonthlyPrice}
                    onChange={(e) => setNewClientMonthlyPrice(Number(e.target.value))}
                    className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-white focus:outline-none focus:border-indigo-500"
                  />
                </div>

                <div>
                  <label className="block text-slate-300 font-semibold mb-1">Dias de Acesso</label>
                  <input
                    type="number"
                    min="1"
                    value={newClientAccessDays}
                    onChange={(e) => setNewClientAccessDays(Number(e.target.value))}
                    className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-white focus:outline-none focus:border-indigo-500"
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-slate-300 font-semibold mb-1">Limite de Experts Permitidos</label>
                  <input
                    type="number"
                    min="1"
                    value={newClientMaxExperts}
                    onChange={(e) => setNewClientMaxExperts(Number(e.target.value))}
                    className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-white focus:outline-none focus:border-indigo-500"
                  />
                </div>

                <div>
                  <label className="block text-slate-300 font-semibold mb-1">Limite Instâncias WhatsApp</label>
                  <input
                    type="number"
                    min="1"
                    value={newClientMaxWpp}
                    onChange={(e) => setNewClientMaxWpp(Number(e.target.value))}
                    className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-white focus:outline-none focus:border-indigo-500"
                  />
                </div>
              </div>

              <div className="pt-3 flex items-center justify-end gap-2 border-t border-slate-800">
                <button
                  type="button"
                  onClick={() => setIsCreateModalOpen(false)}
                  className="px-4 py-2 rounded-xl text-slate-400 hover:text-white hover:bg-slate-800 font-semibold cursor-pointer"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={creating}
                  className="px-5 py-2 bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 text-white rounded-xl font-bold shadow-lg shadow-indigo-600/30 cursor-pointer"
                >
                  {creating ? 'Cadastrando...' : 'Criar Cliente'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ======================================================== */}
      {/* MODAL 2: CONTROLE PERSONALIZADO DE ACESSO (DIAS) */}
      {/* ======================================================== */}
      {isAccessModalOpen && selectedClient && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm p-4 animate-in fade-in">
          <div className="bg-slate-900 border border-slate-800 rounded-2xl w-full max-w-md p-6 shadow-2xl space-y-4">
            <div className="flex items-center justify-between pb-3 border-b border-slate-800">
              <div className="flex items-center gap-2">
                <div className="w-8 h-8 rounded-lg bg-indigo-500/20 border border-indigo-500/40 flex items-center justify-center text-indigo-400">
                  <Calendar className="w-4 h-4" />
                </div>
                <div>
                  <h3 className="font-bold text-base text-white">Liberar Dias de Acesso</h3>
                  <p className="text-[11px] text-slate-400">{selectedClient.name} ({selectedClient.company || selectedClient.email})</p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setIsAccessModalOpen(false)}
                className="text-slate-400 hover:text-white text-lg leading-none cursor-pointer"
              >
                ✕
              </button>
            </div>

            {/* Informações atuais de acesso */}
            <div className="p-3.5 rounded-xl bg-slate-950 border border-slate-800 text-xs space-y-1.5">
              <div className="flex items-center justify-between text-slate-400">
                <span>Data de Início:</span>
                <span className="font-semibold text-white">{new Date(selectedClient.startDate).toLocaleDateString()}</span>
              </div>
              <div className="flex items-center justify-between text-slate-400">
                <span>Data de Vencimento Atual:</span>
                <span className="font-semibold text-white">{new Date(selectedClient.expiresAt).toLocaleDateString()}</span>
              </div>
              <div className="flex items-center justify-between text-slate-400">
                <span>Dias Restantes Atuais:</span>
                <span className="font-bold text-amber-400">{selectedClient.daysLeft} dias</span>
              </div>
            </div>

            {/* Seleção rápida de dias */}
            <div>
              <label className="block text-slate-300 font-semibold text-xs mb-2">Liberação Rápida de Acesso:</label>
              <div className="grid grid-cols-3 gap-2">
                {[7, 30, 60, 90, 180, 365].map((d) => (
                  <button
                    key={d}
                    type="button"
                    disabled={savingAccess}
                    onClick={() => handleApplyDays(d)}
                    className="py-2.5 px-3 rounded-xl bg-slate-800 hover:bg-indigo-600 text-white font-bold text-xs border border-slate-700 hover:border-indigo-500 transition-all cursor-pointer shadow-sm"
                  >
                    +{d} dias
                  </button>
                ))}
              </div>
            </div>

            {/* Quantidade personalizada digitada */}
            <div className="pt-2 border-t border-slate-800">
              <label className="block text-slate-300 font-semibold text-xs mb-1.5">Ou digite uma quantidade personalizada:</label>
              <div className="flex items-center gap-2">
                <input
                  type="number"
                  min="1"
                  value={customDaysInput}
                  onChange={(e) => setCustomDaysInput(Number(e.target.value))}
                  placeholder="Ex: 45 dias"
                  className="flex-1 bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-xs text-white focus:outline-none focus:border-indigo-500 font-semibold"
                />
                <button
                  type="button"
                  disabled={savingAccess || !customDaysInput}
                  onClick={() => handleApplyDays(customDaysInput)}
                  className="px-4 py-2 bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 text-white rounded-xl text-xs font-bold shadow-lg shadow-emerald-600/30 cursor-pointer"
                >
                  {savingAccess ? 'Aplicando...' : 'Aplicar Dias'}
                </button>
              </div>
              <p className="text-[10px] text-slate-500 mt-1.5">
                Cálculo automático: <strong>Data base + quantidade de dias = novo vencimento</strong>.
              </p>
            </div>
          </div>
        </div>
      )}

      {/* ======================================================== */}
      {/* MODAL 3: EDITAR CLIENTE & LIMITES */}
      {/* ======================================================== */}
      {isEditModalOpen && selectedClient && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm p-4 animate-in fade-in">
          <div className="bg-slate-900 border border-slate-800 rounded-2xl w-full max-w-lg p-6 shadow-2xl space-y-4">
            <div className="flex items-center justify-between pb-3 border-b border-slate-800">
              <div className="flex items-center gap-2">
                <div className="w-8 h-8 rounded-lg bg-indigo-500/20 border border-indigo-500/40 flex items-center justify-center text-indigo-400">
                  <Edit className="w-4 h-4" />
                </div>
                <div>
                  <h3 className="font-bold text-base text-white">Editar Dados & Limites do Cliente</h3>
                  <p className="text-[11px] text-slate-400">{selectedClient.name}</p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setIsEditModalOpen(false)}
                className="text-slate-400 hover:text-white text-lg leading-none cursor-pointer"
              >
                ✕
              </button>
            </div>

            <form onSubmit={handleSaveEdit} className="space-y-3.5 text-xs">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-slate-300 font-semibold mb-1">Nome do Cliente</label>
                  <input
                    type="text"
                    required
                    value={editName}
                    onChange={(e) => setEditName(e.target.value)}
                    className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-white focus:outline-none focus:border-indigo-500"
                  />
                </div>

                <div>
                  <label className="block text-slate-300 font-semibold mb-1">Empresa / Marca</label>
                  <input
                    type="text"
                    value={editCompany}
                    onChange={(e) => setEditCompany(e.target.value)}
                    className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-white focus:outline-none focus:border-indigo-500"
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-slate-300 font-semibold mb-1">E-mail</label>
                  <input
                    type="email"
                    required
                    value={editEmail}
                    onChange={(e) => setEditEmail(e.target.value)}
                    className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-white focus:outline-none focus:border-indigo-500"
                  />
                </div>

                <div>
                  <label className="block text-slate-300 font-semibold mb-1">Telefone</label>
                  <input
                    type="text"
                    value={editPhone}
                    onChange={(e) => setEditPhone(e.target.value)}
                    className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-white focus:outline-none focus:border-indigo-500"
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-1 border-t border-slate-800">
                <div>
                  <label className="block text-slate-300 font-semibold mb-1">Plano Contratado</label>
                  <select
                    value={editPlan}
                    onChange={(e) => setEditPlan(e.target.value)}
                    className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-white focus:outline-none focus:border-indigo-500 cursor-pointer"
                  >
                    <option value="Starter">Starter</option>
                    <option value="Pro">Pro</option>
                    <option value="Enterprise">Enterprise</option>
                    <option value="VIP">VIP</option>
                  </select>
                </div>

                <div>
                  <label className="block text-slate-300 font-semibold mb-1">Valor Mensal (R$)</label>
                  <input
                    type="number"
                    min="0"
                    step="0.01"
                    value={editMonthlyPrice}
                    onChange={(e) => setEditMonthlyPrice(Number(e.target.value))}
                    className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-white focus:outline-none focus:border-indigo-500"
                  />
                </div>
              </div>

              {/* Limites de Experts e Instâncias WhatsApp */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 p-3 bg-slate-950 rounded-xl border border-slate-800">
                <div>
                  <label className="block text-amber-300 font-bold mb-1">🎯 Limite de Experts</label>
                  <input
                    type="number"
                    min="1"
                    value={editMaxExperts}
                    onChange={(e) => setEditMaxExperts(Number(e.target.value))}
                    className="w-full bg-slate-900 border border-slate-700 rounded-lg px-3 py-1.5 text-white focus:outline-none focus:border-amber-500 font-bold"
                  />
                  <span className="text-[10px] text-slate-500 mt-1 block">Bloqueia ao atingir</span>
                </div>

                <div>
                  <label className="block text-amber-300 font-bold mb-1">📱 Limite Instâncias WhatsApp</label>
                  <input
                    type="number"
                    min="1"
                    value={editMaxWpp}
                    onChange={(e) => setEditMaxWpp(Number(e.target.value))}
                    className="w-full bg-slate-900 border border-slate-700 rounded-lg px-3 py-1.5 text-white focus:outline-none focus:border-amber-500 font-bold"
                  />
                  <span className="text-[10px] text-slate-500 mt-1 block">Bloqueia conexão extra</span>
                </div>
              </div>

              <div>
                <label className="block text-slate-300 font-semibold mb-1">Notas Internas / Observações</label>
                <textarea
                  rows={2}
                  value={editNotes}
                  onChange={(e) => setEditNotes(e.target.value)}
                  placeholder="Informações sobre pagamento, contrato ou contato comercial..."
                  className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-white focus:outline-none focus:border-indigo-500 resize-none"
                />
              </div>

              <div className="pt-2 flex items-center justify-end gap-2 border-t border-slate-800">
                <button
                  type="button"
                  onClick={() => setIsEditModalOpen(false)}
                  className="px-4 py-2 rounded-xl text-slate-400 hover:text-white hover:bg-slate-800 font-semibold cursor-pointer"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={savingEdit}
                  className="px-5 py-2 bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 text-white rounded-xl font-bold shadow-lg shadow-indigo-600/30 cursor-pointer"
                >
                  {savingEdit ? 'Salvando...' : 'Salvar Alterações'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
