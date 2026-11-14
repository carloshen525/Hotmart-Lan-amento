'use client';

import { useState, useEffect, useRef } from 'react';
import {
  Users,
  Search,
  Filter,
  Download,
  Upload,
  Plus,
  X,
  Mail,
  Phone,
  Tag,
  Clock,
  CheckCircle,
  AlertCircle,
  Trash2,
  UserX,
  FileSpreadsheet,
  Check,
  RefreshCw,
  Info,
  CheckSquare,
  Square,
  MinusSquare,
  Tags,
  Loader2,
  AlertTriangle,
} from 'lucide-react';

interface Contact {
  id: string;
  name: string;
  email: string;
  phone?: string;
  status: string;
  utmSource?: string;
  utmCampaign?: string;
  createdAt: string;
  tags: Array<{ tag: { id: string; name: string; color: string } }>;
}

export default function ContactsPage() {
  const [contacts, setContacts] = useState<Contact[]>([]);
  const [tagsList, setTagsList] = useState<Array<{ id: string; name: string; color: string }>>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [selectedTag, setSelectedTag] = useState('');
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [selectedContact, setSelectedContact] = useState<any | null>(null);
  const [drawerLoading, setDrawerLoading] = useState(false);

  // Seleção Múltipla em Massa
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [isBulkAddTagModalOpen, setIsBulkAddTagModalOpen] = useState(false);
  const [isBulkRemoveTagModalOpen, setIsBulkRemoveTagModalOpen] = useState(false);
  const [isBulkDeleteModalOpen, setIsBulkDeleteModalOpen] = useState(false);
  const [bulkSelectedTags, setBulkSelectedTags] = useState<string[]>([]);
  const [bulkCustomTagName, setBulkCustomTagName] = useState('');
  const [bulkLoading, setBulkLoading] = useState(false);
  const [bulkNotice, setBulkNotice] = useState<{
    type: 'success' | 'error';
    message: string;
  } | null>(null);

  // Form novo contato
  const [newName, setNewName] = useState('');
  const [newEmail, setNewEmail] = useState('');
  const [newPhone, setNewPhone] = useState('');
  const [newTags, setNewTags] = useState('Inscrito');
  const [newUtmSource, setNewUtmSource] = useState('instagram');
  const [triggerAuto, setTriggerAuto] = useState(true);

  // Importação CSV Hotmart
  const [isImportModalOpen, setIsImportModalOpen] = useState(false);
  const [importFile, setImportFile] = useState<File | null>(null);
  const [importCsvPreview, setImportCsvPreview] = useState<string[][]>([]);
  const [importTagByProduct, setImportTagByProduct] = useState(true);
  const [importTagByStatus, setImportTagByStatus] = useState(true);
  const [importTagMode, setImportTagMode] = useState<'UNIFIED' | 'SEPARATE'>('UNIFIED');
  const [importTriggerAuto, setImportTriggerAuto] = useState(false);
  const [importExtraTags, setImportExtraTags] = useState('');
  const [importLoading, setImportLoading] = useState(false);
  const [importResult, setImportResult] = useState<{
    success: boolean;
    totalRows: number;
    created: number;
    updated: number;
    errorsCount: number;
    errorSamples?: string[];
  } | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const fetchContacts = () => {
    setLoading(true);
    let url = `/api/contacts?search=${encodeURIComponent(search)}`;
    if (selectedTag) url += `&tag=${encodeURIComponent(selectedTag)}`;

    fetch(url)
      .then((res) => res.json())
      .then((data) => {
        setContacts(data.contacts || []);
        setLoading(false);
      })
      .catch(() => setLoading(false));
  };

  const fetchTags = () => {
    fetch('/api/tags')
      .then((res) => res.json())
      .then((data) => {
        if (data.tags) {
          setTagsList(data.tags);
        }
      })
      .catch(() => {});
  };

  useEffect(() => {
    fetchTags();
  }, []);

  useEffect(() => {
    const timer = setTimeout(() => {
      fetchContacts();
    }, 300);
    return () => clearTimeout(timer);
  }, [search, selectedTag]);

  // Controles de seleção múltipla
  const isAllSelected = contacts.length > 0 && contacts.every((c) => selectedIds.includes(c.id));
  const isPartiallySelected =
    contacts.some((c) => selectedIds.includes(c.id)) && !isAllSelected;

  const toggleSelectAll = () => {
    if (isAllSelected) {
      setSelectedIds([]);
    } else {
      setSelectedIds(contacts.map((c) => c.id));
    }
  };

  const toggleSelectContact = (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    setSelectedIds((prev) =>
      prev.includes(id) ? prev.filter((i) => i !== id) : [...prev, id]
    );
  };

  // Ação em massa: Adicionar Tags
  const handleBulkAddTags = async (e: React.FormEvent) => {
    e.preventDefault();
    if (bulkSelectedTags.length === 0 && !bulkCustomTagName.trim()) {
      alert('Selecione ao menos uma tag ou digite o nome de uma nova tag.');
      return;
    }

    setBulkLoading(true);
    setBulkNotice(null);

    const tagNames: string[] = [];
    if (bulkCustomTagName.trim()) {
      bulkCustomTagName
        .split(',')
        .map((t) => t.trim())
        .filter(Boolean)
        .forEach((t) => tagNames.push(t));
    }

    try {
      const res = await fetch('/api/leads/bulk/add-tags', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          leadIds: selectedIds,
          tagIds: bulkSelectedTags,
          tagNames,
        }),
      });

      const data = await res.json();
      if (res.ok && data.success) {
        setIsBulkAddTagModalOpen(false);
        setBulkSelectedTags([]);
        setBulkCustomTagName('');
        setSelectedIds([]);
        setBulkNotice({
          type: 'success',
          message: data.message || 'Tags adicionadas aos leads com sucesso!',
        });
        fetchContacts();
        fetchTags();
      } else {
        setBulkNotice({
          type: 'error',
          message: data.error || 'Erro ao adicionar tags em massa.',
        });
      }
    } catch (err: any) {
      setBulkNotice({
        type: 'error',
        message: err.message || 'Falha na comunicação com o servidor.',
      });
    } finally {
      setBulkLoading(false);
    }
  };

  // Ação em massa: Remover Tags
  const handleBulkRemoveTags = async (e: React.FormEvent) => {
    e.preventDefault();
    if (bulkSelectedTags.length === 0) {
      alert('Selecione ao menos uma tag para remover.');
      return;
    }

    setBulkLoading(true);
    setBulkNotice(null);

    try {
      const res = await fetch('/api/leads/bulk/remove-tags', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          leadIds: selectedIds,
          tagIds: bulkSelectedTags,
        }),
      });

      const data = await res.json();
      if (res.ok && data.success) {
        setIsBulkRemoveTagModalOpen(false);
        setBulkSelectedTags([]);
        setSelectedIds([]);
        setBulkNotice({
          type: 'success',
          message: data.message || 'Tags removidas dos leads selecionados!',
        });
        fetchContacts();
        fetchTags();
      } else {
        setBulkNotice({
          type: 'error',
          message: data.error || 'Erro ao remover tags em massa.',
        });
      }
    } catch (err: any) {
      setBulkNotice({
        type: 'error',
        message: err.message || 'Falha na comunicação com o servidor.',
      });
    } finally {
      setBulkLoading(false);
    }
  };

  // Ação em massa: Excluir Contatos
  const handleBulkDelete = async () => {
    setBulkLoading(true);
    setBulkNotice(null);

    try {
      const res = await fetch('/api/leads/bulk/delete', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          leadIds: selectedIds,
        }),
      });

      const data = await res.json();
      if (res.ok && data.success) {
        setIsBulkDeleteModalOpen(false);
        setSelectedIds([]);
        setBulkNotice({
          type: 'success',
          message: data.message || 'Leads excluídos com sucesso.',
        });
        fetchContacts();
        fetchTags();
      } else {
        setBulkNotice({
          type: 'error',
          message: data.error || 'Erro ao excluir contatos.',
        });
      }
    } catch (err: any) {
      setBulkNotice({
        type: 'error',
        message: err.message || 'Falha na comunicação com o servidor.',
      });
    } finally {
      setBulkLoading(false);
    }
  };

  // Ação em massa: Exportar CSV UTF-8
  const handleBulkExport = async () => {
    setBulkLoading(true);
    setBulkNotice(null);

    try {
      const res = await fetch('/api/leads/bulk/export', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          leadIds: selectedIds.length > 0 ? selectedIds : undefined,
          search: search || undefined,
          tag: selectedTag || undefined,
        }),
      });

      if (res.ok) {
        const blob = await res.blob();
        const url = window.URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `leads_export_${new Date().toISOString().split('T')[0]}.csv`;
        document.body.appendChild(a);
        a.click();
        a.remove();
        window.URL.revokeObjectURL(url);

        setBulkNotice({
          type: 'success',
          message: `${selectedIds.length > 0 ? selectedIds.length : contacts.length} lead(s) exportado(s) com sucesso em CSV UTF-8!`,
        });
      } else {
        const data = await res.json().catch(() => ({}));
        setBulkNotice({
          type: 'error',
          message: data.error || 'Erro ao exportar contatos.',
        });
      }
    } catch (err: any) {
      setBulkNotice({
        type: 'error',
        message: err.message || 'Falha na exportação.',
      });
    } finally {
      setBulkLoading(false);
    }
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      setImportFile(file);
      setImportResult(null);
      const reader = new FileReader();
      reader.onload = (event) => {
        const text = (event.target?.result as string) || '';
        const lines = text.split(/\r?\n/).filter((l) => l.trim().length > 0);
        const delimiter = lines[0]?.includes(';') ? ';' : ',';
        const sampleRows = lines.slice(0, 4).map((l) =>
          l.split(delimiter).map((col) => col.replace(/^"|"$/g, '').trim())
        );
        setImportCsvPreview(sampleRows);
      };
      reader.readAsText(file);
    }
  };

  const handleExecuteImport = async () => {
    if (!importFile) return;
    setImportLoading(true);
    setImportResult(null);

    try {
      const formData = new FormData();
      formData.append('file', importFile);
      formData.append('tagByProduct', String(importTagByProduct));
      formData.append('tagByStatus', String(importTagByStatus));
      formData.append('tagMode', importTagMode);
      formData.append('triggerAutomation', String(importTriggerAuto));
      if (importExtraTags.trim()) {
        formData.append('tags', importExtraTags.trim());
      }

      const res = await fetch('/api/contacts/import', {
        method: 'POST',
        body: formData,
      });

      const data = await res.json();
      if (res.ok && data.success) {
        setImportResult(data);
        fetchContacts();
        fetchTags();
      } else {
        setImportResult({
          success: false,
          totalRows: 0,
          created: 0,
          updated: 0,
          errorsCount: 1,
          errorSamples: [data.error || 'Erro ao processar importação'],
        });
      }
    } catch (err: any) {
      setImportResult({
        success: false,
        totalRows: 0,
        created: 0,
        updated: 0,
        errorsCount: 1,
        errorSamples: [err.message || 'Erro de conexão com o servidor'],
      });
    } finally {
      setImportLoading(false);
    }
  };

  const handleCreateContact = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      const res = await fetch('/api/contacts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: newName,
          email: newEmail,
          phone: newPhone,
          utmSource: newUtmSource,
          tags: newTags.split(',').map((t) => t.trim()).filter(Boolean),
          triggerAutomation: triggerAuto,
        }),
      });

      if (res.ok) {
        setIsModalOpen(false);
        setNewName('');
        setNewEmail('');
        setNewPhone('');
        fetchContacts();
      }
    } catch {}
  };

  const openContactDetails = async (id: string) => {
    setDrawerLoading(true);
    try {
      const res = await fetch(`/api/contacts/${id}`);
      const data = await res.json();
      setSelectedContact(data.contact);
    } catch {}
    setDrawerLoading(false);
  };

  const handleToggleOptOut = async (id: string, currentStatus: string) => {
    const nextStatus = currentStatus === 'ACTIVE' ? 'UNSUBSCRIBED' : 'ACTIVE';
    await fetch(`/api/contacts/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status: nextStatus }),
    });
    openContactDetails(id);
    fetchContacts();
  };

  const handleDeleteContact = async (id: string) => {
    if (confirm('Tem certeza que deseja excluir permanentemente este contato?')) {
      await fetch(`/api/contacts/${id}`, { method: 'DELETE' });
      setSelectedContact(null);
      fetchContacts();
    }
  };

  return (
    <div className="space-y-6 max-w-7xl mx-auto pb-24">
      {/* Topo */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-900 tracking-tight">CRM e Gestão de Leads</h1>
          <p className="text-sm text-slate-500 mt-1">
            Contatos, tags, origem do tráfego e movimentação em automações.
          </p>
        </div>

        <div className="flex items-center gap-2 sm:gap-3 flex-wrap">
          <button
            onClick={() => {
              setImportResult(null);
              setImportFile(null);
              setImportCsvPreview([]);
              setIsImportModalOpen(true);
            }}
            className="flex items-center gap-2 px-3.5 py-2 border border-indigo-200 bg-indigo-50/60 hover:bg-indigo-100 text-indigo-700 font-semibold text-xs rounded-lg transition-colors shadow-sm"
          >
            <Upload className="w-3.5 h-3.5" />
            <span>Importar CSV</span>
          </button>
          <button
            onClick={handleBulkExport}
            disabled={bulkLoading}
            className="flex items-center gap-2 px-3.5 py-2 border border-slate-200 bg-white hover:bg-slate-50 text-slate-700 font-medium text-xs rounded-lg transition-colors shadow-sm"
          >
            <Download className="w-3.5 h-3.5" />
            <span>Exportar CSV</span>
          </button>
          <button
            onClick={() => setIsModalOpen(true)}
            className="flex items-center gap-2 px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white font-medium text-xs rounded-lg shadow-sm shadow-indigo-500/20 transition-all"
          >
            <Plus className="w-4 h-4" />
            <span>Novo Contato</span>
          </button>
        </div>
      </div>

      {/* Alerta de Feedback em Massa */}
      {bulkNotice && (
        <div
          className={`p-4 rounded-xl border flex items-center justify-between text-xs animate-in fade-in duration-200 ${
            bulkNotice.type === 'success'
              ? 'bg-emerald-50 text-emerald-800 border-emerald-200'
              : 'bg-red-50 text-red-800 border-red-200'
          }`}
        >
          <div className="flex items-center gap-2">
            {bulkNotice.type === 'success' ? (
              <CheckCircle className="w-4 h-4 text-emerald-600 shrink-0" />
            ) : (
              <AlertCircle className="w-4 h-4 text-red-600 shrink-0" />
            )}
            <span className="font-semibold">{bulkNotice.message}</span>
          </div>
          <button
            onClick={() => setBulkNotice(null)}
            className="text-slate-400 hover:text-slate-600 font-bold"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      {/* Barra de Filtros e Busca */}
      <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-sm flex flex-col sm:flex-row items-center gap-4">
        <div className="relative flex-1 w-full">
          <Search className="w-4 h-4 absolute left-3 top-3 text-slate-400" />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Pesquisar por nome, e-mail ou telefone..."
            className="w-full pl-9 pr-4 py-2 text-xs border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500"
          />
        </div>

        <div className="flex items-center gap-2 w-full sm:w-auto">
          <Filter className="w-4 h-4 text-slate-400" />
          <select
            value={selectedTag}
            onChange={(e) => setSelectedTag(e.target.value)}
            className="text-xs border border-slate-200 rounded-lg px-3 py-2 bg-white text-slate-700 focus:outline-none focus:ring-2 focus:ring-indigo-500 max-w-[200px] truncate"
          >
            <option value="">Todas as Tags</option>
            {tagsList.length > 0 ? (
              tagsList.map((t) => (
                <option key={t.id} value={t.name}>
                  {t.name}
                </option>
              ))
            ) : (
              <>
                <option value="Inscrito">Inscrito</option>
                <option value="Pix Gerado">Pix Gerado</option>
                <option value="Cliente">Cliente</option>
                <option value="Carrinho Abandonado">Carrinho Abandonado</option>
              </>
            )}
          </select>
        </div>
      </div>

      {/* Tabela de Contatos */}
      <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead className="bg-slate-50 border-b border-slate-200 text-slate-600 uppercase tracking-wider font-semibold">
              <tr>
                <th className="p-4 w-10 text-center">
                  <button
                    type="button"
                    onClick={toggleSelectAll}
                    title={isAllSelected ? 'Desmarcar todos' : 'Selecionar todos'}
                    className="text-slate-500 hover:text-indigo-600 focus:outline-none"
                  >
                    {isAllSelected ? (
                      <CheckSquare className="w-4 h-4 text-indigo-600" />
                    ) : isPartiallySelected ? (
                      <MinusSquare className="w-4 h-4 text-indigo-600" />
                    ) : (
                      <Square className="w-4 h-4 text-slate-400" />
                    )}
                  </button>
                </th>
                <th className="p-4">Nome & Contato</th>
                <th className="p-4">WhatsApp</th>
                <th className="p-4">Tags</th>
                <th className="p-4">Origem UTM</th>
                <th className="p-4">Status</th>
                <th className="p-4 text-right">Ações</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {loading ? (
                <tr>
                  <td colSpan={7} className="p-8 text-center text-slate-400">
                    <Loader2 className="w-6 h-6 animate-spin mx-auto mb-2 text-indigo-600" />
                    <span>Carregando contatos...</span>
                  </td>
                </tr>
              ) : contacts.length === 0 ? (
                <tr>
                  <td colSpan={7} className="p-8 text-center text-slate-400">
                    Nenhum contato encontrado com os filtros selecionados.
                  </td>
                </tr>
              ) : (
                contacts.map((c) => {
                  const isChecked = selectedIds.includes(c.id);
                  return (
                    <tr
                      key={c.id}
                      onClick={() => openContactDetails(c.id)}
                      className={`cursor-pointer transition-colors ${
                        isChecked ? 'bg-indigo-50/50 hover:bg-indigo-50/80' : 'hover:bg-slate-50/70'
                      }`}
                    >
                      <td
                        className="p-4 text-center"
                        onClick={(e) => toggleSelectContact(c.id, e)}
                      >
                        <button
                          type="button"
                          className="focus:outline-none"
                          onClick={(e) => toggleSelectContact(c.id, e)}
                        >
                          {isChecked ? (
                            <CheckSquare className="w-4 h-4 text-indigo-600" />
                          ) : (
                            <Square className="w-4 h-4 text-slate-300 hover:text-slate-500" />
                          )}
                        </button>
                      </td>
                      <td className="p-4">
                        <div className="font-semibold text-slate-800">{c.name}</div>
                        <div className="text-slate-400 text-[11px] flex items-center gap-1 mt-0.5">
                          <Mail className="w-3 h-3" />
                          <span>{c.email}</span>
                        </div>
                      </td>
                      <td className="p-4 text-slate-600">
                        {c.phone ? (
                          <span className="flex items-center gap-1">
                            <Phone className="w-3 h-3 text-emerald-600" />
                            <span>{c.phone}</span>
                          </span>
                        ) : (
                          <span className="text-slate-300">-</span>
                        )}
                      </td>
                      <td className="p-4">
                        <div className="flex flex-wrap gap-1">
                          {c.tags.map((t) => (
                            <span
                              key={t.tag.id}
                              style={{ backgroundColor: `${t.tag.color}15`, color: t.tag.color }}
                              className="px-2 py-0.5 rounded font-medium text-[10px] border border-current"
                            >
                              {t.tag.name}
                            </span>
                          ))}
                        </div>
                      </td>
                      <td className="p-4 text-slate-500 font-mono text-[11px]">
                        {c.utmSource || 'direto'}
                      </td>
                      <td className="p-4">
                        <span
                          className={`px-2 py-0.5 rounded-full font-semibold text-[10px] ${
                            c.status === 'ACTIVE'
                              ? 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                              : 'bg-red-50 text-red-700 border border-red-200'
                          }`}
                        >
                          {c.status === 'ACTIVE' ? 'Ativo' : 'Descadastrado'}
                        </span>
                      </td>
                      <td className="p-4 text-right">
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            openContactDetails(c.id);
                          }}
                          className="text-indigo-600 hover:text-indigo-800 font-semibold text-xs"
                        >
                          Ver Perfil
                        </button>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* BARRA FLUTUANTE DE AÇÕES EM MASSA */}
      {selectedIds.length > 0 && (
        <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-40 bg-slate-900 text-white px-5 py-3.5 rounded-2xl shadow-2xl border border-slate-700/80 flex items-center gap-3 sm:gap-4 animate-in slide-in-from-bottom-6 duration-200 backdrop-blur-md">
          <div className="flex items-center gap-2 pr-3 border-r border-slate-700 text-xs font-semibold whitespace-nowrap">
            <CheckSquare className="w-4 h-4 text-indigo-400" />
            <span>{selectedIds.length} selecionado(s)</span>
          </div>

          <div className="flex items-center gap-2 flex-wrap">
            <button
              onClick={() => {
                setBulkSelectedTags([]);
                setBulkCustomTagName('');
                setIsBulkAddTagModalOpen(true);
              }}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white font-medium text-xs transition-colors shadow-sm"
            >
              <Tag className="w-3.5 h-3.5" />
              <span>Adicionar Tag</span>
            </button>

            <button
              onClick={() => {
                setBulkSelectedTags([]);
                setIsBulkRemoveTagModalOpen(true);
              }}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 font-medium text-xs border border-slate-700 transition-colors"
            >
              <Tags className="w-3.5 h-3.5" />
              <span>Remover Tag</span>
            </button>

            <button
              onClick={handleBulkExport}
              disabled={bulkLoading}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 font-medium text-xs border border-slate-700 transition-colors"
            >
              <Download className="w-3.5 h-3.5" />
              <span>Exportar</span>
            </button>

            <button
              onClick={() => setIsBulkDeleteModalOpen(true)}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-red-600/90 hover:bg-red-600 text-white font-medium text-xs transition-colors shadow-sm"
            >
              <Trash2 className="w-3.5 h-3.5" />
              <span>Excluir</span>
            </button>

            <button
              onClick={() => setSelectedIds([])}
              title="Limpar seleção"
              className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 transition-colors ml-1"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>
      )}

      {/* MODAL: ADICIONAR TAGS EM MASSA */}
      {isBulkAddTagModalOpen && (
        <div className="fixed inset-0 bg-slate-900/50 z-50 flex items-center justify-center p-4 backdrop-blur-sm animate-in fade-in duration-200">
          <div className="bg-white rounded-2xl shadow-2xl border border-slate-200 max-w-md w-full p-6 animate-in zoom-in-95 duration-150">
            <div className="flex items-center justify-between pb-3 border-b border-slate-100">
              <div className="flex items-center gap-2">
                <Tag className="w-4 h-4 text-indigo-600" />
                <h3 className="font-bold text-slate-900 text-sm">
                  Adicionar Tags ({selectedIds.length} Leads)
                </h3>
              </div>
              <button
                onClick={() => setIsBulkAddTagModalOpen(false)}
                className="text-slate-400 hover:text-slate-600"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <form onSubmit={handleBulkAddTags} className="space-y-4 mt-4 text-xs">
              <div>
                <label className="block text-slate-700 font-semibold mb-2">
                  Selecione as Tags Existentes
                </label>
                <div className="max-h-48 overflow-y-auto space-y-1.5 p-2 bg-slate-50 border border-slate-200 rounded-xl">
                  {tagsList.length === 0 ? (
                    <p className="text-slate-400 text-center py-4 text-[11px]">
                      Nenhuma tag cadastrada ainda. Digite uma nova abaixo.
                    </p>
                  ) : (
                    tagsList.map((t) => {
                      const isSelected = bulkSelectedTags.includes(t.id);
                      return (
                        <label
                          key={t.id}
                          className={`flex items-center justify-between p-2 rounded-lg cursor-pointer transition-colors ${
                            isSelected
                              ? 'bg-indigo-50 border border-indigo-200'
                              : 'hover:bg-slate-100 border border-transparent'
                          }`}
                        >
                          <div className="flex items-center gap-2">
                            <input
                              type="checkbox"
                              checked={isSelected}
                              onChange={() =>
                                setBulkSelectedTags((prev) =>
                                  prev.includes(t.id)
                                    ? prev.filter((id) => id !== t.id)
                                    : [...prev, t.id]
                                )
                              }
                              className="rounded text-indigo-600 focus:ring-indigo-500"
                            />
                            <span className="font-medium text-slate-800">{t.name}</span>
                          </div>
                          <span
                            style={{ backgroundColor: `${t.color}20`, color: t.color }}
                            className="px-2 py-0.5 rounded text-[10px] font-bold border border-current"
                          >
                            #{t.name}
                          </span>
                        </label>
                      );
                    })
                  )}
                </div>
              </div>

              <div>
                <label className="block text-slate-700 font-semibold mb-1">
                  Ou crie nova(s) tag(s) agora (separadas por vírgula)
                </label>
                <input
                  type="text"
                  value={bulkCustomTagName}
                  onChange={(e) => setBulkCustomTagName(e.target.value)}
                  placeholder="Ex: Aluno Turma Nova, Vip 2026"
                  className="w-full p-2.5 border border-slate-200 rounded-xl focus:ring-2 focus:ring-indigo-500 outline-none text-slate-800 text-xs"
                />
              </div>

              <div className="bg-slate-50 p-3 rounded-xl border border-slate-200 text-[11px] text-slate-600 flex items-center gap-2">
                <Info className="w-4 h-4 text-indigo-500 shrink-0" />
                <span>
                  O sistema aplicará as tags apenas onde ainda não existirem, evitando qualquer
                  duplicidade.
                </span>
              </div>

              <div className="pt-3 flex items-center justify-end gap-2 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setIsBulkAddTagModalOpen(false)}
                  className="px-4 py-2 border border-slate-200 text-slate-600 rounded-xl hover:bg-slate-50 font-medium"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={bulkLoading}
                  className="px-4 py-2 bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 text-white rounded-xl font-semibold shadow-sm flex items-center gap-1.5"
                >
                  {bulkLoading && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
                  <span>Aplicar aos {selectedIds.length} Leads</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* MODAL: REMOVER TAGS EM MASSA */}
      {isBulkRemoveTagModalOpen && (
        <div className="fixed inset-0 bg-slate-900/50 z-50 flex items-center justify-center p-4 backdrop-blur-sm animate-in fade-in duration-200">
          <div className="bg-white rounded-2xl shadow-2xl border border-slate-200 max-w-md w-full p-6 animate-in zoom-in-95 duration-150">
            <div className="flex items-center justify-between pb-3 border-b border-slate-100">
              <div className="flex items-center gap-2">
                <Tags className="w-4 h-4 text-amber-600" />
                <h3 className="font-bold text-slate-900 text-sm">
                  Remover Tags ({selectedIds.length} Leads)
                </h3>
              </div>
              <button
                onClick={() => setIsBulkRemoveTagModalOpen(false)}
                className="text-slate-400 hover:text-slate-600"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <form onSubmit={handleBulkRemoveTags} className="space-y-4 mt-4 text-xs">
              <div>
                <label className="block text-slate-700 font-semibold mb-2">
                  Selecione qual(is) tag(s) deseja desvincular dos leads selecionados:
                </label>
                <div className="max-h-56 overflow-y-auto space-y-1.5 p-2 bg-slate-50 border border-slate-200 rounded-xl">
                  {tagsList.length === 0 ? (
                    <p className="text-slate-400 text-center py-4 text-[11px]">
                      Nenhuma tag cadastrada.
                    </p>
                  ) : (
                    tagsList.map((t) => {
                      const isSelected = bulkSelectedTags.includes(t.id);
                      return (
                        <label
                          key={t.id}
                          className={`flex items-center justify-between p-2 rounded-lg cursor-pointer transition-colors ${
                            isSelected
                              ? 'bg-amber-50 border border-amber-300'
                              : 'hover:bg-slate-100 border border-transparent'
                          }`}
                        >
                          <div className="flex items-center gap-2">
                            <input
                              type="checkbox"
                              checked={isSelected}
                              onChange={() =>
                                setBulkSelectedTags((prev) =>
                                  prev.includes(t.id)
                                    ? prev.filter((id) => id !== t.id)
                                    : [...prev, t.id]
                                )
                              }
                              className="rounded text-amber-600 focus:ring-amber-500"
                            />
                            <span className="font-medium text-slate-800">{t.name}</span>
                          </div>
                          <span
                            style={{ backgroundColor: `${t.color}20`, color: t.color }}
                            className="px-2 py-0.5 rounded text-[10px] font-bold border border-current"
                          >
                            #{t.name}
                          </span>
                        </label>
                      );
                    })
                  )}
                </div>
              </div>

              <div className="bg-amber-50 border border-amber-200 rounded-xl p-3 text-[11px] text-amber-900">
                🛡️ <strong>Segurança:</strong> Esta operação remove apenas a associação entre o
                lead e a tag. <strong>A tag e os contatos continuam existindo no sistema.</strong>
              </div>

              <div className="pt-3 flex items-center justify-end gap-2 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setIsBulkRemoveTagModalOpen(false)}
                  className="px-4 py-2 border border-slate-200 text-slate-600 rounded-xl hover:bg-slate-50 font-medium"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={bulkLoading || bulkSelectedTags.length === 0}
                  className="px-4 py-2 bg-amber-600 hover:bg-amber-700 disabled:opacity-50 text-white rounded-xl font-semibold shadow-sm flex items-center gap-1.5"
                >
                  {bulkLoading && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
                  <span>Remover Tag(s)</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* MODAL: EXCLUSÃO EM MASSA DE LEADS */}
      {isBulkDeleteModalOpen && (
        <div className="fixed inset-0 bg-slate-900/50 z-50 flex items-center justify-center p-4 backdrop-blur-sm animate-in fade-in duration-200">
          <div className="bg-white rounded-2xl shadow-2xl border border-slate-200 max-w-md w-full p-6 animate-in zoom-in-95 duration-150">
            <div className="flex items-center gap-3 mb-4">
              <div className="w-10 h-10 rounded-xl bg-red-100 border border-red-200 flex items-center justify-center text-red-600 shrink-0">
                <AlertTriangle className="w-5 h-5" />
              </div>
              <div>
                <h3 className="font-bold text-slate-900 text-sm">Excluir Contatos em Massa</h3>
                <p className="text-xs text-slate-500">Confirmação de exclusão permanente</p>
              </div>
            </div>

            <div className="bg-red-50 border border-red-200 rounded-xl p-3.5 text-xs text-red-900 space-y-2 mb-4">
              <p>
                Você tem certeza que deseja excluir permanentemente os{' '}
                <strong className="font-bold text-red-700">{selectedIds.length} contatos selecionados</strong>?
              </p>
              <p className="text-[11px] text-red-700 leading-relaxed">
                Esta ação apagará os contatos, suas tags associadas e histórico de mensagens. Esta
                operação não poderá ser desfeita.
              </p>
            </div>

            <div className="flex items-center justify-end gap-2 pt-2 border-t border-slate-100">
              <button
                type="button"
                onClick={() => setIsBulkDeleteModalOpen(false)}
                className="px-4 py-2 border border-slate-200 text-slate-600 rounded-xl hover:bg-slate-50 font-medium text-xs"
              >
                Cancelar
              </button>
              <button
                type="button"
                onClick={handleBulkDelete}
                disabled={bulkLoading}
                className="px-4 py-2 bg-red-600 hover:bg-red-700 disabled:opacity-50 text-white rounded-xl font-semibold text-xs shadow-sm shadow-red-500/20 flex items-center gap-1.5"
              >
                {bulkLoading && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
                <span>Sim, Excluir {selectedIds.length} Contatos</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Drawer Lateral com Perfil Completo do Lead */}
      {selectedContact && (
        <div className="fixed inset-0 bg-slate-900/40 z-50 flex justify-end">
          <div className="w-full max-w-md bg-white h-full shadow-2xl p-6 overflow-y-auto flex flex-col justify-between">
            <div>
              <div className="flex items-center justify-between pb-4 border-b border-slate-200">
                <div>
                  <h3 className="font-bold text-slate-900 text-lg">{selectedContact.name}</h3>
                  <p className="text-xs text-slate-500">{selectedContact.email}</p>
                </div>
                <button
                  onClick={() => setSelectedContact(null)}
                  className="p-1 rounded-lg hover:bg-slate-100 text-slate-400 hover:text-slate-600"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>

              {/* Informações de Contato */}
              <div className="py-4 space-y-3 text-xs">
                <div>
                  <span className="text-slate-400 block text-[10px] uppercase font-semibold">Telefone WhatsApp</span>
                  <span className="text-slate-800 font-medium">{selectedContact.phone || 'Não informado'}</span>
                </div>
                <div>
                  <span className="text-slate-400 block text-[10px] uppercase font-semibold">Origem do Lead</span>
                  <span className="text-slate-800 font-medium font-mono">{selectedContact.utmSource || 'Desconhecido'}</span>
                </div>
                <div>
                  <span className="text-slate-400 block text-[10px] uppercase font-semibold">Consentimento LGPD</span>
                  <span className="text-emerald-700 font-medium flex items-center gap-1 mt-0.5">
                    <CheckCircle className="w-3.5 h-3.5" />
                    Registrado e validado
                  </span>
                </div>

                {/* Tags */}
                <div>
                  <span className="text-slate-400 block text-[10px] uppercase font-semibold mb-1">Tags Atribuídas</span>
                  <div className="flex flex-wrap gap-1.5">
                    {selectedContact.tags?.map((t: any) => (
                      <span
                        key={t.tag.id}
                        style={{ backgroundColor: `${t.tag.color}15`, color: t.tag.color }}
                        className="px-2 py-0.5 rounded font-medium text-[11px] border border-current"
                      >
                        {t.tag.name}
                      </span>
                    ))}
                  </div>
                </div>
              </div>
            </div>

            {/* Ações Rápidas no Drawer */}
            <div className="pt-4 border-t border-slate-200 space-y-2">
              <button
                onClick={() => handleToggleOptOut(selectedContact.id, selectedContact.status)}
                className="w-full flex items-center justify-center gap-2 p-2 border border-slate-200 hover:bg-slate-50 text-slate-700 rounded-lg text-xs font-semibold"
              >
                <UserX className="w-4 h-4 text-amber-600" />
                <span>{selectedContact.status === 'ACTIVE' ? 'Descadastrar (Opt-out)' : 'Reativar Cadastro'}</span>
              </button>
              <button
                onClick={() => handleDeleteContact(selectedContact.id)}
                className="w-full flex items-center justify-center gap-2 p-2 bg-red-50 hover:bg-red-100 text-red-700 rounded-lg text-xs font-semibold"
              >
                <Trash2 className="w-4 h-4" />
                <span>Excluir Contato Definitivamente</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal Novo Contato */}
      {isModalOpen && (
        <div className="fixed inset-0 bg-slate-900/40 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-xl shadow-xl border border-slate-200 max-w-md w-full p-6">
            <div className="flex items-center justify-between pb-3 border-b border-slate-100">
              <h3 className="font-bold text-slate-900 text-base">Novo Contato</h3>
              <button onClick={() => setIsModalOpen(false)} className="text-slate-400 hover:text-slate-600">
                <X className="w-4 h-4" />
              </button>
            </div>

            <form onSubmit={handleCreateContact} className="space-y-4 mt-4 text-xs">
              <div>
                <label className="block text-slate-700 font-semibold mb-1">Nome Completo *</label>
                <input
                  type="text"
                  required
                  value={newName}
                  onChange={(e) => setNewName(e.target.value)}
                  placeholder="Ex: Denis Dominique"
                  className="w-full p-2 border border-slate-200 rounded-lg focus:ring-2 focus:ring-indigo-500"
                />
              </div>

              <div>
                <label className="block text-slate-700 font-semibold mb-1">E-mail *</label>
                <input
                  type="email"
                  required
                  value={newEmail}
                  onChange={(e) => setNewEmail(e.target.value)}
                  placeholder="cliente@email.com"
                  className="w-full p-2 border border-slate-200 rounded-lg focus:ring-2 focus:ring-indigo-500"
                />
              </div>

              <div>
                <label className="block text-slate-700 font-semibold mb-1">WhatsApp / Telefone</label>
                <input
                  type="text"
                  value={newPhone}
                  onChange={(e) => setNewPhone(e.target.value)}
                  placeholder="+55 11 99999-9999"
                  className="w-full p-2 border border-slate-200 rounded-lg focus:ring-2 focus:ring-indigo-500"
                />
              </div>

              <div>
                <label className="block text-slate-700 font-semibold mb-1">Tags (separadas por vírgula)</label>
                <input
                  type="text"
                  value={newTags}
                  onChange={(e) => setNewTags(e.target.value)}
                  placeholder="Inscrito, Turma 5, CPL 1"
                  className="w-full p-2 border border-slate-200 rounded-lg focus:ring-2 focus:ring-indigo-500"
                />
              </div>

              <div>
                <label className="block text-slate-700 font-semibold mb-1">Origem UTM</label>
                <select
                  value={newUtmSource}
                  onChange={(e) => setNewUtmSource(e.target.value)}
                  className="w-full p-2 border border-slate-200 rounded-lg bg-white"
                >
                  <option value="instagram">Instagram Ads</option>
                  <option value="facebook">Facebook Ads</option>
                  <option value="google">Google Search</option>
                  <option value="youtube">YouTube</option>
                  <option value="organico">Orgânico / Direto</option>
                </select>
              </div>

              <div className="flex items-center gap-2 pt-2">
                <input
                  type="checkbox"
                  id="triggerAuto"
                  checked={triggerAuto}
                  onChange={(e) => setTriggerAuto(e.target.checked)}
                  className="rounded text-indigo-600 focus:ring-indigo-500"
                />
                <label htmlFor="triggerAuto" className="text-slate-600 text-xs cursor-pointer">
                  Disparar automação de boas-vindas imediatamente
                </label>
              </div>

              <div className="pt-4 flex items-center justify-end gap-2 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setIsModalOpen(false)}
                  className="px-4 py-2 border border-slate-200 text-slate-600 rounded-lg hover:bg-slate-50 font-medium"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  className="px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg font-semibold shadow-sm"
                >
                  Salvar Contato
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Modal Importação CSV */}
      {isImportModalOpen && (
        <div className="fixed inset-0 bg-slate-900/50 z-50 flex items-center justify-center p-4 backdrop-blur-sm animate-in fade-in duration-200">
          <div className="bg-white rounded-2xl shadow-2xl border border-slate-200 max-w-xl w-full p-6 animate-in zoom-in-95 duration-150">
            <div className="flex items-center justify-between pb-3 border-b border-slate-100">
              <div className="flex items-center gap-2">
                <FileSpreadsheet className="w-5 h-5 text-indigo-600" />
                <h3 className="font-bold text-slate-900 text-base">Importação Inteligente de Planilha</h3>
              </div>
              <button
                onClick={() => setIsImportModalOpen(false)}
                className="text-slate-400 hover:text-slate-600"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {!importResult ? (
              <div className="space-y-4 mt-4 text-xs">
                {/* Upload Zone */}
                <div
                  onClick={() => fileInputRef.current?.click()}
                  className="border-2 border-dashed border-slate-300 hover:border-indigo-400 bg-slate-50/60 hover:bg-indigo-50/30 p-6 rounded-xl text-center cursor-pointer transition-all"
                >
                  <input
                    type="file"
                    ref={fileInputRef}
                    accept=".csv"
                    onChange={handleFileChange}
                    className="hidden"
                  />
                  <Upload className="w-8 h-8 text-indigo-500 mx-auto mb-2" />
                  <p className="font-semibold text-slate-800 text-sm">
                    {importFile ? importFile.name : 'Selecione ou arraste a planilha CSV da Hotmart'}
                  </p>
                  <p className="text-slate-500 text-[11px] mt-1">
                    Aceita arquivos exportados diretamente da Hotmart (.csv com separador vírgula ou ponto-e-vírgula).
                  </p>
                </div>

                {/* Prévia do CSV */}
                {importCsvPreview.length > 0 && (
                  <div className="bg-slate-50 p-3 rounded-lg border border-slate-200 text-[11px]">
                    <span className="font-bold text-slate-700 block mb-1">Prévia das primeiras linhas:</span>
                    <div className="space-y-1 font-mono text-[10px] text-slate-600 overflow-x-auto max-h-24">
                      {importCsvPreview.map((row, i) => (
                        <div key={i} className="whitespace-nowrap">
                          {row.slice(0, 5).join(' | ')}
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* Opções de Importação */}
                <div className="bg-slate-50 p-4 rounded-xl border border-slate-200 space-y-3">
                  <span className="font-bold text-slate-800 block text-xs">Estratégia de Tags Automáticas</span>

                  <label className="flex items-start gap-2.5 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={importTagByProduct}
                      onChange={(e) => setImportTagByProduct(e.target.checked)}
                      className="mt-0.5 rounded text-indigo-600 focus:ring-indigo-500"
                    />
                    <div>
                      <span className="font-semibold text-slate-800 block">Identificar Produto de Referência</span>
                      <span className="text-slate-500 text-[11px]">
                        Adiciona a tag com o nome do produto (ex: #Imersão Busca e Apreensão de Veículos).
                      </span>
                    </div>
                  </label>

                  <label className="flex items-start gap-2.5 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={importTagByStatus}
                      onChange={(e) => setImportTagByStatus(e.target.checked)}
                      className="mt-0.5 rounded text-indigo-600 focus:ring-indigo-500"
                    />
                    <div>
                      <span className="font-semibold text-slate-800 block">Identificar Situação da Compra</span>
                      <span className="text-slate-500 text-[11px]">
                        Adiciona tag de status do pedido (ex: #Compra Aprovada, #Boleto Gerado).
                      </span>
                    </div>
                  </label>

                  {/* Escolha entre Tag Unificada ou Separada */}
                  <div className="pt-2 border-t border-slate-200">
                    <span className="block text-slate-700 font-semibold mb-1 text-[11px]">Formato da Tag</span>
                    <div className="grid grid-cols-2 gap-2">
                      <button
                        type="button"
                        onClick={() => setImportTagMode('UNIFIED')}
                        className={`p-2.5 rounded-lg border text-left transition-all ${
                          importTagMode === 'UNIFIED'
                            ? 'bg-indigo-50 border-indigo-500 text-indigo-900 font-bold'
                            : 'bg-white border-slate-200 text-slate-600'
                        }`}
                      >
                        <span className="block text-xs">Unificada</span>
                        <span className="block text-[10px] font-normal text-slate-500 mt-0.5">
                          Ex: "Cliente Imersão Busca Compra Aprovada"
                        </span>
                      </button>

                      <button
                        type="button"
                        onClick={() => setImportTagMode('SEPARATE')}
                        className={`p-2.5 rounded-lg border text-left transition-all ${
                          importTagMode === 'SEPARATE'
                            ? 'bg-indigo-50 border-indigo-500 text-indigo-900 font-bold'
                            : 'bg-white border-slate-200 text-slate-600'
                        }`}
                      >
                        <span className="block text-xs">Separada</span>
                        <span className="block text-[10px] font-normal text-slate-500 mt-0.5">
                          Ex: #Imersão Busca + #Compra Aprovada
                        </span>
                      </button>
                    </div>
                  </div>

                  <label className="flex items-start gap-2.5 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={importTriggerAuto}
                      onChange={(e) => setImportTriggerAuto(e.target.checked)}
                      className="mt-0.5 rounded text-indigo-600 focus:ring-indigo-500"
                    />
                    <div>
                      <span className="font-semibold text-slate-800 block">
                        Disparar automações ativas para novos leads
                      </span>
                      <span className="text-slate-500 text-[11px]">
                        Se marcado, executará fluxos com gatilho de cadastro para os leads novos.
                      </span>
                    </div>
                  </label>

                  <div className="pt-2 border-t border-slate-200">
                    <label className="block text-slate-700 font-semibold mb-1 text-[11px]">
                      Tags Adicionais Opcionais
                    </label>
                    <input
                      type="text"
                      value={importExtraTags}
                      onChange={(e) => setImportExtraTags(e.target.value)}
                      placeholder="Ex: Turma 01, Lançamento Nov/26"
                      className="w-full p-2 border border-slate-200 rounded-lg text-xs bg-white focus:ring-2 focus:ring-indigo-500"
                    />
                  </div>
                </div>

                {/* Formatação automática de Telefone aviso */}
                <div className="flex items-center gap-2 p-2.5 bg-blue-50/70 text-blue-700 rounded-lg text-[11px] border border-blue-100">
                  <Info className="w-4 h-4 shrink-0 text-blue-500" />
                  <span>
                    Telefones com DDD da planilha serão automaticamente convertidos para o padrão internacional do WhatsApp (ex: +5561999...).
                  </span>
                </div>

                <div className="pt-3 flex items-center justify-end gap-2 border-t border-slate-100">
                  <button
                    type="button"
                    onClick={() => setIsImportModalOpen(false)}
                    className="px-4 py-2 border border-slate-200 text-slate-600 rounded-lg hover:bg-slate-50 font-medium"
                  >
                    Cancelar
                  </button>
                  <button
                    type="button"
                    disabled={!importFile || importLoading}
                    onClick={handleExecuteImport}
                    className="flex items-center gap-2 px-5 py-2 bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 text-white rounded-lg font-semibold shadow-sm transition-all"
                  >
                    {importLoading ? (
                      <>
                        <RefreshCw className="w-4 h-4 animate-spin" />
                        <span>Processando CSV...</span>
                      </>
                    ) : (
                      <>
                        <Upload className="w-4 h-4" />
                        <span>Importar Leads Agora</span>
                      </>
                    )}
                  </button>
                </div>
              </div>
            ) : (
              /* Resultado da Importação */
              <div className="mt-4 space-y-4 text-xs">
                <div className={`p-4 rounded-xl border ${importResult.success ? 'bg-emerald-50/60 border-emerald-200' : 'bg-red-50/60 border-red-200'}`}>
                  <div className="flex items-center gap-2 font-bold text-sm mb-1 text-slate-900">
                    {importResult.success ? (
                      <>
                        <CheckCircle className="w-5 h-5 text-emerald-600" />
                        <span>Importação Concluída com Sucesso!</span>
                      </>
                    ) : (
                      <>
                        <AlertCircle className="w-5 h-5 text-red-600" />
                        <span>Falha na Importação</span>
                      </>
                    )}
                  </div>
                  <p className="text-slate-600 text-xs">
                    {importResult.success
                      ? 'Os contatos da sua planilha Hotmart foram processados e vinculados ao CRM.'
                      : 'Houve um erro ao processar a planilha. Verifique o formato do arquivo.'}
                  </p>
                </div>

                {importResult.success && (
                  <div className="grid grid-cols-3 gap-3">
                    <div className="bg-slate-50 p-3 rounded-lg border border-slate-200 text-center">
                      <span className="block text-xl font-bold text-emerald-600">{importResult.created}</span>
                      <span className="text-[11px] text-slate-500 font-medium">Novos Criados</span>
                    </div>
                    <div className="bg-slate-50 p-3 rounded-lg border border-slate-200 text-center">
                      <span className="block text-xl font-bold text-indigo-600">{importResult.updated}</span>
                      <span className="text-[11px] text-slate-500 font-medium">Atualizados</span>
                    </div>
                    <div className="bg-slate-50 p-3 rounded-lg border border-slate-200 text-center">
                      <span className="block text-xl font-bold text-slate-700">{importResult.totalRows}</span>
                      <span className="text-[11px] text-slate-500 font-medium">Linhas Totais</span>
                    </div>
                  </div>
                )}

                {importResult.errorSamples && importResult.errorSamples.length > 0 && (
                  <div className="p-3 bg-red-50 border border-red-200 rounded-lg text-[11px] text-red-700 space-y-1">
                    <span className="font-semibold block">Avisos / Linhas com problemas:</span>
                    {importResult.errorSamples.map((err, i) => (
                      <p key={i}>• {err}</p>
                    ))}
                  </div>
                )}

                <div className="pt-3 flex justify-end">
                  <button
                    onClick={() => {
                      setIsImportModalOpen(false);
                      setImportResult(null);
                      setImportFile(null);
                      setImportCsvPreview([]);
                    }}
                    className="px-5 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg font-semibold shadow-sm text-xs"
                  >
                    Concluir
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
