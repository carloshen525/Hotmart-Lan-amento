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
  Copy,
  Check,
  Globe,
  UserPlus,
  Code,
  Settings,
  HelpCircle,
  RotateCw,
  Share2,
  Users,
} from 'lucide-react';

import {
  TagNode,
  SequenceLeadNode,
  TimerNode,
  StartNode,
  WhatsAppNode,
  EmailNode,
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

  // Modo de visualização: MACRO (fluxo principal) ou SEQUENCE (dentro de uma sequência lead)
  const [viewMode, setViewMode] = useState<'MACRO' | 'SEQUENCE'>('MACRO');
  const [activeSequenceNode, setActiveSequenceNode] = useState<Node | null>(null);

  // Estados dos nós do fluxo Macro
  const [macroNodes, setMacroNodes] = useState<Node[]>([]);
  const [macroEdges, setMacroEdges] = useState<Edge[]>([]);

  // Estados dos nós dentro da sequência ativa
  const [sequenceNodes, setSequenceNodes] = useState<Node[]>([]);
  const [sequenceEdges, setSequenceEdges] = useState<Edge[]>([]);
  const [sequenceName, setSequenceName] = useState('sequence');
  const [sequenceActive, setSequenceActive] = useState(true);

  // Dados da automação geral
  const [name, setName] = useState('');
  const [status, setStatus] = useState('DRAFT');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saveNotice, setSaveNotice] = useState<string | null>(null);

  // Tags disponíveis no expert
  const [availableTags, setAvailableTags] = useState<TagItem[]>([]);

  // Seleção de nó e modais
  const [selectedNode, setSelectedNode] = useState<Node | null>(null);
  const [isTagModalOpen, setIsTagModalOpen] = useState(false);
  const [isMessageDrawerOpen, setIsMessageDrawerOpen] = useState(false);
  const [isCreateTagOpen, setIsCreateTagOpen] = useState(false);
  const [newTagName, setNewTagName] = useState('');
  const [newTagColor, setNewTagColor] = useState('#8b5cf6');

  // Modal Avançado de Timer
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
  const [simulationSteps, setSimulationSteps] = useState<any[]>([]);
  const [simulating, setSimulating] = useState(false);

  // Compartilhamento via código
  const [copiedShareCode, setCopiedShareCode] = useState(false);
  const handleCopyCode = async () => {
    try {
      const res = await fetch('/api/automations/share', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ automationId }),
      });
      const data = await res.json();
      if (data.shareCode) {
        await navigator.clipboard.writeText(data.shareCode);
        setCopiedShareCode(true);
        setTimeout(() => setCopiedShareCode(false), 2500);
      }
    } catch {}
  };

  // Mapeamento de nós suportados no React Flow
  const nodeTypes = useMemo(
    () => ({
      tag: TagNode,
      sequence_lead: SequenceLeadNode,
      timer: TimerNode,
      delay: TimerNode,
      start: StartNode,
      whatsapp: WhatsAppNode,
      email: EmailNode,
      // Retrocompatibilidade
      trigger: TagNode,
      action: WhatsAppNode,
      condition: TimerNode,
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

          let parsedNodes: Node[] = [];
          let parsedEdges: Edge[] = [];

          try {
            parsedNodes =
              typeof data.automation.nodes === 'string'
                ? JSON.parse(data.automation.nodes)
                : data.automation.nodes || [];
          } catch {
            parsedNodes = [];
          }

          try {
            parsedEdges =
              typeof data.automation.edges === 'string'
                ? JSON.parse(data.automation.edges)
                : data.automation.edges || [];
          } catch {
            parsedEdges = [];
          }

          // Se for uma campanha nova em branco, inicializa no padrão Tag > Sequência Lead
          if (parsedNodes.length === 0) {
            const initialTag: Node = {
              id: 'node_tag_1',
              type: 'tag',
              position: { x: 200, y: 160 },
              data: {
                label: 'Tags',
                type: 'tag',
                subtype: 'TAG_ADDED',
                leadsCount: 0,
                config: { tagName: '', tagColor: '#a855f7', leadsCount: 0 },
              },
            };

            const initialSequence: Node = {
              id: 'node_seq_1',
              type: 'sequence_lead',
              position: { x: 440, y: 160 },
              data: {
                label: 'Sequência Lead',
                type: 'sequence_lead',
                leadsCount: 0,
                config: { leadsCount: 0, waitingCount: 0, successCount: 0, failedCount: 0 },
                subflow: {
                  nodes: [
                    {
                      id: 'seq_start',
                      type: 'start',
                      position: { x: 120, y: 180 },
                      data: { leadsCount: 0 },
                    },
                    {
                      id: 'seq_timer_1',
                      type: 'timer',
                      position: { x: 320, y: 180 },
                      data: {
                        config: {
                          value: 1,
                          unit: 'minutes',
                          weekDaysSummary: 'Dom, Seg, Ter, Qua, Qui, Sex, Sáb.',
                        },
                      },
                    },
                    {
                      id: 'seq_wpp_1',
                      type: 'whatsapp',
                      position: { x: 540, y: 100 },
                      data: {
                        config: {
                          message: 'Olá {{nome}}! Seja muito bem-vindo ao nosso lançamento.',
                          leadsCount: 0,
                        },
                      },
                    },
                    {
                      id: 'seq_mail_1',
                      type: 'email',
                      position: { x: 540, y: 260 },
                      data: {
                        label: 'E-mail Performance',
                        config: {
                          subject: 'Seu acesso foi liberado!',
                          content: '<p>Olá {{nome}}, prepare-se para o que vem aí!</p>',
                          leadsCount: 0,
                        },
                      },
                    },
                  ],
                  edges: [
                    { id: 'e_seq_1', source: 'seq_start', target: 'seq_timer_1', animated: true },
                    { id: 'e_seq_2', source: 'seq_timer_1', target: 'seq_wpp_1', animated: true },
                    { id: 'e_seq_3', source: 'seq_timer_1', target: 'seq_mail_1', animated: true },
                  ],
                },
              },
            };

            const initialEdges: Edge[] = [
              {
                id: 'e_macro_1',
                source: 'node_tag_1',
                target: 'node_seq_1',
                animated: true,
                style: { stroke: '#ffffff', strokeWidth: 2 },
              },
            ];

            setMacroNodes([initialTag, initialSequence]);
            setMacroEdges(initialEdges);
          } else {
            // Migra/garante compatibilidade dos tipos de nós para a nova interface
            const normalizedNodes = parsedNodes.map((n) => {
              let t = n.type;
              if (t === 'trigger') t = 'tag';
              if (t === 'action') t = 'sequence_lead';
              if (t === 'delay') t = 'timer';
              return { ...n, type: t };
            });
            setMacroNodes(normalizedNodes);
            setMacroEdges(parsedEdges);
          }
        }
        setLoading(false);
      })
      .catch(() => setLoading(false));
  }, [automationId]);

  // Handlers para nós do Macro Canvas
  const onMacroNodesChange: OnNodesChange = useCallback(
    (changes) => setMacroNodes((nds) => applyNodeChanges(changes, nds)),
    []
  );
  const onMacroEdgesChange: OnEdgesChange = useCallback(
    (changes) => setMacroEdges((eds) => applyEdgeChanges(changes, eds)),
    []
  );
  const onMacroConnect: OnConnect = useCallback(
    (params) =>
      setMacroEdges((eds) =>
        addEdge({ ...params, animated: true, style: { stroke: '#ffffff', strokeWidth: 2 } }, eds)
      ),
    []
  );

  // Handlers para nós da Sequência Interna
  const onSequenceNodesChange: OnNodesChange = useCallback(
    (changes) => setSequenceNodes((nds) => applyNodeChanges(changes, nds)),
    []
  );
  const onSequenceEdgesChange: OnEdgesChange = useCallback(
    (changes) => setSequenceEdges((eds) => applyEdgeChanges(changes, eds)),
    []
  );
  const onSequenceConnect: OnConnect = useCallback(
    (params) =>
      setSequenceEdges((eds) =>
        addEdge({ ...params, animated: true, style: { stroke: '#ffffff', strokeWidth: 2 } }, eds)
      ),
    []
  );

  // Abrir visão interna da Sequência Lead
  const openSequenceSubflow = (node: Node) => {
    setActiveSequenceNode(node);
    setSequenceName(node.data?.label ? String(node.data.label) : 'sequence');

    const sub = (node.data?.subflow as any) || {};
    let subNodes: Node[] = sub.nodes || [];
    let subEdges: Edge[] = sub.edges || [];

    if (subNodes.length === 0) {
      subNodes = [
        {
          id: 'seq_start',
          type: 'start',
          position: { x: 120, y: 180 },
          data: { leadsCount: 0 },
        },
        {
          id: `seq_timer_${Date.now()}`,
          type: 'timer',
          position: { x: 300, y: 180 },
          data: {
            config: {
              value: 1,
              unit: 'minutes',
              weekDaysSummary: 'Dom, Seg, Ter, Qua, Qui, Sex, Sáb.',
            },
          },
        },
        {
          id: `seq_wpp_${Date.now()}`,
          type: 'whatsapp',
          position: { x: 500, y: 140 },
          data: {
            config: {
              message: '',
              leadsCount: 0,
            },
          },
        },
      ];
      subEdges = [
        { id: 'e_init_1', source: 'seq_start', target: subNodes[1].id, animated: true },
        { id: 'e_init_2', source: subNodes[1].id, target: subNodes[2].id, animated: true },
      ];
    }

    setSequenceNodes(subNodes);
    setSequenceEdges(subEdges);
    setSelectedNode(null);
    setViewMode('SEQUENCE');
  };

  // Voltar da visão interna para o Fluxo Macro
  const closeSequenceSubflow = () => {
    if (activeSequenceNode) {
      setMacroNodes((nds) =>
        nds.map((n) =>
          n.id === activeSequenceNode.id
            ? {
                ...n,
                data: {
                  ...n.data,
                  label: sequenceName || n.data.label,
                  subflow: {
                    nodes: sequenceNodes,
                    edges: sequenceEdges,
                  },
                },
              }
            : n
        )
      );
    }
    setActiveSequenceNode(null);
    setSelectedNode(null);
    setViewMode('MACRO');
  };

  // Adicionar blocos no Macro (Tag, Timer, Sequência Lead)
  const addMacroBlock = (type: 'tag' | 'timer' | 'sequence_lead') => {
    const id = `node_${type}_${Date.now()}`;
    let newN: Node;

    if (type === 'tag') {
      newN = {
        id,
        type: 'tag',
        position: { x: 220 + Math.random() * 50, y: 140 + macroNodes.length * 40 },
        data: {
          label: 'Tags',
          type: 'tag',
          leadsCount: 0,
          config: { tagName: '', tagColor: '#a855f7', leadsCount: 0 },
        },
      };
    } else if (type === 'sequence_lead') {
      newN = {
        id,
        type: 'sequence_lead',
        position: { x: 440 + Math.random() * 50, y: 140 + macroNodes.length * 40 },
        data: {
          label: 'Sequência Lead',
          type: 'sequence_lead',
          leadsCount: 0,
          config: { leadsCount: 0, waitingCount: 0, successCount: 0, failedCount: 0 },
          subflow: {
            nodes: [
              {
                id: `start_${id}`,
                type: 'start',
                position: { x: 100, y: 150 },
                data: { leadsCount: 0 },
              },
            ],
            edges: [],
          },
        },
      };
    } else {
      newN = {
        id,
        type: 'timer',
        position: { x: 340 + Math.random() * 50, y: 140 + macroNodes.length * 40 },
        data: {
          label: 'Timer',
          type: 'timer',
          config: {
            value: 1,
            unit: 'minutes',
            weekDaysSummary: 'Dom, Seg, Ter, Qua, Qui, Sex, Sáb.',
            waitingCount: 0,
            successCount: 0,
            failedCount: 0,
          },
        },
      };
    }

    setMacroNodes((nds) => [...nds, newN]);
    setSelectedNode(newN);

    if (type === 'tag') {
      setIsTagModalOpen(true);
    } else if (type === 'timer') {
      openTimerModal(newN);
    }
  };

  // Adicionar blocos dentro da Sequência (Timer, WhatsApp, E-mail)
  const addSequenceBlock = (type: 'timer' | 'whatsapp' | 'email') => {
    const id = `seq_${type}_${Date.now()}`;
    let newN: Node;

    if (type === 'whatsapp') {
      newN = {
        id,
        type: 'whatsapp',
        position: { x: 400 + Math.random() * 40, y: 100 + sequenceNodes.length * 40 },
        data: {
          label: 'WhatsApp',
          config: {
            message: '',
            leadsCount: 0,
            waitingCount: 0,
            successCount: 0,
            failedCount: 0,
          },
        },
      };
    } else if (type === 'email') {
      newN = {
        id,
        type: 'email',
        position: { x: 400 + Math.random() * 40, y: 100 + sequenceNodes.length * 40 },
        data: {
          label: 'E-mail Performance',
          config: {
            subject: '',
            content: '',
            leadsCount: 0,
            waitingCount: 0,
            successCount: 0,
            failedCount: 0,
          },
        },
      };
    } else {
      newN = {
        id,
        type: 'timer',
        position: { x: 300 + Math.random() * 40, y: 100 + sequenceNodes.length * 40 },
        data: {
          config: {
            value: 1,
            unit: 'minutes',
            weekDaysSummary: 'Dom, Seg, Ter, Qua, Qui, Sex, Sáb.',
            waitingCount: 0,
            successCount: 0,
            failedCount: 0,
          },
        },
      };
    }

    setSequenceNodes((nds) => [...nds, newN]);
    setSelectedNode(newN);

    if (type === 'timer') {
      openTimerModal(newN);
    } else {
      setIsMessageDrawerOpen(true);
    }
  };

  // Salvar no Banco de Dados
  const handleSave = async (publishStatus?: string) => {
    setSaving(true);
    setSaveNotice(null);
    try {
      const newStatus = publishStatus || status;

      // Se estiver dentro de uma sequência, salva as alterações locais no nó pai antes
      let currentMacroNodes = [...macroNodes];
      if (viewMode === 'SEQUENCE' && activeSequenceNode) {
        currentMacroNodes = currentMacroNodes.map((n) =>
          n.id === activeSequenceNode.id
            ? {
                ...n,
                data: {
                  ...n.data,
                  label: sequenceName || n.data.label,
                  subflow: { nodes: sequenceNodes, edges: sequenceEdges },
                },
              }
            : n
        );
      }

      const res = await fetch(`/api/automations/${automationId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name,
          status: newStatus,
          nodes: currentMacroNodes,
          edges: macroEdges,
        }),
      });

      if (res.ok) {
        setStatus(newStatus);
        setSaveNotice(publishStatus === 'ACTIVE' ? 'Automação Ativada com Sucesso!' : 'Salvo com Sucesso!');
        setTimeout(() => setSaveNotice(null), 3000);
      }
    } catch {
      setSaveNotice('Erro ao salvar');
    } finally {
      setSaving(false);
    }
  };

  // Clique em nó
  const onNodeClick = (_: any, node: Node) => {
    setSelectedNode(node);

    if (viewMode === 'MACRO') {
      if (node.type === 'sequence_lead') {
        openSequenceSubflow(node);
      } else if (node.type === 'tag') {
        setIsTagModalOpen(true);
      } else if (node.type === 'timer') {
        openTimerModal(node);
      }
    } else {
      if (node.type === 'whatsapp' || node.type === 'email') {
        setIsMessageDrawerOpen(true);
      } else if (node.type === 'timer') {
        openTimerModal(node);
      }
    }
  };

  // Timer Modal Handler
  const openTimerModal = (nodeToConfigure?: Node) => {
    const target = nodeToConfigure || selectedNode;
    if (!target) return;
    const cfg = (target.data.config as any) || {};

    setTimerTab(cfg.timerType === 'SPECIFIC_DATE' ? 'SPECIFIC_DATE' : 'CONTINUOUS');
    setTimerValue(Number(cfg.value ?? cfg.duration ?? cfg.minutes ?? 1));
    setTimerUnit(cfg.unit || 'minutes');
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

  const handleSaveTimerConfig = () => {
    if (!selectedNode) return;

    const unitText =
      timerUnit === 'minutes' ? 'minuto(s)' : timerUnit === 'hours' ? 'hora(s)' : 'dia(s)';

    const updatedCfg: any = {
      ...(selectedNode.data.config as object),
      timerType: timerTab,
      unit: timerUnit,
      value: timerValue,
      specificDate: timerTab === 'SPECIFIC_DATE' ? timerSpecificDate : undefined,
      cancelCondition: timerCancelCondition,
      hasLimit: timerHasLimit,
      hasInterval: timerHasInterval,
      intervalStart: timerIntervalStart,
      intervalEnd: timerIntervalEnd,
      hasWeekDays: timerHasWeekDays,
      weekDays: timerWeekDays,
      weekDaysSummary: timerHasWeekDays
        ? timerWeekDays.join(', ')
        : 'Dom, Seg, Ter, Qua, Qui, Sex, Sáb.',
    };

    const updateInList = (list: Node[]) =>
      list.map((n) =>
        n.id === selectedNode.id
          ? {
              ...n,
              data: {
                ...n.data,
                config: updatedCfg,
              },
            }
          : n
      );

    if (viewMode === 'MACRO') {
      setMacroNodes(updateInList);
    } else {
      setSequenceNodes(updateInList);
    }

    setIsTimerModalOpen(false);
  };

  // Tag Selection Handler
  const handleSelectTag = (tag: TagItem) => {
    if (!selectedNode) return;

    setMacroNodes((nds) =>
      nds.map((n) =>
        n.id === selectedNode.id
          ? {
              ...n,
              data: {
                ...n.data,
                tagName: tag.name,
                leadsCount: tag._count?.contacts || 0,
                config: {
                  ...((n.data.config as object) || {}),
                  tagName: tag.name,
                  tagColor: tag.color,
                  tagId: tag.id,
                  leadsCount: tag._count?.contacts || 0,
                },
              },
            }
          : n
      )
    );
    setIsTagModalOpen(false);
  };

  // Criação rápida de Tag
  const handleQuickCreateTag = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newTagName.trim()) return;

    try {
      const res = await fetch('/api/tags', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: newTagName.trim(), color: newTagColor }),
      });
      const data = await res.json();
      if (res.ok && data.tag) {
        setAvailableTags((prev) => [...prev, data.tag]);
        handleSelectTag(data.tag);
        setNewTagName('');
        setIsCreateTagOpen(false);
      }
    } catch {}
  };

  // Salvar mensagem de WhatsApp ou E-mail
  const handleSaveMessage = (messageText: string, emailSubject?: string) => {
    if (!selectedNode) return;

    setSequenceNodes((nds) =>
      nds.map((n) => {
        if (n.id === selectedNode.id) {
          const isWpp = n.type === 'whatsapp';
          return {
            ...n,
            data: {
              ...n.data,
              config: {
                ...((n.data.config as object) || {}),
                message: isWpp ? messageText : undefined,
                text: isWpp ? messageText : undefined,
                subject: !isWpp ? emailSubject : undefined,
                content: !isWpp ? messageText : undefined,
              },
            },
          };
        }
        return n;
      })
    );
    setIsMessageDrawerOpen(false);
  };

  // Deletar nó selecionado
  const handleDeleteCurrentNode = () => {
    if (!selectedNode) return;
    if (viewMode === 'MACRO') {
      setMacroNodes((nds) => nds.filter((n) => n.id !== selectedNode.id));
      setMacroEdges((eds) =>
        eds.filter((e) => e.source !== selectedNode.id && e.target !== selectedNode.id)
      );
    } else {
      if (selectedNode.type === 'start') return; // não deleta o nó start
      setSequenceNodes((nds) => nds.filter((n) => n.id !== selectedNode.id));
      setSequenceEdges((eds) =>
        eds.filter((e) => e.source !== selectedNode.id && e.target !== selectedNode.id)
      );
    }
    setSelectedNode(null);
    setIsMessageDrawerOpen(false);
    setIsTagModalOpen(false);
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-full bg-[#0e1015]">
        <div className="w-8 h-8 border-4 border-indigo-500 border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  return (
    <div className="flex flex-col h-[calc(100vh-64px)] -m-8 bg-[#0e1015] text-slate-100 overflow-hidden font-sans select-none">
      {/* ============================================================ */}
      {/* BARRA SUPERIOR (TOP BAR) - MUDA CONFORME O NÍVEL */}
      {/* ============================================================ */}
      <div className="h-14 bg-[#14161d] border-b border-slate-800/80 px-5 flex items-center justify-between z-20 shrink-0">
        <div className="flex items-center gap-3">
          {viewMode === 'MACRO' ? (
            <button
              onClick={() => router.push('/automations')}
              className="p-1.5 rounded-lg border border-slate-700/80 hover:bg-slate-800 text-slate-400 hover:text-white transition-colors cursor-pointer"
              title="Voltar para lista de automações"
            >
              <ArrowLeft className="w-4 h-4" />
            </button>
          ) : (
            <button
              onClick={closeSequenceSubflow}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-slate-700 bg-slate-800 hover:bg-slate-700 text-white text-xs font-semibold transition-colors cursor-pointer"
              title="Voltar ao fluxo principal"
            >
              <ArrowLeft className="w-3.5 h-3.5" />
              <span>Voltar ao Fluxo Principal</span>
            </button>
          )}

          <div className="flex items-center gap-2.5">
            <Settings className="w-4 h-4 text-slate-500" />
            {viewMode === 'MACRO' ? (
              <input
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="nome do fluxo"
                className="font-bold text-white text-sm bg-transparent border-b border-transparent hover:border-slate-700 focus:border-indigo-500 focus:outline-none px-1"
              />
            ) : (
              <input
                type="text"
                value={sequenceName}
                onChange={(e) => setSequenceName(e.target.value)}
                placeholder="sequence"
                className="font-bold text-white text-sm bg-transparent border-b border-transparent hover:border-slate-700 focus:border-indigo-500 focus:outline-none px-1"
              />
            )}
          </div>
        </div>

        {/* Lado Direito do Topo */}
        <div className="flex items-center gap-3">
          {/* Switch Ativar / Desativar estilo da imagem */}
          <div className="flex items-center gap-2 bg-[#1b1e27] px-3 py-1 rounded-full border border-slate-800">
            <span
              className={`text-[11px] font-semibold ${
                (viewMode === 'MACRO' ? status === 'ACTIVE' : sequenceActive)
                  ? 'text-emerald-400'
                  : 'text-slate-400'
              }`}
            >
              {(viewMode === 'MACRO' ? status === 'ACTIVE' : sequenceActive) ? 'Ativar' : 'Desativar'}
            </span>
            <button
              type="button"
              onClick={() => {
                if (viewMode === 'MACRO') {
                  handleSave(status === 'ACTIVE' ? 'PAUSED' : 'ACTIVE');
                } else {
                  setSequenceActive(!sequenceActive);
                }
              }}
              className={`w-9 h-5 flex items-center rounded-full p-0.5 transition-colors cursor-pointer ${
                (viewMode === 'MACRO' ? status === 'ACTIVE' : sequenceActive)
                  ? 'bg-emerald-500'
                  : 'bg-slate-700'
              }`}
            >
              <div
                className={`bg-white w-4 h-4 rounded-full shadow-md transform transition-transform ${
                  (viewMode === 'MACRO' ? status === 'ACTIVE' : sequenceActive)
                    ? 'translate-x-4'
                    : 'translate-x-0'
                }`}
              />
            </button>
          </div>

          {/* Feedback de salvamento */}
          {saveNotice && (
            <span className="text-xs font-semibold text-emerald-400 bg-emerald-950/60 px-3 py-1 rounded-full border border-emerald-500/30">
              {saveNotice}
            </span>
          )}

          {/* Botão Compartilhar Código */}
          <button
            onClick={handleCopyCode}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl border text-xs font-semibold transition-all cursor-pointer ${
              copiedShareCode
                ? 'border-emerald-500/60 bg-emerald-950/80 text-emerald-300'
                : 'border-slate-700 bg-slate-800 hover:bg-slate-700 text-slate-200'
            }`}
            title="Copiar código de compartilhamento deste fluxo"
          >
            {copiedShareCode ? (
              <>
                <Check className="w-3.5 h-3.5 text-emerald-400" />
                <span>Código Copiado!</span>
              </>
            ) : (
              <>
                <Code className="w-3.5 h-3.5 text-indigo-400" />
                <span>Compartilhar Código</span>
              </>
            )}
          </button>

          {/* Botão Salvar */}
          <button
            onClick={() => handleSave()}
            disabled={saving}
            className="flex items-center gap-1.5 px-4 py-1.5 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-semibold transition-colors cursor-pointer shadow-lg shadow-indigo-600/20"
          >
            <Save className="w-3.5 h-3.5" />
            <span>{saving ? 'Salvando...' : 'Salvar'}</span>
          </button>
        </div>
      </div>

      {/* ============================================================ */}
      {/* ÁREA CENTRAL: SIDEBAR DE FERRAMENTAS + CANVAS */}
      {/* ============================================================ */}
      <div className="flex-1 flex relative overflow-hidden bg-[#0e1015]">
        {/* SIDEBAR ESQUERDA - SOMENTE OS ÍCONES SOLICITADOS */}
        <div className="w-48 bg-[#14161d] border-r border-slate-800/80 p-3 flex flex-col justify-between shrink-0 z-20">
          <div>
            <span className="text-[11px] font-semibold text-slate-400 block px-1 mb-3">
              Arraste os ícones
            </span>

            {/* SE ESTIVER NO NÍVEL 1 (MACRO): TAG, TIMER E SEQUÊNCIA LEAD */}
            {viewMode === 'MACRO' ? (
              <div className="space-y-4">
                {/* Tag */}
                <div
                  onClick={() => addMacroBlock('tag')}
                  className="flex flex-col items-center justify-center p-3 rounded-xl bg-[#1b1e27] hover:bg-[#232733] border border-slate-800 hover:border-slate-700 cursor-pointer transition-all group"
                >
                  <TagIcon className="w-6 h-6 text-slate-300 group-hover:text-white mb-1.5 transition-colors" />
                  <span className="text-xs font-medium text-slate-300 group-hover:text-white">Tag</span>
                </div>

                <div className="pt-2 border-t border-slate-800">
                  <span className="text-[10px] text-slate-500 px-1 font-medium block mb-2">
                    Agendamento
                  </span>
                  {/* Timer */}
                  <div
                    onClick={() => addMacroBlock('timer')}
                    className="flex flex-col items-center justify-center p-3 rounded-xl bg-[#1b1e27] hover:bg-[#232733] border border-slate-800 hover:border-slate-700 cursor-pointer transition-all group"
                  >
                    <Clock className="w-6 h-6 text-slate-300 group-hover:text-white mb-1.5 transition-colors" />
                    <span className="text-xs font-medium text-slate-300 group-hover:text-white">Timer</span>
                  </div>
                </div>

                <div className="pt-2 border-t border-slate-800">
                  {/* Sequência Lead */}
                  <div
                    onClick={() => addMacroBlock('sequence_lead')}
                    className="flex flex-col items-center justify-center p-3 rounded-xl bg-[#1b1e27] hover:bg-[#232733] border border-dashed border-red-500/40 hover:border-red-400 cursor-pointer transition-all group"
                  >
                    <div className="flex items-center gap-1 mb-2 text-red-400 group-hover:text-red-300">
                      <div className="w-2 h-2 rounded-full border border-current" />
                      <div className="w-2 h-0.5 bg-current" />
                      <div className="w-1 h-1 rounded-full bg-current" />
                      <div className="w-1 h-1 rounded-full bg-current" />
                      <div className="w-2 h-0.5 bg-current" />
                      <div className="w-2 h-2 rounded-full border border-current" />
                    </div>
                    <span className="text-xs font-semibold text-red-300 group-hover:text-white">
                      Sequência Lead
                    </span>
                  </div>
                </div>
              </div>
            ) : (
              /* SE ESTIVER NO NÍVEL 2 (DENTRO DA SEQUÊNCIA): TIMER, WHATSAPP, E-MAIL */
              <div className="space-y-4">
                <div>
                  <span className="text-[10px] text-slate-500 px-1 font-medium block mb-2">
                    Controladores
                  </span>
                  {/* Timer */}
                  <div
                    onClick={() => addSequenceBlock('timer')}
                    className="flex flex-col items-center justify-center p-3 rounded-xl bg-[#1b1e27] hover:bg-[#232733] border border-slate-800 hover:border-slate-700 cursor-pointer transition-all group"
                  >
                    <Clock className="w-6 h-6 text-slate-300 group-hover:text-white mb-1.5 transition-colors" />
                    <span className="text-xs font-medium text-slate-300 group-hover:text-white">Timer</span>
                  </div>
                </div>

                <div className="pt-2 border-t border-slate-800">
                  <span className="text-[10px] text-slate-500 px-1 font-medium block mb-2">
                    Disparos
                  </span>
                  <div className="space-y-2">
                    {/* WhatsApp */}
                    <div
                      onClick={() => addSequenceBlock('whatsapp')}
                      className="flex flex-col items-center justify-center p-3 rounded-xl bg-[#1b1e27] hover:bg-[#232733] border border-slate-800 hover:border-green-600/60 cursor-pointer transition-all group"
                    >
                      <MessageSquare className="w-6 h-6 text-emerald-400 group-hover:scale-110 mb-1.5 transition-all" />
                      <span className="text-xs font-medium text-slate-300 group-hover:text-white">
                        WhatsApp
                      </span>
                    </div>

                    {/* E-mail */}
                    <div
                      onClick={() => addSequenceBlock('email')}
                      className="flex flex-col items-center justify-center p-3 rounded-xl bg-[#1b1e27] hover:bg-[#232733] border border-slate-800 hover:border-orange-600/60 cursor-pointer transition-all group"
                    >
                      <Mail className="w-6 h-6 text-orange-400 group-hover:scale-110 mb-1.5 transition-all" />
                      <span className="text-xs font-medium text-slate-300 group-hover:text-white">
                        E-mail
                      </span>
                    </div>
                  </div>
                </div>
              </div>
            )}
          </div>

          {/* Dica no rodapé da barra */}
          <div className="p-2.5 rounded-lg bg-[#181a20] border border-slate-800/80 text-[10px] text-slate-400 leading-relaxed">
            {viewMode === 'MACRO' ? (
              <span>💡 Clique na <b>Sequência Lead</b> para entrar e montar os disparos internos.</span>
            ) : (
              <span>💡 Clique em <b>Voltar</b> no topo para salvar e retornar ao fluxo principal.</span>
            )}
          </div>
        </div>

        {/* CANVAS REACT FLOW */}
        <div className="flex-1 h-full relative">
          <ReactFlow
            nodes={viewMode === 'MACRO' ? macroNodes : sequenceNodes}
            edges={viewMode === 'MACRO' ? macroEdges : sequenceEdges}
            onNodesChange={viewMode === 'MACRO' ? onMacroNodesChange : onSequenceNodesChange}
            onEdgesChange={viewMode === 'MACRO' ? onMacroEdgesChange : onSequenceEdgesChange}
            onConnect={viewMode === 'MACRO' ? onMacroConnect : onSequenceConnect}
            onNodeClick={onNodeClick}
            nodeTypes={nodeTypes}
            fitView
            className="bg-[#0e1015]"
          >
            <Background
              color="#2a2e39"
              gap={24}
              size={1}
              variant={BackgroundVariant.Dots}
            />
            <Controls className="!bg-[#181a20] !border-slate-800 !text-slate-300" />
          </ReactFlow>

          {/* ============================================================ */}
          {/* BARRA INFERIOR DE ESTATÍSTICAS DA SEQUÊNCIA (COMO NO PRINT) */}
          {/* ============================================================ */}
          {viewMode === 'SEQUENCE' && (
            <div className="absolute bottom-5 left-1/2 -translate-x-1/2 bg-[#14161d]/90 backdrop-blur-md border border-slate-800/80 px-6 py-2 rounded-2xl shadow-2xl flex items-center gap-8 text-xs text-slate-300 z-10">
              <div className="flex items-center gap-2">
                <MessageSquare className="w-4 h-4 text-emerald-400" />
                <span>
                  <strong className="text-white">2 msg/minuto</strong> Envios de WhatsApp
                </span>
              </div>
              <div className="w-px h-4 bg-slate-800" />
              <div className="flex items-center gap-2">
                <Users className="w-4 h-4 text-indigo-400" />
                <span>
                  <strong className="text-white">0</strong> Leads na sequência
                </span>
              </div>
              <div className="w-px h-4 bg-slate-800" />
              <div className="flex items-center gap-2">
                <XCircle className="w-4 h-4 text-rose-400" />
                <span>
                  <strong className="text-white">0</strong> Leads que saíram da sequência
                </span>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* ============================================================ */}
      {/* MODAL / DRAWER DE CONFIGURAÇÃO DE TAG */}
      {/* ============================================================ */}
      {isTagModalOpen && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-[#181c25] rounded-2xl shadow-2xl border border-slate-800 max-w-md w-full p-6 text-xs text-slate-200">
            <div className="flex items-center justify-between pb-3 border-b border-slate-800">
              <div className="flex items-center gap-2">
                <TagIcon className="w-4 h-4 text-purple-400" />
                <h3 className="font-bold text-white text-sm">Selecionar Tag de Entrada</h3>
              </div>
              <button
                onClick={() => setIsTagModalOpen(false)}
                className="text-slate-400 hover:text-white"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <p className="text-slate-400 text-xs mt-3">
              Qualquer lead que receber esta tag entrará automaticamente na sequência conectada.
            </p>

            <div className="mt-4 space-y-2 max-h-56 overflow-y-auto pr-1">
              {availableTags.length === 0 ? (
                <div className="text-center py-6 text-slate-500">
                  Nenhuma tag cadastrada ainda. Crie uma abaixo:
                </div>
              ) : (
                availableTags.map((t) => (
                  <div
                    key={t.id}
                    onClick={() => handleSelectTag(t)}
                    className="p-3 rounded-xl bg-[#12141a] hover:bg-slate-800/80 border border-slate-800 flex items-center justify-between cursor-pointer transition-all"
                  >
                    <div className="flex items-center gap-2.5">
                      <div className="w-3 h-3 rounded-full" style={{ backgroundColor: t.color }} />
                      <span className="font-semibold text-white">{t.name}</span>
                    </div>
                    <span className="text-[10px] text-slate-400 font-mono">
                      {t._count?.contacts || 0} leads
                    </span>
                  </div>
                ))
              )}
            </div>

            {/* Criar Nova Tag Rápida */}
            {!isCreateTagOpen ? (
              <button
                type="button"
                onClick={() => setIsCreateTagOpen(true)}
                className="w-full mt-3 py-2 border border-dashed border-slate-700 hover:border-purple-500 text-purple-300 rounded-xl text-xs font-semibold flex items-center justify-center gap-1.5 transition-colors"
              >
                <Plus className="w-3.5 h-3.5" />
                <span>Criar Nova Tag</span>
              </button>
            ) : (
              <form onSubmit={handleQuickCreateTag} className="mt-3 p-3 rounded-xl bg-[#12141a] border border-slate-700 space-y-2">
                <input
                  type="text"
                  required
                  value={newTagName}
                  onChange={(e) => setNewTagName(e.target.value)}
                  placeholder="Nome da tag (ex: VIP Lançamento)"
                  className="w-full p-2 bg-[#181c25] border border-slate-700 rounded-lg text-xs text-white focus:outline-none focus:border-purple-500"
                />
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-1.5">
                    {['#8b5cf6', '#10b981', '#f59e0b', '#ef4444', '#3b82f6'].map((c) => (
                      <div
                        key={c}
                        onClick={() => setNewTagColor(c)}
                        style={{ backgroundColor: c }}
                        className={`w-5 h-5 rounded-full cursor-pointer transition-transform ${
                          newTagColor === c ? 'scale-125 ring-2 ring-white' : ''
                        }`}
                      />
                    ))}
                  </div>
                  <div className="flex items-center gap-1.5">
                    <button
                      type="button"
                      onClick={() => setIsCreateTagOpen(false)}
                      className="px-2.5 py-1 text-slate-400 hover:text-white"
                    >
                      Cancelar
                    </button>
                    <button
                      type="submit"
                      className="px-3 py-1 bg-purple-600 hover:bg-purple-500 text-white rounded-lg font-semibold"
                    >
                      Salvar Tag
                    </button>
                  </div>
                </div>
              </form>
            )}

            <div className="pt-4 mt-4 border-t border-slate-800 flex items-center justify-between">
              <button
                onClick={handleDeleteCurrentNode}
                className="text-red-400 hover:text-red-300 flex items-center gap-1 text-xs"
              >
                <Trash2 className="w-3.5 h-3.5" />
                <span>Excluir Gatilho</span>
              </button>
              <button
                onClick={() => setIsTagModalOpen(false)}
                className="px-4 py-1.5 border border-slate-700 hover:bg-slate-800 rounded-lg text-slate-300 font-semibold text-xs"
              >
                Fechar
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ============================================================ */}
      {/* DRAWER / MODAL DE CONFIGURAÇÃO DE MENSAGEM (WHATSAPP & E-MAIL) */}
      {/* ============================================================ */}
      {isMessageDrawerOpen && selectedNode && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-[#181c25] rounded-2xl shadow-2xl border border-slate-800 max-w-lg w-full p-6 text-xs text-slate-200">
            <div className="flex items-center justify-between pb-3 border-b border-slate-800">
              <div className="flex items-center gap-2">
                {selectedNode.type === 'whatsapp' ? (
                  <>
                    <MessageSquare className="w-5 h-5 text-emerald-400" />
                    <div>
                      <h3 className="font-bold text-white text-sm">Disparo de WhatsApp</h3>
                      <p className="text-[11px] text-slate-400">Mensagem que será enviada para o lead</p>
                    </div>
                  </>
                ) : (
                  <>
                    <Mail className="w-5 h-5 text-orange-400" />
                    <div>
                      <h3 className="font-bold text-white text-sm">Disparo de E-mail</h3>
                      <p className="text-[11px] text-slate-400">Assunto e corpo da mensagem</p>
                    </div>
                  </>
                )}
              </div>
              <button
                onClick={() => setIsMessageDrawerOpen(false)}
                className="text-slate-400 hover:text-white"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="mt-4 space-y-3">
              {/* Se for E-mail, pede o assunto */}
              {selectedNode.type === 'email' && (
                <div>
                  <label className="block text-slate-300 font-semibold mb-1">Assunto do E-mail</label>
                  <input
                    type="text"
                    defaultValue={(selectedNode.data.config as any)?.subject || ''}
                    id="email_subject_input"
                    placeholder="Ex: Seu link exclusivo de acesso"
                    className="w-full p-2.5 bg-[#12141a] border border-slate-700 rounded-xl text-xs text-white focus:outline-none focus:border-indigo-500"
                  />
                </div>
              )}

              {/* Mensagem / Conteúdo */}
              <div>
                <label className="block text-slate-300 font-semibold mb-1">
                  {selectedNode.type === 'whatsapp' ? 'Mensagem do WhatsApp' : 'Conteúdo do E-mail'}
                </label>
                <textarea
                  rows={6}
                  id="message_body_input"
                  defaultValue={
                    selectedNode.type === 'whatsapp'
                      ? (selectedNode.data.config as any)?.message ||
                        (selectedNode.data.config as any)?.text ||
                        ''
                      : (selectedNode.data.config as any)?.content || ''
                  }
                  placeholder={
                    selectedNode.type === 'whatsapp'
                      ? 'Olá {{nome}}! Seu link foi liberado: ...'
                      : 'Olá {{nome}},\n\nAqui está o seu acesso...'
                  }
                  className="w-full p-2.5 bg-[#12141a] border border-slate-700 rounded-xl text-xs text-white focus:outline-none focus:border-indigo-500 font-sans leading-relaxed"
                />
              </div>

              {/* Tags de variáveis dinâmicas */}
              <div className="flex items-center gap-1.5 flex-wrap">
                <span className="text-[10px] text-slate-400">Variáveis disponíveis:</span>
                {['{{nome}}', '{{primeiro_nome}}', '{{email}}', '{{telefone}}'].map((v) => (
                  <button
                    key={v}
                    type="button"
                    onClick={() => {
                      const el = document.getElementById('message_body_input') as HTMLTextAreaElement;
                      if (el) {
                        el.value += ` ${v}`;
                      }
                    }}
                    className="px-2 py-0.5 rounded bg-slate-800 hover:bg-slate-700 text-indigo-300 font-mono text-[10px] border border-slate-700"
                  >
                    {v}
                  </button>
                ))}
              </div>
            </div>

            <div className="pt-4 mt-4 border-t border-slate-800 flex items-center justify-between">
              <button
                type="button"
                onClick={handleDeleteCurrentNode}
                className="text-red-400 hover:text-red-300 flex items-center gap-1 text-xs"
              >
                <Trash2 className="w-3.5 h-3.5" />
                <span>Excluir Bloco</span>
              </button>

              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => setIsMessageDrawerOpen(false)}
                  className="px-4 py-2 border border-slate-700 hover:bg-slate-800 rounded-xl text-slate-300 font-semibold"
                >
                  Cancelar
                </button>
                <button
                  type="button"
                  onClick={() => {
                    const bodyEl = document.getElementById('message_body_input') as HTMLTextAreaElement;
                    const subEl = document.getElementById('email_subject_input') as HTMLInputElement;
                    handleSaveMessage(bodyEl?.value || '', subEl?.value || '');
                  }}
                  className="px-5 py-2 bg-indigo-600 hover:bg-indigo-500 text-white rounded-xl font-semibold shadow-lg shadow-indigo-600/30"
                >
                  Salvar Mensagem
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ============================================================ */}
      {/* MODAL AVANÇADO DE CONFIGURAR TIMER (IDÊNTICO AO DAS IMAGENS) */}
      {/* ============================================================ */}
      {isTimerModalOpen && (
        <div className="fixed inset-0 bg-black/70 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-[#181c25] rounded-2xl shadow-2xl border border-slate-800 max-w-lg w-full p-6 text-xs text-slate-200">
            {/* Cabeçalho */}
            <div className="flex items-center justify-between pb-3 border-b border-slate-800">
              <div>
                <span className="text-[10px] text-slate-400 font-mono block">ID - {selectedNode?.id || 'TIMER'}</span>
                <h3 className="font-bold text-white text-base">Configurar Timer</h3>
              </div>
              <button
                onClick={() => setIsTimerModalOpen(false)}
                className="text-slate-400 hover:text-white"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Abas: Tempo contínuo | Data específica */}
            <div className="flex items-center gap-8 border-b border-slate-800 mt-4 text-xs font-semibold">
              <button
                type="button"
                onClick={() => setTimerTab('CONTINUOUS')}
                className={`pb-2.5 relative transition-colors cursor-pointer ${
                  timerTab === 'CONTINUOUS' ? 'text-indigo-400' : 'text-slate-400 hover:text-white'
                }`}
              >
                Tempo contínuo
                {timerTab === 'CONTINUOUS' && (
                  <div className="absolute bottom-0 left-0 right-0 h-0.5 bg-indigo-500 rounded-full" />
                )}
              </button>
              <button
                type="button"
                onClick={() => setTimerTab('SPECIFIC_DATE')}
                className={`pb-2.5 relative transition-colors cursor-pointer ${
                  timerTab === 'SPECIFIC_DATE' ? 'text-indigo-400' : 'text-slate-400 hover:text-white'
                }`}
              >
                Data específica
                {timerTab === 'SPECIFIC_DATE' && (
                  <div className="absolute bottom-0 left-0 right-0 h-0.5 bg-indigo-500 rounded-full" />
                )}
              </button>
            </div>

            {/* Conteúdo Aba Tempo Contínuo */}
            {timerTab === 'CONTINUOUS' ? (
              <div className="mt-4 p-4 rounded-xl bg-[#12141a] border border-slate-800/80 space-y-2">
                <div className="flex items-center gap-2 text-indigo-400 font-semibold text-xs">
                  <Clock className="w-4 h-4" />
                  <span>Selecionar um tempo de espera?</span>
                </div>
                <p className="text-[11px] text-slate-400 leading-tight">
                  O lead irá aguardar um determinado tempo para ser liberado pelo timer.
                </p>
                <div className="flex items-center gap-3 pt-2">
                  <input
                    type="number"
                    min={1}
                    value={timerValue}
                    onChange={(e) => setTimerValue(Math.max(1, parseInt(e.target.value) || 1))}
                    className="w-24 p-2 bg-[#181c25] border border-slate-700 rounded-lg text-white font-bold text-center focus:outline-none focus:border-indigo-500 text-sm"
                  />
                  <select
                    value={timerUnit}
                    onChange={(e) => setTimerUnit(e.target.value as any)}
                    className="flex-1 p-2 bg-[#181c25] border border-slate-700 rounded-lg text-white font-medium focus:outline-none focus:border-indigo-500 text-xs"
                  >
                    <option value="minutes">Minutos</option>
                    <option value="hours">Horas</option>
                    <option value="days">Dias</option>
                  </select>
                </div>
              </div>
            ) : (
              /* Conteúdo Aba Data Específica */
              <div className="mt-4 p-4 rounded-xl bg-[#12141a] border border-slate-800/80 space-y-2">
                <div className="flex items-center gap-2 text-indigo-400 font-semibold text-xs">
                  <Calendar className="w-4 h-4" />
                  <span>Agendar a liberação para um momento específico?</span>
                </div>
                <p className="text-[11px] text-slate-400 leading-tight">
                  O timer vai liberar os leads apenas na data e hora determinada.
                </p>
                <div className="pt-2">
                  <input
                    type="datetime-local"
                    value={timerSpecificDate}
                    onChange={(e) => setTimerSpecificDate(e.target.value)}
                    className="w-full p-2.5 bg-[#181c25] border border-slate-700 rounded-lg text-white focus:outline-none focus:border-indigo-500 font-mono text-xs"
                  />
                </div>
                <div className="pt-2 text-[10px] text-slate-400 space-y-0.5">
                  <span className="font-semibold text-slate-300 block">Fuso horário: SÃO PAULO</span>
                  <span>Esta configuração é aplicada somente para este timer.</span>
                </div>
              </div>
            )}

            {/* Configuração de Intervalo e Dias da Semana */}
            <div className="mt-3 space-y-2">
              <div className="p-3 rounded-xl bg-[#12141a] border border-slate-800/80 flex items-center justify-between">
                <div>
                  <span className="font-semibold text-slate-200 block text-xs">
                    Interromper se a compra for aprovada?
                  </span>
                  <span className="text-[10px] text-slate-400">
                    Se o lead comprar antes, ele não recebe as mensagens restantes deste funil.
                  </span>
                </div>
                <input
                  type="checkbox"
                  checked={timerCancelCondition === 'PURCHASE_APPROVED'}
                  onChange={(e) =>
                    setTimerCancelCondition(e.target.checked ? 'PURCHASE_APPROVED' : 'NONE')
                  }
                  className="w-4 h-4 rounded text-emerald-500 focus:ring-emerald-500"
                />
              </div>

              <div className="p-3 rounded-xl bg-[#12141a] border border-slate-800/80 flex items-center justify-between">
                <div>
                  <span className="font-semibold text-slate-200 block text-xs">
                    Selecionar os dias da semana?
                  </span>
                  <span className="text-[10px] text-slate-400">
                    Determine quais dias o timer pode liberar mensagens.
                  </span>
                </div>
                <input
                  type="checkbox"
                  checked={timerHasWeekDays}
                  onChange={(e) => setTimerHasWeekDays(e.target.checked)}
                  className="w-4 h-4 rounded text-indigo-500 focus:ring-indigo-500"
                />
              </div>

              {timerHasWeekDays && (
                <div className="p-2.5 rounded-xl bg-[#12141a] border border-slate-800 flex items-center justify-center gap-1.5 flex-wrap">
                  {['seg', 'ter', 'qua', 'qui', 'sex', 'sáb', 'dom'].map((day) => {
                    const active = timerWeekDays.includes(day);
                    return (
                      <button
                        key={day}
                        type="button"
                        onClick={() => {
                          if (active) {
                            setTimerWeekDays(timerWeekDays.filter((d) => d !== day));
                          } else {
                            setTimerWeekDays([...timerWeekDays, day]);
                          }
                        }}
                        className={`px-2.5 py-1 rounded-lg text-[10px] font-bold uppercase transition-all ${
                          active
                            ? 'bg-indigo-600 text-white'
                            : 'bg-slate-800 text-slate-400 hover:bg-slate-700'
                        }`}
                      >
                        {day}
                      </button>
                    );
                  })}
                </div>
              )}
            </div>

            {/* Rodapé */}
            <div className="pt-4 mt-4 border-t border-slate-800 flex items-center justify-between">
              <button
                type="button"
                onClick={handleDeleteCurrentNode}
                className="text-red-400 hover:text-red-300 flex items-center gap-1 text-xs"
              >
                <Trash2 className="w-3.5 h-3.5" />
                <span>Excluir Timer</span>
              </button>

              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => setIsTimerModalOpen(false)}
                  className="px-4 py-2 border border-slate-700 hover:bg-slate-800 rounded-xl text-slate-300 font-semibold"
                >
                  Cancelar
                </button>
                <button
                  type="button"
                  onClick={handleSaveTimerConfig}
                  className="px-6 py-2 bg-emerald-600 hover:bg-emerald-500 text-white rounded-xl font-bold uppercase tracking-wider text-xs shadow-lg shadow-emerald-600/30"
                >
                  Salvar
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
