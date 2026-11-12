'use client';

import { useState, useEffect } from 'react';
import { BarChart3, TrendingUp, DollarSign, Users, Award, ShieldAlert } from 'lucide-react';

export default function ReportsPage() {
  const [stats, setStats] = useState<any>(null);

  useEffect(() => {
    fetch('/api/dashboard/stats')
      .then((res) => res.json())
      .then((d) => setStats(d.stats))
      .catch(() => {});
  }, []);

  const conversionRate = stats?.totalLeads
    ? ((stats.approvedSalesCount / stats.totalLeads) * 100).toFixed(2)
    : '0.00';

  return (
    <div className="space-y-8 max-w-7xl mx-auto">
      <div>
        <h1 className="text-2xl font-bold text-slate-900 tracking-tight">Relatórios de Desempenho</h1>
        <p className="text-sm text-slate-500 mt-1">
          Auditoria e métricas de conversão sem estimativas fantasiosas.
        </p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <div className="bg-white p-6 rounded-xl border border-slate-200 shadow-sm">
          <div className="text-xs font-semibold text-slate-400 uppercase tracking-wider">Taxa de Conversão</div>
          <div className="text-3xl font-bold text-slate-900 mt-2">{conversionRate}%</div>
          <p className="text-xs text-slate-500 mt-2">Vendas aprovadas sobre total de leads</p>
        </div>

        <div className="bg-white p-6 rounded-xl border border-slate-200 shadow-sm">
          <div className="text-xs font-semibold text-slate-400 uppercase tracking-wider">Faturamento Confirmado</div>
          <div className="text-3xl font-bold text-emerald-600 mt-2">
            R$ {(stats?.totalRevenue || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
          </div>
          <p className="text-xs text-slate-500 mt-2">Atribuído aos webhooks Hotmart oficiais</p>
        </div>

        <div className="bg-white p-6 rounded-xl border border-slate-200 shadow-sm">
          <div className="text-xs font-semibold text-slate-400 uppercase tracking-wider">Custo de Disparos</div>
          <div className="text-3xl font-bold text-slate-800 mt-2">
            US$ {(stats?.totalProviderCost || 0).toFixed(3)}
          </div>
          <p className="text-xs text-slate-500 mt-2">Consumo de Meta Cloud API e E-mail</p>
        </div>
      </div>
    </div>
  );
}
