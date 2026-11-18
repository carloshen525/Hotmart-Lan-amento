'use client';

import { useState, useEffect } from 'react';
import {
  UserCog,
  Search,
  Plus,
  RefreshCw,
  ShieldCheck,
  ShieldAlert,
  Building,
  Mail,
  Phone,
  Key,
  X,
  Save,
  CheckCircle2,
} from 'lucide-react';

interface SaasUser {
  id: string;
  name: string;
  email: string;
  phone?: string;
  role: string;
  status: string;
  createdAt: string;
  client?: {
    id: string;
    name: string;
    company: string;
    plan: string;
    status: string;
  } | null;
  tenants: Array<{ id: string; name: string; role: string }>;
}

interface ClientOption {
  id: string;
  name: string;
  company: string;
}

export default function AdminUsersPage() {
  const [users, setUsers] = useState<SaasUser[]>([]);
  const [clients, setClients] = useState<ClientOption[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [roleFilter, setRoleFilter] = useState('ALL');

  // Modal
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [phone, setPhone] = useState('');
  const [role, setRole] = useState('ADMIN_CLIENTE');
  const [clientId, setClientId] = useState('');
  const [company, setCompany] = useState('');

  const fetchUsers = async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/admin/users');
      if (res.ok) {
        const data = await res.json();
        setUsers(data.users || []);
      }
    } catch (err) {
      console.error('Erro ao buscar usuários:', err);
    } finally {
      setLoading(false);
    }
  };

  const fetchClients = async () => {
    try {
      const res = await fetch('/api/admin/clients');
      if (res.ok) {
        const data = await res.json();
        setClients(data.clients || []);
      }
    } catch (err) {
      console.error('Erro ao buscar clientes:', err);
    }
  };

  useEffect(() => {
    fetchUsers();
    fetchClients();
  }, []);

  const handleCreateUser = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name || !email || !password) {
      alert('Preencha os campos obrigatórios (Nome, E-mail e Senha)');
      return;
    }

    setSaving(true);
    try {
      const res = await fetch('/api/admin/users', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name,
          email,
          password,
          phone: phone || undefined,
          role,
          clientId: clientId || undefined,
          company: company || undefined,
        }),
      });

      if (res.ok) {
        setIsModalOpen(false);
        setName('');
        setEmail('');
        setPassword('');
        setPhone('');
        setRole('ADMIN_CLIENTE');
        setClientId('');
        setCompany('');
        await fetchUsers();
      } else {
        const err = await res.json();
        alert(err.error || 'Erro ao criar usuário');
      }
    } catch (err) {
      alert('Falha na comunicação com o servidor');
    } finally {
      setSaving(false);
    }
  };

  const filtered = users.filter((u) => {
    const term = search.toLowerCase();
    const matchesSearch =
      u.name.toLowerCase().includes(term) ||
      u.email.toLowerCase().includes(term) ||
      (u.phone && u.phone.includes(term)) ||
      (u.client?.company && u.client.company.toLowerCase().includes(term));

    const matchesRole =
      roleFilter === 'ALL' ||
      (roleFilter === 'SUPER_ADMIN' && (u.role === 'SUPER_ADMIN' || u.role === 'ADMIN')) ||
      (roleFilter === 'ADMIN_CLIENTE' && u.role === 'ADMIN_CLIENTE') ||
      (roleFilter === 'USUARIO' && u.role === 'USUARIO');

    return matchesSearch && matchesRole;
  });

  return (
    <div className="p-8 max-w-7xl mx-auto space-y-6">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <span className="p-2 rounded-xl bg-indigo-500/10 text-indigo-400 border border-indigo-500/20">
              <UserCog className="w-6 h-6" />
            </span>
            <h1 className="text-2xl font-bold text-white tracking-tight">Usuários do SaaS</h1>
          </div>
          <p className="text-xs text-slate-400 mt-1">
            Gestão de credenciais, perfis de acesso (Super Admin, Administrador de Cliente, Usuário Operacional).
          </p>
        </div>

        <div className="flex items-center gap-3">
          <button
            onClick={fetchUsers}
            disabled={loading}
            className="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-semibold rounded-xl border border-slate-700 flex items-center gap-2 transition-all cursor-pointer"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
            <span>Atualizar</span>
          </button>

          <button
            onClick={() => setIsModalOpen(true)}
            className="px-4 py-2 bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-semibold rounded-xl shadow-lg shadow-indigo-600/30 flex items-center gap-2 transition-all cursor-pointer"
          >
            <Plus className="w-4 h-4" />
            <span>Novo Usuário</span>
          </button>
        </div>
      </div>

      {/* Filters */}
      <div className="bg-slate-900 border border-slate-800 rounded-2xl p-4 flex flex-col md:flex-row items-center justify-between gap-4">
        <div className="relative w-full md:w-80">
          <Search className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
          <input
            type="text"
            placeholder="Buscar por nome, email ou empresa..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full bg-slate-950 border border-slate-800 rounded-xl pl-10 pr-4 py-2 text-xs text-slate-200 placeholder:text-slate-500 focus:outline-none focus:border-indigo-500"
          />
        </div>

        <div className="flex rounded-xl bg-slate-950 p-1 border border-slate-800 text-xs">
          <button
            onClick={() => setRoleFilter('ALL')}
            className={`px-3 py-1 rounded-lg font-medium transition-all ${
              roleFilter === 'ALL' ? 'bg-indigo-600 text-white' : 'text-slate-400 hover:text-white'
            }`}
          >
            Todos ({users.length})
          </button>
          <button
            onClick={() => setRoleFilter('SUPER_ADMIN')}
            className={`px-3 py-1 rounded-lg font-medium transition-all ${
              roleFilter === 'SUPER_ADMIN' ? 'bg-amber-600 text-white' : 'text-slate-400 hover:text-white'
            }`}
          >
            Super Admins ({users.filter((u) => u.role === 'SUPER_ADMIN' || u.role === 'ADMIN').length})
          </button>
          <button
            onClick={() => setRoleFilter('ADMIN_CLIENTE')}
            className={`px-3 py-1 rounded-lg font-medium transition-all ${
              roleFilter === 'ADMIN_CLIENTE' ? 'bg-indigo-600 text-white' : 'text-slate-400 hover:text-white'
            }`}
          >
            Admins de Cliente ({users.filter((u) => u.role === 'ADMIN_CLIENTE').length})
          </button>
          <button
            onClick={() => setRoleFilter('USUARIO')}
            className={`px-3 py-1 rounded-lg font-medium transition-all ${
              roleFilter === 'USUARIO' ? 'bg-slate-700 text-white' : 'text-slate-400 hover:text-white'
            }`}
          >
            Usuários ({users.filter((u) => u.role === 'USUARIO').length})
          </button>
        </div>
      </div>

      {/* Users Table */}
      <div className="bg-slate-900 border border-slate-800 rounded-2xl overflow-hidden shadow-sm">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs text-slate-300">
            <thead className="bg-slate-950/80 text-[11px] text-slate-400 uppercase tracking-wider border-b border-slate-800">
              <tr>
                <th className="px-6 py-4 font-semibold">Usuário & Contato</th>
                <th className="px-6 py-4 font-semibold">Perfil de Acesso (Role)</th>
                <th className="px-6 py-4 font-semibold">Cliente / Empresa</th>
                <th className="px-6 py-4 font-semibold">Workspaces / Experts</th>
                <th className="px-6 py-4 font-semibold">Status</th>
                <th className="px-6 py-4 font-semibold">Criado em</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800/60">
              {filtered.length === 0 ? (
                <tr>
                  <td colSpan={6} className="px-6 py-12 text-center text-slate-500">
                    Nenhum usuário cadastrado com os filtros informados.
                  </td>
                </tr>
              ) : (
                filtered.map((user) => (
                  <tr key={user.id} className="hover:bg-slate-800/30 transition-colors">
                    {/* Usuário */}
                    <td className="px-6 py-4">
                      <div className="font-semibold text-white">{user.name}</div>
                      <div className="text-[11px] text-slate-400">{user.email}</div>
                      {user.phone && <div className="text-[10px] text-slate-500">{user.phone}</div>}
                    </td>

                    {/* Perfil */}
                    <td className="px-6 py-4">
                      {user.role === 'SUPER_ADMIN' || user.role === 'ADMIN' ? (
                        <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[10px] font-bold bg-amber-500/15 text-amber-400 border border-amber-500/30">
                          <ShieldCheck className="w-3.5 h-3.5" />
                          SUPER ADMIN
                        </span>
                      ) : user.role === 'ADMIN_CLIENTE' ? (
                        <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[10px] font-semibold bg-indigo-500/15 text-indigo-300 border border-indigo-500/30">
                          ADMIN CLIENTE
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[10px] font-semibold bg-slate-800 text-slate-300 border border-slate-700">
                          USUÁRIO
                        </span>
                      )}
                    </td>

                    {/* Cliente */}
                    <td className="px-6 py-4">
                      {user.client ? (
                        <div>
                          <div className="font-semibold text-white">{user.client.company || user.client.name}</div>
                          <div className="text-[10px] text-indigo-400">Plano: {user.client.plan}</div>
                        </div>
                      ) : (
                        <span className="text-slate-500 italic">Global / Sem cliente</span>
                      )}
                    </td>

                    {/* Tenants */}
                    <td className="px-6 py-4">
                      {user.tenants.length > 0 ? (
                        <div className="flex flex-wrap gap-1">
                          {user.tenants.map((t) => (
                            <span key={t.id} className="px-2 py-0.5 rounded bg-slate-800 border border-slate-700 text-slate-300 text-[10px]">
                              {t.name}
                            </span>
                          ))}
                        </div>
                      ) : (
                        <span className="text-slate-500 text-[11px]">-</span>
                      )}
                    </td>

                    {/* Status */}
                    <td className="px-6 py-4">
                      {user.status === 'BLOCKED' ? (
                        <span className="px-2 py-0.5 rounded-full text-[10px] font-semibold bg-rose-500/10 text-rose-400 border border-rose-500/20">
                          Bloqueado
                        </span>
                      ) : (
                        <span className="px-2 py-0.5 rounded-full text-[10px] font-semibold bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
                          Ativo
                        </span>
                      )}
                    </td>

                    {/* Criado em */}
                    <td className="px-6 py-4 text-slate-400 text-[11px]">
                      {new Date(user.createdAt).toLocaleDateString('pt-BR')}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Modal Novo Usuário */}
      {isModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm">
          <div className="bg-slate-900 border border-slate-800 rounded-2xl w-full max-w-lg p-6 shadow-2xl space-y-5">
            <div className="flex items-center justify-between border-b border-slate-800 pb-4">
              <div>
                <h3 className="text-base font-bold text-white">Criar Novo Usuário</h3>
                <p className="text-xs text-slate-400">Cadastre um usuário com permissões de acesso ao sistema</p>
              </div>
              <button onClick={() => setIsModalOpen(false)} className="text-slate-400 hover:text-white p-1 rounded-lg">
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleCreateUser} className="space-y-4">
              <div>
                <label className="block text-xs font-medium text-slate-300 mb-1">Nome Completo *</label>
                <input
                  type="text"
                  required
                  placeholder="Ex: João da Silva"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3.5 py-2 text-xs text-white focus:outline-none focus:border-indigo-500"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-medium text-slate-300 mb-1">E-mail de Login *</label>
                  <input
                    type="email"
                    required
                    placeholder="joao@empresa.com"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3.5 py-2 text-xs text-white focus:outline-none focus:border-indigo-500"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-300 mb-1">Senha Provisória *</label>
                  <input
                    type="password"
                    required
                    placeholder="••••••••"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3.5 py-2 text-xs text-white focus:outline-none focus:border-indigo-500"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-medium text-slate-300 mb-1">Telefone / WhatsApp</label>
                  <input
                    type="text"
                    placeholder="5511999999999"
                    value={phone}
                    onChange={(e) => setPhone(e.target.value)}
                    className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3.5 py-2 text-xs text-white focus:outline-none focus:border-indigo-500"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-300 mb-1">Nível de Permissão (Role) *</label>
                  <select
                    value={role}
                    onChange={(e) => setRole(e.target.value)}
                    className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3.5 py-2 text-xs text-white focus:outline-none focus:border-indigo-500"
                  >
                    <option value="ADMIN_CLIENTE">Admin de Cliente (Acesso total da conta)</option>
                    <option value="USUARIO">Usuário Operacional (Acesso aos experts autorizados)</option>
                    <option value="SUPER_ADMIN">👑 Super Admin (Acesso completo ao SaaS)</option>
                  </select>
                </div>
              </div>

              {role !== 'SUPER_ADMIN' && (
                <div className="space-y-3 pt-2 border-t border-slate-800">
                  <div>
                    <label className="block text-xs font-medium text-slate-300 mb-1">
                      Vincular a um Cliente Existente
                    </label>
                    <select
                      value={clientId}
                      onChange={(e) => {
                        setClientId(e.target.value);
                        if (e.target.value) setCompany('');
                      }}
                      className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3.5 py-2 text-xs text-white focus:outline-none focus:border-indigo-500"
                    >
                      <option value="">Selecione ou deixe em branco para criar nova conta...</option>
                      {clients.map((c) => (
                        <option key={c.id} value={c.id}>
                          {c.company || c.name}
                        </option>
                      ))}
                    </select>
                  </div>

                  {!clientId && role === 'ADMIN_CLIENTE' && (
                    <div>
                      <label className="block text-xs font-medium text-slate-300 mb-1">
                        Ou Nome da Empresa (para criar novo cliente automaticamente)
                      </label>
                      <input
                        type="text"
                        placeholder="Ex: Agência Crescimento Digital"
                        value={company}
                        onChange={(e) => setCompany(e.target.value)}
                        className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3.5 py-2 text-xs text-white focus:outline-none focus:border-indigo-500"
                      />
                    </div>
                  )}
                </div>
              )}

              <div className="flex items-center justify-end gap-3 pt-4 border-t border-slate-800">
                <button
                  type="button"
                  onClick={() => setIsModalOpen(false)}
                  className="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-semibold rounded-xl"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={saving}
                  className="px-5 py-2 bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-semibold rounded-xl flex items-center gap-1.5 shadow-lg shadow-indigo-600/30 disabled:opacity-50"
                >
                  <Save className="w-3.5 h-3.5" />
                  <span>{saving ? 'Criando...' : 'Criar Usuário'}</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
