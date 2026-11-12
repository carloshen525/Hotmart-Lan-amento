'use client';

import { useState, useEffect } from 'react';
import {
  Users,
  Search,
  Filter,
  Download,
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

  useEffect(() => {
    const timer = setTimeout(() => {
      fetchContacts();
    }, 300);
    return () => clearTimeout(timer);
  }, [search, selectedTag]);

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

        <div className="flex items-center gap-3">
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
            className="text-xs border border-slate-200 rounded-lg px-3 py-2 bg-white text-slate-700 focus:outline-none focus:ring-2 focus:ring-indigo-500"
          >
            <option value="">Todas as Tags</option>
            <option value="Inscrito">Inscrito</option>
            <option value="Pix Gerado">Pix Gerado</option>
            <option value="Cliente">Cliente</option>
            <option value="Carrinho Abandonado">Carrinho Abandonado</option>
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
    </div>
  );
}
