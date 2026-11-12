'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import {
  Users,
  Workflow,
  DollarSign,
  QrCode,
  CheckCircle2,
  Send,
  ArrowUpRight,
  TrendingUp,
  Sparkles,
} from 'lucide-react';

interface DashboardStats {
  stats: {
    totalLeads: number;
    activeLeads: number;
    automationsCount: number;
    activeEnrollments: number;
    totalRevenue: number;
    approvedSalesCount: number;
    pixGeneratedCount: number;
    whatsappCount: number;
    emailCount: number;
    totalMessages: number;
    totalProviderCost: number;
    scheduledJobsPending: number;
  };
  recentEvents: Array<{
    id: string;
    eventType: string;
    buyerEmail: string;
    buyerName?: string;
    productName?: string;
    priceValue?: number;
    paymentType?: string;
    receivedAt: string;
  }>;
  sourcesGrouped: Array<{
    source: string;
    count: number;
  }>;
}

export default function DashboardPage() {
  const [data, setData] = useState<DashboardStats | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch('/api/dashboard/stats')
      .then((res) => res.json())
      .then((resData) => {
        setData(resData);
        setLoading(false);
      })
      .catch(() => setLoading(false));
  }, []);

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="w-8 h-8 border-4 border-indigo-600 border-t-transparent rounded-full animate-spin"></div>
      </div>
    );
  }

  const s = data?.stats;

  return (
    <div className="space-y-8 max-w-7xl mx-auto">
      {/* Cabeçalho da Página */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-900 tracking-tight">Visão Geral do Lançamento</h1>
          <p className="text-sm text-slate-500 mt-1">
            Métricas em tempo real de contatos, automações ativas, eventos Hotmart e disparos.
          </p>
        </div>

        <div className="flex items-center gap-3">
          <Link
            href="/integrations"
            className="flex items-center gap-2 px-4 py-2 bg-gradient-to-r from-orange-500 to-amber-500 hover:from-orange-600 hover:to-amber-600 text-white font-medium text-sm rounded-lg shadow-sm shadow-orange-500/20 transition-all"
          >
            <Sparkles className="w-4 h-4" />
            <span>Simulador Hotmart</span>
          </Link>
          <Link
            href="/automations"
            className="flex items-center gap-2 px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white font-medium text-sm rounded-lg shadow-sm shadow-indigo-500/20 transition-all"
          >
            <Workflow className="w-4 h-4" />
            <span>Ver Automações</span>
          </Link>
        </div>
      </div>

      {/* Cards de Métricas Principais */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-5">
        {/* Total de Leads */}
        <div className="bg-white p-6 rounded-xl border border-slate-200 shadow-sm">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Total de Leads</span>
            <div className="w-8 h-8 rounded-lg bg-indigo-50 text-indigo-600 flex items-center justify-center">
              <Users className="w-4 h-4" />
            </div>
          </div>
          <div className="text-3xl font-bold text-slate-900 mt-3">{s?.totalLeads || 0}</div>
          <div className="flex items-center gap-1.5 mt-2 text-xs text-emerald-600 font-medium">
            <TrendingUp className="w-3.5 h-3.5" />
            <span>{s?.activeLeads || 0} leads ativos no CRM</span>
          </div>
        </div>

        {/* Faturamento Hotmart */}
        <div className="bg-white p-6 rounded-xl border border-slate-200 shadow-sm">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Receita Aprovada</span>
            <div className="w-8 h-8 rounded-lg bg-emerald-50 text-emerald-600 flex items-center justify-center">
              <DollarSign className="w-4 h-4" />
            </div>
          </div>
          <div className="text-3xl font-bold text-slate-900 mt-3">
            R$ {(s?.totalRevenue || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
          </div>
          <div className="flex items-center gap-1.5 mt-2 text-xs text-slate-500 font-medium">
            <CheckCircle2 className="w-3.5 h-3.5 text-emerald-500" />
            <span>{s?.approvedSalesCount || 0} compras aprovadas</span>
          </div>
        </div>

        {/* Pix Gerados */}
        <div className="bg-white p-6 rounded-xl border border-slate-200 shadow-sm">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Pix Gerados</span>
            <div className="w-8 h-8 rounded-lg bg-amber-50 text-amber-600 flex items-center justify-center">
              <QrCode className="w-4 h-4" />
            </div>
          </div>
          <div className="text-3xl font-bold text-slate-900 mt-3">{s?.pixGeneratedCount || 0}</div>
          <div className="flex items-center gap-1.5 mt-2 text-xs text-amber-600 font-medium">
            <span>Recuperação automática ativa</span>
          </div>
        </div>

        {/* Automações Ativas */}
        <div className="bg-white p-6 rounded-xl border border-slate-200 shadow-sm">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Em Automação</span>
            <div className="w-8 h-8 rounded-lg bg-sky-50 text-sky-600 flex items-center justify-center">
              <Workflow className="w-4 h-4" />
            </div>
          </div>
          <div className="text-3xl font-bold text-slate-900 mt-3">{s?.activeEnrollments || 0}</div>
          <div className="flex items-center gap-1.5 mt-2 text-xs text-slate-500 font-medium">
            <span>{s?.scheduledJobsPending || 0} mensagens temporizadas</span>
          </div>
        </div>
      </div>

      {/* Disparos & Custos dos Provedores */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="bg-white p-6 rounded-xl border border-slate-200 shadow-sm col-span-1">
          <h2 className="text-base font-semibold text-slate-900">Mensagens & Custos Operacionais</h2>
          <p className="text-xs text-slate-500 mt-1">Controle de consumo oficial dos canais</p>

          <div className="space-y-4 mt-6">
            <div className="flex items-center justify-between p-3 rounded-lg bg-slate-50 border border-slate-100">
              <div className="flex items-center gap-3">
                <div className="w-8 h-8 rounded-full bg-emerald-100 text-emerald-700 flex items-center justify-center font-bold text-xs">
                  W
                </div>
                <div>
                  <div className="text-sm font-semibold text-slate-800">WhatsApp</div>
                  <div className="text-xs text-slate-500">Oficial Meta Cloud API</div>
                </div>
              </div>
              <div className="text-right">
                <div className="text-sm font-bold text-slate-900">{s?.whatsappCount || 0}</div>
                <div className="text-[11px] text-slate-400">envios</div>
              </div>
            </div>

            <div className="flex items-center justify-between p-3 rounded-lg bg-slate-50 border border-slate-100">
              <div className="flex items-center gap-3">
                <div className="w-8 h-8 rounded-full bg-indigo-100 text-indigo-700 flex items-center justify-center font-bold text-xs">
                  E
                </div>
                <div>
                  <div className="text-sm font-semibold text-slate-800">E-mail Marketing</div>
                  <div className="text-xs text-slate-500">Resend / SES / Simulado</div>
                </div>
              </div>
              <div className="text-right">
                <div className="text-sm font-bold text-slate-900">{s?.emailCount || 0}</div>
                <div className="text-[11px] text-slate-400">envios</div>
              </div>
            </div>

            <div className="pt-3 border-t border-slate-100 flex items-center justify-between text-xs">
              <span className="text-slate-500">Custo Total Estimado de Provedores:</span>
              <span className="font-bold text-slate-900">
                US$ {(s?.totalProviderCost || 0).toFixed(3)}
              </span>
            </div>
          </div>
        </div>

        {/* Origem dos Leads (UTMs) */}
        <div className="bg-white p-6 rounded-xl border border-slate-200 shadow-sm col-span-2">
          <h2 className="text-base font-semibold text-slate-900">Leads por Canal de Tráfego (UTM)</h2>
          <p className="text-xs text-slate-500 mt-1">Origem dos contatos cadastrados no lançamento</p>

          <div className="mt-6 space-y-3">
            {data?.sourcesGrouped && data.sourcesGrouped.length > 0 ? (
              data.sourcesGrouped.map((item, idx) => (
                <div key={idx} className="space-y-1">
                  <div className="flex items-center justify-between text-xs font-medium">
                    <span className="text-slate-700">{item.source}</span>
                    <span className="text-slate-500">{item.count} leads</span>
                  </div>
                  <div className="w-full h-2 rounded-full bg-slate-100 overflow-hidden">
                    <div
                      className="h-full rounded-full bg-indigo-600"
                      style={{
                        width: `${Math.min(100, (item.count / (s?.totalLeads || 1)) * 100)}%`,
                      }}
                    ></div>
                  </div>
                </div>
              ))
            ) : (
              <div className="text-center py-8 text-xs text-slate-400">Nenhum canal registrado ainda.</div>
            )}
          </div>
        </div>
      </div>

      {/* Histórico Recente de Webhooks Hotmart */}
      <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
        <div className="p-6 border-b border-slate-200 flex items-center justify-between">
          <div>
            <h2 className="text-base font-semibold text-slate-900">Últimos Eventos Recebidos da Hotmart</h2>
            <p className="text-xs text-slate-500 mt-0.5">
              Eventos com validação oficial de hottok e idempotência automática
            </p>
          </div>
          <Link
            href="/integrations"
            className="text-xs font-semibold text-indigo-600 hover:text-indigo-700 flex items-center gap-1"
          >
            <span>Ver Configuração do Webhook</span>
            <ArrowUpRight className="w-3.5 h-3.5" />
          </Link>
        </div>

        <div className="divide-y divide-slate-100">
          {data?.recentEvents && data.recentEvents.length > 0 ? (
            data.recentEvents.map((evt) => (
              <div key={evt.id} className="p-4 flex items-center justify-between text-xs hover:bg-slate-50/60 transition-colors">
                <div className="flex items-center gap-3">
                  <span
                    className={`px-2.5 py-1 rounded-full font-semibold uppercase tracking-wider text-[10px] ${
                      evt.eventType === 'PURCHASE_APPROVED'
                        ? 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                        : evt.eventType === 'PURCHASE_WAITING_PAYMENT'
                        ? 'bg-amber-50 text-amber-700 border border-amber-200'
                        : 'bg-slate-100 text-slate-700'
                    }`}
                  >
                    {evt.eventType.replace('PURCHASE_', '')}
                  </span>
                  <div>
                    <span className="font-semibold text-slate-800">{evt.buyerName || evt.buyerEmail}</span>
                    <span className="text-slate-400 ml-2">({evt.buyerEmail})</span>
                  </div>
                </div>

                <div className="flex items-center gap-4 text-slate-500">
                  <span className="font-medium text-slate-700">
                    {evt.priceValue ? `R$ ${evt.priceValue.toFixed(2)}` : ''}
                  </span>
                  <span className="text-slate-400">
                    {new Date(evt.receivedAt).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}
                  </span>
                </div>
              </div>
            ))
          ) : (
            <div className="p-8 text-center text-xs text-slate-400">
              Nenhum evento recebido ainda. Use o simulador na aba Integrações para testar.
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
