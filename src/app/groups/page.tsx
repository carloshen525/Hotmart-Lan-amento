'use client';

import { useState, useEffect } from 'react';
import {
  UsersRound,
  RefreshCw,
  Search,
  Tag as TagIcon,
  CheckCircle2,
  AlertTriangle,
  HelpCircle,
  ShieldCheck,
  ShieldAlert,
  Copy,
  Check,
  Plus,
  Trash2,
  ExternalLink,
  MessageSquare,
  Users,
  Filter,
  X,
} from 'lucide-react';

interface GroupTag {
  id: string;
  name: string;
  color: string;
  description?: string;
  _count?: { groups: number };
}

interface WhatsappGroup {
  id: string;
  jid: string;
  name: string;
  pictureUrl?: string | null;
  participantsCount: number;
  isAdmin: boolean;
  adminRole?: string | null;
  status: string; // 'ACTIVE', 'LEFT', 'UNVERIFIED', 'NOT_ADMIN'
  isEligible: boolean;
  metadata?: string | null;
  lastSyncedAt: string;
  whatsappInstance?: {
    id: string;
    name?: string | null;
    instanceName: string;
    phone?: string | null;
    status: string;
  };
  tags: Array<{
    tag: GroupTag;
  }>;
}

export default function GroupsPage() {
  const [groups, setGroups] = useState<WhatsappGroup[]>([]);
  const [tags, setTags] = useState<GroupTag[]>([]);
  const [loading, setLoading] = useState(true);
  const [syncing, setSyncing] = useState(false);
  const [search, setSearch] = useState('');
  const [tabFilter, setTabFilter] = useState<'ELIGIBLE' | 'ALL' | 'INELIGIBLE'>('ELIGIBLE');
  const [selectedTagFilter, setSelectedTagFilter] = useState<string>('ALL');
  const [selectedGroups, setSelectedGroups] = useState<string[]>([]);
  const [copiedJid, setCopiedJid] = useState<string | null>(null);

  // Modals
  const [isTagModalOpen, setIsTagModalOpen] = useState(false);
  const [newTagName, setNewTagName] = useState('');
  const [newTagColor, setNewTagColor] = useState('#10b981');
  const [savingTag, setSavingTag] = useState(false);

  const [isManageTagsModalOpen, setIsManageTagsModalOpen] = useState(false);
  const [targetGroupForTags, setTargetGroupForTags] = useState<WhatsappGroup | null>(null);
  const [selectedTagsToApply, setSelectedTagsToApply] = useState<string[]>([]);
  const [applyingTags, setApplyingTags] = useState(false);

  // Toast / feedback
  const [toast, setToast] = useState<{ message: string; type: 'success' | 'error' | 'info' } | null>(null);

  const showToast = (message: string, type: 'success' | 'error' | 'info' = 'info') => {
    setToast({ message, type });
    setTimeout(() => setToast(null), 4000);
  };

  const fetchGroups = async () => {
    try {
      setLoading(true);
      const res = await fetch('/api/groups');
      const data = await res.json();
      if (res.ok) {
        setGroups(data.groups || []);
        setTags(data.tags || []);
      } else {
        showToast(data.error || 'Erro ao carregar grupos', 'error');
      }
    } catch (err: any) {
      showToast(err.message || 'Erro de conexão', 'error');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchGroups();
  }, []);

  const handleSync = async () => {
    try {
      setSyncing(true);
      const res = await fetch('/api/groups/sync', { method: 'POST' });
      const data = await res.json();
      if (res.ok && data.success) {
        showToast(data.message, 'success');
        await fetchGroups();
      } else {
        showToast(data.error || 'Erro ao sincronizar com a Evolution API', 'error');
      }
    } catch (err: any) {
      showToast(err.message || 'Erro de conexão na sincronização', 'error');
    } finally {
      setSyncing(false);
    }
  };

  const handleCopyJid = (jid: string) => {
    navigator.clipboard.writeText(jid);
    setCopiedJid(jid);
    setTimeout(() => setCopiedJid(null), 2000);
  };

  const handleCreateTag = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newTagName.trim()) return;

    try {
      setSavingTag(true);
      const res = await fetch('/api/groups/tags', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: newTagName.trim(), color: newTagColor }),
      });
      const data = await res.json();
      if (res.ok && data.success) {
        showToast(`Tag "${data.tag.name}" criada com sucesso!`, 'success');
        setNewTagName('');
        setIsTagModalOpen(false);
        fetchGroups();
      } else {
        showToast(data.error || 'Erro ao criar tag', 'error');
      }
    } catch (err: any) {
      showToast(err.message || 'Erro ao criar tag', 'error');
    } finally {
      setSavingTag(false);
    }
  };

  const handleDeleteTag = async (tagId: string, tagName: string) => {
    if (!confirm(`Tem certeza que deseja excluir a tag "${tagName}"?`)) return;

    try {
      const res = await fetch(`/api/groups/tags/${tagId}`, { method: 'DELETE' });
      const data = await res.json();
      if (res.ok && data.success) {
        showToast(`Tag "${tagName}" excluída com sucesso!`, 'success');
        fetchGroups();
      } else {
        showToast(data.error || 'Erro ao excluir tag', 'error');
      }
    } catch (err: any) {
      showToast(err.message || 'Erro de conexão', 'error');
    }
  };

  const handleOpenManageTags = (group?: WhatsappGroup) => {
    if (group) {
      setTargetGroupForTags(group);
      setSelectedTagsToApply(group.tags.map((t) => t.tag.id));
    } else {
      setTargetGroupForTags(null);
      setSelectedTagsToApply([]);
    }
    setIsManageTagsModalOpen(true);
  };

  const handleApplyTags = async () => {
    const targetGroupIds = targetGroupForTags ? [targetGroupForTags.id] : selectedGroups;
    if (targetGroupIds.length === 0) return;

    try {
      setApplyingTags(true);

      // Remove tags não selecionadas
      if (targetGroupForTags) {
        const currentTagIds = targetGroupForTags.tags.map((t) => t.tag.id);
        const tagsToRemove = currentTagIds.filter((id) => !selectedTagsToApply.includes(id));
        if (tagsToRemove.length > 0) {
          await fetch('/api/groups/bulk/remove-tags', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ groupIds: targetGroupIds, tagIds: tagsToRemove }),
          });
        }
      }

      // Adiciona tags selecionadas
      if (selectedTagsToApply.length > 0) {
        await fetch('/api/groups/bulk/add-tags', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ groupIds: targetGroupIds, tagIds: selectedTagsToApply }),
        });
      }

      showToast('Tags atualizadas com sucesso!', 'success');
      setIsManageTagsModalOpen(false);
      setSelectedGroups([]);
      fetchGroups();
    } catch (err: any) {
      showToast(err.message || 'Erro ao aplicar tags', 'error');
    } finally {
      setApplyingTags(false);
    }
  };

  const handleValidateLive = async (group: WhatsappGroup) => {
    try {
      showToast(`Validando status de administrador de "${group.name}"...`, 'info');
      const res = await fetch(`/api/groups/${group.id}`);
      const data = await res.json();
      if (res.ok) {
        if (data.eligible) {
          showToast(`✅ Confirmado: A instância é administradora ativa no grupo!`, 'success');
        } else {
          showToast(`⚠️ Não elegível: ${data.reason}`, 'error');
        }
        fetchGroups();
      }
    } catch (err: any) {
      showToast(err.message || 'Erro ao validar grupo', 'error');
    }
  };

  // Filtragem dos grupos
  const filteredGroups = groups.filter((g) => {
    // Filtro por tab
    if (tabFilter === 'ELIGIBLE' && !g.isEligible) return false;
    if (tabFilter === 'INELIGIBLE' && g.isEligible) return false;

    // Filtro por tag
    if (selectedTagFilter !== 'ALL') {
      const hasTag = g.tags.some((t) => t.tag.id === selectedTagFilter);
      if (!hasTag) return false;
    }

    // Filtro por busca
    if (search.trim()) {
      const q = search.toLowerCase().trim();
      const matchName = g.name.toLowerCase().includes(q);
      const matchJid = g.jid.toLowerCase().includes(q);
      const matchTag = g.tags.some((t) => t.tag.name.toLowerCase().includes(q));
      if (!matchName && !matchJid && !matchTag) return false;
    }

    return true;
  });

  // Estatísticas dos cards
  const eligibleGroupsCount = groups.filter((g) => g.isEligible).length;
  const ineligibleGroupsCount = groups.filter((g) => !g.isEligible && g.status === 'NOT_ADMIN').length;
  const unverifiedGroupsCount = groups.filter((g) => g.status === 'UNVERIFIED').length;

  const toggleSelectGroup = (id: string) => {
    setSelectedGroups((prev) => (prev.includes(id) ? prev.filter((item) => item !== id) : [...prev, id]));
  };

  const toggleSelectAll = () => {
    if (selectedGroups.length === filteredGroups.length) {
      setSelectedGroups([]);
    } else {
      setSelectedGroups(filteredGroups.map((g) => g.id));
    }
  };

  return (
    <div className="space-y-6">
      {/* Toast de notificação */}
      {toast && (
        <div
          className={`fixed bottom-6 right-6 z-50 px-4 py-3 rounded-xl shadow-lg border text-sm font-medium transition-all ${
            toast.type === 'success'
              ? 'bg-emerald-600 text-white border-emerald-500 shadow-emerald-500/20'
              : toast.type === 'error'
              ? 'bg-rose-600 text-white border-rose-500 shadow-rose-500/20'
              : 'bg-slate-900 text-white border-slate-700 shadow-slate-900/30'
          }`}
        >
          {toast.message}
        </div>
      )}

      {/* Header Principal */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-2xl font-bold text-slate-900 dark:text-white">Grupos do WhatsApp</h1>
            <span className="bg-emerald-100 dark:bg-emerald-950/60 text-emerald-800 dark:text-emerald-300 text-xs px-2.5 py-0.5 rounded-full font-semibold border border-emerald-200 dark:border-emerald-800">
              Evolution API
            </span>
          </div>
          <p className="text-slate-500 dark:text-slate-400 text-sm mt-1">
            Identificação em tempo real de administradores e segmentação por tags para automações em grupos.
          </p>
        </div>

        <div className="flex items-center gap-3">
          <button
            onClick={() => setIsTagModalOpen(true)}
            className="flex items-center gap-2 bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-800 dark:text-slate-200 px-3.5 py-2 rounded-xl text-sm font-semibold transition-all border border-slate-200 dark:border-slate-700"
          >
            <TagIcon className="w-4 h-4 text-emerald-600" />
            Nova Tag de Grupo
          </button>

          <button
            onClick={handleSync}
            disabled={syncing}
            className="flex items-center gap-2 bg-emerald-600 hover:bg-emerald-500 text-white px-4 py-2 rounded-xl text-sm font-semibold shadow-sm shadow-emerald-600/30 transition-all disabled:opacity-50"
          >
            <RefreshCw className={`w-4 h-4 ${syncing ? 'animate-spin' : ''}`} />
            {syncing ? 'Sincronizando...' : 'Sincronizar Grupos'}
          </button>
        </div>
      </div>

      {/* Cards de Métricas */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {/* Card 1: Elegíveis */}
        <div className="bg-white dark:bg-slate-900 p-4 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-sm flex items-center justify-between">
          <div>
            <span className="text-xs font-semibold text-slate-500 dark:text-slate-400 block uppercase tracking-wider">
              Elegíveis para Automação
            </span>
            <span className="text-2xl font-extrabold text-emerald-600 dark:text-emerald-400 mt-1 block">
              {eligibleGroupsCount}
            </span>
            <span className="text-[11px] text-slate-400">Instância é administradora real</span>
          </div>
          <div className="w-12 h-12 rounded-xl bg-emerald-50 dark:bg-emerald-950/40 text-emerald-600 dark:text-emerald-400 flex items-center justify-center">
            <ShieldCheck className="w-6 h-6" />
          </div>
        </div>

        {/* Card 2: Não Elegíveis */}
        <div className="bg-white dark:bg-slate-900 p-4 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-sm flex items-center justify-between">
          <div>
            <span className="text-xs font-semibold text-slate-500 dark:text-slate-400 block uppercase tracking-wider">
              Sem Privilégio de Admin
            </span>
            <span className="text-2xl font-extrabold text-amber-600 dark:text-amber-400 mt-1 block">
              {ineligibleGroupsCount}
            </span>
            <span className="text-[11px] text-slate-400">Participante comum (não elegível)</span>
          </div>
          <div className="w-12 h-12 rounded-xl bg-amber-50 dark:bg-amber-950/40 text-amber-600 dark:text-amber-400 flex items-center justify-center">
            <ShieldAlert className="w-6 h-6" />
          </div>
        </div>

        {/* Card 3: Não Verificados */}
        <div className="bg-white dark:bg-slate-900 p-4 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-sm flex items-center justify-between">
          <div>
            <span className="text-xs font-semibold text-slate-500 dark:text-slate-400 block uppercase tracking-wider">
              Permissão Não Verificada
            </span>
            <span className="text-2xl font-extrabold text-slate-600 dark:text-slate-300 mt-1 block">
              {unverifiedGroupsCount}
            </span>
            <span className="text-[11px] text-slate-400">Bloqueado para disparos</span>
          </div>
          <div className="w-12 h-12 rounded-xl bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 flex items-center justify-center">
            <HelpCircle className="w-6 h-6" />
          </div>
        </div>

        {/* Card 4: Tags de Grupos */}
        <div className="bg-white dark:bg-slate-900 p-4 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-sm flex items-center justify-between">
          <div>
            <span className="text-xs font-semibold text-slate-500 dark:text-slate-400 block uppercase tracking-wider">
              Tags de Grupos
            </span>
            <span className="text-2xl font-extrabold text-indigo-600 dark:text-indigo-400 mt-1 block">
              {tags.length}
            </span>
            <span className="text-[11px] text-slate-400">Segmentação independente</span>
          </div>
          <div className="w-12 h-12 rounded-xl bg-indigo-50 dark:bg-indigo-950/40 text-indigo-600 dark:text-indigo-400 flex items-center justify-center">
            <TagIcon className="w-6 h-6" />
          </div>
        </div>
      </div>

      {/* Regra Fundamental em Destaque */}
      <div className="bg-blue-50 dark:bg-blue-950/30 border border-blue-200 dark:border-blue-900/50 rounded-2xl p-4 flex items-start gap-3">
        <ShieldCheck className="w-5 h-5 text-blue-600 dark:text-blue-400 shrink-0 mt-0.5" />
        <div className="text-xs text-blue-950 dark:text-blue-200">
          <strong className="block font-semibold">Regra Fundamental de Elegibilidade:</strong>
          Apenas grupos onde o número da instância conectada é comprovadamente <strong>administrador</strong> ou <strong>superadministrador</strong> na Evolution API são disponibilizados para automação. Grupos onde você é apenas membro comum permanecem visíveis para consulta, mas são estritamente bloqueados para disparos automatizados.
        </div>
      </div>

      {/* Filtros e Barra de Ações */}
      <div className="bg-white dark:bg-slate-900 p-4 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-sm space-y-4">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          {/* Tabs de Filtro de Elegibilidade */}
          <div className="flex items-center gap-1.5 p-1 bg-slate-100 dark:bg-slate-800 rounded-xl">
            <button
              onClick={() => setTabFilter('ELIGIBLE')}
              className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-all ${
                tabFilter === 'ELIGIBLE'
                  ? 'bg-white dark:bg-slate-700 text-emerald-700 dark:text-emerald-300 shadow-sm'
                  : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
              }`}
            >
              👑 Elegíveis (Admin) ({eligibleGroupsCount})
            </button>
            <button
              onClick={() => setTabFilter('ALL')}
              className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-all ${
                tabFilter === 'ALL'
                  ? 'bg-white dark:bg-slate-700 text-slate-900 dark:text-white shadow-sm'
                  : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
              }`}
            >
              Todos os Grupos ({groups.length})
            </button>
            <button
              onClick={() => setTabFilter('INELIGIBLE')}
              className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-all ${
                tabFilter === 'INELIGIBLE'
                  ? 'bg-white dark:bg-slate-700 text-amber-700 dark:text-amber-300 shadow-sm'
                  : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
              }`}
            >
              ⚠️ Não Elegíveis ({ineligibleGroupsCount + unverifiedGroupsCount})
            </button>
          </div>

          {/* Busca e Filtro de Tag */}
          <div className="flex items-center gap-3">
            <div className="relative min-w-[240px]">
              <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
              <input
                type="text"
                placeholder="Buscar grupo ou JID..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="w-full pl-9 pr-4 py-2 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl text-xs text-slate-800 dark:text-slate-200 focus:outline-none focus:ring-2 focus:ring-emerald-500"
              />
            </div>

            <select
              value={selectedTagFilter}
              onChange={(e) => setSelectedTagFilter(e.target.value)}
              className="bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl px-3 py-2 text-xs text-slate-800 dark:text-slate-200 focus:outline-none focus:ring-2 focus:ring-emerald-500 font-medium"
            >
              <option value="ALL">Todas as tags</option>
              {tags.map((t) => (
                <option key={t.id} value={t.id}>
                  🏷️ {t.name}
                </option>
              ))}
            </select>
          </div>
        </div>

        {/* Barra de Ações em Massa (quando grupos selecionados) */}
        {selectedGroups.length > 0 && (
          <div className="bg-emerald-50 dark:bg-emerald-950/40 border border-emerald-200 dark:border-emerald-800 rounded-xl px-4 py-2.5 flex items-center justify-between text-xs animate-in fade-in">
            <div className="flex items-center gap-2 text-emerald-900 dark:text-emerald-200 font-semibold">
              <CheckCircle2 className="w-4 h-4 text-emerald-600" />
              {selectedGroups.length} grupo(s) selecionado(s)
            </div>

            <div className="flex items-center gap-2">
              <button
                onClick={() => handleOpenManageTags()}
                className="flex items-center gap-1.5 bg-emerald-600 hover:bg-emerald-500 text-white px-3 py-1.5 rounded-lg font-semibold transition-all shadow-sm"
              >
                <TagIcon className="w-3.5 h-3.5" />
                Gerenciar Tags em Massa
              </button>
              <button
                onClick={() => setSelectedGroups([])}
                className="text-slate-500 dark:text-slate-400 hover:text-slate-800 dark:hover:text-slate-200 px-2.5 py-1.5 rounded-lg"
              >
                Desmarcar todos
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Tabela de Grupos */}
      <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-sm overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs text-slate-600 dark:text-slate-400">
            <thead className="bg-slate-50 dark:bg-slate-800/60 text-slate-700 dark:text-slate-300 font-semibold border-b border-slate-200 dark:border-slate-800 uppercase tracking-wider text-[11px]">
              <tr>
                <th className="p-4 w-10">
                  <input
                    type="checkbox"
                    checked={filteredGroups.length > 0 && selectedGroups.length === filteredGroups.length}
                    onChange={toggleSelectAll}
                    className="rounded text-emerald-600 focus:ring-emerald-500 cursor-pointer"
                  />
                </th>
                <th className="py-4 px-3">Grupo</th>
                <th className="py-4 px-3">ID Exclusivo (JID)</th>
                <th className="py-4 px-3">Participantes</th>
                <th className="py-4 px-3">Instância Conectada</th>
                <th className="py-4 px-3">Status de Administrador</th>
                <th className="py-4 px-3">Tags Associadas</th>
                <th className="py-4 px-3 text-right">Ações</th>
              </tr>
            </thead>

            <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
              {loading ? (
                <tr>
                  <td colSpan={8} className="py-12 text-center text-slate-400">
                    <RefreshCw className="w-6 h-6 animate-spin mx-auto mb-2 text-emerald-500" />
                    Carregando grupos do WhatsApp...
                  </td>
                </tr>
              ) : filteredGroups.length === 0 ? (
                <tr>
                  <td colSpan={8} className="py-12 text-center text-slate-400">
                    Nenhum grupo encontrado com os filtros selecionados.
                  </td>
                </tr>
              ) : (
                filteredGroups.map((g) => {
                  const isSelected = selectedGroups.includes(g.id);

                  return (
                    <tr
                      key={g.id}
                      className={`hover:bg-slate-50/80 dark:hover:bg-slate-800/40 transition-all ${
                        isSelected ? 'bg-emerald-50/40 dark:bg-emerald-950/20' : ''
                      }`}
                    >
                      {/* Checkbox */}
                      <td className="p-4">
                        <input
                          type="checkbox"
                          checked={isSelected}
                          onChange={() => toggleSelectGroup(g.id)}
                          className="rounded text-emerald-600 focus:ring-emerald-500 cursor-pointer"
                        />
                      </td>

                      {/* Nome e Foto */}
                      <td className="py-4 px-3">
                        <div className="flex items-center gap-3">
                          {g.pictureUrl ? (
                            <img
                              src={g.pictureUrl}
                              alt={g.name}
                              className="w-10 h-10 rounded-xl object-cover border border-slate-200 dark:border-slate-700 shrink-0"
                            />
                          ) : (
                            <div className="w-10 h-10 rounded-xl bg-slate-100 dark:bg-slate-800 text-slate-500 dark:text-slate-400 flex items-center justify-center shrink-0 border border-slate-200 dark:border-slate-700">
                              <UsersRound className="w-5 h-5" />
                            </div>
                          )}
                          <div className="min-w-0 max-w-xs">
                            <span className="font-bold text-slate-900 dark:text-white block truncate text-sm">
                              {g.name}
                            </span>
                            <span className="text-[11px] text-slate-400 block truncate">
                              Atualizado em: {new Date(g.lastSyncedAt).toLocaleDateString('pt-BR')}
                            </span>
                          </div>
                        </div>
                      </td>

                      {/* JID com cópia rápida */}
                      <td className="py-4 px-3 font-mono text-[11px] text-slate-500 dark:text-slate-400">
                        <div className="flex items-center gap-1.5">
                          <span className="truncate max-w-[140px]">{g.jid}</span>
                          <button
                            onClick={() => handleCopyJid(g.jid)}
                            className="p-1 hover:bg-slate-200 dark:hover:bg-slate-800 rounded transition-all text-slate-400 hover:text-slate-700 dark:hover:text-slate-200"
                            title="Copiar JID"
                          >
                            {copiedJid === g.jid ? (
                              <Check className="w-3.5 h-3.5 text-emerald-600" />
                            ) : (
                              <Copy className="w-3.5 h-3.5" />
                            )}
                          </button>
                        </div>
                      </td>

                      {/* Quantidade de Participantes */}
                      <td className="py-4 px-3">
                        <span className="inline-flex items-center gap-1 px-2.5 py-1 bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 rounded-lg font-medium text-xs">
                          <Users className="w-3.5 h-3.5 text-slate-400" />
                          {g.participantsCount} membros
                        </span>
                      </td>

                      {/* Instância Responsável */}
                      <td className="py-4 px-3">
                        {g.whatsappInstance ? (
                          <div>
                            <span className="font-semibold text-slate-800 dark:text-slate-200 block text-xs">
                              {g.whatsappInstance.name || g.whatsappInstance.instanceName}
                            </span>
                            <span className="text-[11px] text-slate-400">
                              {g.whatsappInstance.phone || g.whatsappInstance.instanceName}
                            </span>
                          </div>
                        ) : (
                          <span className="text-slate-400 text-xs">Desconhecida</span>
                        )}
                      </td>

                      {/* Status de Administrador */}
                      <td className="py-4 px-3">
                        {g.isEligible ? (
                          <div className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-semibold bg-emerald-100 dark:bg-emerald-950/60 text-emerald-800 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-800">
                            <ShieldCheck className="w-3.5 h-3.5 text-emerald-600 dark:text-emerald-400" />
                            {g.adminRole === 'superadmin' ? 'Super Administrador' : 'Administrador'}
                          </div>
                        ) : g.status === 'UNVERIFIED' ? (
                          <div className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-semibold bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 border border-slate-200 dark:border-slate-700">
                            <HelpCircle className="w-3.5 h-3.5" />
                            Permissão não verificada
                          </div>
                        ) : g.status === 'LEFT' ? (
                          <div className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-semibold bg-rose-100 dark:bg-rose-950/60 text-rose-800 dark:text-rose-300 border border-rose-200 dark:border-rose-800">
                            <X className="w-3.5 h-3.5 text-rose-600" />
                            Saiu do grupo
                          </div>
                        ) : (
                          <div className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-semibold bg-amber-100 dark:bg-amber-950/60 text-amber-800 dark:text-amber-300 border border-amber-200 dark:border-amber-800">
                            <ShieldAlert className="w-3.5 h-3.5 text-amber-600 dark:text-amber-400" />
                            Não é Administrador
                          </div>
                        )}
                      </td>

                      {/* Tags Associadas */}
                      <td className="py-4 px-3">
                        <div className="flex flex-wrap items-center gap-1.5 max-w-[220px]">
                          {g.tags && g.tags.length > 0 ? (
                            g.tags.map(({ tag }) => (
                              <span
                                key={tag.id}
                                style={{ backgroundColor: `${tag.color}15`, color: tag.color, borderColor: `${tag.color}40` }}
                                className="px-2 py-0.5 rounded-md text-[11px] font-semibold border"
                              >
                                #{tag.name}
                              </span>
                            ))
                          ) : (
                            <span className="text-[11px] text-slate-400 italic">Sem tags</span>
                          )}
                          <button
                            onClick={() => handleOpenManageTags(g)}
                            className="p-1 hover:bg-slate-100 dark:hover:bg-slate-800 rounded text-slate-400 hover:text-slate-700 dark:hover:text-slate-200"
                            title="Gerenciar Tags"
                          >
                            <Plus className="w-3 h-3" />
                          </button>
                        </div>
                      </td>

                      {/* Ações */}
                      <td className="py-4 px-3 text-right">
                        <div className="flex items-center justify-end gap-2">
                          <button
                            onClick={() => handleValidateLive(g)}
                            className="px-2.5 py-1 text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-lg text-xs font-medium border border-slate-200 dark:border-slate-700 transition-all"
                            title="Verificar status real agora na Evolution API"
                          >
                            Validar
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* MODAL: Nova Tag de Grupo */}
      {isTagModalOpen && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl w-full max-w-md p-6 shadow-2xl animate-in zoom-in-95">
            <div className="flex items-center justify-between pb-4 border-b border-slate-200 dark:border-slate-800">
              <div className="flex items-center gap-2">
                <TagIcon className="w-5 h-5 text-emerald-600" />
                <h3 className="font-bold text-slate-900 dark:text-white text-base">Nova Tag de Grupo</h3>
              </div>
              <button
                onClick={() => setIsTagModalOpen(false)}
                className="text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 p-1"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleCreateTag} className="space-y-4 mt-4">
              <div>
                <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1.5">
                  Nome da Tag
                </label>
                <input
                  type="text"
                  placeholder="Ex: Clientes VIP, Promoções, Parceiros..."
                  value={newTagName}
                  onChange={(e) => setNewTagName(e.target.value)}
                  className="w-full px-3.5 py-2.5 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl text-sm text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-emerald-500"
                  required
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1.5">
                  Cor da Tag
                </label>
                <div className="flex items-center gap-2">
                  <input
                    type="color"
                    value={newTagColor}
                    onChange={(e) => setNewTagColor(e.target.value)}
                    className="w-10 h-10 rounded-lg cursor-pointer bg-transparent border-0"
                  />
                  <span className="text-xs font-mono text-slate-500 uppercase">{newTagColor}</span>
                </div>
              </div>

              {/* Tags Existentes com opção de exclusão */}
              {tags.length > 0 && (
                <div className="pt-2">
                  <span className="text-xs font-semibold text-slate-500 dark:text-slate-400 block mb-2">
                    Tags de Grupos Existentes:
                  </span>
                  <div className="flex flex-wrap gap-1.5 max-h-32 overflow-y-auto p-1">
                    {tags.map((t) => (
                      <span
                        key={t.id}
                        style={{ backgroundColor: `${t.color}15`, color: t.color, borderColor: `${t.color}40` }}
                        className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md text-xs font-semibold border"
                      >
                        #{t.name}
                        <button
                          type="button"
                          onClick={() => handleDeleteTag(t.id, t.name)}
                          className="hover:opacity-75"
                          title="Excluir tag"
                        >
                          <X className="w-3 h-3" />
                        </button>
                      </span>
                    ))}
                  </div>
                </div>
              )}

              <div className="flex items-center justify-end gap-3 pt-4 border-t border-slate-200 dark:border-slate-800">
                <button
                  type="button"
                  onClick={() => setIsTagModalOpen(false)}
                  className="px-4 py-2 text-xs font-semibold text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={savingTag || !newTagName.trim()}
                  className="bg-emerald-600 hover:bg-emerald-500 text-white px-4 py-2 rounded-xl text-xs font-semibold shadow-sm transition-all disabled:opacity-50"
                >
                  {savingTag ? 'Criando...' : 'Criar Tag'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* MODAL: Gerenciar Tags de Grupos (Individual ou em Massa) */}
      {isManageTagsModalOpen && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl w-full max-w-lg p-6 shadow-2xl animate-in zoom-in-95">
            <div className="flex items-center justify-between pb-4 border-b border-slate-200 dark:border-slate-800">
              <div>
                <h3 className="font-bold text-slate-900 dark:text-white text-base">
                  {targetGroupForTags ? `Tags de "${targetGroupForTags.name}"` : `Tags para ${selectedGroups.length} Grupo(s)`}
                </h3>
                <p className="text-xs text-slate-400 mt-0.5">
                  Selecione as tags que devem ser associadas a estes grupos para segmentação nas automações.
                </p>
              </div>
              <button
                onClick={() => setIsManageTagsModalOpen(false)}
                className="text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 p-1"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="py-4 space-y-3">
              {tags.length === 0 ? (
                <div className="text-center py-6 text-slate-400 text-xs">
                  Nenhuma tag de grupo cadastrada ainda.{' '}
                  <button
                    onClick={() => {
                      setIsManageTagsModalOpen(false);
                      setIsTagModalOpen(true);
                    }}
                    className="text-emerald-600 underline font-semibold ml-1"
                  >
                    Criar primeira tag
                  </button>
                </div>
              ) : (
                <div className="grid grid-cols-2 gap-2 max-h-60 overflow-y-auto p-1">
                  {tags.map((t) => {
                    const isChecked = selectedTagsToApply.includes(t.id);
                    return (
                      <label
                        key={t.id}
                        className={`flex items-center gap-2.5 p-3 rounded-xl border cursor-pointer transition-all ${
                          isChecked
                            ? 'bg-emerald-50 dark:bg-emerald-950/40 border-emerald-300 dark:border-emerald-700'
                            : 'bg-slate-50 dark:bg-slate-800/40 border-slate-200 dark:border-slate-700 hover:bg-slate-100'
                        }`}
                      >
                        <input
                          type="checkbox"
                          checked={isChecked}
                          onChange={() => {
                            setSelectedTagsToApply((prev) =>
                              prev.includes(t.id) ? prev.filter((id) => id !== t.id) : [...prev, t.id]
                            );
                          }}
                          className="rounded text-emerald-600 focus:ring-emerald-500"
                        />
                        <span
                          style={{ backgroundColor: `${t.color}20`, color: t.color }}
                          className="px-2 py-0.5 rounded text-xs font-semibold"
                        >
                          #{t.name}
                        </span>
                      </label>
                    );
                  })}
                </div>
              )}
            </div>

            <div className="flex items-center justify-end gap-3 pt-4 border-t border-slate-200 dark:border-slate-800">
              <button
                type="button"
                onClick={() => setIsManageTagsModalOpen(false)}
                className="px-4 py-2 text-xs font-semibold text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white"
              >
                Cancelar
              </button>
              <button
                onClick={handleApplyTags}
                disabled={applyingTags}
                className="bg-emerald-600 hover:bg-emerald-500 text-white px-4 py-2 rounded-xl text-xs font-semibold shadow-sm transition-all disabled:opacity-50"
              >
                {applyingTags ? 'Salvando...' : 'Salvar Alterações'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
