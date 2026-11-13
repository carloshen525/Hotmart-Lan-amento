'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
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
  Code,
  BookOpen,
  Copy,
  Check,
  X,
  Layers,
  ArrowRight,
  AlertCircle,
  Share2,
} from 'lucide-react';
import { PRESET_TEMPLATES, AutomationTemplate, generateShareCode } from '@/lib/automation-templates';

interface Automation {
  id: string;
  name: string;
  description?: string;
  status: string;
  triggerType: string;
  triggerConfig?: string;
  nodes: string;
  edges: string;
  updatedAt: string;
  _count: {
    enrollments: number;
    scheduledJobs: number;
  };
}

export default function AutomationsListPage() {
  const router = useRouter();
  const [automations, setAutomations] = useState<Automation[]>([]);
  const [loading, setLoading] = useState(true);

  // Modal Nova Campanha
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [modalTab, setModalTab] = useState<'CREATE' | 'TEMPLATES'>('CREATE');
  const [creationMode, setCreationMode] = useState<'BLANK' | 'CODE'>('BLANK');
  const [flowName, setFlowName] = useState('');
  const [shareCodeInput, setShareCodeInput] = useState('');
  const [codeValidating, setCodeValidating] = useState(false);
  const [codeValidationResult, setCodeValidationResult] = useState<{
    valid: boolean;
    name?: string;
    details?: string;
    payload?: any;
  } | null>(null);
  const [selectedTemplate, setSelectedTemplate] = useState<AutomationTemplate | null>(null);
  const [creating, setCreating] = useState(false);
  const [copiedCodeId, setCopiedCodeId] = useState<string | null>(null);

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

  // Copiar código de compartilhamento de um fluxo
  const handleCopyShareCode = async (automation: Automation) => {
    try {
      const res = await fetch('/api/automations/share', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ automationId: automation.id }),
      });
      const data = await res.json();
      const code = data.shareCode || generateShareCode(automation);
      await navigator.clipboard.writeText(code);
      setCopiedCodeId(automation.id);
      setTimeout(() => setCopiedCodeId(null), 3000);
    } catch {
      const code = generateShareCode(automation);
      await navigator.clipboard.writeText(code);
      setCopiedCodeId(automation.id);
      setTimeout(() => setCopiedCodeId(null), 3000);
    }
  };

  // Validação em tempo real do código digitado
  const handleValidateCode = async (codeToValidate: string) => {
    const code = codeToValidate.trim();
    if (!code) {
      setCodeValidationResult(null);
      return;
    }

    setCodeValidating(true);
    try {
      const res = await fetch(`/api/automations/share?code=${encodeURIComponent(code)}`);
      const data = await res.json();
      if (res.ok && data.success && data.automation) {
        const auto = data.automation;
        setCodeValidationResult({
          valid: true,
          name: auto.name,
          details: `${auto.nodes?.length || 0} blocos • ${auto.edges?.length || 0} conexões`,
          payload: auto,
        });
        if (!flowName.trim() && auto.name) {
          setFlowName(auto.name);
        }
      } else {
        setCodeValidationResult({
          valid: false,
          details: data.error || 'Código de automação inválido ou não encontrado.',
        });
      }
    } catch {
      setCodeValidationResult({
        valid: false,
        details: 'Erro ao conectar com o servidor para validar código.',
      });
    } finally {
      setCodeValidating(false);
    }
  };

  // Criar Automação
  const handleCreateAutomation = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!flowName.trim()) return;

    setCreating(true);
    try {
      let bodyData: any = {
        name: flowName.trim(),
      };

      if (modalTab === 'TEMPLATES' && selectedTemplate) {
        bodyData.name = flowName.trim();
        bodyData.triggerType = selectedTemplate.triggerType;
        bodyData.triggerConfig = selectedTemplate.triggerConfig;
        bodyData.nodes = selectedTemplate.nodes;
        bodyData.edges = selectedTemplate.edges;
      } else if (creationMode === 'CODE') {
        if (codeValidationResult?.payload) {
          const p = codeValidationResult.payload;
          bodyData.triggerType = p.triggerType;
          bodyData.triggerConfig = p.triggerConfig;
          bodyData.nodes = p.nodes;
          bodyData.edges = p.edges;
        } else {
          bodyData.shareCode = shareCodeInput.trim();
        }
      }

      const res = await fetch('/api/automations', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(bodyData),
      });

      const data = await res.json();
      if (res.ok && data.automation) {
        setIsModalOpen(false);
        setFlowName('');
        setShareCodeInput('');
        setCodeValidationResult(null);
        setSelectedTemplate(null);
        // Redireciona imediatamente para o editor visual
        router.push(`/automations/${data.automation.id}`);
      }
    } catch {}
    setCreating(false);
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
            Crie funis em branco, utilize templates prontos de lançamento ou compartilhe automações via código.
          </p>
        </div>

        <button
          onClick={() => {
            setFlowName('');
            setShareCodeInput('');
            setCodeValidationResult(null);
            setSelectedTemplate(null);
            setCreationMode('BLANK');
            setModalTab('CREATE');
            setIsModalOpen(true);
          }}
          className="flex items-center gap-2 px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white font-medium text-xs rounded-lg shadow-sm shadow-indigo-500/20 transition-all self-start sm:self-auto cursor-pointer"
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
              onClick={() => {
                setFlowName('');
                setCreationMode('BLANK');
                setModalTab('CREATE');
                setIsModalOpen(true);
              }}
              className="px-4 py-2 bg-indigo-600 text-white text-xs font-semibold rounded-lg shadow-sm cursor-pointer"
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
                    className="text-xs font-semibold text-slate-500 hover:text-slate-800 flex items-center gap-1 cursor-pointer"
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

              <div className="pt-5 mt-4 border-t border-slate-100 flex items-center justify-between gap-2">
                <Link
                  href={`/automations/${a.id}`}
                  className="flex items-center gap-2 px-3 py-1.5 bg-indigo-50 hover:bg-indigo-100 text-indigo-700 font-semibold text-xs rounded-lg transition-colors"
                >
                  <Edit className="w-3.5 h-3.5" />
                  <span>Abrir Editor</span>
                </Link>

                <div className="flex items-center gap-1">
                  <button
                    onClick={() => handleCopyShareCode(a)}
                    className={`flex items-center gap-1 px-2.5 py-1.5 rounded-lg border text-[11px] font-semibold transition-all cursor-pointer ${
                      copiedCodeId === a.id
                        ? 'bg-emerald-50 text-emerald-700 border-emerald-300'
                        : 'border-slate-200 text-slate-600 hover:bg-slate-50'
                    }`}
                    title="Copiar código de compartilhamento deste fluxo"
                  >
                    {copiedCodeId === a.id ? (
                      <>
                        <Check className="w-3.5 h-3.5 text-emerald-600" />
                        <span>Copiado!</span>
                      </>
                    ) : (
                      <>
                        <Code className="w-3.5 h-3.5 text-indigo-600" />
                        <span>Código</span>
                      </>
                    )}
                  </button>

                  <button
                    onClick={() => handleDelete(a.id)}
                    className="p-1.5 text-slate-400 hover:text-red-600 transition-colors cursor-pointer rounded-lg hover:bg-red-50"
                    title="Excluir fluxo"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              </div>
            </div>
          ))
        )}
      </div>

      {/* Modal Nova Campanha (Inspirado no Design de Referência) */}
      {isModalOpen && (
        <div className="fixed inset-0 bg-slate-950/70 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-[#12141a] text-white rounded-2xl shadow-2xl border border-slate-800 max-w-lg w-full p-6 animate-in fade-in zoom-in-95 duration-150">
            {/* Cabeçalho */}
            <div className="flex items-center justify-between pb-3">
              <h3 className="font-bold text-white text-lg tracking-tight">Nova campanha</h3>
              <button
                onClick={() => setIsModalOpen(false)}
                className="text-slate-400 hover:text-white p-1 rounded-lg hover:bg-slate-800 transition-colors cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleCreateAutomation} className="space-y-5 mt-2">
              {/* Campo Nome */}
              <div>
                <label className="block text-slate-400 text-xs font-semibold mb-1.5">Nome</label>
                <input
                  type="text"
                  required
                  value={flowName}
                  onChange={(e) => setFlowName(e.target.value)}
                  placeholder="nome do fluxo"
                  className="w-full px-3.5 py-2.5 bg-[#1a1e27] border border-slate-700/80 rounded-xl text-sm text-white placeholder-slate-500 focus:outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 transition-all"
                />
              </div>

              {/* Abas: Criar campanha | Templates */}
              <div>
                <div className="flex items-center border-b border-slate-800 gap-8 text-xs font-bold">
                  <button
                    type="button"
                    onClick={() => {
                      setModalTab('CREATE');
                      setSelectedTemplate(null);
                    }}
                    className={`pb-2.5 relative transition-colors cursor-pointer ${
                      modalTab === 'CREATE' ? 'text-indigo-400' : 'text-slate-400 hover:text-slate-200'
                    }`}
                  >
                    Criar campanha
                    {modalTab === 'CREATE' && (
                      <div className="absolute bottom-0 left-0 right-0 h-0.5 bg-indigo-500 rounded-full" />
                    )}
                  </button>

                  <button
                    type="button"
                    onClick={() => {
                      setModalTab('TEMPLATES');
                      if (PRESET_TEMPLATES.length > 0 && !selectedTemplate) {
                        setSelectedTemplate(PRESET_TEMPLATES[0]);
                        if (!flowName.trim()) setFlowName(PRESET_TEMPLATES[0].name);
                      }
                    }}
                    className={`pb-2.5 relative transition-colors cursor-pointer ${
                      modalTab === 'TEMPLATES' ? 'text-indigo-400' : 'text-slate-400 hover:text-slate-200'
                    }`}
                  >
                    Templates
                    {modalTab === 'TEMPLATES' && (
                      <div className="absolute bottom-0 left-0 right-0 h-0.5 bg-indigo-500 rounded-full" />
                    )}
                  </button>
                </div>
              </div>

              {/* Conteúdo da Aba 'Criar campanha' */}
              {modalTab === 'CREATE' && (
                <div className="space-y-3">
                  {/* Opção 1: Campanha em branco */}
                  <div
                    onClick={() => {
                      setCreationMode('BLANK');
                      setShareCodeInput('');
                      setCodeValidationResult(null);
                    }}
                    className={`p-4 rounded-xl flex items-center gap-3.5 cursor-pointer transition-all border ${
                      creationMode === 'BLANK'
                        ? 'bg-[#15803d] border-[#22c55e] text-white shadow-lg shadow-green-900/20'
                        : 'bg-[#181c25] border-slate-800 text-slate-300 hover:border-slate-700'
                    }`}
                  >
                    <div
                      className={`w-9 h-9 rounded-lg flex items-center justify-center shrink-0 ${
                        creationMode === 'BLANK' ? 'bg-white/20 text-white' : 'bg-slate-800 text-slate-400'
                      }`}
                    >
                      <BookOpen className="w-5 h-5" />
                    </div>
                    <div>
                      <h4 className="font-bold text-sm leading-tight text-white">Campanha em branco</h4>
                      <p
                        className={`text-xs mt-0.5 ${
                          creationMode === 'BLANK' ? 'text-green-100' : 'text-slate-400'
                        }`}
                      >
                        Crie uma campanha nova, sem nenhuma predefinição
                      </p>
                    </div>
                  </div>

                  {/* Opção 2: Via código */}
                  <div
                    onClick={() => setCreationMode('CODE')}
                    className={`p-4 rounded-xl cursor-pointer transition-all border ${
                      creationMode === 'CODE'
                        ? 'bg-[#181c25] border-indigo-500 shadow-lg shadow-indigo-950/40'
                        : 'bg-[#181c25] border-slate-800 hover:border-slate-700'
                    }`}
                  >
                    <div className="flex items-center gap-3.5">
                      <div
                        className={`w-9 h-9 rounded-lg flex items-center justify-center shrink-0 ${
                          creationMode === 'CODE' ? 'bg-indigo-600/30 text-indigo-400' : 'bg-slate-800 text-slate-400'
                        }`}
                      >
                        <Code className="w-5 h-5" />
                      </div>
                      <div>
                        <h4 className="font-bold text-sm leading-tight text-white">Via código</h4>
                        <p className="text-xs text-slate-400 mt-0.5">
                          Crie uma campanha utilizando o código de outra, mantendo as configurações originais
                        </p>
                      </div>
                    </div>

                    {/* Campo de Código (quando Via Código selecionado) */}
                    {creationMode === 'CODE' && (
                      <div className="mt-4 pt-3 border-t border-slate-800 space-y-2">
                        <label className="block text-[11px] font-semibold text-slate-300">
                          Cole o Código de Compartilhamento:
                        </label>
                        <div className="flex items-center gap-2">
                          <input
                            type="text"
                            value={shareCodeInput}
                            onChange={(e) => {
                              setShareCodeInput(e.target.value);
                              handleValidateCode(e.target.value);
                            }}
                            placeholder="Ex: LF-eyJuYW1lIjoiTGFuY2FtZW50by..."
                            className="flex-1 px-3 py-2 bg-[#12141a] border border-slate-700 rounded-lg text-xs font-mono text-indigo-300 focus:outline-none focus:border-indigo-500"
                          />
                        </div>

                        {codeValidating && (
                          <div className="text-[11px] text-slate-400 animate-pulse flex items-center gap-1.5">
                            <Clock className="w-3.5 h-3.5 text-indigo-400" />
                            <span>Validando código do fluxo...</span>
                          </div>
                        )}

                        {codeValidationResult && (
                          <div
                            className={`p-2.5 rounded-lg text-xs flex items-start gap-2 border ${
                              codeValidationResult.valid
                                ? 'bg-emerald-950/40 border-emerald-500/30 text-emerald-300'
                                : 'bg-red-950/40 border-red-500/30 text-red-300'
                            }`}
                          >
                            {codeValidationResult.valid ? (
                              <Check className="w-4 h-4 text-emerald-400 shrink-0 mt-0.5" />
                            ) : (
                              <AlertCircle className="w-4 h-4 text-red-400 shrink-0 mt-0.5" />
                            )}
                            <div>
                              <span className="font-bold block">
                                {codeValidationResult.valid
                                  ? `Fluxo Encontrado: ${codeValidationResult.name}`
                                  : 'Código Não Reconhecido'}
                              </span>
                              <span className="text-[11px] opacity-80">{codeValidationResult.details}</span>
                            </div>
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                </div>
              )}

              {/* Conteúdo da Aba 'Templates' */}
              {modalTab === 'TEMPLATES' && (
                <div className="space-y-2.5 max-h-64 overflow-y-auto pr-1">
                  {PRESET_TEMPLATES.map((tmpl) => (
                    <div
                      key={tmpl.id}
                      onClick={() => {
                        setSelectedTemplate(tmpl);
                        if (!flowName.trim() || flowName === selectedTemplate?.name) {
                          setFlowName(tmpl.name);
                        }
                      }}
                      className={`p-3.5 rounded-xl cursor-pointer transition-all border text-left ${
                        selectedTemplate?.id === tmpl.id
                          ? 'bg-[#181c25] border-indigo-500 shadow-lg shadow-indigo-950/40'
                          : 'bg-[#181c25] border-slate-800 hover:border-slate-700'
                      }`}
                    >
                      <div className="flex items-center justify-between">
                        <span className="px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider bg-indigo-950/80 text-indigo-300 border border-indigo-800/60">
                          {tmpl.category}
                        </span>
                        <span className="text-[10px] text-slate-400">
                          {tmpl.nodes.length} nós • {tmpl.edges.length} conexões
                        </span>
                      </div>
                      <h4 className="font-bold text-sm text-white mt-1.5">{tmpl.name}</h4>
                      <p className="text-xs text-slate-400 mt-0.5 line-clamp-2">{tmpl.description}</p>
                    </div>
                  ))}
                </div>
              )}

              {/* Rodapé com Ações CANCELAR e + CRIAR */}
              <div className="pt-4 border-t border-slate-800 flex items-center justify-end gap-3">
                <button
                  type="button"
                  onClick={() => setIsModalOpen(false)}
                  className="px-5 py-2.5 rounded-xl border border-slate-700 hover:bg-slate-800 text-slate-300 text-xs font-bold uppercase tracking-wider transition-colors cursor-pointer"
                >
                  CANCELAR
                </button>
                <button
                  type="submit"
                  disabled={
                    creating ||
                    !flowName.trim() ||
                    (modalTab === 'CREATE' && creationMode === 'CODE' && !codeValidationResult?.valid)
                  }
                  className="px-6 py-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 text-white text-xs font-bold uppercase tracking-wider transition-all shadow-lg shadow-indigo-600/30 flex items-center gap-1.5 cursor-pointer"
                >
                  <Plus className="w-4 h-4" />
                  <span>{creating ? 'CRIANDO...' : '+ CRIAR'}</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
