'use client';

import { useState, useEffect } from 'react';
import {
  Tags,
  Plus,
  Hash,
  Users,
  X,
  Pencil,
  Trash2,
  AlertTriangle,
  CheckCircle2,
  AlertCircle,
  Loader2,
  Filter,
} from 'lucide-react';

interface TagItem {
  id: string;
  name: string;
  color: string;
  description?: string;
  _count: { contacts: number };
}

export default function TagsPage() {
  const [tags, setTags] = useState<TagItem[]>([]);
  const [loading, setLoading] = useState(true);

  // Modal Criação
  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);
  const [name, setName] = useState('');
  const [color, setColor] = useState('#6366f1');
  const [description, setDescription] = useState('');
  const [submittingCreate, setSubmittingCreate] = useState(false);

  // Modal Edição
  const [editingTag, setEditingTag] = useState<TagItem | null>(null);
  const [editName, setEditName] = useState('');
  const [editColor, setEditColor] = useState('#6366f1');
  const [editDescription, setEditDescription] = useState('');
  const [submittingEdit, setSubmittingEdit] = useState(false);

  // Modal Exclusão
  const [deletingTag, setDeletingTag] = useState<TagItem | null>(null);
  const [submittingDelete, setSubmittingDelete] = useState(false);

  // Notificações
  const [notice, setNotice] = useState<{
    type: 'success' | 'error';
    message: string;
  } | null>(null);

  const fetchTags = () => {
    setLoading(true);
    fetch('/api/tags')
      .then((res) => res.json())
      .then((data) => {
        setTags(data.tags || []);
        setLoading(false);
      })
      .catch(() => setLoading(false));
  };

  useEffect(() => {
    fetchTags();
  }, []);

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmittingCreate(true);
    setNotice(null);
    try {
      const res = await fetch('/api/tags', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name, color, description }),
      });
      const data = await res.json();
      if (res.ok) {
        setIsCreateModalOpen(false);
        setName('');
        setDescription('');
        setColor('#6366f1');
        setNotice({
          type: 'success',
          message: `Tag "${data.tag.name}" criada com sucesso!`,
        });
        fetchTags();
      } else {
        setNotice({
          type: 'error',
          message: data.error || 'Erro ao criar tag.',
        });
      }
    } catch (err: any) {
      setNotice({
        type: 'error',
        message: err.message || 'Falha na comunicação com o servidor.',
      });
    } finally {
      setSubmittingCreate(false);
    }
  };

  const openEditModal = (t: TagItem) => {
    setEditingTag(t);
    setEditName(t.name);
    setEditColor(t.color || '#6366f1');
    setEditDescription(t.description || '');
  };

  const handleUpdate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingTag) return;
    setSubmittingEdit(true);
    setNotice(null);

    try {
      const res = await fetch(`/api/tags/${editingTag.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: editName,
          color: editColor,
          description: editDescription,
        }),
      });
      const data = await res.json();
      if (res.ok) {
        setEditingTag(null);
        setNotice({
          type: 'success',
          message: `Tag "${data.tag.name}" atualizada com sucesso!`,
        });
        fetchTags();
      } else {
        setNotice({
          type: 'error',
          message: data.error || 'Erro ao atualizar tag.',
        });
      }
    } catch (err: any) {
      setNotice({
        type: 'error',
        message: err.message || 'Falha na comunicação com o servidor.',
      });
    } finally {
      setSubmittingEdit(false);
    }
  };

  const handleDelete = async () => {
    if (!deletingTag) return;
    setSubmittingDelete(true);
    setNotice(null);

    try {
      const res = await fetch(`/api/tags/${deletingTag.id}`, {
        method: 'DELETE',
      });
      const data = await res.json();
      if (res.ok) {
        setDeletingTag(null);
        setNotice({
          type: 'success',
          message:
            data.message ||
            `Tag "${deletingTag.name}" excluída. Nenhum contato foi removido.`,
        });
        fetchTags();
      } else {
        setNotice({
          type: 'error',
          message: data.error || 'Erro ao excluir tag.',
        });
      }
    } catch (err: any) {
      setNotice({
        type: 'error',
        message: err.message || 'Falha ao excluir tag.',
      });
    } finally {
      setSubmittingDelete(false);
    }
  };

  return (
    <div className="space-y-6 max-w-7xl mx-auto">
      {/* Topo */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <div className="w-9 h-9 rounded-xl bg-indigo-50 border border-indigo-100 flex items-center justify-center text-indigo-600">
              <Tags className="w-5 h-5" />
            </div>
            <div>
              <h1 className="text-2xl font-bold text-slate-900 tracking-tight">
                Tags e Segmentações
              </h1>
              <p className="text-xs text-slate-500 mt-0.5">
                Classifique seus leads para personalizar e disparar fluxos no momento certo.
              </p>
            </div>
          </div>
        </div>

        <button
          onClick={() => setIsCreateModalOpen(true)}
          className="flex items-center gap-2 px-4 py-2.5 bg-indigo-600 hover:bg-indigo-700 text-white font-semibold text-xs rounded-xl shadow-sm shadow-indigo-500/20 transition-all self-start sm:self-auto"
        >
          <Plus className="w-4 h-4" />
          <span>Criar Nova Tag</span>
        </button>
      </div>

      {/* Alerta de Feedback */}
      {notice && (
        <div
          className={`p-4 rounded-xl border flex items-center justify-between text-xs animate-in fade-in duration-200 ${
            notice.type === 'success'
              ? 'bg-emerald-50 text-emerald-800 border-emerald-200'
              : 'bg-red-50 text-red-800 border-red-200'
          }`}
        >
          <div className="flex items-center gap-2">
            {notice.type === 'success' ? (
              <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
            ) : (
              <AlertCircle className="w-4 h-4 text-red-600 shrink-0" />
            )}
            <span className="font-medium">{notice.message}</span>
          </div>
          <button
            onClick={() => setNotice(null)}
            className="text-slate-400 hover:text-slate-600 font-semibold"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      {/* Grade de Tags */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
        {loading ? (
          <div className="col-span-full py-16 text-center text-slate-400 bg-white rounded-2xl border border-slate-200">
            <Loader2 className="w-6 h-6 animate-spin mx-auto mb-2 text-indigo-600" />
            <p className="text-xs font-medium">Carregando tags do expert...</p>
          </div>
        ) : tags.length === 0 ? (
          <div className="col-span-full py-16 text-center text-slate-400 bg-white rounded-2xl border border-slate-200">
            <Tags className="w-8 h-8 mx-auto mb-2 text-slate-300" />
            <p className="text-xs font-semibold text-slate-600">Nenhuma tag cadastrada ainda.</p>
            <p className="text-[11px] text-slate-400 mt-1">
              Crie tags para segmentar seus leads por produto, evento ou interesse.
            </p>
          </div>
        ) : (
          tags.map((t) => (
            <div
              key={t.id}
              className="group bg-white p-5 rounded-2xl border border-slate-200 shadow-sm hover:border-indigo-200 hover:shadow-md transition-all flex flex-col justify-between"
            >
              <div>
                <div className="flex items-center justify-between mb-3">
                  <span
                    style={{ backgroundColor: `${t.color}15`, color: t.color, borderColor: `${t.color}40` }}
                    className="px-2.5 py-1 rounded-lg font-bold text-xs flex items-center gap-1.5 border"
                  >
                    <Hash className="w-3.5 h-3.5" />
                    <span>{t.name}</span>
                  </span>

                  <div className="flex items-center gap-1 opacity-70 group-hover:opacity-100 transition-opacity">
                    <button
                      onClick={() => openEditModal(t)}
                      title="Editar Tag"
                      className="p-1.5 rounded-lg text-slate-400 hover:text-indigo-600 hover:bg-indigo-50 transition-colors"
                    >
                      <Pencil className="w-3.5 h-3.5" />
                    </button>
                    <button
                      onClick={() => setDeletingTag(t)}
                      title="Excluir Tag"
                      className="p-1.5 rounded-lg text-slate-400 hover:text-red-600 hover:bg-red-50 transition-colors"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>

                {t.description ? (
                  <p className="text-xs text-slate-500 line-clamp-2 leading-relaxed">{t.description}</p>
                ) : (
                  <p className="text-[11px] text-slate-300 italic">Sem descrição</p>
                )}
              </div>

              <div className="pt-4 mt-4 border-t border-slate-100 flex items-center justify-between text-xs text-slate-500">
                <span className="flex items-center gap-1.5">
                  <Users className="w-3.5 h-3.5 text-slate-400" />
                  <span className="font-semibold text-slate-700">{t._count?.contacts || 0}</span>
                  <span className="text-slate-400">leads</span>
                </span>
                <a
                  href={`/contacts?tag=${encodeURIComponent(t.name)}`}
                  className="flex items-center gap-1 text-indigo-600 hover:text-indigo-700 font-semibold text-[11px] hover:underline"
                >
                  <Filter className="w-3 h-3" />
                  <span>Ver Leads</span>
                </a>
              </div>
            </div>
          ))
        )}
      </div>

      {/* Modal Nova Tag */}
      {isCreateModalOpen && (
        <div className="fixed inset-0 bg-slate-900/40 z-50 flex items-center justify-center p-4 backdrop-blur-sm animate-in fade-in duration-200">
          <div className="bg-white rounded-2xl shadow-2xl border border-slate-200 max-w-sm w-full p-6 animate-in zoom-in-95 duration-150">
            <div className="flex items-center justify-between pb-3 border-b border-slate-100">
              <div className="flex items-center gap-2">
                <Tags className="w-4 h-4 text-indigo-600" />
                <h3 className="font-bold text-slate-900 text-sm">Criar Nova Tag</h3>
              </div>
              <button
                onClick={() => setIsCreateModalOpen(false)}
                className="text-slate-400 hover:text-slate-600"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <form onSubmit={handleCreate} className="space-y-4 mt-4 text-xs">
              <div>
                <label className="block text-slate-700 font-semibold mb-1">Nome da Tag *</label>
                <input
                  type="text"
                  required
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="Ex: Cliente Imersão Veículos"
                  className="w-full p-2.5 border border-slate-200 rounded-xl focus:ring-2 focus:ring-indigo-500 outline-none text-slate-800"
                />
              </div>

              <div>
                <label className="block text-slate-700 font-semibold mb-1">Cor de Destaque</label>
                <div className="flex items-center gap-2 p-2 border border-slate-200 rounded-xl bg-slate-50">
                  <input
                    type="color"
                    value={color}
                    onChange={(e) => setColor(e.target.value)}
                    className="w-7 h-7 rounded-lg border border-slate-300 cursor-pointer"
                  />
                  <span className="font-mono text-slate-600 font-medium text-xs">{color}</span>
                  <div
                    style={{ backgroundColor: `${color}20`, color, borderColor: `${color}40` }}
                    className="ml-auto px-2 py-0.5 rounded text-[10px] font-bold border"
                  >
                    Prévia
                  </div>
                </div>
              </div>

              <div>
                <label className="block text-slate-700 font-semibold mb-1">Descrição (Opcional)</label>
                <textarea
                  rows={2}
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  placeholder="Finalidade ou estratégia desta tag..."
                  className="w-full p-2.5 border border-slate-200 rounded-xl focus:ring-2 focus:ring-indigo-500 outline-none text-slate-800"
                />
              </div>

              <div className="pt-3 flex items-center justify-end gap-2 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setIsCreateModalOpen(false)}
                  className="px-4 py-2 border border-slate-200 text-slate-600 rounded-xl hover:bg-slate-50 font-medium"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={submittingCreate}
                  className="px-4 py-2 bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 text-white rounded-xl font-semibold shadow-sm flex items-center gap-1.5"
                >
                  {submittingCreate && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
                  <span>Criar Tag</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Modal Editar Tag */}
      {editingTag && (
        <div className="fixed inset-0 bg-slate-900/40 z-50 flex items-center justify-center p-4 backdrop-blur-sm animate-in fade-in duration-200">
          <div className="bg-white rounded-2xl shadow-2xl border border-slate-200 max-w-sm w-full p-6 animate-in zoom-in-95 duration-150">
            <div className="flex items-center justify-between pb-3 border-b border-slate-100">
              <div className="flex items-center gap-2">
                <Pencil className="w-4 h-4 text-indigo-600" />
                <h3 className="font-bold text-slate-900 text-sm">Editar Tag</h3>
              </div>
              <button
                onClick={() => setEditingTag(null)}
                className="text-slate-400 hover:text-slate-600"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <form onSubmit={handleUpdate} className="space-y-4 mt-4 text-xs">
              <div>
                <label className="block text-slate-700 font-semibold mb-1">Nome da Tag *</label>
                <input
                  type="text"
                  required
                  value={editName}
                  onChange={(e) => setEditName(e.target.value)}
                  className="w-full p-2.5 border border-slate-200 rounded-xl focus:ring-2 focus:ring-indigo-500 outline-none text-slate-800"
                />
              </div>

              <div>
                <label className="block text-slate-700 font-semibold mb-1">Cor</label>
                <div className="flex items-center gap-2 p-2 border border-slate-200 rounded-xl bg-slate-50">
                  <input
                    type="color"
                    value={editColor}
                    onChange={(e) => setEditColor(e.target.value)}
                    className="w-7 h-7 rounded-lg border border-slate-300 cursor-pointer"
                  />
                  <span className="font-mono text-slate-600 font-medium text-xs">{editColor}</span>
                  <div
                    style={{ backgroundColor: `${editColor}20`, color: editColor, borderColor: `${editColor}40` }}
                    className="ml-auto px-2 py-0.5 rounded text-[10px] font-bold border"
                  >
                    Prévia
                  </div>
                </div>
              </div>

              <div>
                <label className="block text-slate-700 font-semibold mb-1">Descrição</label>
                <textarea
                  rows={2}
                  value={editDescription}
                  onChange={(e) => setEditDescription(e.target.value)}
                  placeholder="Finalidade desta tag..."
                  className="w-full p-2.5 border border-slate-200 rounded-xl focus:ring-2 focus:ring-indigo-500 outline-none text-slate-800"
                />
              </div>

              <div className="pt-3 flex items-center justify-end gap-2 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setEditingTag(null)}
                  className="px-4 py-2 border border-slate-200 text-slate-600 rounded-xl hover:bg-slate-50 font-medium"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={submittingEdit}
                  className="px-4 py-2 bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 text-white rounded-xl font-semibold shadow-sm flex items-center gap-1.5"
                >
                  {submittingEdit && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
                  <span>Salvar Alterações</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Modal Excluir Tag */}
      {deletingTag && (
        <div className="fixed inset-0 bg-slate-900/50 z-50 flex items-center justify-center p-4 backdrop-blur-sm animate-in fade-in duration-200">
          <div className="bg-white rounded-2xl shadow-2xl border border-slate-200 max-w-md w-full p-6 animate-in zoom-in-95 duration-150">
            <div className="flex items-center gap-3 mb-4">
              <div className="w-10 h-10 rounded-xl bg-red-100 border border-red-200 flex items-center justify-center text-red-600 shrink-0">
                <AlertTriangle className="w-5 h-5" />
              </div>
              <div>
                <h3 className="font-bold text-slate-900 text-sm">Excluir Tag</h3>
                <p className="text-xs text-slate-500">Confirmação de exclusão permanente</p>
              </div>
            </div>

            <div className="bg-amber-50 border border-amber-200 rounded-xl p-3.5 text-xs text-amber-900 space-y-2 mb-4">
              <p>
                Você está prestes a excluir a tag{' '}
                <strong className="font-semibold text-slate-900">"{deletingTag.name}"</strong>.
              </p>
              <p className="text-amber-800 text-[11px]">
                🛡️ <strong>Atenção:</strong> Ao excluir esta tag, ela será desvinculada de todos os{' '}
                <strong>{deletingTag._count?.contacts || 0} leads</strong> que a possuem.
                <strong> Nenhum contato será excluído do sistema.</strong>
              </p>
            </div>

            <div className="flex items-center justify-end gap-2 pt-2 border-t border-slate-100">
              <button
                type="button"
                onClick={() => setDeletingTag(null)}
                className="px-4 py-2 border border-slate-200 text-slate-600 rounded-xl hover:bg-slate-50 font-medium text-xs"
              >
                Cancelar
              </button>
              <button
                type="button"
                onClick={handleDelete}
                disabled={submittingDelete}
                className="px-4 py-2 bg-red-600 hover:bg-red-700 disabled:opacity-50 text-white rounded-xl font-semibold text-xs shadow-sm shadow-red-500/20 flex items-center gap-1.5"
              >
                {submittingDelete && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
                <span>Sim, Excluir Tag</span>
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
