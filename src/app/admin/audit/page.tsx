'use client';

import { useState, useEffect } from 'react';
import {
  FileText,
  Search,
  RefreshCw,
  Clock,
  User,
  Building,
  Eye,
  X,
  Code,
  ShieldCheck,
  Filter,
} from 'lucide-react';

interface AuditLog {
  id: string;
  clientId?: string | null;
  userId?: string | null;
  userEmail?: string | null;
  userName?: string | null;
  action: string;
  entityType: string;
  entityId?: string | null;
  description: string;
  beforeData?: string | null;
  afterData?: string | null;
  ipAddress?: string | null;
  createdAt: string;
  client?: {
    id: string;
    name: string;
    company: string;
  } | null;
}

export default function AdminAuditPage() {
  const [logs, setLogs] = useState<AuditLog[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [entityTypeFilter, setEntityTypeFilter] = useState('ALL');
  const [viewingLog, setViewingLog] = useState<AuditLog | null>(null);

  const fetchLogs = async () => {
    setLoading(true);
    try {
      const url = new URL('/api/admin/audit', window.location.origin);
      if (search) url.searchParams.set('search', search);
      if (entityTypeFilter && entityTypeFilter !== 'ALL') {
        url.searchParams.set('entityType', entityTypeFilter);
      }

      const res = await fetch(url.toString());
      if (res.ok) {
        const data = await res.json();
        setLogs(data.logs || []);
      }
    } catch (err) {
      console.error('Erro ao buscar logs de auditoria:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchLogs();
  }, [entityTypeFilter]);

  const handleSearchSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    fetchLogs();
  };

  const getActionBadge = (action: string) => {
    if (action.includes('BLOCKED') || action.includes('DELETED')) {
      return (
        <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-rose-500/15 text-rose-400 border border-rose-500/30">
          {action}
        </span>
      );
    }
    if (action.includes('CREATED') || action.includes('UNBLOCKED')) {
      return (
        <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-emerald-500/15 text-emerald-400 border border-emerald-500/30">
          {action}
        </span>
      );
    }
    if (action.includes('DAYS') || action.includes('SUBSCRIPTION')) {
      return (
        <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-amber-500/15 text-amber-400 border border-amber-500/30">
          {action}
        </span>
      );
    }
    return (
      <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-indigo-500/15 text-indigo-300 border border-indigo-500/30">
        {action}
      </span>
    );
  };

  const formatJson = (str?: string | null) => {
    if (!str) return 'Nenhum dado registrado';
    try {
      const parsed = JSON.parse(str);
      return JSON.stringify(parsed, null, 2);
    } catch {
      return str;
    }
  };

  return (
    <div className="p-8 max-w-7xl mx-auto space-y-6">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <span className="p-2 rounded-xl bg-indigo-500/10 text-indigo-400 border border-indigo-500/20">
              <FileText className="w-6 h-6" />
            </span>
            <h1 className="text-2xl font-bold text-white tracking-tight">Auditoria & Logs Operacionais</h1>
          </div>
          <p className="text-xs text-slate-400 mt-1">
            Rastreamento de todas as ações administrativas, alterações de limites, bloqueios e acessos no SaaS.
          </p>
        </div>

        <button
          onClick={fetchLogs}
          disabled={loading}
          className="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-semibold rounded-xl border border-slate-700 flex items-center gap-2 transition-all cursor-pointer"
        >
          <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
          <span>Atualizar Logs</span>
        </button>
      </div>

      {/* Filter and Search Bar */}
      <div className="bg-slate-900 border border-slate-800 rounded-2xl p-4 flex flex-col md:flex-row items-center justify-between gap-4">
        <form onSubmit={handleSearchSubmit} className="relative w-full md:w-96">
          <Search className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
          <input
            type="text"
            placeholder="Buscar por descrição, ação, usuário ou e-mail..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full bg-slate-950 border border-slate-800 rounded-xl pl-10 pr-4 py-2 text-xs text-slate-200 placeholder:text-slate-500 focus:outline-none focus:border-indigo-500"
          />
        </form>

        <div className="flex items-center gap-2 w-full md:w-auto">
          <span className="text-xs text-slate-400 flex items-center gap-1">
            <Filter className="w-3.5 h-3.5" /> Entidade:
          </span>
          <select
            value={entityTypeFilter}
            onChange={(e) => setEntityTypeFilter(e.target.value)}
            className="bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-xs text-white focus:outline-none focus:border-indigo-500"
          >
            <option value="ALL">Todas as Entidades</option>
            <option value="CLIENT">Clientes (CLIENT)</option>
            <option value="INSTANCE">Instâncias WhatsApp (INSTANCE)</option>
            <option value="USER">Usuários (USER)</option>
            <option value="SUBSCRIPTION">Assinaturas (SUBSCRIPTION)</option>
            <option value="TICKET">Chamados / Suporte (TICKET)</option>
          </select>
        </div>
      </div>

      {/* Audit Logs Table */}
      <div className="bg-slate-900 border border-slate-800 rounded-2xl overflow-hidden shadow-sm">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs text-slate-300">
            <thead className="bg-slate-950/80 text-[11px] text-slate-400 uppercase tracking-wider border-b border-slate-800">
              <tr>
                <th className="px-6 py-4 font-semibold">Data / Hora</th>
                <th className="px-6 py-4 font-semibold">Super Admin Responsável</th>
                <th className="px-6 py-4 font-semibold">Ação & Entidade</th>
                <th className="px-6 py-4 font-semibold">Cliente Afetado</th>
                <th className="px-6 py-4 font-semibold">Descrição Detalhada</th>
                <th className="px-6 py-4 font-semibold text-right">Dados</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800/60">
              {logs.length === 0 ? (
                <tr>
                  <td colSpan={6} className="px-6 py-12 text-center text-slate-500">
                    Nenhum registro de auditoria encontrado.
                  </td>
                </tr>
              ) : (
                logs.map((log) => (
                  <tr key={log.id} className="hover:bg-slate-800/30 transition-colors">
                    {/* Data/Hora */}
                    <td className="px-6 py-4 font-mono text-[11px] text-slate-400 whitespace-nowrap">
                      {new Date(log.createdAt).toLocaleString('pt-BR')}
                    </td>

                    {/* Responsável */}
                    <td className="px-6 py-4">
                      <div className="font-semibold text-white">{log.userName || 'Sistema'}</div>
                      <div className="text-[11px] text-slate-400">{log.userEmail || '-'}</div>
                    </td>

                    {/* Ação */}
                    <td className="px-6 py-4">
                      <div>{getActionBadge(log.action)}</div>
                      <div className="text-[10px] text-slate-500 mt-0.5">Tipo: {log.entityType}</div>
                    </td>

                    {/* Cliente */}
                    <td className="px-6 py-4">
                      {log.client ? (
                        <div>
                          <div className="font-semibold text-white">{log.client.company || log.client.name}</div>
                          <div className="text-[10px] text-slate-400">{log.client.name}</div>
                        </div>
                      ) : (
                        <span className="text-slate-500 italic">Global / Geral</span>
                      )}
                    </td>

                    {/* Descrição */}
                    <td className="px-6 py-4 text-slate-300 max-w-md">
                      <p className="line-clamp-2 leading-relaxed">{log.description}</p>
                    </td>

                    {/* Ver Dados */}
                    <td className="px-6 py-4 text-right">
                      {(log.beforeData || log.afterData) && (
                        <button
                          onClick={() => setViewingLog(log)}
                          className="px-2.5 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-indigo-300 text-xs font-semibold border border-slate-700 inline-flex items-center gap-1.5 cursor-pointer"
                        >
                          <Eye className="w-3.5 h-3.5" />
                          <span>Ver Snapshot</span>
                        </button>
                      )}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Snapshot Modal */}
      {viewingLog && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm">
          <div className="bg-slate-900 border border-slate-800 rounded-2xl w-full max-w-3xl p-6 shadow-2xl space-y-4">
            <div className="flex items-center justify-between border-b border-slate-800 pb-3">
              <div>
                <h3 className="text-base font-bold text-white flex items-center gap-2">
                  <Code className="w-4 h-4 text-indigo-400" /> Snapshot de Alteração
                </h3>
                <p className="text-xs text-slate-400">{viewingLog.description}</p>
              </div>
              <button onClick={() => setViewingLog(null)} className="text-slate-400 hover:text-white p-1">
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {/* Antes */}
              <div>
                <span className="text-xs font-bold text-amber-400 block mb-1">Dados Antes da Ação</span>
                <pre className="bg-slate-950 border border-slate-800 rounded-xl p-3 text-[11px] font-mono text-slate-300 overflow-x-auto max-h-72">
                  {formatJson(viewingLog.beforeData)}
                </pre>
              </div>

              {/* Depois */}
              <div>
                <span className="text-xs font-bold text-emerald-400 block mb-1">Dados Depois da Ação</span>
                <pre className="bg-slate-950 border border-slate-800 rounded-xl p-3 text-[11px] font-mono text-slate-300 overflow-x-auto max-h-72">
                  {formatJson(viewingLog.afterData)}
                </pre>
              </div>
            </div>

            <div className="flex justify-end pt-3 border-t border-slate-800">
              <button
                onClick={() => setViewingLog(null)}
                className="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-semibold rounded-xl cursor-pointer"
              >
                Fechar
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
