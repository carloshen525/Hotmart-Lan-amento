'use client';

import { useState, useEffect, useCallback, useMemo } from 'react';
import { useParams, useRouter } from 'next/navigation';
import {
  ReactFlow,
  Controls,
  Background,
  applyNodeChanges,
  applyEdgeChanges,
  addEdge,
  Node,
  Edge,
  OnNodesChange,
  OnEdgesChange,
  OnConnect,
  BackgroundVariant,
} from '@xyflow/react';

import {
  ArrowLeft,
  Save,
  Play,
  Pause,
  Plus,
  Sparkles,
  Zap,
  Mail,
  MessageSquare,
  Clock,
  Calendar,
  GitFork,
  Tag as TagIcon,
  XCircle,
  X,
  CheckCircle2,
  Edit2,
  Trash2,
  Sliders,
  ChevronDown,
  Info,
  Layers,
} from 'lucide-react';

import {
  TriggerNode,
  ActionNode,
  ConditionNode,
  DelayNode,
} from '@/components/automation/CustomNodes';

interface TagItem {
  id: string;
  name: string;
  color: string;
  _count?: { contacts: number };
}

export default function AutomationCanvasPage() {
  const params = useParams();
  const router = useRouter();
  const automationId = params.id as string;

  const [nodes, setNodes] = useState<Node[]>([]);
  const [edges, setEdges] = useState<Edge[]>([]);
  const [name, setName] = useState('');
  const [status, setStatus] = useState('DRAFT');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saveNotice, setSaveNotice] = useState<string | null>(null);

  // Lista de tags existentes no expert
  const [availableTags, setAvailableTags] = useState<TagItem[]>([]);

  // Seleção de nó
  const [selectedNode, setSelectedNode] = useState<Node | null>(null);

  // Modais de Tag (Criação e Edição rápida)
  const [isCreateTagOpen, setIsCreateTagOpen] = useState(false);
  const [isEditTagOpen, setIsEditTagOpen] = useState(false);
  const [newTagName, setNewTagName] = useState('');
  const [newTagColor, setNewTagColor] = useState('#8b5cf6');
  const [tagBeingEdited, setTagBeingEdited] = useState<TagItem | null>(null);

  // Modal Avançado de Configurar Timer (Inspirado nas Imagens)
  const [isTimerModalOpen, setIsTimerModalOpen] = useState(false);
  const [timerTab, setTimerTab] = useState<'CONTINUOUS' | 'SPECIFIC_DATE'>('CONTINUOUS');
  const [timerValue, setTimerValue] = useState<number>(1);
  const [timerUnit, setTimerUnit] = useState<'minutes' | 'hours' | 'days'>('minutes');
  const [timerSpecificDate, setTimerSpecificDate] = useState<string>('');
  const [timerCancelCondition, setTimerCancelCondition] = useState<'PURCHASE_APPROVED' | 'NONE'>('PURCHASE_APPROVED');
  const [timerHasLimit, setTimerHasLimit] = useState(false);
  const [timerHasInterval, setTimerHasInterval] = useState(false);
  const [timerIntervalStart, setTimerIntervalStart] = useState('08:00');
  const [timerIntervalEnd, setTimerIntervalEnd] = useState('20:00');
  const [timerHasWeekDays, setTimerHasWeekDays] = useState(false);
  const [timerWeekDays, setTimerWeekDays] = useState<string[]>(['seg', 'ter', 'qua', 'qui', 'sex']);

  // Modal de Simulação
  const [isSimulateOpen, setIsSimulateOpen] = useState(false);
  const [simClientStatus, setSimClientStatus] = useState(false);
  const [simPixStatus, setSimPixStatus] = useState(false);
  const [simulationSteps, setSimulationSteps] = useState<any[]>([]);
  const [simulating, setSimulating] = useState(false);

  // Mapeamento de nós do React Flow
  const nodeTypes = useMemo(
    () => ({
      trigger: TriggerNode,
      action: ActionNode,
      condition: ConditionNode,
      delay: DelayNode,
    }),
    []
  );

  const fetchTags = async () => {
    try {
      const res = await fetch('/api/tags');
      const data = await res.json();
      setAvailableTags(data.tags || []);
    } catch {}
  };

  useEffect(() => {
    fetchTags();

    fetch(`/api/automations/${automationId}`)
      .then((res) => res.json())
      .then((data) => {
        if (data.automation) {
          setName(data.automation.name);
          setStatus(data.automation.status);
          setNodes(data.automation.nodes || []);
          setEdges(data.automation.edges || []);
        }
        setLoading(false);
      })
      .catch(() => setLoading(false));
  }, [automationId]);

  const onNodesChange: OnNodesChange = useCallback(
    (changes) => setNodes((nds) => applyNodeChanges(changes, nds)),
    []
  );

  const onEdgesChange: OnEdgesChange = useCallback(
    (changes) => setEdges((eds) => applyEdgeChanges(changes, eds)),
    []
  );

  const onConnect: OnConnect = useCallback(
    (params) => setEdges((eds) => addEdge({ ...params, animated: true }, eds)),
    []
  );

  const handleSave = async (publishStatus?: string) => {
    setSaving(true);
    setSaveNotice(null);
    try {
      const newStatus = publishStatus || status;
      const res = await fetch(`/api/automations/${automationId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name,
          status: newStatus,
          nodes,
          edges,
        }),
      });

      if (res.ok) {
        setStatus(newStatus);
        setSaveNotice(publishStatus === 'ACTIVE' ? 'Automação Ativada com Sucesso!' : 'Rascunho Salvo!');
        setTimeout(() => setSaveNotice(null), 3000);
      }
    } catch {
      setSaveNotice('Erro ao salvar');
    } finally {
      setSaving(false);
    }
  };

  const addBlock = (type: string, subtype: string, label: string, config: any = {}) => {
    const id = `node_${Date.now()}`;
    const newNode: Node = {
      id,
      type,
      position: { x: 340 + Math.random() * 40, y: 150 + nodes.length * 50 },
      data: {
        label,
        type,
        subtype,
        config,
      },
    };
    setNodes((nds) => [...nds, newNode]);
    setSelectedNode(newNode);

    if (type === 'delay') {
      openTimerModal(newNode);
    }
  };

  const updateSelectedNodeConfig = (key: string, value: any) => {
    if (!selectedNode) return;
    setNodes((nds) =>
      nds.map((n) => {
        if (n.id === selectedNode.id) {
          const updated = {
            ...n,
            data: {
              ...n.data,
              config: {
                ...(n.data.config as object),
                [key]: value,
              },
            },
          };
          setSelectedNode(updated);
          return updated;
        }
        return n;
      })
    );
  };

  const updateSelectedNodeLabel = (label: string) => {
    if (!selectedNode) return;
    setNodes((nds) =>
      nds.map((n) => {
        if (n.id === selectedNode.id) {
          const updated = {
            ...n,
            data: { ...n.data, label },
          };
          setSelectedNode(updated);
          return updated;
        }
        return n;
      })
    );
  };

  const deleteSelectedNode = () => {
    if (!selectedNode) return;
    setNodes((nds) => nds.filter((n) => n.id !== selectedNode.id));
    setEdges((eds) => eds.filter((e) => e.source !== selectedNode.id && e.target !== selectedNode.id));
    setSelectedNode(null);
  };

  // Abre e popula o modal de Timer para o nó
  const openTimerModal = (nodeToConfigure?: Node) => {
    const targetNode = nodeToConfigure || selectedNode;
    if (!targetNode || targetNode.data.type !== 'delay') return;

    const cfg = (targetNode.data.config as any) || {};
    const isSpecific =
      cfg.timerType === 'SPECIFIC_DATE' ||
      cfg.delayType === 'specific_date' ||
      !!cfg.specificDate;

    setTimerTab(isSpecific ? 'SPECIFIC_DATE' : 'CONTINUOUS');
    setTimerValue(Number(cfg.value ?? cfg.duration ?? cfg.minutes ?? cfg.hours ?? cfg.days ?? 1));
    setTimerUnit(cfg.unit || (cfg.minutes !== undefined ? 'minutes' : cfg.hours !== undefined ? 'hours' : 'days'));
    setTimerSpecificDate(cfg.specificDate || '');
    setTimerCancelCondition(cfg.cancelCondition || 'PURCHASE_APPROVED');
    setTimerHasLimit(!!cfg.hasLimit);
    setTimerHasInterval(!!cfg.hasInterval);
    setTimerIntervalStart(cfg.intervalStart || '08:00');
    setTimerIntervalEnd(cfg.intervalEnd || '20:00');
    setTimerHasWeekDays(!!cfg.hasWeekDays);
    setTimerWeekDays(cfg.weekDays || ['seg', 'ter', 'qua', 'qui', 'sex']);

    setIsTimerModalOpen(true);
  };

  // Salva configurações do Timer no nó
  const handleSaveTimer = () => {
    if (!selectedNode) return;

    let newLabel = '';
    let updatedConfig: any = {
      ...(selectedNode.data.config as object),
      timerType: timerTab,
      cancelCondition: timerCancelCondition,
      hasLimit: timerHasLimit,
      hasInterval: timerHasInterval,
      intervalStart: timerIntervalStart,
      intervalEnd: timerIntervalEnd,
      hasWeekDays: timerHasWeekDays,
      weekDays: timerWeekDays,
    };

    if (timerTab === 'CONTINUOUS') {
      const unitLabel = timerUnit === 'minutes' ? 'Minuto(s)' : timerUnit === 'hours' ? 'Hora(s)' : 'Dia(s)';
      newLabel = `Aguardar ${timerValue} ${unitLabel}`;
      updatedConfig.unit = timerUnit;
      updatedConfig.value = timerValue;
      updatedConfig.specificDate = undefined;
    } else {
      if (!timerSpecificDate) {
        alert('Por favor, informe a data e horário desejados para liberação.');
        return;
      }
      const d = new Date(timerSpecificDate);
      const dateFormatted = !isNaN(d.getTime())
        ? `${d.toLocaleDateString('pt-BR')} ${d.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}`
        : timerSpecificDate;
      newLabel = `Liberar em ${dateFormatted}`;
      updatedConfig.specificDate = timerSpecificDate;
    }

    setNodes((nds) =>
      nds.map((n) => {
        if (n.id === selectedNode.id) {
          const updated = {
            ...n,
            data: {
              ...n.data,
              label: newLabel,
              config: updatedConfig,
            },
          };
          setSelectedNode(updated);
          return updated;
        }
        return n;
      })
    );

    setIsTimerModalOpen(false);
  };

  // Criação rápida de Tag dentro do fluxo
  const handleCreateTag = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newTagName.trim()) return;

    try {
      const res = await fetch('/api/tags', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: newTagName.trim(), color: newTagColor }),
      });
      const data = await res.json();
      if (data.tag) {
        await fetchTags();

        // Se um nó de tag estiver selecionado, vincula a nova tag automaticamente
        if (selectedNode) {
          const isAddOrRemove = selectedNode.data.subtype === 'ADD_TAG' || selectedNode.data.subtype === 'REMOVE_TAG';
          const prefix = selectedNode.data.subtype === 'REMOVE_TAG' ? 'Remover Tag' : 'Tag';
          const newLabel = isAddOrRemove ? `${prefix}: ${data.tag.name}` : `Verifica: ${data.tag.name}`;

          setNodes((nds) =>
            nds.map((n) => {
              if (n.id === selectedNode.id) {
                const updated = {
                  ...n,
                  data: {
                    ...n.data,
                    label: newLabel,
                    config: {
                      ...(n.data.config as object),
                      tagName: data.tag.name,
                      tagColor: data.tag.color,
                      tagId: data.tag.id,
                      leadsCount: 0,
                    },
                  },
                };
                setSelectedNode(updated);
                return updated;
              }
              return n;
            })
          );
        }

        setNewTagName('');
        setIsCreateTagOpen(false);
      }
    } catch {}
  };

  // Edição rápida de Tag
  const handleUpdateTag = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!tagBeingEdited || !tagBeingEdited.name.trim()) return;

    try {
      const res = await fetch(`/api/tags/${tagBeingEdited.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: tagBeingEdited.name.trim(), color: tagBeingEdited.color }),
      });
      const data = await res.json();
      if (data.tag) {
        await fetchTags();

        // Atualiza os nós no canvas que usam essa tag
        setNodes((nds) =>
          nds.map((n) => {
            const cfg = n.data.config as any;
            if (cfg?.tagName === tagBeingEdited.name || cfg?.tagId === tagBeingEdited.id) {
              const prefix = n.data.subtype === 'REMOVE_TAG' ? 'Remover Tag' : n.data.subtype === 'HAS_TAG' ? 'Verifica' : 'Tag';
              return {
                ...n,
                data: {
                  ...n.data,
                  label: `${prefix}: ${data.tag.name}`,
                  config: {
                    ...cfg,
                    tagName: data.tag.name,
                    tagColor: data.tag.color,
                  },
                },
              };
            }
            return n;
          })
        );

        if (selectedNode) {
          const cfg = selectedNode.data.config as any;
          if (cfg?.tagName === tagBeingEdited.name || cfg?.tagId === tagBeingEdited.id) {
            setSelectedNode((prev) =>
              prev
                ? {
                    ...prev,
                    data: {
                      ...prev.data,
                      label: `Tag: ${data.tag.name}`,
                      config: { ...cfg, tagName: data.tag.name, tagColor: data.tag.color },
                    },
                  }
                : null
            );
          }
        }

        setIsEditTagOpen(false);
        setTagBeingEdited(null);
      }
    } catch {}
  };

  // Seleciona tag para o nó
  const handleSelectTagForNode = (tag: TagItem) => {
    if (!selectedNode) return;
    const isAddOrRemove = selectedNode.data.subtype === 'ADD_TAG' || selectedNode.data.subtype === 'REMOVE_TAG';
    const prefix = selectedNode.data.subtype === 'REMOVE_TAG' ? 'Remover Tag' : selectedNode.data.subtype === 'HAS_TAG' ? 'Verifica' : 'Tag';
    const newLabel = `${prefix}: ${tag.name}`;

    setNodes((nds) =>
      nds.map((n) => {
        if (n.id === selectedNode.id) {
          const updated = {
            ...n,
            data: {
              ...n.data,
              label: newLabel,
              config: {
                ...(n.data.config as object),
                tagName: tag.name,
                tagColor: tag.color,
                tagId: tag.id,
                leadsCount: tag._count?.contacts || 0,
              },
            },
          };
          setSelectedNode(updated);
          return updated;
        }
        return n;
      })
    );
  };

  // Simulação de fluxo
  const runSimulation = async () => {
    setSimulating(true);
    setSimulationSteps([]);
    try {
      const res = await fetch(`/api/automations/${automationId}/simulate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contactTags: ['Inscrito', ...(simClientStatus ? ['Cliente'] : []), ...(simPixStatus ? ['Pix Gerado'] : [])],
          isClient: simClientStatus,
          hasGeneratedPix: simPixStatus,
        }),
      });
      const data = await res.json();
      setSimulationSteps(data.steps || []);
    } catch {}
    setSimulating(false);
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-full bg-slate-950">
        <div className="w-8 h-8 border-4 border-indigo-500 border-t-transparent rounded-full animate-spin"></div>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-[calc(100vh-64px)] -m-8 bg-slate-950 text-slate-100 overflow-hidden font-sans">
      {/* Topo do Construtor */}
      <div className="h-14 bg-slate-900 border-b border-slate-800 px-6 flex items-center justify-between z-10 shrink-0">
        <div className="flex items-center gap-4">
          <button
            onClick={() => router.push('/automations')}
            className="p-1.5 rounded-lg border border-slate-700 hover:bg-slate-800 text-slate-400 hover:text-white transition-colors cursor-pointer"
          >
            <ArrowLeft className="w-4 h-4" />
          </button>

          <div className="flex items-center gap-3">
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="font-bold text-white text-sm bg-transparent border-b border-transparent hover:border-slate-700 focus:border-indigo-500 focus:outline-none px-1"
            />

            {/* Switch Ativada / Desativada no Topo (como na imagem de inspiração) */}
            <div className="flex items-center gap-2 bg-slate-800/80 px-2.5 py-1 rounded-full border border-slate-700/60">
              <span className={`text-[11px] font-semibold ${status === 'ACTIVE' ? 'text-emerald-400' : 'text-slate-400'}`}>
                {status === 'ACTIVE' ? 'Ativada' : 'Desativada'}
              </span>
              <button
                type="button"
                onClick={() => handleSave(status === 'ACTIVE' ? 'PAUSED' : 'ACTIVE')}
                className={`w-9 h-5 flex items-center rounded-full p-0.5 transition-colors cursor-pointer ${
                  status === 'ACTIVE' ? 'bg-emerald-500' : 'bg-slate-600'
                }`}
              >
                <div
                  className={`bg-white w-4 h-4 rounded-full shadow-md transform transition-transform ${
                    status === 'ACTIVE' ? 'translate-x-4' : 'translate-x-0'
                  }`}
                />
              </button>
            </div>
          </div>
        </div>

        <div className="flex items-center gap-3">
          {saveNotice && (
            <span className="text-xs font-semibold text-emerald-400 bg-emerald-950/60 px-3 py-1 rounded-full border border-emerald-500/30">
              {saveNotice}
            </span>
          )}

          <button
            onClick={() => {
              setIsSimulateOpen(true);
              runSimulation();
            }}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl border border-purple-500/30 bg-purple-950/40 text-purple-300 hover:bg-purple-900/60 text-xs font-semibold transition-colors cursor-pointer"
          >
            <Sparkles className="w-3.5 h-3.5 text-purple-400" />
            <span>Simular Fluxo</span>
          </button>

          <button
            onClick={() => handleSave()}
            disabled={saving}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl border border-slate-700 bg-slate-800 hover:bg-slate-700 text-white text-xs font-semibold transition-colors cursor-pointer"
          >
            <Save className="w-3.5 h-3.5" />
            <span>Salvar Rascunho</span>
          </button>
        </div>
      </div>

      {/* Área Central: Barra Lateral de Ferramentas + Canvas + Painel de Edição */}
      <div className="flex-1 flex relative overflow-hidden bg-slate-950">
        {/* Barra Lateral Esquerda de Blocos (Inspirada na Imagem 2) */}
        <div className="w-56 bg-slate-900 border-r border-slate-800 p-3 flex flex-col justify-between shrink-0 z-20 overflow-y-auto">
          <div className="space-y-4">
            <div>
              <span className="text-[10px] font-bold uppercase tracking-wider text-slate-500 block px-2 mb-2">
                Arraste os Blocos
              </span>

              {/* Seção Entrada */}
              <div className="space-y-1 mb-3">
                <span className="text-[10px] text-slate-500 px-2 font-medium">Entrada</span>
                <button
                  onClick={() =>
                    addBlock('trigger', 'CONTACT_CREATED', 'Novo Lead Cadastrado', {
                      description: 'Inicia quando o lead entra no lançamento',
                    })
                  }
                  className="w-full flex items-center gap-2.5 px-3 py-2 rounded-xl bg-slate-800/60 hover:bg-slate-800 text-slate-200 text-xs font-medium transition-all text-left border border-slate-700/40 hover:border-indigo-500/40 cursor-pointer"
                >
                  <div className="w-6 h-6 rounded-lg bg-indigo-500/20 text-indigo-400 flex items-center justify-center">
                    <Zap className="w-3.5 h-3.5" />
                  </div>
                  <span>Gatilho de Entrada</span>
                </button>
              </div>

              {/* Seção Tags */}
              <div className="space-y-1 mb-3">
                <span className="text-[10px] text-slate-500 px-2 font-medium">Segmentação</span>
                <button
                  onClick={() =>
                    addBlock('action', 'ADD_TAG', 'Adicionar Tag', {
                      tagName: availableTags[0]?.name || 'Inscrito',
                      tagColor: availableTags[0]?.color || '#8b5cf6',
                      tagId: availableTags[0]?.id,
                      leadsCount: availableTags[0]?._count?.contacts || 0,
                    })
                  }
                  className="w-full flex items-center gap-2.5 px-3 py-2 rounded-xl bg-slate-800/60 hover:bg-slate-800 text-slate-200 text-xs font-medium transition-all text-left border border-slate-700/40 hover:border-purple-500/40 cursor-pointer"
                >
                  <div className="w-6 h-6 rounded-lg bg-purple-500/20 text-purple-400 flex items-center justify-center">
                    <TagIcon className="w-3.5 h-3.5" />
                  </div>
                  <span>Tag / Segmento</span>
                </button>
              </div>

              {/* Seção Agendamento & Timer */}
              <div className="space-y-1 mb-3">
                <span className="text-[10px] text-slate-500 px-2 font-medium">Agendamento</span>
                <button
                  onClick={() =>
                    addBlock('delay', 'WAIT_TIME', 'Aguardar 1 Minuto', {
                      timerType: 'CONTINUOUS',
                      value: 1,
                      unit: 'minutes',
                      cancelCondition: 'PURCHASE_APPROVED',
                    })
                  }
                  className="w-full flex items-center gap-2.5 px-3 py-2 rounded-xl bg-slate-800/60 hover:bg-slate-800 text-slate-200 text-xs font-medium transition-all text-left border border-slate-700/40 hover:border-sky-500/40 cursor-pointer"
                >
                  <div className="w-6 h-6 rounded-lg bg-sky-500/20 text-sky-400 flex items-center justify-center">
                    <Clock className="w-3.5 h-3.5" />
                  </div>
                  <span>Timer / Agendamento</span>
                </button>
              </div>

              {/* Seção Disparos de Mensagens */}
              <div className="space-y-1 mb-3">
                <span className="text-[10px] text-slate-500 px-2 font-medium">Disparos</span>
                <button
                  onClick={() =>
                    addBlock('action', 'SEND_WHATSAPP', 'Enviar WhatsApp', {
                      text: 'Olá {{nome}}! Seu link exclusivo para entrar na sala ao vivo é: https://zoom.us/demo',
                    })
                  }
                  className="w-full flex items-center gap-2.5 px-3 py-2 rounded-xl bg-slate-800/60 hover:bg-slate-800 text-slate-200 text-xs font-medium transition-all text-left border border-slate-700/40 hover:border-emerald-500/40 cursor-pointer"
                >
                  <div className="w-6 h-6 rounded-lg bg-emerald-500/20 text-emerald-400 flex items-center justify-center">
                    <MessageSquare className="w-3.5 h-3.5" />
                  </div>
                  <span>Mensagem WhatsApp</span>
                </button>

                <button
                  onClick={() =>
                    addBlock('action', 'SEND_EMAIL', 'Enviar E-mail', {
                      subject: 'Link da Aula ao Vivo',
                      content: '<p>Olá {{nome}}, nossa transmissão vai começar!</p>',
                    })
                  }
                  className="w-full flex items-center gap-2.5 px-3 py-2 rounded-xl bg-slate-800/60 hover:bg-slate-800 text-slate-200 text-xs font-medium transition-all text-left border border-slate-700/40 hover:border-blue-500/40 cursor-pointer"
                >
                  <div className="w-6 h-6 rounded-lg bg-blue-500/20 text-blue-400 flex items-center justify-center">
                    <Mail className="w-3.5 h-3.5" />
                  </div>
                  <span>E-mail Marketing</span>
                </button>
              </div>

              {/* Seção Decisões & Filtros */}
              <div className="space-y-1 mb-3">
                <span className="text-[10px] text-slate-500 px-2 font-medium">Decisões</span>
                <button
                  onClick={() =>
                    addBlock('condition', 'HAS_TAG', 'Condição: Comprou?', {
                      tagName: 'Cliente',
                    })
                  }
                  className="w-full flex items-center gap-2.5 px-3 py-2 rounded-xl bg-slate-800/60 hover:bg-slate-800 text-slate-200 text-xs font-medium transition-all text-left border border-slate-700/40 hover:border-amber-500/40 cursor-pointer"
                >
                  <div className="w-6 h-6 rounded-lg bg-amber-500/20 text-amber-400 flex items-center justify-center">
                    <GitFork className="w-3.5 h-3.5" />
                  </div>
                  <span>Condição SE / SENÃO</span>
                </button>

                <button
                  onClick={() =>
                    addBlock('action', 'CANCEL_OTHER_FLOWS', 'Interromper Cobranças', {})
                  }
                  className="w-full flex items-center gap-2.5 px-3 py-2 rounded-xl bg-slate-800/60 hover:bg-slate-800 text-slate-200 text-xs font-medium transition-all text-left border border-slate-700/40 hover:border-rose-500/40 cursor-pointer"
                >
                  <div className="w-6 h-6 rounded-lg bg-rose-500/20 text-rose-400 flex items-center justify-center">
                    <XCircle className="w-3.5 h-3.5" />
                  </div>
                  <span>Interromper Cobranças</span>
                </button>
              </div>
            </div>
          </div>

          <div className="pt-3 border-t border-slate-800 text-[11px] text-slate-500">
            Arraste ou clique para conectar blocos pelo fluxo
          </div>
        </div>

        {/* Canvas do React Flow */}
        <div className="flex-1 h-full w-full bg-slate-950">
          <ReactFlow
            nodes={nodes}
            edges={edges}
            onNodesChange={onNodesChange}
            onEdgesChange={onEdgesChange}
            onConnect={onConnect}
            nodeTypes={nodeTypes}
            onNodeClick={(_, node) => {
              setSelectedNode(node);
              if (node.data.type === 'delay') {
                openTimerModal(node);
              }
            }}
            onPaneClick={() => setSelectedNode(null)}
            fitView
          >
            <Background variant={BackgroundVariant.Dots} gap={20} size={1.5} color="#334155" />
            <Controls className="!bg-slate-900 !border-slate-800 !text-white !fill-white shadow-xl" />
          </ReactFlow>
        </div>

        {/* Painel Lateral de Configuração do Bloco Selecionado */}
        {selectedNode && (
          <div className="w-88 bg-slate-900 border-l border-slate-800 shadow-2xl p-5 overflow-y-auto z-20 shrink-0 text-xs flex flex-col justify-between animate-in fade-in slide-in-from-right-2">
            <div>
              <div className="flex items-center justify-between pb-3 border-b border-slate-800 mb-4">
                <div className="flex items-center gap-2">
                  <span className="font-bold text-white text-sm">Configurar Bloco</span>
                  <span className="text-[10px] text-slate-500 font-mono">ID: {selectedNode.id}</span>
                </div>
                <button
                  onClick={() => setSelectedNode(null)}
                  className="text-slate-400 hover:text-white p-1 rounded-lg hover:bg-slate-800 cursor-pointer"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>

              <div className="space-y-4">
                <div>
                  <label className="block text-slate-300 font-semibold mb-1">Título no Fluxo</label>
                  <input
                    type="text"
                    value={selectedNode.data.label as string}
                    onChange={(e) => updateSelectedNodeLabel(e.target.value)}
                    className="w-full p-2.5 bg-slate-950 border border-slate-700 rounded-xl text-white focus:outline-none focus:border-indigo-500"
                  />
                </div>

                {/* Bloco de TEMPORIZADOR / TIMER */}
                {selectedNode.data.type === 'delay' && (
                  <div className="p-4 rounded-xl bg-slate-950/80 border border-sky-500/30 space-y-3">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2 text-sky-400 font-bold">
                        <Clock className="w-4 h-4" />
                        <span>Configurações do Timer</span>
                      </div>
                      <button
                        onClick={() => openTimerModal()}
                        className="px-2.5 py-1 rounded-lg bg-sky-500 hover:bg-sky-600 text-white text-xs font-semibold flex items-center gap-1.5 shadow-sm cursor-pointer"
                      >
                        <Sliders className="w-3.5 h-3.5" />
                        <span>Abrir Modal</span>
                      </button>
                    </div>

                    <div className="text-slate-300 text-[11px] leading-relaxed">
                      {(selectedNode.data.config as any)?.timerType === 'SPECIFIC_DATE' ? (
                        <>
                          <div className="font-medium text-sky-300">Modo: Data e Horário Específico</div>
                          <div>Agendado para: {(selectedNode.data.config as any)?.specificDate || 'Não definido'}</div>
                        </>
                      ) : (
                        <>
                          <div className="font-medium text-sky-300">Modo: Tempo Contínuo</div>
                          <div>
                            Espera: {(selectedNode.data.config as any)?.value || (selectedNode.data.config as any)?.days || 1}{' '}
                            {(selectedNode.data.config as any)?.unit || 'dias'}
                          </div>
                        </>
                      )}
                    </div>
                  </div>
                )}

                {/* Bloco de TAGS: Criar, Editar e Selecionar Tags diretamente no fluxo */}
                {(selectedNode.data.subtype === 'ADD_TAG' ||
                  selectedNode.data.subtype === 'REMOVE_TAG' ||
                  selectedNode.data.subtype === 'HAS_TAG') && (
                  <div className="space-y-3 p-4 rounded-xl bg-slate-950/70 border border-purple-500/30">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-1.5 text-purple-400 font-bold">
                        <TagIcon className="w-4 h-4" />
                        <span>Gerenciar Tag no Fluxo</span>
                      </div>

                      <button
                        type="button"
                        onClick={() => setIsCreateTagOpen(true)}
                        className="px-2.5 py-1 bg-purple-600 hover:bg-purple-700 text-white rounded-lg text-[11px] font-semibold flex items-center gap-1 transition-colors cursor-pointer"
                      >
                        <Plus className="w-3 h-3" />
                        <span>Nova Tag</span>
                      </button>
                    </div>

                    <div>
                      <label className="block text-slate-400 text-[11px] font-semibold mb-1">
                        Selecione a Tag Existente
                      </label>
                      <div className="max-h-48 overflow-y-auto space-y-1.5 pr-1">
                        {availableTags.length === 0 ? (
                          <div className="p-3 text-center text-slate-500 text-xs">
                            Nenhuma tag cadastrada ainda. Clique em &quot;Nova Tag&quot; acima.
                          </div>
                        ) : (
                          availableTags.map((tag) => {
                            const isSelected =
                              (selectedNode.data.config as any)?.tagName === tag.name ||
                              (selectedNode.data.config as any)?.tagId === tag.id;

                            return (
                              <div
                                key={tag.id}
                                className={`flex items-center justify-between p-2 rounded-xl border transition-all ${
                                  isSelected
                                    ? 'bg-purple-500/20 border-purple-500 text-white font-medium'
                                    : 'bg-slate-900 border-slate-800 text-slate-300 hover:border-slate-700'
                                }`}
                              >
                                <button
                                  type="button"
                                  onClick={() => handleSelectTagForNode(tag)}
                                  className="flex items-center gap-2 flex-1 text-left cursor-pointer"
                                >
                                  <span
                                    className="w-3 h-3 rounded-full shrink-0"
                                    style={{ backgroundColor: tag.color }}
                                  />
                                  <span className="truncate">{tag.name}</span>
                                  {tag._count?.contacts !== undefined && (
                                    <span className="text-[10px] text-slate-500">
                                      ({tag._count.contacts} leads)
                                    </span>
                                  )}
                                </button>

                                <button
                                  type="button"
                                  onClick={() => {
                                    setTagBeingEdited(tag);
                                    setIsEditTagOpen(true);
                                  }}
                                  title="Editar esta Tag"
                                  className="text-slate-400 hover:text-white p-1 hover:bg-slate-800 rounded-lg cursor-pointer ml-1"
                                >
                                  <Edit2 className="w-3 h-3" />
                                </button>
                              </div>
                            );
                          })
                        )}
                      </div>
                    </div>
                  </div>
                )}

                {/* Bloco de Mensagem WhatsApp */}
                {selectedNode.data.subtype === 'SEND_WHATSAPP' && (
                  <div>
                    <label className="block text-slate-300 font-semibold mb-1">Texto da Mensagem</label>
                    <textarea
                      rows={5}
                      value={(selectedNode.data.config as any)?.text || ''}
                      onChange={(e) => updateSelectedNodeConfig('text', e.target.value)}
                      placeholder="Olá {{nome}}, seu link de acesso é..."
                      className="w-full p-2.5 bg-slate-950 border border-slate-700 rounded-xl text-white focus:outline-none focus:border-indigo-500"
                    />
                    <span className="text-[10px] text-slate-500">
                      Variáveis disponíveis: {'{{nome}}'}, {'{{email}}'}, {'{{telefone}}'}
                    </span>
                  </div>
                )}

                {/* Bloco de E-mail */}
                {selectedNode.data.subtype === 'SEND_EMAIL' && (
                  <div className="space-y-3">
                    <div>
                      <label className="block text-slate-300 font-semibold mb-1">Assunto do E-mail</label>
                      <input
                        type="text"
                        value={(selectedNode.data.config as any)?.subject || ''}
                        onChange={(e) => updateSelectedNodeConfig('subject', e.target.value)}
                        placeholder="Ex: Sua vaga está confirmada!"
                        className="w-full p-2.5 bg-slate-950 border border-slate-700 rounded-xl text-white focus:outline-none focus:border-indigo-500"
                      />
                    </div>
                    <div>
                      <label className="block text-slate-300 font-semibold mb-1">Conteúdo do E-mail</label>
                      <textarea
                        rows={5}
                        value={(selectedNode.data.config as any)?.content || ''}
                        onChange={(e) => updateSelectedNodeConfig('content', e.target.value)}
                        className="w-full p-2.5 bg-slate-950 border border-slate-700 rounded-xl text-white font-mono text-[11px] focus:outline-none focus:border-indigo-500"
                      />
                    </div>
                  </div>
                )}
              </div>
            </div>

            <button
              onClick={deleteSelectedNode}
              className="mt-6 w-full py-2.5 bg-rose-500/10 hover:bg-rose-500/20 text-rose-400 border border-rose-500/30 font-semibold rounded-xl transition-colors flex items-center justify-center gap-1.5 cursor-pointer"
            >
              <Trash2 className="w-3.5 h-3.5" />
              <span>Excluir Bloco do Fluxo</span>
            </button>
          </div>
        )}
      </div>

      {/* ========================================================================= */}
      {/* MODAL CONFIGURAR TIMER (INSPIRADO EXATAMENTE NAS IMAGENS 3 E 4) */}
      {/* ========================================================================= */}
      {isTimerModalOpen && selectedNode && (
        <div className="fixed inset-0 bg-slate-950/80 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-slate-900 border border-slate-800 rounded-2xl shadow-2xl max-w-lg w-full overflow-hidden animate-in fade-in zoom-in-95 text-xs">
            {/* Cabeçalho do Modal */}
            <div className="p-5 border-b border-slate-800 flex items-center justify-between">
              <div>
                <div className="text-[11px] text-slate-500 font-mono">ID - {selectedNode.id}</div>
                <h2 className="text-base font-bold text-white">Configurar Timer</h2>
              </div>
              <button
                onClick={() => setIsTimerModalOpen(false)}
                className="text-slate-400 hover:text-white p-1 rounded-lg hover:bg-slate-800 cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Abas Superiores (Tempo contínuo | Data específica) */}
            <div className="flex border-b border-slate-800 bg-slate-950/50 px-5 pt-3">
              <button
                type="button"
                onClick={() => setTimerTab('CONTINUOUS')}
                className={`pb-3 px-4 font-semibold text-xs transition-colors relative cursor-pointer ${
                  timerTab === 'CONTINUOUS'
                    ? 'text-indigo-400 border-b-2 border-indigo-500'
                    : 'text-slate-400 hover:text-slate-200'
                }`}
              >
                Tempo contínuo
              </button>
              <button
                type="button"
                onClick={() => setTimerTab('SPECIFIC_DATE')}
                className={`pb-3 px-4 font-semibold text-xs transition-colors relative cursor-pointer ${
                  timerTab === 'SPECIFIC_DATE'
                    ? 'text-indigo-400 border-b-2 border-indigo-500'
                    : 'text-slate-400 hover:text-slate-200'
                }`}
              >
                Data específica
              </button>
            </div>

            {/* Conteúdo das Abas */}
            <div className="p-6 space-y-5 max-h-[65vh] overflow-y-auto">
              {/* ABA 1: TEMPO CONTÍNUO (Imagem 3) */}
              {timerTab === 'CONTINUOUS' && (
                <>
                  {/* Card Selecionar um tempo de espera */}
                  <div className="p-4 rounded-xl bg-slate-950/70 border border-slate-800 space-y-3">
                    <div className="flex items-start gap-2.5">
                      <Clock className="w-4 h-4 text-sky-400 mt-0.5 shrink-0" />
                      <div>
                        <div className="font-bold text-white text-xs">Selecionar um tempo de espera?</div>
                        <p className="text-[11px] text-slate-400 mt-0.5">
                          O lead irá aguardar um determinado tempo para ser liberado pelo timer.
                        </p>
                      </div>
                    </div>

                    <div className="flex items-center gap-3 pt-1">
                      <input
                        type="number"
                        min={1}
                        value={timerValue}
                        onChange={(e) => setTimerValue(Math.max(1, Number(e.target.value)))}
                        className="w-28 p-2.5 bg-slate-900 border border-slate-700 rounded-xl text-white font-bold text-center text-sm focus:outline-none focus:border-indigo-500"
                      />

                      <select
                        value={timerUnit}
                        onChange={(e) => setTimerUnit(e.target.value as any)}
                        className="flex-1 p-2.5 bg-slate-900 border border-slate-700 rounded-xl text-white font-medium text-xs focus:outline-none focus:border-indigo-500"
                      >
                        <option value="minutes">Minutos</option>
                        <option value="hours">Horas</option>
                        <option value="days">Dias</option>
                      </select>
                    </div>
                  </div>

                  {/* Switch Determinar intervalo de tempo */}
                  <div className="p-4 rounded-xl bg-slate-950/70 border border-slate-800 space-y-2">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <Calendar className="w-4 h-4 text-slate-400" />
                        <div>
                          <span className="font-semibold text-white block">Determinar um intervalo de tempo?</span>
                          <span className="text-[11px] text-slate-400">
                            O timer vai liberar os leads entre os horários de início e fim.
                          </span>
                        </div>
                      </div>
                      <button
                        type="button"
                        onClick={() => setTimerHasInterval(!timerHasInterval)}
                        className={`w-9 h-5 flex items-center rounded-full p-0.5 transition-colors cursor-pointer ${
                          timerHasInterval ? 'bg-indigo-600' : 'bg-slate-700'
                        }`}
                      >
                        <div
                          className={`bg-white w-4 h-4 rounded-full shadow-md transform transition-transform ${
                            timerHasInterval ? 'translate-x-4' : 'translate-x-0'
                          }`}
                        />
                      </button>
                    </div>

                    {timerHasInterval && (
                      <div className="grid grid-cols-2 gap-3 pt-2">
                        <div>
                          <label className="text-[10px] text-slate-400 block mb-1">Horário de início</label>
                          <input
                            type="time"
                            value={timerIntervalStart}
                            onChange={(e) => setTimerIntervalStart(e.target.value)}
                            className="w-full p-2 bg-slate-900 border border-slate-700 rounded-lg text-white"
                          />
                        </div>
                        <div>
                          <label className="text-[10px] text-slate-400 block mb-1">Horário de fim</label>
                          <input
                            type="time"
                            value={timerIntervalEnd}
                            onChange={(e) => setTimerIntervalEnd(e.target.value)}
                            className="w-full p-2 bg-slate-900 border border-slate-700 rounded-lg text-white"
                          />
                        </div>
                      </div>
                    )}
                  </div>

                  {/* Switch Dias da semana */}
                  <div className="p-4 rounded-xl bg-slate-950/70 border border-slate-800 space-y-2">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <Layers className="w-4 h-4 text-slate-400" />
                        <div>
                          <span className="font-semibold text-white block">Selecionar os dias da semana?</span>
                          <span className="text-[11px] text-slate-400">
                            Determine quais dias da semana o timer vai ser acionado.
                          </span>
                        </div>
                      </div>
                      <button
                        type="button"
                        onClick={() => setTimerHasWeekDays(!timerHasWeekDays)}
                        className={`w-9 h-5 flex items-center rounded-full p-0.5 transition-colors cursor-pointer ${
                          timerHasWeekDays ? 'bg-indigo-600' : 'bg-slate-700'
                        }`}
                      >
                        <div
                          className={`bg-white w-4 h-4 rounded-full shadow-md transform transition-transform ${
                            timerHasWeekDays ? 'translate-x-4' : 'translate-x-0'
                          }`}
                        />
                      </button>
                    </div>

                    {timerHasWeekDays && (
                      <div className="flex gap-1.5 pt-2 flex-wrap">
                        {['seg', 'ter', 'qua', 'qui', 'sex', 'sab', 'dom'].map((dia) => {
                          const isChecked = timerWeekDays.includes(dia);
                          return (
                            <button
                              key={dia}
                              type="button"
                              onClick={() => {
                                if (isChecked) {
                                  setTimerWeekDays(timerWeekDays.filter((d) => d !== dia));
                                } else {
                                  setTimerWeekDays([...timerWeekDays, dia]);
                                }
                              }}
                              className={`px-2.5 py-1 rounded-lg text-[10px] font-bold uppercase transition-all cursor-pointer ${
                                isChecked
                                  ? 'bg-indigo-600 text-white'
                                  : 'bg-slate-800 text-slate-400 border border-slate-700'
                              }`}
                            >
                              {dia}
                            </button>
                          );
                        })}
                      </div>
                    )}
                  </div>
                </>
              )}

              {/* ABA 2: DATA ESPECÍFICA (Imagem 4) */}
              {timerTab === 'SPECIFIC_DATE' && (
                <>
                  <div className="p-4 rounded-xl bg-slate-950/70 border border-slate-800 space-y-3">
                    <div className="flex items-start gap-2.5">
                      <Calendar className="w-4 h-4 text-sky-400 mt-0.5 shrink-0" />
                      <div>
                        <div className="font-bold text-white text-xs">
                          Agendar a liberação para um momento específico?
                        </div>
                        <p className="text-[11px] text-slate-400 mt-0.5">
                          O timer vai liberar os leads apenas na data e hora determinada.
                        </p>
                      </div>
                    </div>

                    <div className="pt-1">
                      <input
                        type="datetime-local"
                        value={timerSpecificDate}
                        onChange={(e) => setTimerSpecificDate(e.target.value)}
                        className="w-full p-2.5 bg-slate-900 border border-slate-700 rounded-xl text-white font-medium text-xs focus:outline-none focus:border-indigo-500"
                      />
                    </div>

                    {/* Fuso Horário São Paulo */}
                    <div className="p-3 rounded-lg bg-slate-900/60 border border-slate-800 text-[11px] space-y-1">
                      <div className="font-bold text-slate-300">Fuso horário: SAO PAULO</div>
                      <div className="text-slate-400">
                        Horário atual de São Paulo: {new Date().toLocaleDateString('pt-BR')} {new Date().toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}
                      </div>
                      <div className="text-[10px] text-slate-500">
                        Os leads aguardarão até este exato momento para receberem a mensagem programada.
                      </div>
                    </div>
                  </div>
                </>
              )}

              {/* Condição de Cancelamento Inteligente */}
              <div className="p-4 rounded-xl bg-slate-950/70 border border-slate-800 space-y-2">
                <div className="flex items-center gap-2">
                  <CheckCircle2 className="w-4 h-4 text-emerald-400" />
                  <span className="font-semibold text-white">Cancelar espera se comprar na Hotmart?</span>
                </div>
                <select
                  value={timerCancelCondition}
                  onChange={(e) => setTimerCancelCondition(e.target.value as any)}
                  className="w-full p-2.5 bg-slate-900 border border-slate-700 rounded-xl text-white text-xs"
                >
                  <option value="PURCHASE_APPROVED">Sim (Cancela cobrança se compra for aprovada)</option>
                  <option value="NONE">Não cancelar (Enviar mesmo se já comprou)</option>
                </select>
              </div>
            </div>

            {/* Rodapé do Modal com Botão Verde SALVAR (como na Imagem 4) */}
            <div className="p-4 border-t border-slate-800 bg-slate-950 flex items-center justify-end gap-3">
              <button
                type="button"
                onClick={() => setIsTimerModalOpen(false)}
                className="px-4 py-2 rounded-xl text-slate-400 hover:text-white font-medium text-xs transition-colors cursor-pointer"
              >
                Cancelar
              </button>

              <button
                type="button"
                onClick={handleSaveTimer}
                className="px-6 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-xs uppercase tracking-wider shadow-lg shadow-emerald-600/25 transition-all cursor-pointer"
              >
                Salvar
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* MODAL CRIAR NOVA TAG (DENTRO DO FLUXO) */}
      {/* ========================================================================= */}
      {isCreateTagOpen && (
        <div className="fixed inset-0 bg-slate-950/80 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-slate-900 border border-slate-800 rounded-2xl shadow-2xl max-w-sm w-full p-6 animate-in fade-in zoom-in-95 text-xs">
            <div className="flex items-center justify-between pb-3 border-b border-slate-800 mb-4">
              <div className="flex items-center gap-2 text-purple-400 font-bold text-sm">
                <TagIcon className="w-4 h-4" />
                <span>Nova Tag</span>
              </div>
              <button
                onClick={() => setIsCreateTagOpen(false)}
                className="text-slate-400 hover:text-white"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <form onSubmit={handleCreateTag} className="space-y-4">
              <div>
                <label className="block text-slate-300 font-medium mb-1">Nome da Tag</label>
                <input
                  type="text"
                  required
                  autoFocus
                  placeholder="Ex: Lead inscreveu tráfego"
                  value={newTagName}
                  onChange={(e) => setNewTagName(e.target.value)}
                  className="w-full p-2.5 bg-slate-950 border border-slate-700 rounded-xl text-white focus:outline-none focus:border-purple-500 text-xs"
                />
              </div>

              <div>
                <label className="block text-slate-300 font-medium mb-1.5">Cor da Tag</label>
                <div className="flex items-center gap-2 mb-2">
                  {['#8b5cf6', '#3b82f6', '#10b981', '#f59e0b', '#ef4444', '#ec4899', '#6366f1'].map((c) => (
                    <button
                      key={c}
                      type="button"
                      onClick={() => setNewTagColor(c)}
                      className={`w-6 h-6 rounded-full transition-transform cursor-pointer ${
                        newTagColor === c ? 'scale-125 ring-2 ring-white ring-offset-2 ring-offset-slate-900' : ''
                      }`}
                      style={{ backgroundColor: c }}
                    />
                  ))}
                </div>
                <input
                  type="color"
                  value={newTagColor}
                  onChange={(e) => setNewTagColor(e.target.value)}
                  className="w-full h-8 bg-transparent cursor-pointer rounded-lg border border-slate-700 p-0.5"
                />
              </div>

              <div className="pt-2 flex items-center justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setIsCreateTagOpen(false)}
                  className="px-3 py-2 text-slate-400 hover:text-white"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  className="px-4 py-2 bg-purple-600 hover:bg-purple-500 text-white font-semibold rounded-xl shadow-md cursor-pointer"
                >
                  Criar e Adicionar
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* MODAL EDITAR TAG (DENTRO DO FLUXO) */}
      {/* ========================================================================= */}
      {isEditTagOpen && tagBeingEdited && (
        <div className="fixed inset-0 bg-slate-950/80 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-slate-900 border border-slate-800 rounded-2xl shadow-2xl max-w-sm w-full p-6 animate-in fade-in zoom-in-95 text-xs">
            <div className="flex items-center justify-between pb-3 border-b border-slate-800 mb-4">
              <div className="flex items-center gap-2 text-purple-400 font-bold text-sm">
                <Edit2 className="w-4 h-4" />
                <span>Editar Tag</span>
              </div>
              <button
                onClick={() => {
                  setIsEditTagOpen(false);
                  setTagBeingEdited(null);
                }}
                className="text-slate-400 hover:text-white"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <form onSubmit={handleUpdateTag} className="space-y-4">
              <div>
                <label className="block text-slate-300 font-medium mb-1">Nome da Tag</label>
                <input
                  type="text"
                  required
                  value={tagBeingEdited.name}
                  onChange={(e) =>
                    setTagBeingEdited({ ...tagBeingEdited, name: e.target.value })
                  }
                  className="w-full p-2.5 bg-slate-950 border border-slate-700 rounded-xl text-white focus:outline-none focus:border-purple-500 text-xs"
                />
              </div>

              <div>
                <label className="block text-slate-300 font-medium mb-1.5">Cor da Tag</label>
                <div className="flex items-center gap-2 mb-2">
                  {['#8b5cf6', '#3b82f6', '#10b981', '#f59e0b', '#ef4444', '#ec4899', '#6366f1'].map((c) => (
                    <button
                      key={c}
                      type="button"
                      onClick={() => setTagBeingEdited({ ...tagBeingEdited, color: c })}
                      className={`w-6 h-6 rounded-full transition-transform cursor-pointer ${
                        tagBeingEdited.color === c ? 'scale-125 ring-2 ring-white ring-offset-2 ring-offset-slate-900' : ''
                      }`}
                      style={{ backgroundColor: c }}
                    />
                  ))}
                </div>
                <input
                  type="color"
                  value={tagBeingEdited.color}
                  onChange={(e) =>
                    setTagBeingEdited({ ...tagBeingEdited, color: e.target.value })
                  }
                  className="w-full h-8 bg-transparent cursor-pointer rounded-lg border border-slate-700 p-0.5"
                />
              </div>

              <div className="pt-2 flex items-center justify-end gap-2">
                <button
                  type="button"
                  onClick={() => {
                    setIsEditTagOpen(false);
                    setTagBeingEdited(null);
                  }}
                  className="px-3 py-2 text-slate-400 hover:text-white"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  className="px-4 py-2 bg-indigo-600 hover:bg-indigo-500 text-white font-semibold rounded-xl shadow-md cursor-pointer"
                >
                  Salvar Alterações
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* MODAL DE SIMULAÇÃO DE FLUXO */}
      {/* ========================================================================= */}
      {isSimulateOpen && (
        <div className="fixed inset-0 bg-slate-950/80 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-slate-900 rounded-2xl shadow-2xl border border-slate-800 max-w-lg w-full p-6 max-h-[85vh] flex flex-col justify-between text-xs text-slate-200">
            <div>
              <div className="flex items-center justify-between pb-3 border-b border-slate-800">
                <div className="flex items-center gap-2 text-purple-400 font-bold text-base">
                  <Sparkles className="w-5 h-5" />
                  <span>Simulador de Automação</span>
                </div>
                <button onClick={() => setIsSimulateOpen(false)} className="text-slate-400 hover:text-white cursor-pointer">
                  <X className="w-4 h-4" />
                </button>
              </div>

              <div className="py-4 space-y-4">
                <p className="text-slate-400 text-xs">
                  Simule o comportamento de um lead passando por cada etapa deste fluxo antes de publicá-lo.
                </p>

                <div className="bg-slate-950 p-4 rounded-xl border border-slate-800 space-y-2">
                  <span className="font-bold text-slate-200 block text-xs">Cenário de Teste:</span>
                  <div className="flex items-center justify-between">
                    <span>Lead já comprou (Possui tag Cliente)?</span>
                    <input
                      type="checkbox"
                      checked={simClientStatus}
                      onChange={(e) => setSimClientStatus(e.target.checked)}
                      className="rounded border-slate-700 bg-slate-800 text-indigo-600 w-4 h-4"
                    />
                  </div>
                  <div className="flex items-center justify-between">
                    <span>Lead gerou Pix na Hotmart?</span>
                    <input
                      type="checkbox"
                      checked={simPixStatus}
                      onChange={(e) => setSimPixStatus(e.target.checked)}
                      className="rounded border-slate-700 bg-slate-800 text-indigo-600 w-4 h-4"
                    />
                  </div>
                </div>

                <div className="space-y-2">
                  <span className="font-bold text-slate-300 block text-xs">Resultado dos Passos:</span>
                  <div className="max-h-52 overflow-y-auto space-y-2 p-1">
                    {simulating ? (
                      <div className="text-center py-6 text-slate-500">Executando simulação...</div>
                    ) : simulationSteps.length === 0 ? (
                      <div className="text-center py-6 text-slate-500">Nenhum passo executado no cenário</div>
                    ) : (
                      simulationSteps.map((step, idx) => (
                        <div key={idx} className="p-3 bg-slate-950 border border-slate-800 rounded-xl space-y-1">
                          <div className="flex items-center justify-between font-bold text-slate-200">
                            <span>
                              {idx + 1}. {step.label}
                            </span>
                            <span className="text-[10px] text-indigo-400 uppercase font-mono">{step.type}</span>
                          </div>
                          {step.details && (
                            <div className="text-[11px] text-slate-400">
                              {step.details.message && <div>{step.details.message}</div>}
                              {step.details.branch && (
                                <div className="text-emerald-400 font-semibold">
                                  Ramificação tomada: {step.details.branch === 'yes' ? 'SIM (Verde)' : 'NÃO (Vermelha)'}
                                </div>
                              )}
                              {step.details.scheduledUntil && (
                                <div className="text-sky-400">
                                  Aguardará até: {new Date(step.details.scheduledUntil).toLocaleString('pt-BR')}
                                </div>
                              )}
                            </div>
                          )}
                        </div>
                      ))
                    )}
                  </div>
                </div>
              </div>
            </div>

            <div className="pt-3 border-t border-slate-800 flex justify-end gap-2">
              <button
                onClick={() => setIsSimulateOpen(false)}
                className="px-4 py-2 border border-slate-700 text-slate-300 rounded-xl hover:bg-slate-800 text-xs font-semibold cursor-pointer"
              >
                Fechar
              </button>
              <button
                onClick={runSimulation}
                className="px-4 py-2 bg-indigo-600 hover:bg-indigo-500 text-white rounded-xl text-xs font-semibold shadow-md cursor-pointer"
              >
                Rodar Novamente
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
