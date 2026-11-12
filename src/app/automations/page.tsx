'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import {
  Workflow,
  Plus,
  Play,
  Pause,
  Edit,
  Trash2,
  Users,
  Clock,
  Sparkles,
  Zap,
} from 'lucide-react';

interface Automation {
  id: string;
  name: string;
  description?: string;
  status: string;
  triggerType: string;
  updatedAt: string;
  _count: {
    enrollments: number;
    scheduledJobs: number;
  };
}

export default function AutomationsListPage() {
  const [automations, setAutomations] = useState<Automation[]>([]);
  const [loading, setLoading] = useState(true);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [newName, setNewName] = useState('');
  const [newDesc, setNewDesc] = useState('');
  const [newTrigger, setNewTrigger] = useState('TAG_ADDED');

  const fetchAutomations = () => {
    setLoading(true);
    fetch('/api/automations')
      .then((res) => res.json())
      .then((data) => {
        setAutomations(data.automations || []);
        setLoading(false);
      })
      .catch(() => setLoading(false));
  };

  useEffect(() => {
    fetchAutomations();
  }, []);

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      const res = await fetch('/api/automations', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: newName,
          description: newDesc,
          triggerType: newTrigger,
        }),
      });

      if (res.ok) {
        setIsModalOpen(false);
        setNewName('');
        setNewDesc('');
        fetchAutomations();
      }
    } catch {}
  };

  const toggleStatus = async (id: string, currentStatus: string) => {
    const nextStatus = currentStatus === 'ACTIVE' ? 'PAUSED' : 'ACTIVE';
    await fetch(`/api/automations/${id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status: nextStatus }),
    });
    fetchAutomations();
  };

  const handleDelete = async (id: string) => {
    if (confirm('Deseja excluir esta automação?')) {
      await fetch(`/api/automations/${id}`, { method: 'DELETE' });
      fetchAutomations();
    }
  };

  return (
    <div className="space-y-6 max-w-7xl mx-auto">
      {/* Topo */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-900 tracking-tight">Fluxos de Automação</h1>
          <p className="text-sm text-slate-500 mt-1">
            Sequências inteligentes de e-mails, WhatsApp, condições SE/SENÃO e temporizadores.
          </p>
        </div>

        <button
          onClick={() => setIsModalOpen(true)}
          className="flex items-center gap-2 px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white font-medium text-xs rounded-lg shadow-sm shadow-indigo-500/20 transition-all self-start sm:self-auto"
        >
          <Plus className="w-4 h-4" />
          <span>Criar Nova Automação</span>
        </button>
      </div>

      {/* Lista de Automações */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {loading ? (
          <div className="col-span-full py-12 text-center text-slate-400 text-xs">
            Carregando fluxos de automação...
          </div>
        ) : automations.length === 0 ? (
          <div className="col-span-full py-16 text-center bg-white rounded-xl border border-slate-200 p-8">
            <Workflow className="w-10 h-10 text-slate-300 mx-auto mb-3" />
            <h3 className="text-sm font-semibold text-slate-800">Nenhuma automação cadastrada</h3>
            <p className="text-xs text-slate-500 mt-1 mb-4">
              Crie seu primeiro funil visual com disparos de WhatsApp e E-mail.
            </p>
            <button
              onClick={() => setIsModalOpen(true)}
              className="px-4 py-2 bg-indigo-600 text-white text-xs font-semibold rounded-lg shadow-sm"
            >
              Criar Agora
            </button>
          </div>
        ) : (
          automations.map((a) => (
            <div
              key={a.id}
              className="bg-white rounded-xl border border-slate-200 p-6 shadow-sm hover:shadow-md transition-shadow flex flex-col justify-between"
            >
              <div>
                <div className="flex items-center justify-between mb-3">
                  <span
                    className={`px-2.5 py-0.5 rounded-full text-[10px] font-semibold uppercase tracking-wider ${
                      a.status === 'ACTIVE'
                        ? 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                        : a.status === 'PAUSED'
                        ? 'bg-amber-50 text-amber-700 border border-amber-200'
                        : 'bg-slate-100 text-slate-600'
                    }`}
                  >
                    {a.status === 'ACTIVE' ? 'Ativa' : a.status === 'PAUSED' ? 'Pausada' : 'Rascunho'}
                  </span>

                  <button
                    onClick={() => toggleStatus(a.id, a.status)}
                    className="text-xs font-semibold text-slate-500 hover:text-slate-800 flex items-center gap-1"
                    title={a.status === 'ACTIVE' ? 'Pausar fluxo' : 'Ativar fluxo'}
                  >
                    {a.status === 'ACTIVE' ? (
                      <>
                        <Pause className="w-3.5 h-3.5 text-amber-600" />
                        <span>Pausar</span>
                      </>
                    ) : (
                      <>
                        <Play className="w-3.5 h-3.5 text-emerald-600" />
                        <span>Ativar</span>
                      </>
                    )}
                  </button>
                </div>

                <h3 className="font-bold text-slate-900 text-base leading-snug">{a.name}</h3>
                <p className="text-xs text-slate-500 mt-1 line-clamp-2">
                  {a.description || 'Automação para captura, engajamento e vendas de lançamentos.'}
                </p>

                <div className="flex items-center gap-4 mt-4 pt-3 border-t border-slate-100 text-xs text-slate-500">
                  <div className="flex items-center gap-1.5">
                    <Users className="w-3.5 h-3.5 text-indigo-600" />
                    <span>{a._count?.enrollments || 0} inscritos</span>
                  </div>
                  <div className="flex items-center gap-1.5">
                    <Clock className="w-3.5 h-3.5 text-amber-500" />
                    <span>{a._count?.scheduledJobs || 0} na fila</span>
                  </div>
                </div>
              </div>

              <div className="pt-5 mt-4 border-t border-slate-100 flex items-center justify-between">
                <Link
                  href={`/automations/${a.id}`}
                  className="flex items-center gap-2 px-3 py-1.5 bg-indigo-50 hover:bg-indigo-100 text-indigo-700 font-semibold text-xs rounded-lg transition-colors"
                >
                  <Edit className="w-3.5 h-3.5" />
                  <span>Abrir Editor Visual</span>
                </Link>

                <button
                  onClick={() => handleDelete(a.id)}
                  className="p-1.5 text-slate-400 hover:text-red-600 transition-colors"
                  title="Excluir fluxo"
                >
                  <Trash2 className="w-4 h-4" />
                </button>
              </div>
            </div>
          ))
        )}
      </div>

      {/* Modal Criar Automação */}
      {isModalOpen && (
        <div className="fixed inset-0 bg-slate-900/40 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-xl shadow-xl border border-slate-200 max-w-md w-full p-6">
            <h3 className="font-bold text-slate-900 text-base mb-1">Criar Nova Automação</h3>
            <p className="text-xs text-slate-500 mb-4">
              Você poderá desenhar e conectar os blocos visualmente no editor.
            </p>

            <form onSubmit={handleCreate} className="space-y-4 text-xs">
              <div>
                <label className="block text-slate-700 font-semibold mb-1">Nome do Fluxo *</label>
                <input
                  type="text"
                  required
                  value={newName}
                  onChange={(e) => setNewName(e.target.value)}
                  placeholder="Ex: Aquecimento - Imersão VIP"
                  className="w-full p-2 border border-slate-200 rounded-lg focus:ring-2 focus:ring-indigo-500"
                />
              </div>

              <div>
                <label className="block text-slate-700 font-semibold mb-1">Descrição</label>
                <textarea
                  rows={2}
                  value={newDesc}
                  onChange={(e) => setNewDesc(e.target.value)}
                  placeholder="Ex: Sequência de 3 dias para entrega de links e oferta especial..."
                  className="w-full p-2 border border-slate-200 rounded-lg focus:ring-2 focus:ring-indigo-500"
                />
              </div>

              <div>
                <label className="block text-slate-700 font-semibold mb-1">Gatilho de Entrada</label>
                <select
                  value={newTrigger}
                  onChange={(e) => setNewTrigger(e.target.value)}
                  className="w-full p-2 border border-slate-200 rounded-lg bg-white focus:ring-2 focus:ring-indigo-500"
                >
                  <option value="TAG_ADDED">Tag Adicionada (Ex: Tag 'Inscrito')</option>
                  <option value="CONTACT_CREATED">Novo Contato Cadastrado</option>
                  <option value="HOTMART_EVENT">Evento da Hotmart (Pix ou Compra)</option>
                  <option value="MANUAL">Entrada Manual</option>
                </select>
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
                  Criar e Abrir Construtor
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
