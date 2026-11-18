'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import {
  Users,
  CreditCard,
  TrendingUp,
  Smartphone,
  Workflow,
  MessageSquare,
  AlertTriangle,
  Clock,
  ShieldCheck,
  CheckCircle2,
  XCircle,
  ArrowUpRight,
  RefreshCw,
  Plus,
} from 'lucide-react';

interface StatsData {
  clients: {
    total: number;
    active: number;
    blocked: number;
    expired: number;
    newInPeriod: number;
    expiringSoon: number;
  };
  financial: {
    mrr: number;
    arr: number;
    averageTicket: number;
    defaultingCount: number;
    upcomingExpirations: Array<{
      id: string;
      name: string;
      company: string;
      email: string;
      plan: string;
      monthlyPrice: number;
      expiresAt: string;
      daysLeft: number;
    }>;
  };
  usage: {
    totalUsers: number;
    totalTenants: number;
    totalInstances: number;
    connectedInstances: number;
    totalMessages: number;
    totalAutomations: number;
    openTicketsCount: number;
  };
}

export default function AdminDashboardPage() {
  const [stats, setStats] = useState<StatsData | null>(null);
  const [loading, setLoading] = useState(true);

  const fetchStats = async () => {
    try {
      setLoading(true);
      const res = await fetch('/api/admin/stats');
      if (res.ok) {
        const data = await res.json();
        setStats(data);
      }
    } catch {} finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchStats();
  }, []);

  const formatBRL = (val: number) => {
    return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(val || 0);
  };

  return (
    <div className="space-y-8 max-w-7xl mx-auto">
      {/* Header com Boas-vindas e Ações Rápidas */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-extrabold text-white tracking-tight flex items-center gap-2.5">
            <span>Visão Geral da Operação SaaS</span>
            <span className="px-2 py-0.5 rounded bg-emerald-500/20 text-emerald-400 border border-emerald-500/30 text-[10px] font-bold uppercase tracking-wider">
              Ao Vivo
            </span>
          </h1>
          <p className="text-xs text-slate-400 mt-1">
            Métricas consolidadas de clientes, faturamento recorrente (MRR), limites e infraestrutura.
          </p>
        </div>

        <div className="flex items-center gap-3">
          <button
            onClick={fetchStats}
            disabled={loading}
            className="p-2.5 rounded-xl border border-slate-800 bg-slate-900 hover:bg-slate-850 text-slate-300 hover:text-white transition-colors"
            title="Atualizar métricas"
          >
            <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin text-indigo-400' : ''}`} />
          </button>
          <Link
            href="/admin/clients"
            className="px-4 py-2.5 bg-gradient-to-r from-indigo-600 to-indigo-700 hover:from-indigo-500 hover:to-indigo-600 text-white rounded-xl text-xs font-bold shadow-lg shadow-indigo-600/30 flex items-center gap-1.5 transition-all"
          >
            <Plus className="w-4 h-4" />
            <span>Gerenciar Clientes</span>
          </Link>
        </div>
      </div>

      {/* ======================================================== */}
      {/* 1. MÉTRICAS FINANCEIRAS (MRR, ARR, TICKET MÉDIO) */}
      {/* ======================================================== */}
      <div>
        <div className="flex items-center gap-2 mb-3">
          <CreditCard className="w-4 h-4 text-emerald-400" />
          <h2 className="text-xs font-bold text-slate-400 uppercase tracking-wider">Métricas Financeiras & Recorrência</h2>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          {/* MRR */}
          <div className="bg-slate-900/90 border border-slate-800 rounded-2xl p-5 shadow-sm relative overflow-hidden group">
            <div className="flex items-center justify-between text-slate-400 mb-2">
              <span className="text-xs font-semibold">MRR (Mensal)</span>
              <div className="w-8 h-8 rounded-xl bg-emerald-500/10 border border-emerald-500/30 flex items-center justify-center text-emerald-400">
                <TrendingUp className="w-4 h-4" />
              </div>
            </div>
            <div className="text-2xl font-black text-white tracking-tight">
              {formatBRL(stats?.financial.mrr || 0)}
            </div>
            <span className="text-[11px] text-emerald-400 font-medium mt-1 block">
              Receita Recorrente Mensal Ativa
            </span>
          </div>

          {/* ARR Estimado */}
          <div className="bg-slate-900/90 border border-slate-800 rounded-2xl p-5 shadow-sm relative overflow-hidden group">
            <div className="flex items-center justify-between text-slate-400 mb-2">
              <span className="text-xs font-semibold">ARR (Anual Estimado)</span>
              <div className="w-8 h-8 rounded-xl bg-indigo-500/10 border border-indigo-500/30 flex items-center justify-center text-indigo-400">
                <CreditCard className="w-4 h-4" />
              </div>
            </div>
            <div className="text-2xl font-black text-white tracking-tight">
              {formatBRL(stats?.financial.arr || 0)}
            </div>
            <span className="text-[11px] text-indigo-400 font-medium mt-1 block">
              Base anual projetada (MRR × 12)
            </span>
          </div>

          {/* Ticket Médio */}
          <div className="bg-slate-900/90 border border-slate-800 rounded-2xl p-5 shadow-sm relative overflow-hidden group">
            <div className="flex items-center justify-between text-slate-400 mb-2">
              <span className="text-xs font-semibold">Ticket Médio / Cliente</span>
              <div className="w-8 h-8 rounded-xl bg-blue-500/10 border border-blue-500/30 flex items-center justify-center text-blue-400">
                <Users className="w-4 h-4" />
              </div>
            </div>
            <div className="text-2xl font-black text-white tracking-tight">
              {formatBRL(stats?.financial.averageTicket || 0)}
            </div>
            <span className="text-[11px] text-blue-400 font-medium mt-1 block">
              Valor médio por cliente ativo
            </span>
          </div>

          {/* Inadimplentes / Vencidos */}
          <div className="bg-slate-900/90 border border-slate-800 rounded-2xl p-5 shadow-sm relative overflow-hidden group">
            <div className="flex items-center justify-between text-slate-400 mb-2">
              <span className="text-xs font-semibold">Inadimplentes / Expirados</span>
              <div className="w-8 h-8 rounded-xl bg-rose-500/10 border border-rose-500/30 flex items-center justify-center text-rose-400">
                <AlertTriangle className="w-4 h-4" />
              </div>
            </div>
            <div className="text-2xl font-black text-white tracking-tight">
              {stats?.financial.defaultingCount || 0}
            </div>
            <span className="text-[11px] text-rose-400 font-medium mt-1 block">
              Clientes com prazo de acesso vencido
            </span>
          </div>
        </div>
      </div>

      {/* ======================================================== */}
      {/* 2. MÉTRICAS DE CLIENTES */}
      {/* ======================================================== */}
      <div>
        <div className="flex items-center gap-2 mb-3">
          <Users className="w-4 h-4 text-indigo-400" />
          <h2 className="text-xs font-bold text-slate-400 uppercase tracking-wider">Gestão da Base de Clientes</h2>
        </div>

        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3.5">
          <div className="p-4 rounded-xl bg-slate-900/70 border border-slate-800">
            <span className="text-[11px] text-slate-400 font-medium block">Total de Clientes</span>
            <span className="text-xl font-bold text-white mt-1 block">{stats?.clients.total || 0}</span>
          </div>

          <div className="p-4 rounded-xl bg-slate-900/70 border border-slate-800">
            <span className="text-[11px] text-emerald-400 font-medium flex items-center gap-1">
              <CheckCircle2 className="w-3 h-3" /> Clientes Ativos
            </span>
            <span className="text-xl font-bold text-emerald-300 mt-1 block">{stats?.clients.active || 0}</span>
          </div>

          <div className="p-4 rounded-xl bg-slate-900/70 border border-slate-800">
            <span className="text-[11px] text-rose-400 font-medium flex items-center gap-1">
              <XCircle className="w-3 h-3" /> Bloqueados
            </span>
            <span className="text-xl font-bold text-rose-400 mt-1 block">{stats?.clients.blocked || 0}</span>
          </div>

          <div className="p-4 rounded-xl bg-slate-900/70 border border-slate-800">
            <span className="text-[11px] text-amber-400 font-medium flex items-center gap-1">
              <Clock className="w-3 h-3" /> Próx. do Vencimento
            </span>
            <span className="text-xl font-bold text-amber-300 mt-1 block">{stats?.clients.expiringSoon || 0}</span>
          </div>

          <div className="p-4 rounded-xl bg-slate-900/70 border border-slate-800">
            <span className="text-[11px] text-blue-400 font-medium block">Novos (30 dias)</span>
            <span className="text-xl font-bold text-blue-300 mt-1 block">{stats?.clients.newInPeriod || 0}</span>
          </div>
        </div>
      </div>

      {/* ======================================================== */}
      {/* 3. USO DA PLATAFORMA & INFRAESTRUTURA */}
      {/* ======================================================== */}
      <div>
        <div className="flex items-center gap-2 mb-3">
          <Workflow className="w-4 h-4 text-purple-400" />
          <h2 className="text-xs font-bold text-slate-400 uppercase tracking-wider">Uso da Plataforma & Infraestrutura</h2>
        </div>

        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3.5">
          <div className="p-4 rounded-xl bg-slate-900/70 border border-slate-800">
            <span className="text-[11px] text-slate-400 font-medium block">Total de Usuários</span>
            <span className="text-lg font-bold text-white mt-1 block">{stats?.usage.totalUsers || 0}</span>
          </div>

          <div className="p-4 rounded-xl bg-slate-900/70 border border-slate-800">
            <span className="text-[11px] text-slate-400 font-medium block">Total Experts</span>
            <span className="text-lg font-bold text-white mt-1 block">{stats?.usage.totalTenants || 0}</span>
          </div>

          <div className="p-4 rounded-xl bg-slate-900/70 border border-slate-800">
            <span className="text-[11px] text-emerald-400 font-medium flex items-center gap-1">
              <Smartphone className="w-3 h-3" /> WhatsApp On
            </span>
            <span className="text-lg font-bold text-emerald-300 mt-1 block">
              {stats?.usage.connectedInstances || 0} <span className="text-xs text-slate-500 font-normal">/ {stats?.usage.totalInstances || 0}</span>
            </span>
          </div>

          <div className="p-4 rounded-xl bg-slate-900/70 border border-slate-800">
            <span className="text-[11px] text-slate-400 font-medium block">Mensagens Enviadas</span>
            <span className="text-lg font-bold text-white mt-1 block">
              {(stats?.usage.totalMessages || 0).toLocaleString()}
            </span>
          </div>

          <div className="p-4 rounded-xl bg-slate-900/70 border border-slate-800">
            <span className="text-[11px] text-slate-400 font-medium block">Automações Criadas</span>
            <span className="text-lg font-bold text-white mt-1 block">{stats?.usage.totalAutomations || 0}</span>
          </div>

          <div className="p-4 rounded-xl bg-slate-900/70 border border-slate-800">
            <span className="text-[11px] text-amber-400 font-medium block">Tickets Pendentes</span>
            <span className="text-lg font-bold text-amber-300 mt-1 block">{stats?.usage.openTicketsCount || 0}</span>
          </div>
        </div>
      </div>

      {/* ======================================================== */}
      {/* 4. PRÓXIMOS VENCIMENTOS */}
      {/* ======================================================== */}
      <div className="bg-slate-900/90 border border-slate-800 rounded-2xl p-6 shadow-sm">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-2">
            <Clock className="w-4 h-4 text-amber-400" />
            <h3 className="text-sm font-bold text-white">Próximos Vencimentos de Acesso</h3>
          </div>
          <Link
            href="/admin/clients"
            className="text-xs text-indigo-400 hover:text-indigo-300 flex items-center gap-1 font-semibold"
          >
            <span>Ver todos os clientes</span>
            <ArrowUpRight className="w-3.5 h-3.5" />
          </Link>
        </div>

        {stats?.financial.upcomingExpirations && stats.financial.upcomingExpirations.length > 0 ? (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead>
                <tr className="border-b border-slate-800 text-slate-400 uppercase text-[10px] tracking-wider">
                  <th className="pb-3 font-semibold">Cliente / Empresa</th>
                  <th className="pb-3 font-semibold">Plano</th>
                  <th className="pb-3 font-semibold">Valor Mensal</th>
                  <th className="pb-3 font-semibold">Data Vencimento</th>
                  <th className="pb-3 font-semibold">Dias Restantes</th>
                  <th className="pb-3 font-semibold text-right">Ação</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800/60">
                {stats.financial.upcomingExpirations.map((item) => (
                  <tr key={item.id} className="hover:bg-slate-850/50 transition-colors">
                    <td className="py-3">
                      <div className="font-semibold text-white">{item.name}</div>
                      <div className="text-[11px] text-slate-400">{item.company} • {item.email}</div>
                    </td>
                    <td className="py-3">
                      <span className="px-2 py-0.5 rounded bg-indigo-500/20 text-indigo-300 border border-indigo-500/30 font-semibold text-[10px]">
                        {item.plan}
                      </span>
                    </td>
                    <td className="py-3 font-medium text-slate-200">
                      {formatBRL(item.monthlyPrice)}
                    </td>
                    <td className="py-3 text-slate-300">
                      {new Date(item.expiresAt).toLocaleDateString()}
                    </td>
                    <td className="py-3">
                      <span className={`px-2 py-0.5 rounded font-bold text-[10px] ${
                        item.daysLeft <= 3
                          ? 'bg-rose-500/20 text-rose-400 border border-rose-500/30'
                          : item.daysLeft <= 7
                          ? 'bg-amber-500/20 text-amber-400 border border-amber-500/30'
                          : 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/30'
                      }`}>
                        {item.daysLeft} {item.daysLeft === 1 ? 'dia' : 'dias'}
                      </span>
                    </td>
                    <td className="py-3 text-right">
                      <Link
                        href={`/admin/clients?search=${encodeURIComponent(item.email)}`}
                        className="text-xs text-indigo-400 hover:text-indigo-300 font-semibold underline"
                      >
                        Liberar Dias
                      </Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <div className="py-8 text-center text-xs text-slate-400">
            Nenhum cliente cadastrado ainda. Clique em "Gerenciar Clientes" para criar seu primeiro cliente.
          </div>
        )}
      </div>
    </div>
  );
}
