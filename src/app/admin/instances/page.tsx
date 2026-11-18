'use client';

import { useState, useEffect } from 'react';
import {
  Smartphone,
  Search,
  RefreshCw,
  Power,
  PowerOff,
  ShieldAlert,
  ShieldCheck,
  Trash2,
  AlertTriangle,
  Building,
  User,
  MessageSquare,
  Layers,
  Clock,
  CheckCircle2,
} from 'lucide-react';

interface Instance {
  id: string;
  name: string;
  instanceName: string;
  phone?: string;
  status: string;
  isDefault: boolean;
  createdAt: string;
  updatedAt: string;
  lastConnectedAt?: string;
  tenantId: string;
  tenantName: string;
  client?: {
    id: string;
    name: string;
    company: string;
    email: string;
    status: string;
  } | null;
  ownerUser?: {
    id: string;
    name: string;
    email: string;
  } | null;
  totalQueue: number;
  totalGroups: number;
}

export default function AdminInstancesPage() {
  const [instances, setInstances] = useState<Instance[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('ALL');
  const [actionLoadingId, setActionLoadingId] = useState<string | null>(null);

  const fetchInstances = async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/admin/instances');
      if (res.ok) {
        const data = await res.json();
        setInstances(data.instances || []);
      }
    } catch (err) {
      console.error('Erro ao buscar instâncias:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchInstances();
  }, []);

  const handleAction = async (id: string, action: 'disconnect' | 'block' | 'unblock') => {
    const confirmMsg =
      action === 'disconnect'
        ? 'Deseja forçar a desconexão desta instância WhatsApp?'
        : action === 'block'
        ? 'Deseja BLOQUEAR esta instância? O cliente não poderá enviar mensagens nem reconectar até o desbloqueio.'
        : 'Deseja desbloquear esta instância?';

    if (!confirm(confirmMsg)) return;

    setActionLoadingId(id);
    try {
      const res = await fetch(`/api/admin/instances/${id}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action }),
      });

      if (res.ok) {
        await fetchInstances();
      } else {
        const err = await res.json();
        alert(err.error || 'Erro ao processar ação');
      }
    } catch (err) {
      alert('Falha na comunicação com o servidor');
    } finally {
      setActionLoadingId(null);
    }
  };

  const handleDelete = async (id: string, name: string) => {
    if (!confirm(`ATENÇÃO: Deseja excluir permanentemente a instância "${name}"? Todas as conexões ativas serão encerradas.`)) {
      return;
    }

    setActionLoadingId(id);
    try {
      const res = await fetch(`/api/admin/instances/${id}`, {
        method: 'DELETE',
      });

      if (res.ok) {
        await fetchInstances();
      } else {
        const err = await res.json();
        alert(err.error || 'Erro ao excluir instância');
      }
    } catch (err) {
      alert('Falha na comunicação com o servidor');
    } finally {
      setActionLoadingId(null);
    }
  };

  const filtered = instances.filter((inst) => {
    const term = search.toLowerCase();
    const matchesSearch =
      inst.name.toLowerCase().includes(term) ||
      inst.instanceName.toLowerCase().includes(term) ||
      (inst.phone && inst.phone.includes(term)) ||
      (inst.client?.company && inst.client.company.toLowerCase().includes(term)) ||
      (inst.client?.name && inst.client.name.toLowerCase().includes(term)) ||
      inst.tenantName.toLowerCase().includes(term);

    const matchesStatus =
      statusFilter === 'ALL' ||
      (statusFilter === 'CONNECTED' && inst.status === 'CONNECTED') ||
      (statusFilter === 'DISCONNECTED' && (inst.status === 'DISCONNECTED' || inst.status === 'CONNECTING')) ||
      (statusFilter === 'BLOCKED' && inst.status === 'BLOCKED');

    return matchesSearch && matchesStatus;
  });

  const totalConnected = instances.filter((i) => i.status === 'CONNECTED').length;
  const totalBlocked = instances.filter((i) => i.status === 'BLOCKED').length;

  return (
    <div className="p-8 max-w-7xl mx-auto space-y-6">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <span className="p-2 rounded-xl bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
              <Smartphone className="w-6 h-6" />
            </span>
            <h1 className="text-2xl font-bold text-white tracking-tight">Instâncias WhatsApp</h1>
          </div>
          <p className="text-xs text-slate-400 mt-1">
            Supervisão e governança de todas as instâncias WhatsApp conectadas por clientes no SaaS.
          </p>
        </div>

        <button
          onClick={fetchInstances}
          disabled={loading}
          className="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-semibold rounded-xl border border-slate-700 flex items-center gap-2 transition-all cursor-pointer"
        >
          <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
          <span>Atualizar Lista</span>
        </button>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div className="bg-slate-900 border border-slate-800 rounded-2xl p-5 shadow-sm">
          <div className="flex items-center justify-between mb-2">
            <span className="text-xs font-medium text-slate-400">Total de Instâncias</span>
            <Smartphone className="w-4 h-4 text-indigo-400" />
          </div>
          <div className="text-2xl font-black text-white">{instances.length}</div>
          <div className="text-[11px] text-slate-400 mt-1">Distribuídas entre todos os clientes</div>
        </div>

        <div className="bg-slate-900 border border-slate-800 rounded-2xl p-5 shadow-sm">
          <div className="flex items-center justify-between mb-2">
            <span className="text-xs font-medium text-slate-400">Conectadas & Online</span>
            <CheckCircle2 className="w-4 h-4 text-emerald-400" />
          </div>
          <div className="text-2xl font-black text-emerald-400">{totalConnected}</div>
          <div className="text-[11px] text-emerald-400/80 mt-1">Prontas para envio de mensagens</div>
        </div>

        <div className="bg-slate-900 border border-slate-800 rounded-2xl p-5 shadow-sm">
          <div className="flex items-center justify-between mb-2">
            <span className="text-xs font-medium text-slate-400">Bloqueadas Administrativamente</span>
            <ShieldAlert className="w-4 h-4 text-rose-400" />
          </div>
          <div className="text-2xl font-black text-rose-400">{totalBlocked}</div>
          <div className="text-[11px] text-rose-400/80 mt-1">Suspensa por governança ou inadimplência</div>
        </div>
      </div>

      {/* Filters */}
      <div className="bg-slate-900 border border-slate-800 rounded-2xl p-4 flex flex-col md:flex-row items-center justify-between gap-4">
        <div className="relative w-full md:w-80">
          <Search className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
          <input
            type="text"
            placeholder="Buscar por nome, telefone ou cliente..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full bg-slate-950 border border-slate-800 rounded-xl pl-10 pr-4 py-2 text-xs text-slate-200 placeholder:text-slate-500 focus:outline-none focus:border-indigo-500"
          />
        </div>

        <div className="flex rounded-xl bg-slate-950 p-1 border border-slate-800 text-xs">
          <button
            onClick={() => setStatusFilter('ALL')}
            className={`px-3 py-1 rounded-lg font-medium transition-all ${
              statusFilter === 'ALL' ? 'bg-indigo-600 text-white' : 'text-slate-400 hover:text-white'
            }`}
          >
            Todas ({instances.length})
          </button>
          <button
            onClick={() => setStatusFilter('CONNECTED')}
            className={`px-3 py-1 rounded-lg font-medium transition-all ${
              statusFilter === 'CONNECTED' ? 'bg-emerald-600 text-white' : 'text-slate-400 hover:text-white'
            }`}
          >
            Conectadas ({totalConnected})
          </button>
          <button
            onClick={() => setStatusFilter('DISCONNECTED')}
            className={`px-3 py-1 rounded-lg font-medium transition-all ${
              statusFilter === 'DISCONNECTED' ? 'bg-amber-600 text-white' : 'text-slate-400 hover:text-white'
            }`}
          >
            Desconectadas ({instances.filter((i) => i.status !== 'CONNECTED' && i.status !== 'BLOCKED').length})
          </button>
          <button
            onClick={() => setStatusFilter('BLOCKED')}
            className={`px-3 py-1 rounded-lg font-medium transition-all ${
              statusFilter === 'BLOCKED' ? 'bg-rose-600 text-white' : 'text-slate-400 hover:text-white'
            }`}
          >
            Bloqueadas ({totalBlocked})
          </button>
        </div>
      </div>

      {/* Instances Table */}
      <div className="bg-slate-900 border border-slate-800 rounded-2xl overflow-hidden shadow-sm">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs text-slate-300">
            <thead className="bg-slate-950/80 text-[11px] text-slate-400 uppercase tracking-wider border-b border-slate-800">
              <tr>
                <th className="px-6 py-4 font-semibold">Instância & Número</th>
                <th className="px-6 py-4 font-semibold">Cliente Proprietário</th>
                <th className="px-6 py-4 font-semibold">Expert Vinculado</th>
                <th className="px-6 py-4 font-semibold">Status</th>
                <th className="px-6 py-4 font-semibold">Fila / Grupos</th>
                <th className="px-6 py-4 font-semibold">Última Atividade</th>
                <th className="px-6 py-4 font-semibold text-right">Ações Super Admin</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800/60">
              {filtered.length === 0 ? (
                <tr>
                  <td colSpan={7} className="px-6 py-12 text-center text-slate-500">
                    Nenhuma instância WhatsApp encontrada.
                  </td>
                </tr>
              ) : (
                filtered.map((inst) => (
                  <tr key={inst.id} className="hover:bg-slate-800/30 transition-colors">
                    {/* Instância & Número */}
                    <td className="px-6 py-4">
                      <div className="flex items-center gap-2">
                        <div className="font-semibold text-white">{inst.name || inst.instanceName}</div>
                        {inst.isDefault && (
                          <span className="px-1.5 py-0.2 rounded bg-indigo-500/20 text-indigo-300 text-[9px] font-bold">
                            PADRÃO
                          </span>
                        )}
                      </div>
                      <div className="text-[11px] text-slate-400 font-mono mt-0.5">
                        {inst.phone || 'Sem número detectado'}
                      </div>
                    </td>

                    {/* Cliente Proprietário */}
                    <td className="px-6 py-4">
                      {inst.client ? (
                        <div>
                          <div className="font-semibold text-white flex items-center gap-1.5">
                            <Building className="w-3 h-3 text-slate-400" />
                            {inst.client.company || inst.client.name}
                          </div>
                          <div className="text-[11px] text-slate-400">{inst.client.email}</div>
                        </div>
                      ) : (
                        <div className="text-slate-500 italic">Sem cliente vinculado</div>
                      )}
                    </td>

                    {/* Expert Vinculado */}
                    <td className="px-6 py-4">
                      <span className="px-2 py-1 rounded-lg bg-slate-800 border border-slate-700 text-slate-300 font-medium">
                        {inst.tenantName}
                      </span>
                    </td>

                    {/* Status */}
                    <td className="px-6 py-4">
                      {inst.status === 'CONNECTED' && (
                        <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[10px] font-semibold bg-emerald-500/15 text-emerald-400 border border-emerald-500/30">
                          <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse"></span>
                          Conectado
                        </span>
                      )}
                      {inst.status === 'CONNECTING' && (
                        <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[10px] font-semibold bg-amber-500/15 text-amber-400 border border-amber-500/30">
                          <span className="w-1.5 h-1.5 rounded-full bg-amber-400"></span>
                          Aguardando QR Code
                        </span>
                      )}
                      {inst.status === 'DISCONNECTED' && (
                        <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[10px] font-semibold bg-slate-800 text-slate-400 border border-slate-700">
                          <span className="w-1.5 h-1.5 rounded-full bg-slate-500"></span>
                          Desconectado
                        </span>
                      )}
                      {inst.status === 'BLOCKED' && (
                        <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[10px] font-semibold bg-rose-500/15 text-rose-400 border border-rose-500/30">
                          <span className="w-1.5 h-1.5 rounded-full bg-rose-400"></span>
                          Bloqueado
                        </span>
                      )}
                    </td>

                    {/* Fila / Grupos */}
                    <td className="px-6 py-4 text-slate-400 text-[11px]">
                      <div>{inst.totalQueue} msgs na fila</div>
                      <div>{inst.totalGroups} grupos monitorados</div>
                    </td>

                    {/* Última Atividade */}
                    <td className="px-6 py-4 text-slate-400 text-[11px]">
                      {inst.lastConnectedAt ? new Date(inst.lastConnectedAt).toLocaleString('pt-BR') : new Date(inst.updatedAt).toLocaleString('pt-BR')}
                    </td>

                    {/* Ações Super Admin */}
                    <td className="px-6 py-4 text-right">
                      <div className="flex items-center justify-end gap-1.5">
                        {/* Desconectar */}
                        {inst.status === 'CONNECTED' && (
                          <button
                            title="Desconectar Forçadamente"
                            disabled={actionLoadingId === inst.id}
                            onClick={() => handleAction(inst.id, 'disconnect')}
                            className="p-1.5 rounded-lg bg-amber-500/10 hover:bg-amber-500/20 text-amber-400 border border-amber-500/30 cursor-pointer transition-colors"
                          >
                            <PowerOff className="w-4 h-4" />
                          </button>
                        )}

                        {/* Bloquear / Desbloquear */}
                        {inst.status === 'BLOCKED' ? (
                          <button
                            title="Desbloquear Instância"
                            disabled={actionLoadingId === inst.id}
                            onClick={() => handleAction(inst.id, 'unblock')}
                            className="p-1.5 rounded-lg bg-emerald-500/10 hover:bg-emerald-500/20 text-emerald-400 border border-emerald-500/30 cursor-pointer transition-colors"
                          >
                            <ShieldCheck className="w-4 h-4" />
                          </button>
                        ) : (
                          <button
                            title="Bloquear Instância"
                            disabled={actionLoadingId === inst.id}
                            onClick={() => handleAction(inst.id, 'block')}
                            className="p-1.5 rounded-lg bg-rose-500/10 hover:bg-rose-500/20 text-rose-400 border border-rose-500/30 cursor-pointer transition-colors"
                          >
                            <ShieldAlert className="w-4 h-4" />
                          </button>
                        )}

                        {/* Excluir */}
                        <button
                          title="Excluir Permanentemente"
                          disabled={actionLoadingId === inst.id}
                          onClick={() => handleDelete(inst.id, inst.name || inst.instanceName)}
                          className="p-1.5 rounded-lg bg-slate-800 hover:bg-rose-950 text-slate-400 hover:text-rose-400 border border-slate-700 cursor-pointer transition-colors"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
