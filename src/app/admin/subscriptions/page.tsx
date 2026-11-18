'use client';

import { useState, useEffect } from 'react';
import {
  CreditCard,
  DollarSign,
  Calendar,
  AlertTriangle,
  CheckCircle2,
  Clock,
  Search,
  RefreshCw,
  Edit,
  TrendingUp,
  FileSpreadsheet,
  X,
  Save,
} from 'lucide-react';

interface Subscription {
  id: string;
  name: string;
  company: string;
  email: string;
  phone?: string;
  plan: string;
  monthlyPrice: number;
  billingCycle: string;
  startDate: string;
  expiresAt: string;
  status: string;
  effectiveStatus: 'ACTIVE' | 'EXPIRED' | 'BLOCKED';
  daysLeft: number;
}

interface Summary {
  totalMrr: number;
  totalArr: number;
  activeSubscribers: number;
  expiredSubscribers: number;
  blockedSubscribers: number;
  totalSubscribers: number;
}

export default function AdminSubscriptionsPage() {
  const [loading, setLoading] = useState(true);
  const [subscriptions, setSubscriptions] = useState<Subscription[]>([]);
  const [summary, setSummary] = useState<Summary | null>(null);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('ALL');
  const [editingSub, setEditingSub] = useState<Subscription | null>(null);
  const [saving, setSaving] = useState(false);

  // Edit form state
  const [editPlan, setEditPlan] = useState('');
  const [editPrice, setEditPrice] = useState(0);
  const [editCycle, setEditCycle] = useState('MONTHLY');
  const [editExpiresAt, setEditExpiresAt] = useState('');
  const [editStatus, setEditStatus] = useState('ACTIVE');

  const fetchSubscriptions = async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/admin/subscriptions');
      if (res.ok) {
        const data = await res.json();
        setSubscriptions(data.subscriptions || []);
        setSummary(data.summary || null);
      }
    } catch (err) {
      console.error('Erro ao buscar assinaturas:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchSubscriptions();
  }, []);

  const openEditModal = (sub: Subscription) => {
    setEditingSub(sub);
    setEditPlan(sub.plan || 'Pro');
    setEditPrice(sub.monthlyPrice || 0);
    setEditCycle(sub.billingCycle || 'MONTHLY');
    setEditExpiresAt(sub.expiresAt ? new Date(sub.expiresAt).toISOString().split('T')[0] : '');
    setEditStatus(sub.status || 'ACTIVE');
  };

  const handleSaveEdit = async () => {
    if (!editingSub) return;
    setSaving(true);
    try {
      const res = await fetch('/api/admin/subscriptions', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          clientId: editingSub.id,
          plan: editPlan,
          monthlyPrice: editPrice,
          billingCycle: editCycle,
          expiresAt: editExpiresAt ? new Date(editExpiresAt).toISOString() : undefined,
          status: editStatus,
        }),
      });

      if (res.ok) {
        setEditingSub(null);
        await fetchSubscriptions();
      } else {
        const err = await res.json();
        alert(err.error || 'Erro ao atualizar assinatura');
      }
    } catch (err) {
      alert('Falha na comunicação com o servidor');
    } finally {
      setSaving(false);
    }
  };

  const addDaysToEditExpires = (days: number) => {
    const base = editExpiresAt ? new Date(editExpiresAt) : new Date();
    base.setDate(base.getDate() + days);
    setEditExpiresAt(base.toISOString().split('T')[0]);
  };

  const filtered = subscriptions.filter((sub) => {
    const matchesSearch =
      sub.name.toLowerCase().includes(search.toLowerCase()) ||
      sub.company.toLowerCase().includes(search.toLowerCase()) ||
      sub.email.toLowerCase().includes(search.toLowerCase()) ||
      sub.plan.toLowerCase().includes(search.toLowerCase());

    const matchesStatus =
      statusFilter === 'ALL' ||
      (statusFilter === 'ACTIVE' && sub.effectiveStatus === 'ACTIVE') ||
      (statusFilter === 'EXPIRED' && sub.effectiveStatus === 'EXPIRED') ||
      (statusFilter === 'BLOCKED' && sub.effectiveStatus === 'BLOCKED');

    return matchesSearch && matchesStatus;
  });

  const averageTicket =
    summary && summary.activeSubscribers > 0
      ? summary.totalMrr / summary.activeSubscribers
      : 0;

  return (
    <div className="p-8 max-w-7xl mx-auto space-y-6">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <span className="p-2 rounded-xl bg-indigo-500/10 text-indigo-400 border border-indigo-500/20">
              <CreditCard className="w-6 h-6" />
            </span>
            <h1 className="text-2xl font-bold text-white tracking-tight">Recorrência & MRR</h1>
          </div>
          <p className="text-xs text-slate-400 mt-1">
            Gestão financeira de planos, renovações, faturamento mensal e anual de clientes do SaaS.
          </p>
        </div>

        <button
          onClick={fetchSubscriptions}
          disabled={loading}
          className="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-semibold rounded-xl border border-slate-700 flex items-center gap-2 transition-all cursor-pointer"
        >
          <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
          <span>Atualizar Métricas</span>
        </button>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {/* MRR */}
        <div className="bg-slate-900 border border-slate-800 rounded-2xl p-5 relative overflow-hidden shadow-sm">
          <div className="absolute top-0 right-0 w-24 h-24 bg-emerald-500/5 rounded-full blur-2xl pointer-events-none" />
          <div className="flex items-center justify-between mb-2">
            <span className="text-xs font-medium text-slate-400">MRR (Recorrência Mensal)</span>
            <span className="p-2 rounded-xl bg-emerald-500/10 text-emerald-400">
              <DollarSign className="w-4 h-4" />
            </span>
          </div>
          <div className="text-2xl font-black text-white tracking-tight">
            R$ {summary?.totalMrr ? summary.totalMrr.toLocaleString('pt-BR', { minimumFractionDigits: 2 }) : '0,00'}
          </div>
          <div className="text-[11px] text-emerald-400 font-medium mt-1 flex items-center gap-1">
            <TrendingUp className="w-3 h-3" /> Faturamento recorrente ativo
          </div>
        </div>

        {/* ARR */}
        <div className="bg-slate-900 border border-slate-800 rounded-2xl p-5 relative overflow-hidden shadow-sm">
          <div className="absolute top-0 right-0 w-24 h-24 bg-indigo-500/5 rounded-full blur-2xl pointer-events-none" />
          <div className="flex items-center justify-between mb-2">
            <span className="text-xs font-medium text-slate-400">ARR (Projeção Anual)</span>
            <span className="p-2 rounded-xl bg-indigo-500/10 text-indigo-400">
              <TrendingUp className="w-4 h-4" />
            </span>
          </div>
          <div className="text-2xl font-black text-white tracking-tight">
            R$ {summary?.totalArr ? summary.totalArr.toLocaleString('pt-BR', { minimumFractionDigits: 2 }) : '0,00'}
          </div>
          <div className="text-[11px] text-indigo-400 font-medium mt-1">
            12x MRR atual
          </div>
        </div>

        {/* Ticket Médio */}
        <div className="bg-slate-900 border border-slate-800 rounded-2xl p-5 relative overflow-hidden shadow-sm">
          <div className="absolute top-0 right-0 w-24 h-24 bg-blue-500/5 rounded-full blur-2xl pointer-events-none" />
          <div className="flex items-center justify-between mb-2">
            <span className="text-xs font-medium text-slate-400">Ticket Médio / Cliente</span>
            <span className="p-2 rounded-xl bg-blue-500/10 text-blue-400">
              <CreditCard className="w-4 h-4" />
            </span>
          </div>
          <div className="text-2xl font-black text-white tracking-tight">
            R$ {averageTicket.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
          </div>
          <div className="text-[11px] text-slate-400 font-medium mt-1">
            Média por assinante ativo
          </div>
        </div>

        {/* Assinantes Ativos */}
        <div className="bg-slate-900 border border-slate-800 rounded-2xl p-5 relative overflow-hidden shadow-sm">
          <div className="absolute top-0 right-0 w-24 h-24 bg-amber-500/5 rounded-full blur-2xl pointer-events-none" />
          <div className="flex items-center justify-between mb-2">
            <span className="text-xs font-medium text-slate-400">Status dos Assinantes</span>
            <span className="p-2 rounded-xl bg-amber-500/10 text-amber-400">
              <CheckCircle2 className="w-4 h-4" />
            </span>
          </div>
          <div className="flex items-baseline gap-2">
            <span className="text-2xl font-black text-emerald-400">{summary?.activeSubscribers || 0}</span>
            <span className="text-xs text-slate-400">ativos</span>
            {(summary?.expiredSubscribers || 0) > 0 && (
              <>
                <span className="text-slate-600">/</span>
                <span className="text-sm font-bold text-amber-400">{summary?.expiredSubscribers}</span>
                <span className="text-xs text-slate-400">expirados</span>
              </>
            )}
          </div>
          <div className="text-[11px] text-slate-400 font-medium mt-1">
            Total de {summary?.totalSubscribers || 0} contas registradas
          </div>
        </div>
      </div>

      {/* Filters & Search */}
      <div className="bg-slate-900 border border-slate-800 rounded-2xl p-4 flex flex-col md:flex-row items-center justify-between gap-4">
        <div className="relative w-full md:w-80">
          <Search className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
          <input
            type="text"
            placeholder="Buscar por cliente, empresa ou plano..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full bg-slate-950 border border-slate-800 rounded-xl pl-10 pr-4 py-2 text-xs text-slate-200 placeholder:text-slate-500 focus:outline-none focus:border-indigo-500 transition-colors"
          />
        </div>

        <div className="flex items-center gap-2 w-full md:w-auto">
          <div className="flex rounded-xl bg-slate-950 p-1 border border-slate-800 text-xs">
            <button
              onClick={() => setStatusFilter('ALL')}
              className={`px-3 py-1 rounded-lg font-medium transition-all ${
                statusFilter === 'ALL' ? 'bg-indigo-600 text-white shadow-sm' : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              Todos ({subscriptions.length})
            </button>
            <button
              onClick={() => setStatusFilter('ACTIVE')}
              className={`px-3 py-1 rounded-lg font-medium transition-all ${
                statusFilter === 'ACTIVE' ? 'bg-emerald-600 text-white shadow-sm' : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              Ativos ({subscriptions.filter((s) => s.effectiveStatus === 'ACTIVE').length})
            </button>
            <button
              onClick={() => setStatusFilter('EXPIRED')}
              className={`px-3 py-1 rounded-lg font-medium transition-all ${
                statusFilter === 'EXPIRED' ? 'bg-amber-600 text-white shadow-sm' : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              Expirados ({subscriptions.filter((s) => s.effectiveStatus === 'EXPIRED').length})
            </button>
            <button
              onClick={() => setStatusFilter('BLOCKED')}
              className={`px-3 py-1 rounded-lg font-medium transition-all ${
                statusFilter === 'BLOCKED' ? 'bg-rose-600 text-white shadow-sm' : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              Bloqueados ({subscriptions.filter((s) => s.effectiveStatus === 'BLOCKED').length})
            </button>
          </div>
        </div>
      </div>

      {/* Subscriptions Table */}
      <div className="bg-slate-900 border border-slate-800 rounded-2xl overflow-hidden shadow-sm">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs text-slate-300">
            <thead className="bg-slate-950/80 text-[11px] text-slate-400 uppercase tracking-wider border-b border-slate-800">
              <tr>
                <th className="px-6 py-4 font-semibold">Cliente & Empresa</th>
                <th className="px-6 py-4 font-semibold">Plano</th>
                <th className="px-6 py-4 font-semibold">Ciclo & Valor</th>
                <th className="px-6 py-4 font-semibold">Início</th>
                <th className="px-6 py-4 font-semibold">Próxima Renovação</th>
                <th className="px-6 py-4 font-semibold">Dias Restantes</th>
                <th className="px-6 py-4 font-semibold">Status</th>
                <th className="px-6 py-4 font-semibold text-right">Ação</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800/60">
              {filtered.length === 0 ? (
                <tr>
                  <td colSpan={8} className="px-6 py-12 text-center text-slate-500">
                    Nenhuma assinatura encontrada para os filtros selecionados.
                  </td>
                </tr>
              ) : (
                filtered.map((sub) => (
                  <tr key={sub.id} className="hover:bg-slate-800/30 transition-colors">
                    {/* Cliente */}
                    <td className="px-6 py-4">
                      <div className="font-semibold text-white">{sub.company || sub.name}</div>
                      <div className="text-[11px] text-slate-400">{sub.name} • {sub.email}</div>
                    </td>

                    {/* Plano */}
                    <td className="px-6 py-4">
                      <span className="px-2.5 py-1 rounded-lg bg-indigo-500/10 text-indigo-300 border border-indigo-500/20 font-medium">
                        {sub.plan}
                      </span>
                    </td>

                    {/* Ciclo & Valor */}
                    <td className="px-6 py-4">
                      <div className="font-bold text-white">
                        R$ {sub.monthlyPrice?.toLocaleString('pt-BR', { minimumFractionDigits: 2 }) || '0,00'}
                        <span className="text-[10px] font-normal text-slate-400"> /mês</span>
                      </div>
                      <div className="text-[10px] text-slate-400 capitalize">
                        Ciclo: {sub.billingCycle === 'MONTHLY' ? 'Mensal' : sub.billingCycle === 'YEARLY' ? 'Anual' : sub.billingCycle}
                      </div>
                    </td>

                    {/* Início */}
                    <td className="px-6 py-4 text-slate-400">
                      {sub.startDate ? new Date(sub.startDate).toLocaleDateString('pt-BR') : '-'}
                    </td>

                    {/* Renovação */}
                    <td className="px-6 py-4">
                      <div className="text-white font-medium">
                        {sub.expiresAt ? new Date(sub.expiresAt).toLocaleDateString('pt-BR') : 'Sem data'}
                      </div>
                    </td>

                    {/* Dias Restantes */}
                    <td className="px-6 py-4">
                      {sub.effectiveStatus === 'EXPIRED' ? (
                        <span className="px-2 py-0.5 rounded-full text-[10px] font-semibold bg-rose-500/10 text-rose-400 border border-rose-500/20">
                          Expirado
                        </span>
                      ) : sub.daysLeft <= 7 ? (
                        <span className="px-2 py-0.5 rounded-full text-[10px] font-semibold bg-amber-500/10 text-amber-400 border border-amber-500/20">
                          {sub.daysLeft} {sub.daysLeft === 1 ? 'dia' : 'dias'}
                        </span>
                      ) : (
                        <span className="px-2 py-0.5 rounded-full text-[10px] font-semibold bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
                          {sub.daysLeft} dias
                        </span>
                      )}
                    </td>

                    {/* Status */}
                    <td className="px-6 py-4">
                      {sub.effectiveStatus === 'ACTIVE' && (
                        <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[10px] font-semibold bg-emerald-500/15 text-emerald-400 border border-emerald-500/30">
                          <span className="w-1.5 h-1.5 rounded-full bg-emerald-400"></span>
                          Ativo
                        </span>
                      )}
                      {sub.effectiveStatus === 'EXPIRED' && (
                        <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[10px] font-semibold bg-amber-500/15 text-amber-400 border border-amber-500/30">
                          <span className="w-1.5 h-1.5 rounded-full bg-amber-400"></span>
                          Vencido
                        </span>
                      )}
                      {sub.effectiveStatus === 'BLOCKED' && (
                        <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[10px] font-semibold bg-rose-500/15 text-rose-400 border border-rose-500/30">
                          <span className="w-1.5 h-1.5 rounded-full bg-rose-400"></span>
                          Bloqueado
                        </span>
                      )}
                    </td>

                    {/* Ações */}
                    <td className="px-6 py-4 text-right">
                      <button
                        onClick={() => openEditModal(sub)}
                        className="px-3 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-semibold border border-slate-700 inline-flex items-center gap-1.5 transition-all cursor-pointer"
                      >
                        <Edit className="w-3.5 h-3.5" />
                        <span>Gerenciar</span>
                      </button>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Edit Subscription Modal */}
      {editingSub && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm">
          <div className="bg-slate-900 border border-slate-800 rounded-2xl w-full max-w-lg p-6 shadow-2xl space-y-5">
            <div className="flex items-center justify-between border-b border-slate-800 pb-4">
              <div>
                <h3 className="text-base font-bold text-white">Gerenciar Assinatura & Recorrência</h3>
                <p className="text-xs text-slate-400">{editingSub.company || editingSub.name} ({editingSub.email})</p>
              </div>
              <button
                onClick={() => setEditingSub(null)}
                className="text-slate-400 hover:text-white p-1 rounded-lg"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="space-y-4">
              {/* Plano & Valor */}
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-medium text-slate-300 mb-1">Plano Contratado</label>
                  <input
                    type="text"
                    value={editPlan}
                    onChange={(e) => setEditPlan(e.target.value)}
                    className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3.5 py-2 text-xs text-white focus:outline-none focus:border-indigo-500"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-300 mb-1">Valor Mensal (R$)</label>
                  <input
                    type="number"
                    step="0.01"
                    value={editPrice}
                    onChange={(e) => setEditPrice(parseFloat(e.target.value) || 0)}
                    className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3.5 py-2 text-xs text-white focus:outline-none focus:border-indigo-500"
                  />
                </div>
              </div>

              {/* Ciclo & Status */}
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-medium text-slate-300 mb-1">Ciclo de Cobrança</label>
                  <select
                    value={editCycle}
                    onChange={(e) => setEditCycle(e.target.value)}
                    className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3.5 py-2 text-xs text-white focus:outline-none focus:border-indigo-500"
                  >
                    <option value="MONTHLY">Mensal</option>
                    <option value="QUARTERLY">Trimestral</option>
                    <option value="SEMIANNUAL">Semestral</option>
                    <option value="YEARLY">Anual</option>
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-300 mb-1">Status Operacional</label>
                  <select
                    value={editStatus}
                    onChange={(e) => setEditStatus(e.target.value)}
                    className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3.5 py-2 text-xs text-white focus:outline-none focus:border-indigo-500"
                  >
                    <option value="ACTIVE">Ativo</option>
                    <option value="BLOCKED">Bloqueado</option>
                  </select>
                </div>
              </div>

              {/* Vencimento */}
              <div>
                <label className="block text-xs font-medium text-slate-300 mb-1">
                  Data de Vencimento / Próxima Cobrança
                </label>
                <input
                  type="date"
                  value={editExpiresAt}
                  onChange={(e) => setEditExpiresAt(e.target.value)}
                  className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3.5 py-2 text-xs text-white focus:outline-none focus:border-indigo-500"
                />
              </div>

              {/* Adicionar Dias Rapidamente */}
              <div>
                <label className="block text-[11px] font-medium text-slate-400 mb-1.5">
                  Extensão Rápida de Acesso a partir da data atual/vencimento:
                </label>
                <div className="flex flex-wrap gap-2">
                  <button
                    type="button"
                    onClick={() => addDaysToEditExpires(30)}
                    className="px-2.5 py-1 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 text-[11px] border border-slate-700 cursor-pointer"
                  >
                    +30 dias
                  </button>
                  <button
                    type="button"
                    onClick={() => addDaysToEditExpires(60)}
                    className="px-2.5 py-1 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 text-[11px] border border-slate-700 cursor-pointer"
                  >
                    +60 dias
                  </button>
                  <button
                    type="button"
                    onClick={() => addDaysToEditExpires(90)}
                    className="px-2.5 py-1 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 text-[11px] border border-slate-700 cursor-pointer"
                  >
                    +90 dias
                  </button>
                  <button
                    type="button"
                    onClick={() => addDaysToEditExpires(365)}
                    className="px-2.5 py-1 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 text-[11px] border border-slate-700 cursor-pointer"
                  >
                    +1 ano
                  </button>
                </div>
              </div>
            </div>

            <div className="flex items-center justify-end gap-3 pt-3 border-t border-slate-800">
              <button
                onClick={() => setEditingSub(null)}
                className="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-semibold rounded-xl cursor-pointer"
              >
                Cancelar
              </button>
              <button
                onClick={handleSaveEdit}
                disabled={saving}
                className="px-5 py-2 bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-semibold rounded-xl flex items-center gap-1.5 shadow-lg shadow-indigo-600/30 cursor-pointer disabled:opacity-50"
              >
                <Save className="w-3.5 h-3.5" />
                <span>{saving ? 'Salvando...' : 'Salvar Alterações'}</span>
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
