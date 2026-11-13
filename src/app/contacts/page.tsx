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

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      setImportFile(file);
      setImportResult(null);
      // Ler prévia
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
    <div className="space-y-6 max-w-7xl mx-auto">
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
          <a
            href="/api/contacts?format=csv"
            className="flex items-center gap-2 px-3.5 py-2 border border-slate-200 bg-white hover:bg-slate-50 text-slate-700 font-medium text-xs rounded-lg transition-colors shadow-sm"
          >
            <Download className="w-3.5 h-3.5" />
            <span>Exportar CSV</span>
          </a>
          <button
            onClick={() => setIsModalOpen(true)}
            className="flex items-center gap-2 px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white font-medium text-xs rounded-lg shadow-sm shadow-indigo-500/20 transition-all"
          >
            <Plus className="w-4 h-4" />
            <span>Novo Contato</span>
          </button>
        </div>
      </div>

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
                  <td colSpan={6} className="p-8 text-center text-slate-400">
                    Carregando contatos...
                  </td>
                </tr>
              ) : contacts.length === 0 ? (
                <tr>
                  <td colSpan={6} className="p-8 text-center text-slate-400">
                    Nenhum contato encontrado com os filtros selecionados.
                  </td>
                </tr>
              ) : (
                contacts.map((c) => (
                  <tr
                    key={c.id}
                    onClick={() => openContactDetails(c.id)}
                    className="hover:bg-slate-50/70 cursor-pointer transition-colors"
                  >
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
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

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
                  <span className="text-slate-400 block text-[10px] uppercase font-semibold mb-1">Tags Ativas</span>
                  <div className="flex flex-wrap gap-1">
                    {selectedContact.tags?.map((t: any) => (
                      <span
                        key={t.tag.id}
                        style={{ backgroundColor: `${t.tag.color}15`, color: t.tag.color }}
                        className="px-2 py-0.5 rounded font-medium text-[10px] border border-current"
                      >
                        {t.tag.name}
                      </span>
                    ))}
                  </div>
                </div>

                {/* Linha do Tempo de Mensagens */}
                <div className="pt-4 border-t border-slate-100">
                  <span className="text-slate-400 block text-[10px] uppercase font-semibold mb-2">
                    Histórico de Disparos ({selectedContact.messageLogs?.length || 0})
                  </span>
                  <div className="space-y-2 max-h-48 overflow-y-auto">
                    {selectedContact.messageLogs?.length > 0 ? (
                      selectedContact.messageLogs.map((m: any) => (
                        <div key={m.id} className="p-2.5 rounded-lg bg-slate-50 border border-slate-100 text-[11px]">
                          <div className="flex items-center justify-between">
                            <span className="font-semibold text-slate-800">
                              {m.channel === 'WHATSAPP' ? 'WhatsApp' : 'E-mail'}: {m.subject || m.templateName || 'Mensagem'}
                            </span>
                            <span className="text-[10px] text-emerald-600 font-semibold">{m.status}</span>
                          </div>
                          <div className="text-slate-400 text-[10px] mt-1">
                            {new Date(m.sentAt).toLocaleString('pt-BR')}
                          </div>
                        </div>
                      ))
                    ) : (
                      <div className="text-slate-400 text-center py-2">Nenhuma mensagem disparada ainda.</div>
                    )}
                  </div>
                </div>
              </div>
            </div>

            {/* Ações de Gestão de Lead */}
            <div className="pt-4 border-t border-slate-200 flex items-center justify-between gap-3">
              <button
                onClick={() => handleToggleOptOut(selectedContact.id, selectedContact.status)}
                className="flex items-center gap-1.5 px-3 py-2 text-xs font-semibold rounded-lg border border-slate-200 text-slate-700 hover:bg-slate-50"
              >
                <UserX className="w-3.5 h-3.5 text-amber-600" />
                <span>{selectedContact.status === 'ACTIVE' ? 'Descadastrar (Opt-out)' : 'Reativar Lead'}</span>
              </button>

              <button
                onClick={() => handleDeleteContact(selectedContact.id)}
                className="flex items-center gap-1.5 px-3 py-2 text-xs font-semibold rounded-lg bg-red-50 text-red-600 hover:bg-red-100"
              >
                <Trash2 className="w-3.5 h-3.5" />
                <span>Excluir</span>
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
              <h3 className="font-bold text-slate-900 text-base">Cadastrar Novo Contato</h3>
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
                  placeholder="Ex: Ana Clara Rodrigues"
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
                  placeholder="ana.clara@email.com"
                  className="w-full p-2 border border-slate-200 rounded-lg focus:ring-2 focus:ring-indigo-500"
                />
              </div>

              <div>
                <label className="block text-slate-700 font-semibold mb-1">WhatsApp (com DDI)</label>
                <input
                  type="text"
                  value={newPhone}
                  onChange={(e) => setNewPhone(e.target.value)}
                  placeholder="+5511999998888"
                  className="w-full p-2 border border-slate-200 rounded-lg focus:ring-2 focus:ring-indigo-500"
                />
              </div>

              <div>
                <label className="block text-slate-700 font-semibold mb-1">Tags (separadas por vírgula)</label>
                <input
                  type="text"
                  value={newTags}
                  onChange={(e) => setNewTags(e.target.value)}
                  placeholder="Inscrito, VIP"
                  className="w-full p-2 border border-slate-200 rounded-lg focus:ring-2 focus:ring-indigo-500"
                />
              </div>

              <div>
                <label className="block text-slate-700 font-semibold mb-1">Origem (UTM Source)</label>
                <input
                  type="text"
                  value={newUtmSource}
                  onChange={(e) => setNewUtmSource(e.target.value)}
                  placeholder="instagram_ads"
                  className="w-full p-2 border border-slate-200 rounded-lg focus:ring-2 focus:ring-indigo-500"
                />
              </div>

              <div className="flex items-center gap-2 pt-2">
                <input
                  type="checkbox"
                  id="triggerAuto"
                  checked={triggerAuto}
                  onChange={(e) => setTriggerAuto(e.target.checked)}
                  className="rounded text-indigo-600 focus:ring-indigo-500"
                />
                <label htmlFor="triggerAuto" className="text-slate-600">
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
                  Salvar Lead
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Modal Importação CSV Hotmart */}
      {isImportModalOpen && (
        <div className="fixed inset-0 bg-slate-900/50 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-2xl border border-slate-200 max-w-xl w-full p-6 max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between pb-3 border-b border-slate-100">
              <div className="flex items-center gap-2">
                <div className="w-8 h-8 rounded-lg bg-indigo-50 border border-indigo-100 flex items-center justify-center text-indigo-600">
                  <FileSpreadsheet className="w-4 h-4" />
                </div>
                <div>
                  <h3 className="font-bold text-slate-900 text-base">Importar Leads via CSV</h3>
                  <p className="text-[11px] text-slate-500">Compatível com exportação de vendas da Hotmart ou planilhas padrão</p>
                </div>
              </div>
              <button
                onClick={() => setIsImportModalOpen(false)}
                className="text-slate-400 hover:text-slate-600 p-1 rounded-lg hover:bg-slate-100"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {!importResult ? (
              <div className="space-y-4 mt-4 text-xs">
                {/* Upload Box */}
                <div>
                  <input
                    ref={fileInputRef}
                    type="file"
                    accept=".csv,text/csv"
                    onChange={handleFileChange}
                    className="hidden"
                  />
                  <div
                    onClick={() => fileInputRef.current?.click()}
                    className={`border-2 border-dashed rounded-xl p-5 text-center cursor-pointer transition-all ${
                      importFile
                        ? 'border-indigo-400 bg-indigo-50/30'
                        : 'border-slate-200 hover:border-indigo-300 hover:bg-slate-50'
                    }`}
                  >
                    <Upload className="w-7 h-7 mx-auto text-indigo-500 mb-2" />
                    {importFile ? (
                      <div>
                        <p className="font-semibold text-slate-800 text-xs">{importFile.name}</p>
                        <p className="text-[11px] text-slate-500 mt-0.5">
                          {(importFile.size / 1024).toFixed(1)} KB • Clique para escolher outro arquivo
                        </p>
                      </div>
                    ) : (
                      <div>
                        <p className="font-semibold text-slate-700 text-xs">
                          Clique para selecionar ou arraste o arquivo CSV
                        </p>
                        <p className="text-[11px] text-slate-400 mt-1">
                          Exportação da Hotmart (com ponto e vírgula) ou padrão UTF-8
                        </p>
                      </div>
                    )}
                  </div>
                </div>

                {/* Prévia dos dados lidos */}
                {importCsvPreview.length > 0 && (
                  <div className="bg-slate-50 border border-slate-200 rounded-lg p-3">
                    <div className="flex items-center justify-between mb-2">
                      <span className="font-semibold text-slate-700 text-[11px] flex items-center gap-1.5">
                        <CheckCircle className="w-3.5 h-3.5 text-emerald-600" />
                        Prévia dos dados identificados:
                      </span>
                      <span className="text-[10px] text-slate-400">Primeiras {importCsvPreview.length - 1} linhas</span>
                    </div>
                    <div className="overflow-x-auto text-[10px] text-slate-600 font-mono">
                      <table className="w-full">
                        <thead>
                          <tr className="border-b border-slate-200 text-slate-800 font-semibold">
                            {importCsvPreview[0]?.slice(0, 5).map((col, idx) => (
                              <th key={idx} className="p-1 text-left truncate max-w-[120px]">
                                {col}
                              </th>
                            ))}
                          </tr>
                        </thead>
                        <tbody>
                          {importCsvPreview.slice(1).map((row, rIdx) => (
                            <tr key={rIdx} className="border-b border-slate-100">
                              {row.slice(0, 5).map((cell, cIdx) => (
                                <td key={cIdx} className="p-1 truncate max-w-[120px]">
                                  {cell || '-'}
                                </td>
                              ))}
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>
                )}

                {/* Opções de Inteligência de Importação */}
                <div className="bg-slate-50/70 p-3.5 rounded-xl border border-slate-200 space-y-3">
                  <span className="text-[11px] font-bold text-slate-800 uppercase tracking-wider block">
                    Regras de Automação e Tags
                  </span>

                  {/* Modo de Identificação por Tag (Denis Dominique) */}
                  <div className="p-2.5 bg-white rounded-lg border border-slate-200 space-y-2">
                    <span className="text-[11px] font-bold text-slate-700 block">
                      Formato de Identificação por Tags:
                    </span>
                    <div className="space-y-1.5">
                      <label className="flex items-start gap-2 cursor-pointer">
                        <input
                          type="radio"
                          name="tagMode"
                          value="UNIFIED"
                          checked={importTagMode === 'UNIFIED'}
                          onChange={() => setImportTagMode('UNIFIED')}
                          className="mt-0.5 text-indigo-600 focus:ring-indigo-500"
                        />
                        <div>
                          <span className="text-xs font-semibold text-slate-800 block">
                            Tag Unificada por Produto <span className="text-[10px] font-bold text-emerald-600 bg-emerald-50 px-1.5 py-0.2 rounded border border-emerald-200">Recomendado</span>
                          </span>
                          <span className="text-slate-500 text-[11px] block">
                            Cria &quot;Cliente: [Produto] - Compra Aprovada&quot;. Evita disparos duplicados ou cruzados entre múltiplos produtos na esteira.
                          </span>
                        </div>
                      </label>

                      <label className="flex items-start gap-2 cursor-pointer">
                        <input
                          type="radio"
                          name="tagMode"
                          value="SEPARATE"
                          checked={importTagMode === 'SEPARATE'}
                          onChange={() => setImportTagMode('SEPARATE')}
                          className="mt-0.5 text-indigo-600 focus:ring-indigo-500"
                        />
                        <div>
                          <span className="text-xs font-semibold text-slate-800 block">
                            Tags Separadas (#Produto e #Situação)
                          </span>
                          <span className="text-slate-500 text-[11px] block">
                            Cria tags soltas para o produto e o status. Use para acionar gatilhos com regra E/OU (Multi-tags) no funil.
                          </span>
                        </div>
                      </label>
                    </div>
                  </div>

                  <label className="flex items-start gap-2.5 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={importTagByProduct}
                      onChange={(e) => setImportTagByProduct(e.target.checked)}
                      className="mt-0.5 rounded text-indigo-600 focus:ring-indigo-500"
                    />
                    <div>
                      <span className="font-semibold text-slate-800 block">
                        Criar tag com o Nome do Produto Hotmart
                      </span>
                      <span className="text-slate-500 text-[11px]">
                        Identifica a coluna &quot;Nome do Produto&quot; e aplica como tag no lead.
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
                      <span className="font-semibold text-slate-800 block">
                        Criar tag pelo Status da Compra
                      </span>
                      <span className="text-slate-500 text-[11px]">
                        Aplica tags como &quot;Cliente&quot; para compras aprovadas ou &quot;Aguardando Pagamento&quot;.
                      </span>
                    </div>
                  </label>

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
