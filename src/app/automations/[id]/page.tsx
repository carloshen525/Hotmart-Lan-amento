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
  RefreshCw,
  RotateCcw,
  Share2,
  Users,
  Flame,
  Search,
  Image as ImageIcon,
  Video as VideoIcon,
  Mic,
  Upload,
  Music,
  FileUp,
  Paperclip,
  FileText,
  Eye,
  Smartphone,
  ExternalLink,
  AlertCircle,
} from 'lucide-react';

import {
  TagNode,
  SequenceLeadNode,
  TimerNode,
  WarmupNode,
  StartNode,
  WhatsAppNode,
  EmailNode,
  formatTimerSummary,
} from '@/components/automation/CustomNodes';
import { EmailBuilderModal } from '@/components/email-builder/EmailBuilderModal';

interface TagItem {
  id: string;
  name: string;
  color: string;
  _count?: { contacts: number };
}

export interface MessageBlock {
  id: string;
  type: 'text' | 'image' | 'video' | 'audio' | 'file';
  text?: string;
  mediaUrl?: string;
  mediaBase64?: string;
  mediaFileName?: string;
  mediaMimeType?: string;
  mediaSize?: number | null;
  caption?: string;
}

// Helper para converter datetime no formato local do navegador
const getLocalDatetimeString = (date: Date = new Date()) => {
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
};

// Helper para interpretar data/hora considerando o fuso horário de Brasília (UTC-3)
function parseTargetDate(dateStr: string): number {
  if (!dateStr) return NaN;
  const clean = dateStr.trim();
  if (/[Z+-]\d{2}(:?\d{2})?$/.test(clean) || clean.endsWith('Z')) {
    return new Date(clean).getTime();
  }
  if (/^\d{4}-\d{2}-\d{2}[T ]\d{2}:\d{2}(:\d{2})?(\.\d+)?$/.test(clean)) {
    const isoWithT = clean.replace(' ', 'T');
    const withOffset = new Date(`${isoWithT}-03:00`).getTime();
    if (!isNaN(withOffset)) return withOffset;
  }
  return new Date(clean).getTime();
}

// Helper para evitar duplicação do telefone no rótulo da linha WhatsApp
function formatWppInstanceLabel(inst: any): string {
  if (!inst) return 'WhatsApp';
  const name = (inst.name || 'WhatsApp').trim();
  const phone = (inst.phone || '').trim();
  if (phone && !name.includes(phone)) {
    return `${name} (${phone})`;
  }
  return name;
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

  // Estatísticas e progresso dos leads em tempo real
  const [realtimeStats, setRealtimeStats] = useState<{
    totalLeads: number;
    activeInSequence: number;
    exitedFromSequence: number;
    nodeStats: Record<string, { leadsCount: number; waitingCount: number; successCount: number; failedCount: number }>;
  }>({
    totalLeads: 0,
    activeInSequence: 0,
    exitedFromSequence: 0,
    nodeStats: {},
  });
  const [isRefreshingStats, setIsRefreshingStats] = useState(false);
  const [lastUpdatedText, setLastUpdatedText] = useState<string | null>(null);

  // Tags disponíveis no expert
  const [availableTags, setAvailableTags] = useState<TagItem[]>([]);

  // Seleção de nó e modais
  const [selectedNode, setSelectedNode] = useState<Node | null>(null);
  const [isTagModalOpen, setIsTagModalOpen] = useState(false);
  const [tagEntryTags, setTagEntryTags] = useState<string[]>([]);
  const [tagExclusionTags, setTagExclusionTags] = useState<string[]>([]);
  const [tagHasDateLimit, setTagHasDateLimit] = useState(false);
  const [tagDateLimit, setTagDateLimit] = useState('');
  const [currentEntrySelect, setCurrentEntrySelect] = useState('');
  const [currentExclusionSelect, setCurrentExclusionSelect] = useState('');
  const [isMessageDrawerOpen, setIsMessageDrawerOpen] = useState(false);
  const [isCreateTagOpen, setIsCreateTagOpen] = useState(false);
  const [newTagName, setNewTagName] = useState('');
  const [newTagColor, setNewTagColor] = useState('#8b5cf6');

  // Configurações de Mídia no WhatsApp (Áudio, Vídeo, Imagem e Legenda)
  const [wppMessageType, setWppMessageType] = useState<'text' | 'image' | 'video' | 'audio'>('text');
  const [wppMediaUrl, setWppMediaUrl] = useState('');
  const [wppMediaBase64, setWppMediaBase64] = useState('');
  const [wppMediaFileName, setWppMediaFileName] = useState('');
  const [wppMediaMimeType, setWppMediaMimeType] = useState('');
  const [wppMediaSize, setWppMediaSize] = useState<number | null>(null);
  const [wppCaption, setWppCaption] = useState('');
  const [wppUploading, setWppUploading] = useState(false);
  const [wppUploadError, setWppUploadError] = useState<string | null>(null);

  // Múltiplos Blocos de Mensagem do WhatsApp (Texto e Arquivos empilhados sem perda de dados)
  const [wppBlocks, setWppBlocks] = useState<MessageBlock[]>([]);
  const [uploadingBlockId, setUploadingBlockId] = useState<string | null>(null);
  const [uploadProgress, setUploadProgress] = useState<Record<string, number>>({});
  const [isActivating, setIsActivating] = useState(false);
  const [showAddBlockMenu, setShowAddBlockMenu] = useState(false);

  // Instâncias / Números de WhatsApp disponíveis no sistema
  const [availableWppInstances, setAvailableWppInstances] = useState<any[]>([]);
  const [selectedWppInstanceId, setSelectedWppInstanceId] = useState<string>('');
  const [flowWhatsappInstanceId, setFlowWhatsappInstanceId] = useState<string>('');
  const [isFlowWppModalOpen, setIsFlowWppModalOpen] = useState(false);
  const [propagateWppToAllNodes, setPropagateWppToAllNodes] = useState(true);

  // Modalidade de Automação (Individual vs Grupo) e Acompanhamento de Grupos
  const [targetType, setTargetType] = useState<'INDIVIDUAL' | 'GROUP'>('INDIVIDUAL');
  const [isGroupPanelOpen, setIsGroupPanelOpen] = useState(false);
  const [groupStats, setGroupStats] = useState<any>(null);
  const [loadingGroupStats, setLoadingGroupStats] = useState(false);
  const [syncingGroups, setSyncingGroups] = useState(false);

  // Construtor Visual de E-mails
  const [isVisualEmailBuilderOpen, setIsVisualEmailBuilderOpen] = useState(false);

  // Modal Avançado de Timer
  const [isTimerModalOpen, setIsTimerModalOpen] = useState(false);
  const [timerTab, setTimerTab] = useState<'CONTINUOUS' | 'SPECIFIC_DATE'>('CONTINUOUS');
  const [timerValue, setTimerValue] = useState<number>(1);
  const [timerUnit, setTimerUnit] = useState<'minutes' | 'hours' | 'days'>('minutes');
  const [timerSpecificDate, setTimerSpecificDate] = useState<string>('');
  const [timerError, setTimerError] = useState<string | null>(null);
  const [timerCancelCondition, setTimerCancelCondition] = useState<'PURCHASE_APPROVED' | 'NONE'>('PURCHASE_APPROVED');
  const [timerHasLimit, setTimerHasLimit] = useState(false);
  const [timerHasInterval, setTimerHasInterval] = useState(false);
  const [timerIntervalStart, setTimerIntervalStart] = useState('08:00');
  const [timerIntervalEnd, setTimerIntervalEnd] = useState('20:00');
  const [timerHasWeekDays, setTimerHasWeekDays] = useState(false);
  const [timerWeekDays, setTimerWeekDays] = useState<string[]>(['seg', 'ter', 'qua', 'qui', 'sex']);

  // Modal de Aquecimento (Throttle / Warmup)
  const [isWarmupModalOpen, setIsWarmupModalOpen] = useState(false);
  const [warmupRateLimit, setWarmupRateLimit] = useState<number>(1);
  const [warmupHasInterval, setWarmupHasInterval] = useState(false);
  const [warmupIntervalStart, setWarmupIntervalStart] = useState('08:00');
  const [warmupIntervalEnd, setWarmupIntervalEnd] = useState('20:00');
  const [warmupHasWeekDays, setWarmupHasWeekDays] = useState(false);
  const [warmupWeekDays, setWarmupWeekDays] = useState<string[]>([
    'Domingo',
    'Segunda-feira',
    'Terça-feira',
    'Quarta-feira',
    'Quinta-feira',
    'Sexta-feira',
    'Sábado',
  ]);
  const [warmupAdvancedOpen, setWarmupAdvancedOpen] = useState(false);

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
      aquecimento: WarmupNode,
      warmup: WarmupNode,
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

  const fetchWppInstances = async () => {
    try {
      const res = await fetch('/api/whatsapp');
      const data = await res.json();
      if (Array.isArray(data.instances)) {
        setAvailableWppInstances(data.instances);
      }
    } catch {}
  };

  const applyStatsToNodeList = useCallback(
    (nodesList: Node[], statsMap: Record<string, any>): Node[] => {
      if (!statsMap || Object.keys(statsMap).length === 0) return nodesList;

      return nodesList.map((node): Node => {
        const s =
          statsMap[node.id] ||
          (node.type === 'start' ? statsMap['seq_start'] : null) || {
            leadsCount: 0,
            waitingCount: 0,
            successCount: 0,
            failedCount: 0,
          };

        let updatedSubflow = node.data?.subflow as any;
        if (updatedSubflow && Array.isArray(updatedSubflow.nodes)) {
          updatedSubflow = {
            ...updatedSubflow,
            nodes: updatedSubflow.nodes.map((subNode: Node): Node => {
              const subS =
                statsMap[subNode.id] ||
                (subNode.type === 'start' ? statsMap['seq_start'] : null) || {
                  leadsCount: 0,
                  waitingCount: 0,
                  successCount: 0,
                  failedCount: 0,
                };
              return {
                ...subNode,
                data: {
                  ...subNode.data,
                  leadsCount: subS.leadsCount,
                  config: {
                    ...((subNode.data?.config as any) || {}),
                    leadsCount: subS.leadsCount,
                    waitingCount: subS.waitingCount,
                    successCount: subS.successCount,
                    failedCount: subS.failedCount,
                  },
                },
              };
            }),
          };
        }

        return {
          ...node,
          data: {
            ...node.data,
            leadsCount: s.leadsCount,
            subflow: updatedSubflow,
            config: {
              ...((node.data?.config as any) || {}),
              leadsCount: s.leadsCount,
              waitingCount: s.waitingCount,
              successCount: s.successCount,
              failedCount: s.failedCount,
            },
          },
        };
      });
    },
    []
  );

  const fetchRealtimeStats = useCallback(async () => {
    setIsRefreshingStats(true);
    try {
      const res = await fetch(`/api/automations/${automationId}/stats`);
      const data = await res.json();
      if (res.ok && data.stats) {
        const stats = data.stats;
        setRealtimeStats(stats);
        const now = new Date();
        const timeStr = now.toLocaleTimeString('pt-BR', {
          hour: '2-digit',
          minute: '2-digit',
          second: '2-digit',
        });
        setLastUpdatedText(`às ${timeStr}`);

        // Atualiza nós no canvas Macro
        setMacroNodes((prev) => applyStatsToNodeList(prev, stats.nodeStats || {}));

        // Atualiza nós no canvas da Sequência
        setSequenceNodes((prev) => applyStatsToNodeList(prev, stats.nodeStats || {}));

        // Se estiver dentro de uma sequência, atualiza a referência local
        if (activeSequenceNode && stats.nodeStats) {
          const seqNodeStat = stats.nodeStats[activeSequenceNode.id];
          if (seqNodeStat) {
            setActiveSequenceNode((prev) =>
              prev
                ? {
                    ...prev,
                    data: {
                      ...prev.data,
                      leadsCount: seqNodeStat.leadsCount,
                      config: {
                        ...(prev.data?.config || {}),
                        leadsCount: seqNodeStat.leadsCount,
                        waitingCount: seqNodeStat.waitingCount,
                        successCount: seqNodeStat.successCount,
                        failedCount: seqNodeStat.failedCount,
                      },
                    },
                  }
                : null
            );
          }
        }
      }
    } catch (err) {
      console.error('Erro ao recarregar estatísticas em tempo real:', err);
    } finally {
      setIsRefreshingStats(false);
    }
  }, [automationId, applyStatsToNodeList, activeSequenceNode]);

  useEffect(() => {
    fetchTags();
    fetchWppInstances();

    // Regra 10: Cache inteligente - recupera dados da sessão instantaneamente
    const cacheKey = `flow_cache_${automationId}`;
    try {
      const cached = sessionStorage.getItem(cacheKey);
      if (cached) {
        const parsed = JSON.parse(cached);
        if (parsed && Array.isArray(parsed.nodes) && parsed.nodes.length > 0) {
          setName(parsed.name || '');
          setStatus(parsed.status || 'DRAFT');
          setMacroNodes(parsed.nodes);
          setMacroEdges(parsed.edges || []);
          setLoading(false);
        }
      }
    } catch {}

    fetch(`/api/automations/${automationId}`)
      .then((res) => res.json())
      .then((data) => {
        if (data.automation) {
          setName(data.automation.name);
          setStatus(data.automation.status);
          setTargetType(data.automation.targetType || 'INDIVIDUAL');

          let parsedTriggerConfig: any = {};
          try {
            parsedTriggerConfig =
              typeof data.automation.triggerConfig === 'string'
                ? JSON.parse(data.automation.triggerConfig)
                : data.automation.triggerConfig || {};
          } catch {}
          if (parsedTriggerConfig?.whatsappInstanceId) {
            setFlowWhatsappInstanceId(parsedTriggerConfig.whatsappInstanceId);
          }

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

          // Atualiza o cache inteligente local
          try {
            sessionStorage.setItem(
              cacheKey,
              JSON.stringify({
                name: data.automation.name,
                status: data.automation.status,
                nodes: parsedNodes,
                edges: parsedEdges,
              })
            );
          } catch {}

          if (data.stats) {
            setRealtimeStats(data.stats);
            const now = new Date();
            const timeStr = now.toLocaleTimeString('pt-BR', {
              hour: '2-digit',
              minute: '2-digit',
            });
            setLastUpdatedText(`às ${timeStr}`);
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

            const initialNodesWithStats = data.stats
              ? applyStatsToNodeList([initialTag, initialSequence], data.stats.nodeStats || {})
              : [initialTag, initialSequence];

            setMacroNodes(initialNodesWithStats);
            setMacroEdges(initialEdges);
          } else {
            // Migra/garante compatibilidade dos tipos de nós para a nova interface
            let normalizedNodes: Node[] = parsedNodes.map((n) => {
              let t = n.type;
              if (t === 'trigger') t = 'tag';
              if (t === 'action') t = 'sequence_lead';
              if (t === 'delay') t = 'timer';
              return { ...n, type: t };
            });

            if (data.stats) {
              normalizedNodes = applyStatsToNodeList(normalizedNodes, data.stats.nodeStats || {});
            }

            setMacroNodes(normalizedNodes);
            setMacroEdges(parsedEdges);
          }
        }
        setLoading(false);
      })
      .catch(() => setLoading(false));
  }, [automationId, applyStatsToNodeList]);

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
        addEdge(
          {
            ...params,
            animated: status === 'ACTIVE',
            style: {
              stroke: status === 'ACTIVE' ? '#22c55e' : '#ffffff',
              strokeWidth: status === 'ACTIVE' ? 2.5 : 2,
              strokeDasharray: status === 'ACTIVE' ? '6 6' : undefined,
            },
          },
          eds
        )
      ),
    [status]
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
        addEdge(
          {
            ...params,
            animated: status === 'ACTIVE',
            style: {
              stroke: status === 'ACTIVE' ? '#22c55e' : '#ffffff',
              strokeWidth: status === 'ACTIVE' ? 2.5 : 2,
              strokeDasharray: status === 'ACTIVE' ? '6 6' : undefined,
            },
          },
          eds
        )
      ),
    [status]
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

    if (realtimeStats.nodeStats && Object.keys(realtimeStats.nodeStats).length > 0) {
      subNodes = applyStatsToNodeList(subNodes, realtimeStats.nodeStats);
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
    if (status === 'ACTIVE') {
      const wantsToPause = confirm(
        'Regra de Edição: Este fluxo está ATIVO em produção.\n\nPara adicionar novos blocos ou editar etapas, a automação precisa ser pausada.\n\nDeseja pausar o fluxo agora para prosseguir com a edição?'
      );
      if (!wantsToPause) return;
      handleSave('PAUSED');
    }

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
          config: { tagName: '', tagNames: [], matchMode: 'ALL', tagColor: '#a855f7', leadsCount: 0 },
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
      openTagModal(newN);
    } else if (type === 'timer') {
      openTimerModal(newN);
    }
  };

  // Adicionar blocos dentro da Sequência (Timer, Aquecimento, WhatsApp, E-mail)
  const addSequenceBlock = (type: 'timer' | 'aquecimento' | 'whatsapp' | 'email') => {
    if (status === 'ACTIVE') {
      const wantsToPause = confirm(
        'Regra de Edição: Este fluxo está ATIVO em produção.\n\nPara adicionar novos blocos ou editar etapas, a automação precisa ser pausada.\n\nDeseja pausar o fluxo agora para prosseguir com a edição?'
      );
      if (!wantsToPause) return;
      handleSave('PAUSED');
    }

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
    } else if (type === 'aquecimento') {
      newN = {
        id,
        type: 'aquecimento',
        position: { x: 340 + Math.random() * 40, y: 100 + sequenceNodes.length * 40 },
        data: {
          label: 'Aquecimento',
          config: {
            rateLimitPerMinute: 1,
            releasesPerMinute: 1,
            hasInterval: false,
            intervalStart: '',
            intervalEnd: '',
            hasWeekDays: false,
            weekDays: [
              'Domingo',
              'Segunda-feira',
              'Terça-feira',
              'Quarta-feira',
              'Quinta-feira',
              'Sexta-feira',
              'Sábado',
            ],
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
    } else if (type === 'aquecimento') {
      openWarmupModal(newN);
    } else {
      openMessageModal(newN);
    }
  };

  // Ativação Segura da Automação com Validações Completas de Aptidão
  const handleActivateAutomation = async () => {
    if (saving || isActivating) return;

    // 1. Validação de Aptidão para Execução
    // 1.1 Nome do fluxo
    if (!name || !name.trim()) {
      setSaveNotice('⚠️ Dê um nome para a automação antes de ativar.');
      setTimeout(() => setSaveNotice(null), 5000);
      return;
    }

    // Obter os nós mais recentes (considerando se está editando subflow de sequência)
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
      setMacroNodes(currentMacroNodes);
      setActiveSequenceNode((prev) =>
        prev
          ? {
              ...prev,
              data: {
                ...prev.data,
                label: sequenceName || prev.data.label,
                subflow: { nodes: sequenceNodes, edges: sequenceEdges },
              },
            }
          : null
      );
    }

    // 1.2 Pelo menos uma Tag / Gatilho de entrada configurado
    const tagNodes = currentMacroNodes.filter((n) => n.type === 'tag' || n.type === 'trigger');
    if (tagNodes.length === 0) {
      setSaveNotice('⚠️ Adicione ao menos um nó de Tag de Entrada no fluxo.');
      setTimeout(() => setSaveNotice(null), 5000);
      return;
    }

    const hasConfiguredTag = tagNodes.some((tn) => {
      const cfg: any = tn.data?.config || {};
      const tags =
        cfg.entryTags && Array.isArray(cfg.entryTags) && cfg.entryTags.length > 0
          ? cfg.entryTags
          : cfg.tagNames && Array.isArray(cfg.tagNames) && cfg.tagNames.length > 0
          ? cfg.tagNames
          : cfg.tagName
          ? [cfg.tagName]
          : (tn.data as any)?.tagName
          ? [(tn.data as any).tagName]
          : [];
      return tags.length > 0;
    });

    if (!hasConfiguredTag) {
      setSaveNotice('⚠️ Configure ao menos uma tag de entrada no nó de Tag.');
      setTimeout(() => setSaveNotice(null), 5000);
      return;
    }

    // 1.3 Pelo menos uma sequência de mensagens conectada ou presente
    const sequenceOrActionNodes = currentMacroNodes.filter(
      (n) => n.type === 'sequence_lead' || n.type === 'whatsapp' || n.type === 'email'
    );
    if (sequenceOrActionNodes.length === 0) {
      setSaveNotice('⚠️ Adicione ao menos uma Sequência de Mensagens no fluxo.');
      setTimeout(() => setSaveNotice(null), 5000);
      return;
    }

    // 1.4 Validação de Timers com data específica no passado
    const nowTime = Date.now();
    let hasPastTimer = false;
    let pastTimerError = '';

    const checkNodeTimer = (node: any) => {
      if (node.type === 'timer' || node.type === 'delay') {
        const cfg: any = node.data?.config || {};
        if (cfg.timerType === 'SPECIFIC_DATE' || cfg.delayType === 'specific_date' || cfg.specificDate) {
          if (!cfg.specificDate) {
            hasPastTimer = true;
            pastTimerError = '⚠️ Existe um timer com data específica não configurada.';
          } else {
            const tDate = parseTargetDate(cfg.specificDate);
            if (isNaN(tDate) || tDate <= nowTime - 60000) {
              hasPastTimer = true;
              pastTimerError = '❌ A data e hora selecionadas no timer já passaram. Escolha um horário futuro.';
            }
          }
        }
      }
    };

    currentMacroNodes.forEach((mn) => {
      checkNodeTimer(mn);
      const subflowNodes = (mn.data as any)?.subflow?.nodes;
      if (subflowNodes && Array.isArray(subflowNodes)) {
        subflowNodes.forEach(checkNodeTimer);
      }
    });

    if (hasPastTimer) {
      setSaveNotice(pastTimerError);
      setTimeout(() => setSaveNotice(null), 6000);
      return;
    }

    // 1.5 Validação Obrigatória de WhatsApp: Se houver nós de WhatsApp no fluxo, é obrigatório selecionar uma linha conectada
    const wppNodesList: any[] = [];
    const collectWpp = (node: any) => {
      if (node.type === 'whatsapp') wppNodesList.push(node);
      if (node.data?.subflow?.nodes && Array.isArray(node.data.subflow.nodes)) {
        node.data.subflow.nodes.forEach(collectWpp);
      }
    };
    currentMacroNodes.forEach(collectWpp);

    if (wppNodesList.length > 0) {
      for (const wn of wppNodesList) {
        const instId = wn.data?.config?.whatsappInstanceId || flowWhatsappInstanceId;
        if (!instId) {
          setSaveNotice('⚠️ Obrigatório selecionar um número de WhatsApp operacional antes de ativar o fluxo.');
          setIsFlowWppModalOpen(true);
          return;
        }
        const foundInst = availableWppInstances.find((i) => i.id === instId);
        if (!foundInst) {
          setSaveNotice('⚠️ O WhatsApp configurado para este fluxo não foi encontrado.');
          setIsFlowWppModalOpen(true);
          return;
        }
        const isOnline = Boolean(foundInst && (foundInst.connected === true || foundInst.status === 'CONNECTED'));
        if (!isOnline) {
          setSaveNotice(`🔴 O WhatsApp "${foundInst?.name || foundInst?.phone || 'Linha'}" está desconectado. Conecte antes de ativar.`);
          setIsFlowWppModalOpen(true);
          return;
        }
      }
    }

    // 2. Transição visual imediata para "Ativando..."
    setIsActivating(true);
    setSaving(true);
    setSaveNotice('Ativando automação...');

    try {
      const res = await fetch(`/api/automations/${automationId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name,
          status: 'ACTIVE',
          forceActivate: true,
          flowWhatsappInstanceId,
          nodes: currentMacroNodes,
          edges: macroEdges,
        }),
      });

      const data = await res.json();

      if (!res.ok || !data.success) {
        throw new Error(data.error || 'Falha ao ativar a automação no servidor.');
      }

      // 3. Atualiza o status para Ativa sem recarregar a página!
      setStatus('ACTIVE');
      setSaveNotice('Automação Ativa com Sucesso!');

      // Atualiza cache de sessão
      const cacheKey = `flow_cache_${automationId}`;
      try {
        sessionStorage.setItem(
          cacheKey,
          JSON.stringify({
            name,
            status: 'ACTIVE',
            nodes: currentMacroNodes,
            edges: macroEdges,
            cachedAt: Date.now(),
          })
        );
      } catch {}

      // Atualiza estatísticas em tempo real
      fetchRealtimeStats();
      setTimeout(() => {
        fetchRealtimeStats();
      }, 1500);
    } catch (err: any) {
      // Caso ocorra algum erro: manter pausada e exibir motivo
      setStatus('PAUSED');
      setSaveNotice(`❌ ${err.message || 'Erro ao ativar automação'}`);
    } finally {
      setIsActivating(false);
      setSaving(false);
      setTimeout(() => {
        setSaveNotice((prev) => (prev?.includes('Ativa com Sucesso') ? null : prev));
      }, 4000);
    }
  };

  // Salvar no Banco de Dados
  const handleSave = async (publishStatus?: string) => {
    if (saving || isActivating) return; // Impede requisições simultâneas
    if (publishStatus === 'ACTIVE') {
      return handleActivateAutomation();
    }
    setSaving(true);
    setSaveNotice(null);
    try {
      const newStatus = publishStatus || status;

      // Regra: Toda edição dentro do fluxo só pode ser feita com ele pausado/desativado.
      // Se a automação estiver ATIVA e o usuário estiver tentando salvar alterações estruturais sem pausar:
      if (status === 'ACTIVE' && newStatus === 'ACTIVE') {
        const wantsToPause = confirm(
          'Regra de Segurança do Fluxo:\n\nToda edição dentro do fluxo só pode ser feita com ele pausado/desativado.\n\nDeseja pausar a automação agora para salvar as suas alterações com segurança?'
        );
        if (!wantsToPause) {
          setSaveNotice('⚠️ A automação precisa ser pausada para salvar alterações.');
          setSaving(false);
          setIsActivating(false);
          return;
        }
        return handleSave('PAUSED');
      }

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
        setMacroNodes(currentMacroNodes);
        setActiveSequenceNode((prev) =>
          prev
            ? {
                ...prev,
                data: {
                  ...prev.data,
                  label: sequenceName || prev.data.label,
                  subflow: { nodes: sequenceNodes, edges: sequenceEdges },
                },
              }
            : null
        );
      }

      const res = await fetch(`/api/automations/${automationId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name,
          status: newStatus,
          flowWhatsappInstanceId,
          nodes: currentMacroNodes,
          edges: macroEdges,
        }),
      });

      const data = await res.json();

      if (res.ok) {
        setStatus(newStatus);
        setSaveNotice(
          newStatus === 'ACTIVE'
            ? 'Automação Ativa!'
            : newStatus === 'PAUSED'
            ? 'Automação Pausada e Salva!'
            : 'Salvo com Sucesso!'
        );
        setTimeout(() => setSaveNotice(null), 3500);

        // Atualização do cache inteligente local (Regra 10)
        try {
          sessionStorage.setItem(`flow_cache_${automationId}`, JSON.stringify({
            name,
            status: newStatus,
            nodes: currentMacroNodes,
            edges: macroEdges,
          }));
        } catch {}

        fetchRealtimeStats();
      } else {
        setSaveNotice(data.error || 'Erro ao salvar alterações');
      }
    } catch {
      setSaveNotice('Erro ao salvar');
    } finally {
      setSaving(false);
      setIsActivating(false);
    }
  };

  // Clique em nó
  const onNodeClick = (_: any, node: Node) => {
    setSelectedNode(node);

    if (viewMode === 'MACRO') {
      if (node.type === 'sequence_lead') {
        openSequenceSubflow(node);
      } else if (node.type === 'tag') {
        openTagModal(node);
      } else if (node.type === 'timer') {
        openTimerModal(node);
      }
    } else {
      if (node.type === 'whatsapp' || node.type === 'email') {
        openMessageModal(node);
      } else if (node.type === 'timer') {
        openTimerModal(node);
      } else if (node.type === 'aquecimento' || node.type === 'warmup') {
        openWarmupModal(node);
      }
    }
  };

  // Salvar WhatsApp padrão do Fluxo
  const handleSaveFlowWhatsapp = async (selectedId: string, propagate: boolean) => {
    setFlowWhatsappInstanceId(selectedId);
    let updatedMacroNodes = [...macroNodes];

    if (propagate && selectedId) {
      const selInst = availableWppInstances.find((i) => i.id === selectedId);
      const updateNodeWpp = (node: any): any => {
        let updated = { ...node };
        if (updated.type === 'whatsapp') {
          updated.data = {
            ...updated.data,
            config: {
              ...(updated.data?.config || {}),
              whatsappInstanceId: selectedId,
              whatsappInstanceName: selInst?.name || undefined,
              whatsappPhone: selInst?.phone || undefined,
            },
          };
        }
        if (updated.data?.subflow?.nodes && Array.isArray(updated.data.subflow.nodes)) {
          updated.data = {
            ...updated.data,
            subflow: {
              ...updated.data.subflow,
              nodes: updated.data.subflow.nodes.map(updateNodeWpp),
            },
          };
        }
        return updated;
      };
      updatedMacroNodes = updatedMacroNodes.map(updateNodeWpp);
      setMacroNodes(updatedMacroNodes);
      if (viewMode === 'SEQUENCE' && activeSequenceNode) {
        const currentSub: any = updatedMacroNodes.find((n) => n.id === activeSequenceNode.id);
        if (currentSub?.data?.subflow?.nodes) {
          setSequenceNodes(currentSub.data.subflow.nodes);
        }
      }
    }

    try {
      await fetch(`/api/automations/${automationId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          flowWhatsappInstanceId: selectedId,
          nodes: updatedMacroNodes,
          edges: macroEdges,
        }),
      });
      setSaveNotice('WhatsApp do Fluxo configurado com sucesso!');
      setTimeout(() => setSaveNotice(null), 4000);
    } catch {}

    setIsFlowWppModalOpen(false);
  };

  // Funções para Painel de Acompanhamento de Grupos
  const fetchGroupStats = async () => {
    setLoadingGroupStats(true);
    try {
      const res = await fetch(`/api/automations/${automationId}/groups`);
      const data = await res.json();
      if (res.ok) {
        setGroupStats(data);
      }
    } catch {}
    setLoadingGroupStats(false);
  };

  const handleSyncAndEnrollGroups = async () => {
    setSyncingGroups(true);
    try {
      const res = await fetch(`/api/automations/${automationId}/groups`, { method: 'POST' });
      const data = await res.json();
      if (res.ok) {
        setSaveNotice(data.message || 'Grupos sincronizados e inscritos no fluxo!');
        setTimeout(() => setSaveNotice(null), 4000);
        await fetchGroupStats();
      } else {
        setSaveNotice(data.error || 'Erro ao sincronizar grupos');
        setTimeout(() => setSaveNotice(null), 4000);
      }
    } catch {
      setSaveNotice('Erro de conexão ao sincronizar grupos');
      setTimeout(() => setSaveNotice(null), 4000);
    }
    setSyncingGroups(false);
  };

  // Aquecimento Modal Handler
  const openWarmupModal = (nodeToConfigure?: Node) => {
    const target = nodeToConfigure || selectedNode;
    if (!target) return;
    const cfg = (target.data.config as any) || {};

    setWarmupRateLimit(Number(cfg.rateLimitPerMinute ?? cfg.releasesPerMinute ?? 1));
    setWarmupHasInterval(!!cfg.hasInterval);
    setWarmupIntervalStart(cfg.intervalStart || '');
    setWarmupIntervalEnd(cfg.intervalEnd || '');
    setWarmupHasWeekDays(!!cfg.hasWeekDays);
    setWarmupWeekDays(
      cfg.weekDays || [
        'Domingo',
        'Segunda-feira',
        'Terça-feira',
        'Quarta-feira',
        'Quinta-feira',
        'Sexta-feira',
        'Sábado',
      ]
    );
    setWarmupAdvancedOpen(false);
    setIsWarmupModalOpen(true);
  };

  const handleSaveWarmupConfig = () => {
    if (!selectedNode) return;

    if (status === 'ACTIVE') {
      const wantsToPause = confirm(
        'Regra de Edição: O fluxo está ATIVO em produção.\n\nPara alterar as configurações desta etapa, a automação precisa ser pausada.\n\nDeseja pausar o fluxo agora para prosseguir com a edição?'
      );
      if (!wantsToPause) return;
      handleSave('PAUSED');
    }

    const updatedCfg: any = {
      ...((selectedNode.data.config as object) || {}),
      rateLimitPerMinute: warmupRateLimit,
      releasesPerMinute: warmupRateLimit,
      hasInterval: warmupHasInterval,
      intervalStart: warmupIntervalStart,
      intervalEnd: warmupIntervalEnd,
      hasWeekDays: warmupHasWeekDays,
      weekDays: warmupWeekDays,
    };

    setSequenceNodes((nds) =>
      nds.map((n) =>
        n.id === selectedNode.id
          ? {
              ...n,
              data: {
                ...n.data,
                config: updatedCfg,
              },
            }
          : n
      )
    );

    setIsWarmupModalOpen(false);
  };

  // Timer Modal Handler
  const openTimerModal = (nodeToConfigure?: Node) => {
    const target = nodeToConfigure || selectedNode;
    if (!target) return;
    setSelectedNode(target);
    const cfg = (target.data.config as any) || {};

    const isSpecific =
      cfg.timerType === 'SPECIFIC_DATE' ||
      cfg.delayType === 'specific_date' ||
      Boolean(cfg.specificDate && cfg.timerType !== 'CONTINUOUS');

    setTimerTab(isSpecific ? 'SPECIFIC_DATE' : 'CONTINUOUS');
    setTimerValue(Number(cfg.value ?? cfg.duration ?? cfg.minutes ?? cfg.delayMinutes ?? 1));
    setTimerUnit(cfg.unit || 'minutes');

    let formattedDate = cfg.specificDate || '';
    if (formattedDate && !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(formattedDate)) {
      try {
        const d = new Date(formattedDate);
        if (!isNaN(d.getTime())) {
          const year = d.getFullYear();
          const month = String(d.getMonth() + 1).padStart(2, '0');
          const day = String(d.getDate()).padStart(2, '0');
          const hours = String(d.getHours()).padStart(2, '0');
          const minutes = String(d.getMinutes()).padStart(2, '0');
          formattedDate = `${year}-${month}-${day}T${hours}:${minutes}`;
        }
      } catch {}
    }
    setTimerSpecificDate(formattedDate);
    setTimerCancelCondition(cfg.cancelCondition || 'PURCHASE_APPROVED');
    setTimerHasLimit(!!cfg.hasLimit);
    setTimerHasInterval(!!cfg.hasInterval);
    setTimerIntervalStart(cfg.intervalStart || '08:00');
    setTimerIntervalEnd(cfg.intervalEnd || '20:00');
    setTimerHasWeekDays(!!cfg.hasWeekDays);
    setTimerWeekDays(cfg.weekDays || ['seg', 'ter', 'qua', 'qui', 'sex']);
    setTimerError(null);

    setIsTimerModalOpen(true);
  };

  const handleSaveTimerConfig = async () => {
    if (!selectedNode) return;

    // Regra 1: Validação de data no passado para Data/Hora Específica
    if (timerTab === 'SPECIFIC_DATE') {
      if (!timerSpecificDate) {
        setTimerError('❌ A data e hora selecionadas já passaram. Escolha um horário futuro.');
        return;
      }
      const selectedTime = parseTargetDate(timerSpecificDate);
      if (isNaN(selectedTime) || selectedTime <= Date.now()) {
        setTimerError('❌ A data e hora selecionadas já passaram. Escolha um horário futuro.');
        return;
      }
    }

    setTimerError(null);

    let nextStatus = status;
    if (status === 'ACTIVE') {
      const wantsToPause = confirm(
        'Regra de Edição: O fluxo está ATIVO em produção.\n\nPara alterar os tempos ou regras deste agendamento, a automação precisa ser pausada.\n\nDeseja pausar o fluxo agora para prosseguir com a edição?'
      );
      if (!wantsToPause) return;
      nextStatus = 'PAUSED';
      setStatus('PAUSED');
    }

    // Regra 4: Limpar completamente configuração anterior ao trocar o tipo de timer
    let updatedCfg: any;
    if (timerTab === 'SPECIFIC_DATE') {
      const baseCfg = { ...((selectedNode.data.config as object) || {}) } as any;
      delete baseCfg.value;
      delete baseCfg.unit;
      delete baseCfg.minutes;
      delete baseCfg.hours;
      delete baseCfg.days;
      delete baseCfg.duration;
      delete baseCfg.delayMinutes;
      delete baseCfg.delayType;

      updatedCfg = {
        ...baseCfg,
        timerType: 'SPECIFIC_DATE',
        specificDate: timerSpecificDate,
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
    } else {
      const baseCfg = { ...((selectedNode.data.config as object) || {}) } as any;
      delete baseCfg.specificDate;
      delete baseCfg.delayType;
      delete baseCfg.targetDate;
      delete baseCfg.targetTime;
      delete baseCfg.timezone;

      updatedCfg = {
        ...baseCfg,
        timerType: 'CONTINUOUS',
        value: timerValue,
        unit: timerUnit,
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
    }

    // Regras 2, 3 e 5: Atualização imediata do card e estado do fluxo
    const summary = formatTimerSummary(updatedCfg);

    const updateInList = (list: Node[]) =>
      list.map((n) =>
        n.id === selectedNode.id
          ? {
              ...n,
              data: {
                ...n.data,
                label: summary,
                config: updatedCfg,
              },
            }
          : n
      );

    let updatedMacroNodes = [...macroNodes];
    if (viewMode === 'MACRO') {
      setMacroNodes(updateInList);
      updatedMacroNodes = updateInList(macroNodes);
    } else {
      setSequenceNodes(updateInList);
      const nextSequenceNodes = updateInList(sequenceNodes);
      if (activeSequenceNode) {
        updatedMacroNodes = updatedMacroNodes.map((m) =>
          m.id === activeSequenceNode.id
            ? {
                ...m,
                data: {
                  ...m.data,
                  subflow: {
                    nodes: nextSequenceNodes,
                    edges: sequenceEdges,
                  },
                },
              }
            : m
        );
        setMacroNodes(updatedMacroNodes);
      }
    }

    setSelectedNode((prev) =>
      prev && prev.id === selectedNode.id
        ? {
            ...prev,
            data: {
              ...prev.data,
              label: summary,
              config: updatedCfg,
            },
          }
        : prev
    );

    setIsTimerModalOpen(false);

    // Persistência imediata no Banco de Dados (Regra 5 e 6)
    try {
      const res = await fetch(`/api/automations/${automationId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          status: nextStatus,
          nodes: updatedMacroNodes,
          edges: macroEdges,
        }),
      });

      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        setSaveNotice(data.error || 'Erro ao persistir timer no banco de dados');
      } else {
        setSaveNotice(
          nextStatus === 'PAUSED' && status === 'ACTIVE'
            ? 'Timer configurado e fluxo pausado com sucesso!'
            : 'Timer configurado e salvo com sucesso!'
        );
        setTimeout(() => setSaveNotice(null), 3000);
      }
    } catch {
      setSaveNotice('Erro de conexão ao salvar timer');
    }
  };

  // Tag Selection Modal Handlers (Idêntico à ferramenta de referência)
  const openTagModal = (nodeToConfigure?: Node) => {
    const target = nodeToConfigure || selectedNode;
    if (!target) return;
    setSelectedNode(target);
    const cfg = (target.data.config as any) || {};

    const existingEntries: string[] =
      cfg.entryTags && Array.isArray(cfg.entryTags) && cfg.entryTags.length > 0
        ? cfg.entryTags
        : cfg.tagNames && Array.isArray(cfg.tagNames) && cfg.tagNames.length > 0
        ? cfg.tagNames
        : cfg.tagName
        ? [cfg.tagName]
        : (target.data as any).tagName
        ? [(target.data as any).tagName]
        : [];

    setTagEntryTags(existingEntries);
    setTagExclusionTags(cfg.exclusionTags || []);
    setTagHasDateLimit(!!cfg.hasDateLimit);
    setTagDateLimit(cfg.dateLimit || '');
    setCurrentEntrySelect('');
    setCurrentExclusionSelect('');
    setIsCreateTagOpen(false);
    setIsTagModalOpen(true);
  };

  const handleAddEntryTag = () => {
    if (!currentEntrySelect.trim()) return;
    if (!tagEntryTags.includes(currentEntrySelect.trim())) {
      setTagEntryTags((prev) => [...prev, currentEntrySelect.trim()]);
    }
    setCurrentEntrySelect('');
  };

  const handleRemoveEntryTag = (name: string) => {
    setTagEntryTags((prev) => prev.filter((t) => t !== name));
  };

  const handleAddExclusionTag = () => {
    if (!currentExclusionSelect.trim()) return;
    if (!tagExclusionTags.includes(currentExclusionSelect.trim())) {
      setTagExclusionTags((prev) => [...prev, currentExclusionSelect.trim()]);
    }
    setCurrentExclusionSelect('');
  };

  const handleRemoveExclusionTag = (name: string) => {
    setTagExclusionTags((prev) => prev.filter((t) => t !== name));
  };

  const handleSaveTagConfig = () => {
    if (!selectedNode) return;

    if (status === 'ACTIVE') {
      const wantsToPause = confirm(
        'Regra de Edição: O fluxo está ATIVO em produção.\n\nPara alterar as tags deste gatilho de entrada, a automação precisa ser pausada.\n\nDeseja pausar o fluxo agora para prosseguir com a edição?'
      );
      if (!wantsToPause) return;
      handleSave('PAUSED');
    }

    const count = availableTags
      .filter((t) => tagEntryTags.includes(t.name))
      .reduce((acc, t) => acc + (t._count?.contacts || 0), 0);

    const updatedCfg: any = {
      ...((selectedNode.data.config as object) || {}),
      entryTags: tagEntryTags,
      tagNames: tagEntryTags,
      tagName: tagEntryTags[0] || '',
      exclusionTags: tagExclusionTags,
      hasDateLimit: tagHasDateLimit,
      dateLimit: tagDateLimit,
      matchMode: 'ALL',
      leadsCount: count,
    };

    setMacroNodes((nds) =>
      nds.map((n) =>
        n.id === selectedNode.id
          ? {
              ...n,
              data: {
                ...n.data,
                tagName: tagEntryTags[0] || '',
                tagNames: tagEntryTags,
                entryTags: tagEntryTags,
                exclusionTags: tagExclusionTags,
                matchMode: 'ALL',
                leadsCount: count,
                config: updatedCfg,
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
        setCurrentEntrySelect(data.tag.name);
        setNewTagName('');
        setIsCreateTagOpen(false);
      }
    } catch {}
  };

  // Abertura e configuração do modal de WhatsApp / E-mail
  const openMessageModal = (nodeToConfigure?: Node) => {
    const target = nodeToConfigure || selectedNode;
    if (!target) return;
    setSelectedNode(target);

    const cfg = (target.data?.config as any) || {};
    if (target.type === 'whatsapp') {
      setSelectedWppInstanceId(cfg.whatsappInstanceId || '');
      fetchWppInstances();
      if (Array.isArray(cfg.blocks) && cfg.blocks.length > 0) {
        setWppBlocks(cfg.blocks);
      } else {
        const initialBlocks: MessageBlock[] = [];
        const legacyText = cfg.message || cfg.text || '';
        const hasMedia = Boolean(cfg.mediaUrl || cfg.mediaBase64);

        if (hasMedia) {
          const detectedType = cfg.messageType || (cfg.mediaMimeType?.startsWith('video/') ? 'video' : cfg.mediaMimeType?.startsWith('audio/') ? 'audio' : 'image');
          initialBlocks.push({
            id: typeof crypto !== 'undefined' && crypto.randomUUID ? crypto.randomUUID() : Math.random().toString(36).substring(2, 9),
            type: detectedType as any,
            mediaUrl: cfg.mediaUrl,
            mediaBase64: cfg.mediaBase64,
            mediaFileName: cfg.mediaFileName,
            mediaMimeType: cfg.mediaMimeType,
            mediaSize: cfg.mediaSize,
            caption: cfg.caption || '',
          });
          if (legacyText && legacyText !== cfg.caption) {
            initialBlocks.unshift({
              id: typeof crypto !== 'undefined' && crypto.randomUUID ? crypto.randomUUID() : Math.random().toString(36).substring(2, 9),
              type: 'text',
              text: legacyText,
            });
          }
        } else {
          initialBlocks.push({
            id: typeof crypto !== 'undefined' && crypto.randomUUID ? crypto.randomUUID() : Math.random().toString(36).substring(2, 9),
            type: 'text',
            text: legacyText,
          });
        }
        setWppBlocks(initialBlocks);
      }
      setWppUploadError(null);
      setShowAddBlockMenu(false);
    }
    setIsMessageDrawerOpen(true);
  };

  // Funções de manipulação de blocos de mensagem (Texto & Arquivos)
  const handleAddTextBlock = () => {
    setWppBlocks((prev) => [
      ...prev,
      {
        id: typeof crypto !== 'undefined' && crypto.randomUUID ? crypto.randomUUID() : Math.random().toString(36).substring(2, 9),
        type: 'text',
        text: '',
      },
    ]);
    setShowAddBlockMenu(false);
  };

  const handleAddMediaBlock = (mediaType: 'image' | 'video' | 'audio' | 'file' = 'image') => {
    setWppBlocks((prev) => [
      ...prev,
      {
        id: typeof crypto !== 'undefined' && crypto.randomUUID ? crypto.randomUUID() : Math.random().toString(36).substring(2, 9),
        type: mediaType,
        caption: '',
      },
    ]);
    setShowAddBlockMenu(false);
  };

  const handleRemoveBlock = (blockId: string) => {
    setWppBlocks((prev) => {
      const filtered = prev.filter((b) => b.id !== blockId);
      return filtered.length > 0
        ? filtered
        : [
            {
              id: typeof crypto !== 'undefined' && crypto.randomUUID ? crypto.randomUUID() : Math.random().toString(36).substring(2, 9),
              type: 'text',
              text: '',
            },
          ];
    });
  };

  const handleUpdateBlockText = (blockId: string, text: string) => {
    setWppBlocks((prev) =>
      prev.map((b) => (b.id === blockId ? { ...b, text } : b))
    );
  };

  const handleUpdateBlockCaption = (blockId: string, caption: string) => {
    setWppBlocks((prev) =>
      prev.map((b) => (b.id === blockId ? { ...b, caption } : b))
    );
  };

  const handleInsertVariableInBlock = (blockId: string, field: 'text' | 'caption', variable: string) => {
    setWppBlocks((prev) =>
      prev.map((b) => {
        if (b.id !== blockId) return b;
        const currentVal = (b as any)[field] || '';
        return {
          ...b,
          [field]: currentVal ? `${currentVal} ${variable}` : variable,
        };
      })
    );
  };

  const handleUpdateBlockType = (blockId: string, newType: 'image' | 'video' | 'audio' | 'file') => {
    setWppBlocks((prev) =>
      prev.map((b) => (b.id === blockId ? { ...b, type: newType } : b))
    );
  };

  // Upload desacoplado em segundo plano com barra de progresso (Regras 2, 7, 8 e 11)
  const handleBlockFileUpload = (blockId: string, e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setUploadingBlockId(blockId);
    setUploadProgress((prev) => ({ ...prev, [blockId]: 0 }));
    setWppUploadError(null);

    // Pré-visualização instantânea local leve via Object URL (zero custo de memória)
    const previewBlobUrl = URL.createObjectURL(file);

    let autoType: 'image' | 'video' | 'audio' | 'file' = 'file';
    if (file.type?.startsWith('image/')) autoType = 'image';
    else if (file.type?.startsWith('video/')) autoType = 'video';
    else if (file.type?.startsWith('audio/') || file.name.match(/\.(mp3|wav|ogg|m4a|aac)$/i)) autoType = 'audio';

    setWppBlocks((prev) =>
      prev.map((b) =>
        b.id === blockId
          ? {
              ...b,
              type: autoType,
              mediaUrl: previewBlobUrl,
              mediaFileName: file.name,
              mediaSize: file.size,
              mediaMimeType: file.type,
            }
          : b
      )
    );

    // Upload assíncrono desacoplado via XHR com rastreamento real de progresso
    const xhr = new XMLHttpRequest();
    const formData = new FormData();
    formData.append('file', file);

    xhr.upload.onprogress = (evt) => {
      if (evt.lengthComputable) {
        const percent = Math.round((evt.loaded / evt.total) * 100);
        setUploadProgress((prev) => ({ ...prev, [blockId]: percent }));
      }
    };

    xhr.onload = () => {
      try {
        if (xhr.status >= 200 && xhr.status < 300) {
          const data = JSON.parse(xhr.responseText);
          if (data.success && data.url) {
            URL.revokeObjectURL(previewBlobUrl);
            setWppBlocks((prev) =>
              prev.map((b) =>
                b.id === blockId
                  ? {
                      ...b,
                      type: data.mediaType || autoType,
                      mediaId: data.mediaId,
                      mediaUrl: data.url,
                      mediaFileName: data.fileName,
                      mediaMimeType: data.mimeType,
                      mediaSize: data.fileSize,
                      mediaBase64: undefined, // Nunca persiste base64
                    }
                  : b
              )
            );
          } else {
            throw new Error(data.error || 'Falha no upload do arquivo');
          }
        } else {
          throw new Error('Falha no upload do arquivo');
        }
      } catch (err: any) {
        setWppUploadError(err.message || 'Erro ao carregar arquivo');
      } finally {
        setUploadingBlockId(null);
      }
    };

    xhr.onerror = () => {
      setWppUploadError('Erro de conexão ao carregar arquivo');
      setUploadingBlockId(null);
    };

    xhr.open('POST', '/api/whatsapp/upload');
    xhr.send(formData);
  };

  const handleClearBlockMedia = (blockId: string) => {
    setWppBlocks((prev) =>
      prev.map((b) =>
        b.id === blockId
          ? {
              ...b,
              mediaUrl: undefined,
              mediaBase64: undefined,
              mediaFileName: undefined,
              mediaMimeType: undefined,
              mediaSize: null,
            }
          : b
      )
    );
  };

  // Salvar mensagem de WhatsApp ou E-mail (Regra 5 e 7: salva apenas referências, sem Base64)
  const handleSaveMessage = (legacyMessageText?: string, emailSubject?: string) => {
    if (!selectedNode) return;

    if (status === 'ACTIVE') {
      const wantsToPause = confirm(
        'Regra de Edição: O fluxo está ATIVO em produção.\n\nPara alterar o conteúdo e mensagens desta etapa, a automação precisa ser pausada.\n\nDeseja pausar a automação agora para prosseguir com a edição?'
      );
      if (!wantsToPause) return;
      handleSave('PAUSED');
    }

    setSequenceNodes((nds) =>
      nds.map((n) => {
        if (n.id === selectedNode.id) {
          const isWpp = n.type === 'whatsapp';
          if (isWpp) {
            // Expurgar Base64 de todos os blocos antes de persistir
            const sanitizedBlocks = wppBlocks.map((b) => {
              const { mediaBase64, ...rest } = b;
              return rest;
            });

            const firstMedia = sanitizedBlocks.find((b) => b.type !== 'text');
            const firstText = sanitizedBlocks.find((b) => b.type === 'text');
            const selectedInst = availableWppInstances.find((i) => i.id === selectedWppInstanceId);

            const nextCfg: any = {
              ...((n.data.config as object) || {}),
              whatsappInstanceId: selectedWppInstanceId || undefined,
              whatsappInstanceName: selectedInst?.name || undefined,
              whatsappPhone: selectedInst?.phone || undefined,
              blocks: sanitizedBlocks,
              messageType: firstMedia ? firstMedia.type : 'text',
              mediaUrl: firstMedia?.mediaUrl,
              mediaMimeType: firstMedia?.mediaMimeType,
              mediaFileName: firstMedia?.mediaFileName,
              mediaSize: firstMedia?.mediaSize,
              caption: firstMedia?.caption,
              message: firstText?.text || firstMedia?.caption || '[Mensagem WhatsApp]',
              text: firstText?.text || firstMedia?.caption || '[Mensagem WhatsApp]',
            };
            delete nextCfg.mediaBase64;

            return {
              ...n,
              data: {
                ...n.data,
                config: nextCfg,
              },
            };
          } else {
            return {
              ...n,
              data: {
                ...n.data,
                config: {
                  ...((n.data.config as object) || {}),
                  subject: emailSubject,
                  content: legacyMessageText,
                },
              },
            };
          }
        }
        return n;
      })
    );
    setIsMessageDrawerOpen(false);
  };

  // Deletar nó selecionado
  const handleDeleteCurrentNode = () => {
    if (!selectedNode) return;
    if (status === 'ACTIVE') {
      const wantsToPause = confirm(
        'Regra de Edição: Este fluxo está ATIVO em produção.\n\nPara excluir etapas, a automação precisa ser pausada.\n\nDeseja pausar o fluxo agora para prosseguir com a exclusão?'
      );
      if (!wantsToPause) return;
      handleSave('PAUSED');
    }
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

  // Conexões estilizadas conforme o status da automação (ATIVO: pontilhado verde em movimento; DESATIVADO: linha branca contínua)
  const isFlowActive = status === 'ACTIVE';

  const formatEdgesWithFlowState = useCallback(
    (edgesList: Edge[]): Edge[] => {
      return edgesList.map((edge) => {
        if (isFlowActive) {
          return {
            ...edge,
            animated: true,
            style: {
              ...edge.style,
              stroke: '#22c55e',
              strokeWidth: 2.5,
              strokeDasharray: '6 6',
            },
          };
        } else {
          return {
            ...edge,
            animated: false,
            style: {
              ...edge.style,
              stroke: '#ffffff',
              strokeWidth: 2,
              strokeDasharray: undefined,
            },
          };
        }
      });
    },
    [isFlowActive]
  );

  const displayEdges = useMemo(() => {
    const currentList = viewMode === 'MACRO' ? macroEdges : sequenceEdges;
    return formatEdgesWithFlowState(currentList);
  }, [viewMode, macroEdges, sequenceEdges, formatEdgesWithFlowState]);

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
          {/* Switch Único Ativar / Desativar para o Fluxo Inteiro */}
          <div className="flex items-center gap-2 bg-[#1b1e27] px-3 py-1 rounded-full border border-slate-800">
            <span
              className={`text-[11px] font-semibold ${
                status === 'ACTIVE'
                  ? 'text-emerald-400'
                  : 'text-amber-400'
              }`}
            >
              {isActivating ? 'Ativando...' : status === 'ACTIVE' ? 'Fluxo Ativo' : 'Fluxo Pausado'}
            </span>
            <button
              type="button"
              disabled={saving || isActivating}
              onClick={() => {
                const nextStatus = status === 'ACTIVE' ? 'PAUSED' : 'ACTIVE';
                handleSave(nextStatus);
              }}
              className={`w-9 h-5 flex items-center rounded-full p-0.5 transition-colors cursor-pointer ${
                status === 'ACTIVE'
                  ? 'bg-emerald-500'
                  : 'bg-slate-700'
              } ${saving || isActivating ? 'opacity-50 cursor-not-allowed' : ''}`}
              title={
                status === 'ACTIVE'
                  ? 'Clique para pausar todo o fluxo e permitir edições'
                  : 'Clique para ativar todo o fluxo e processar os leads'
              }
            >
              <div
                className={`bg-white w-4 h-4 rounded-full shadow-md transform transition-transform ${
                  status === 'ACTIVE'
                    ? 'translate-x-4'
                    : 'translate-x-0'
                }`}
              />
            </button>
          </div>

          {/* Botão Atualizar (Recarregar em Tempo Real o avanço dos leads no fluxo) */}
          <button
            type="button"
            onClick={fetchRealtimeStats}
            disabled={isRefreshingStats}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl border border-slate-700/80 bg-[#1b1e27] hover:bg-[#232733] hover:border-sky-500/50 text-slate-200 text-xs font-semibold transition-all cursor-pointer shadow-md active:scale-95 group disabled:opacity-60"
            title="Recarregar e ver o avanço dos leads em tempo real em cada etapa do fluxo"
          >
            <RefreshCw
              className={`w-3.5 h-3.5 text-sky-400 transition-transform duration-500 ${
                isRefreshingStats ? 'animate-spin text-sky-300' : 'group-hover:rotate-180'
              }`}
            />
            <span>{isRefreshingStats ? 'Atualizando...' : 'Atualizar'}</span>
            {lastUpdatedText && (
              <span className="text-[10px] text-slate-400 font-normal hidden md:inline border-l border-slate-700/80 pl-1.5">
                {lastUpdatedText}
              </span>
            )}
          </button>

          {/* Feedback de salvamento */}
          {saveNotice && (
            <span className="text-xs font-semibold text-emerald-400 bg-emerald-950/60 px-3 py-1 rounded-full border border-emerald-500/30">
              {saveNotice}
            </span>
          )}

          {/* Indicador de Modalidade de Grupos e Botão do Painel de Grupos */}
          {targetType === 'GROUP' && (
            <>
              <span className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl border border-purple-500/50 bg-purple-950/60 text-purple-300 text-xs font-semibold">
                <Users className="w-3.5 h-3.5 text-purple-400" />
                <span>Automação em Grupos</span>
              </span>

              <button
                type="button"
                onClick={() => {
                  setIsGroupPanelOpen(true);
                  fetchGroupStats();
                }}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl border border-purple-500/60 bg-[#1e152e] hover:bg-[#281c3e] text-purple-200 text-xs font-semibold transition-all cursor-pointer shadow-md shadow-purple-950/30"
                title="Abrir painel de acompanhamento dos grupos inscritos nesta automação"
              >
                <Layers className="w-3.5 h-3.5 text-purple-400" />
                <span>Painel de Grupos</span>
              </button>
            </>
          )}

          {/* Botão WhatsApp do Fluxo */}
          <button
            type="button"
            onClick={() => setIsFlowWppModalOpen(true)}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl border text-xs font-semibold transition-all cursor-pointer ${
              flowWhatsappInstanceId
                ? 'border-emerald-500/50 bg-emerald-950/60 text-emerald-300 hover:bg-emerald-900/60'
                : 'border-amber-500/50 bg-amber-950/50 text-amber-300 hover:bg-amber-900/50'
            }`}
            title="Configurar o número de WhatsApp responsável por este fluxo"
          >
            <Smartphone className="w-3.5 h-3.5 text-emerald-400" />
            <span>
              {flowWhatsappInstanceId
                ? `WhatsApp: ${formatWppInstanceLabel(availableWppInstances.find((i) => i.id === flowWhatsappInstanceId))}`
                : 'WhatsApp do Fluxo'}
            </span>
          </button>

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

      {/* Banner de Modo de Edição / Produção */}
      {status === 'ACTIVE' ? (
        <div className="bg-emerald-950/40 border-b border-emerald-500/20 px-6 py-2.5 flex items-center justify-between text-xs text-emerald-200">
          <div className="flex items-center gap-2.5">
            <span className="w-2.5 h-2.5 rounded-full bg-emerald-400 animate-pulse shadow-sm shadow-emerald-400/50" />
            <span className="font-bold text-emerald-300 uppercase tracking-wider text-[11px]">Fluxo Ativo:</span>
            <span className="text-slate-300">
              O fluxo está operando normalmente. Para alterar nós, mensagens ou sequências, você precisa pausar a automação. Leads que já receberam mensagens não receberão novamente.
            </span>
          </div>
          <button
            type="button"
            onClick={() => handleSave('PAUSED')}
            disabled={saving}
            className="flex items-center gap-1.5 px-3 py-1 bg-amber-500/20 hover:bg-amber-500/30 text-amber-300 border border-amber-500/40 rounded-lg font-semibold transition-all cursor-pointer shadow-sm active:scale-95"
            title="Pausar o fluxo para permitir edições com segurança"
          >
            <span>⏸️ Pausar para Editar</span>
          </button>
        </div>
      ) : (
        <div className="bg-amber-950/30 border-b border-amber-500/20 px-6 py-2.5 flex items-center justify-between text-xs text-amber-200">
          <div className="flex items-center gap-2.5">
            <span className="w-2.5 h-2.5 rounded-full bg-amber-400" />
            <span className="font-bold text-amber-300 uppercase tracking-wider text-[11px]">Modo de Edição (Pausado):</span>
            <span className="text-slate-300">
              O fluxo está pausado. Você pode alterar mensagens, adicionar ou conectar novas etapas. Ao terminar, ative para retomar os disparos normalmente.
            </span>
          </div>
          <button
            type="button"
            onClick={handleActivateAutomation}
            disabled={saving || isActivating}
            className="flex items-center gap-2 px-3.5 py-1 bg-emerald-600 hover:bg-emerald-500 text-white rounded-lg font-semibold transition-all cursor-pointer shadow-md shadow-emerald-600/30 active:scale-95 disabled:opacity-50 disabled:cursor-not-allowed"
            title="Ativar o fluxo para processar os leads normalmente"
          >
            {isActivating ? (
              <>
                <RefreshCw className="w-3.5 h-3.5 animate-spin text-white" />
                <span>Ativando...</span>
              </>
            ) : (
              <span>▶️ Ativar Automação</span>
            )}
          </button>
        </div>
      )}

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
                  <div className="grid grid-cols-2 gap-2">
                    {/* Timer */}
                    <div
                      onClick={() => addSequenceBlock('timer')}
                      className="flex flex-col items-center justify-center p-3 rounded-xl bg-[#1b1e27] hover:bg-[#232733] border border-slate-800 hover:border-slate-700 cursor-pointer transition-all group"
                      title="Temporizador: programa a espera ou horário de disparo"
                    >
                      <Clock className="w-5 h-5 text-slate-300 group-hover:text-white mb-1.5 transition-colors" />
                      <span className="text-[11px] font-medium text-slate-300 group-hover:text-white">Timer</span>
                    </div>

                    {/* Aquecimento */}
                    <div
                      onClick={() => addSequenceBlock('aquecimento')}
                      className="flex flex-col items-center justify-center p-3 rounded-xl bg-[#1b1e27] hover:bg-[#232733] border border-slate-800 hover:border-rose-500/50 cursor-pointer transition-all group"
                      title="AQUECIMENTO: Cria uma limitação controlada no fluxo de leads reduzindo o volume de disparos por minuto, ideal para aquecimento de e-mails ou WhatsApp."
                    >
                      <Flame className="w-5 h-5 text-rose-400 fill-rose-400 group-hover:scale-110 mb-1.5 transition-all" />
                      <span className="text-[11px] font-medium text-slate-300 group-hover:text-white">Aquecimento</span>
                    </div>
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

                    {/* Botão Configurar WhatsApp do Fluxo */}
                    <div
                      onClick={() => setIsFlowWppModalOpen(true)}
                      className="flex flex-col items-center justify-center p-2.5 rounded-xl bg-emerald-950/30 hover:bg-emerald-900/40 border border-emerald-500/40 hover:border-emerald-500/70 cursor-pointer transition-all group mt-2"
                      title="Configurar qual número de WhatsApp é o responsável por enviar as mensagens deste fluxo"
                    >
                      <Smartphone className="w-5 h-5 text-emerald-400 group-hover:scale-110 mb-1 transition-all" />
                      <span className="text-[10px] font-semibold text-emerald-300 group-hover:text-white text-center leading-tight">
                        WhatsApp do Fluxo
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
            edges={displayEdges}
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
                  <strong className="text-white">{realtimeStats.activeInSequence}</strong> Leads na sequência
                </span>
              </div>
              <div className="w-px h-4 bg-slate-800" />
              <div className="flex items-center gap-2">
                <XCircle className="w-4 h-4 text-rose-400" />
                <span>
                  <strong className="text-white">{realtimeStats.exitedFromSequence}</strong> Leads que saíram da sequência
                </span>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* ============================================================ */}
      {/* MODAL DE CONFIGURAÇÃO DE TAG (IDÊNTICO À FERRAMENTA DE REFERÊNCIA) */}
      {/* ============================================================ */}
      {isTagModalOpen && (
        <div className="fixed inset-0 bg-black/75 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-[#12141a] rounded-2xl shadow-2xl border border-[#232734] max-w-lg w-full p-6 text-xs text-slate-200">
            {/* Header: ID - xxx | Configurar Tag + Ícones à direita */}
            <div className="flex items-start justify-between pb-4 border-b border-slate-800/80">
              <div>
                <h3 className="font-bold text-white text-base tracking-wide">
                  ID - {selectedNode?.id?.replace(/[^0-9]/g, '').slice(-7) || '8719590'}
                </h3>
                <p className="text-slate-400 text-xs mt-0.5">Configurar Tag</p>
              </div>
              <div className="flex items-center gap-3">
                <button
                  type="button"
                  title="Histórico de alterações"
                  className="text-slate-400 hover:text-white transition-colors"
                >
                  <RotateCcw className="w-4 h-4" />
                </button>
                <div className="relative group">
                  <div className="absolute -top-7 left-1/2 -translate-x-1/2 bg-black px-2 py-0.5 rounded text-[10px] font-bold text-white shadow pointer-events-none opacity-0 group-hover:opacity-100 transition-opacity whitespace-nowrap">
                    Tutorial
                  </div>
                  <button
                    type="button"
                    title="Tutorial"
                    className="text-slate-400 hover:text-white transition-colors"
                  >
                    <HelpCircle className="w-4 h-4" />
                  </button>
                </div>
                <button
                  type="button"
                  title="Duplicar nó"
                  className="text-slate-400 hover:text-white transition-colors"
                >
                  <Copy className="w-4 h-4" />
                </button>
                <button
                  type="button"
                  onClick={() => setIsTagModalOpen(false)}
                  className="text-slate-400 hover:text-white transition-colors ml-1"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>
            </div>

            {/* Card: Agendar data e hora limite? */}
            <div className="mt-4 p-3.5 rounded-xl bg-[#0e1726]/70 border border-cyan-900/40">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className="w-8 h-8 rounded-full bg-cyan-950/80 border border-cyan-800/50 flex items-center justify-center text-cyan-400">
                    <Clock className="w-4 h-4" />
                  </div>
                  <div>
                    <h4 className="font-semibold text-white text-xs">Agendar data e hora limite?</h4>
                    <p className="text-slate-400 text-[11px] mt-0.5">
                      A etapa vai liberar os leads até uma data e hora determinada.
                    </p>
                  </div>
                </div>
                <label className="relative inline-flex items-center cursor-pointer">
                  <input
                    type="checkbox"
                    checked={tagHasDateLimit}
                    onChange={(e) => setTagHasDateLimit(e.target.checked)}
                    className="sr-only peer"
                  />
                  <div className="w-11 h-6 bg-slate-800 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-cyan-600"></div>
                </label>
              </div>

              {tagHasDateLimit && (
                <div className="mt-3 pt-3 border-t border-cyan-900/40">
                  <label className="text-[11px] text-slate-300 block mb-1">Data e hora limite de liberação:</label>
                  <input
                    type="datetime-local"
                    value={tagDateLimit}
                    onChange={(e) => setTagDateLimit(e.target.value)}
                    className="w-full p-2 bg-[#101217] border border-cyan-900/50 rounded-lg text-xs text-white focus:outline-none focus:border-cyan-500"
                  />
                </div>
              )}
            </div>

            {/* Seção 1: Tag(s) de entrada dos leads */}
            <div className="mt-5 space-y-1.5">
              <h4 className="font-bold text-white text-xs">Tag(s) de entrada dos leads</h4>
              <p className="text-slate-400 text-[11px]">
                Para o lead entrar nesta tag, o mesmo deve possuir TODAS as tags abaixo, simultaneamente.
              </p>

              <div className="flex items-center gap-2 pt-1">
                <select
                  value={currentEntrySelect}
                  onChange={(e) => setCurrentEntrySelect(e.target.value)}
                  className="flex-1 bg-[#101217] border border-[#2b2b3b] hover:border-slate-600 rounded-xl px-3 py-2.5 text-xs text-white focus:outline-none focus:border-purple-500 transition-colors"
                >
                  <option value="" disabled>
                    Selecione uma tag para adicionar...
                  </option>
                  {availableTags.map((t) => (
                    <option key={t.id} value={t.name}>
                      {t.name} ({t._count?.contacts || 0} leads)
                    </option>
                  ))}
                </select>

                <button
                  type="button"
                  onClick={handleAddEntryTag}
                  disabled={!currentEntrySelect}
                  className="w-10 h-10 border border-[#2b2b3b] hover:border-purple-500 hover:bg-[#1a1c24] rounded-xl flex items-center justify-center text-slate-200 hover:text-white text-lg font-bold bg-[#101217] transition-all disabled:opacity-40 disabled:cursor-not-allowed"
                >
                  +
                </button>
              </div>

              {/* Tags de entrada adicionadas */}
              {tagEntryTags.length > 0 && (
                <div className="flex flex-wrap gap-1.5 pt-2">
                  {tagEntryTags.map((name) => {
                    const tagObj = availableTags.find((t) => t.name === name);
                    return (
                      <span
                        key={name}
                        className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-[#181c25] text-purple-200 border border-purple-800/60 text-xs font-semibold shadow-sm"
                      >
                        <span
                          className="w-2 h-2 rounded-full"
                          style={{ backgroundColor: tagObj?.color || '#a855f7' }}
                        />
                        <span>{name}</span>
                        <button
                          type="button"
                          onClick={() => handleRemoveEntryTag(name)}
                          className="text-slate-400 hover:text-red-400 transition-colors ml-1"
                        >
                          <X className="w-3.5 h-3.5" />
                        </button>
                      </span>
                    );
                  })}
                </div>
              )}
            </div>

            {/* Seção 2: Tag(s) que impossibilitam a entrada dos leads */}
            <div className="mt-5 space-y-1.5">
              <h4 className="font-bold text-white text-xs">
                Tag(s) que impossibilitam a entrada dos leads
              </h4>
              <p className="text-slate-400 text-[11px]">
                Se o lead possuir TODAS as tags abaixo, ele não entrará nesta etapa.
              </p>

              <div className="flex items-center gap-2 pt-1">
                <select
                  value={currentExclusionSelect}
                  onChange={(e) => setCurrentExclusionSelect(e.target.value)}
                  className="flex-1 bg-[#101217] border border-[#2b2b3b] hover:border-slate-600 rounded-xl px-3 py-2.5 text-xs text-white focus:outline-none focus:border-red-500 transition-colors"
                >
                  <option value="" disabled>
                    Selecione uma tag que impossibilita a entrada...
                  </option>
                  {availableTags.map((t) => (
                    <option key={t.id} value={t.name}>
                      {t.name} ({t._count?.contacts || 0} leads)
                    </option>
                  ))}
                </select>

                <button
                  type="button"
                  onClick={handleAddExclusionTag}
                  disabled={!currentExclusionSelect}
                  className="w-10 h-10 border border-[#2b2b3b] hover:border-red-500 hover:bg-[#1a1c24] rounded-xl flex items-center justify-center text-slate-200 hover:text-white text-lg font-bold bg-[#101217] transition-all disabled:opacity-40 disabled:cursor-not-allowed"
                >
                  +
                </button>
              </div>

              {/* Tags de exclusão adicionadas */}
              {tagExclusionTags.length > 0 && (
                <div className="flex flex-wrap gap-1.5 pt-2">
                  {tagExclusionTags.map((name) => (
                    <span
                      key={name}
                      className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-red-950/40 text-red-200 border border-red-800/60 text-xs font-semibold shadow-sm"
                    >
                      <span>Bloquear se possuir: {name}</span>
                      <button
                        type="button"
                        onClick={() => handleRemoveExclusionTag(name)}
                        className="text-slate-400 hover:text-white transition-colors ml-1"
                      >
                        <X className="w-3.5 h-3.5" />
                      </button>
                    </span>
                  ))}
                </div>
              )}
            </div>

            {/* Criar Nova Tag Rápida */}
            <div className="mt-4 pt-3 border-t border-slate-800/70">
              {!isCreateTagOpen ? (
                <button
                  type="button"
                  onClick={() => setIsCreateTagOpen(true)}
                  className="w-full py-2 border border-dashed border-slate-700 hover:border-purple-500 text-purple-300 rounded-xl text-xs font-semibold flex items-center justify-center gap-1.5 transition-colors"
                >
                  <Plus className="w-3.5 h-3.5" />
                  <span>Cadastrar Nova Tag no Sistema</span>
                </button>
              ) : (
                <form
                  onSubmit={handleQuickCreateTag}
                  className="p-3 rounded-xl bg-[#101217] border border-slate-800 space-y-2.5"
                >
                  <span className="text-[11px] font-bold text-slate-300 block">Criar Nova Tag:</span>
                  <input
                    type="text"
                    required
                    value={newTagName}
                    onChange={(e) => setNewTagName(e.target.value)}
                    placeholder="Nome da tag (ex: Boleto Gerado, Cliente VIP)"
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
                        Salvar e Selecionar
                      </button>
                    </div>
                  </div>
                </form>
              )}
            </div>

            {/* Rodapé com Ações */}
            <div className="pt-4 mt-4 border-t border-slate-800 flex items-center justify-between">
              <button
                type="button"
                onClick={handleDeleteCurrentNode}
                className="text-red-400 hover:text-red-300 flex items-center gap-1 text-xs"
              >
                <Trash2 className="w-3.5 h-3.5" />
                <span>Excluir Gatilho</span>
              </button>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => setIsTagModalOpen(false)}
                  className="px-4 py-2 border border-slate-700 hover:bg-slate-800 rounded-xl text-slate-300 font-semibold text-xs"
                >
                  Cancelar
                </button>
                <button
                  type="button"
                  onClick={handleSaveTagConfig}
                  className="px-5 py-2 bg-purple-600 hover:bg-purple-500 text-white rounded-xl font-bold text-xs shadow-lg shadow-purple-600/30"
                >
                  Salvar
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ============================================================ */}
      {/* DRAWER / MODAL DE CONFIGURAÇÃO DE MENSAGEM (WHATSAPP & E-MAIL) */}
      {/* ============================================================ */}
      {isMessageDrawerOpen && selectedNode && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-[#181c25] rounded-2xl shadow-2xl border border-slate-800 max-w-xl w-full p-6 text-xs text-slate-200 max-h-[90vh] overflow-y-auto">
            {/* Cabeçalho */}
            <div className="flex items-center justify-between pb-3 border-b border-slate-800">
              <div className="flex items-center gap-2">
                {selectedNode.type === 'whatsapp' ? (
                  <>
                    <MessageSquare className="w-5 h-5 text-emerald-400" />
                    <div>
                      <h3 className="font-bold text-white text-sm">Disparo de WhatsApp</h3>
                      <p className="text-[11px] text-slate-400">Texto, imagem, vídeo ou áudio do seu computador</p>
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

            <div className="mt-4 space-y-4">
              {/* Alerta de erro de upload se houver */}
              {wppUploadError && (
                <div className="p-3 bg-red-950/50 border border-red-800/60 rounded-xl text-red-300 text-xs flex items-center gap-2">
                  <XCircle className="w-4 h-4 shrink-0 text-red-400" />
                  <span>{wppUploadError}</span>
                </div>
              )}

              {/* SE FOR WHATSAPP: NOVO BUILDER DE BLOCOS MÚLTIPLOS (TEXTO + ARQUIVOS) */}
              {selectedNode.type === 'whatsapp' && (
                <div className="space-y-3">
                  {/* SELEÇÃO DO NÚMERO DE WHATSAPP PARA DISPARO DESTE BLOCO */}
                  <div className="bg-[#12141a] border border-slate-800 rounded-xl p-3.5 space-y-2">
                    <div className="flex items-center justify-between">
                      <label className="text-slate-200 font-bold text-xs flex items-center gap-1.5">
                        <Smartphone className="w-4 h-4 text-emerald-400" />
                        <span>Número de Envio do WhatsApp</span>
                        <span className="text-rose-400 font-semibold text-[10px] bg-rose-950/60 px-1.5 py-0.5 rounded border border-rose-500/30">
                          Obrigatório
                        </span>
                      </label>
                      <a
                        href="/whatsapp"
                        target="_blank"
                        className="text-[11px] text-emerald-400 hover:text-emerald-300 hover:underline flex items-center gap-1 transition-colors"
                        title="Abrir gerenciador de números de WhatsApp em nova aba"
                      >
                        <span>Gerenciar números</span>
                        <ExternalLink className="w-3 h-3" />
                      </a>
                    </div>

                    <select
                      value={selectedWppInstanceId}
                      onChange={(e) => setSelectedWppInstanceId(e.target.value)}
                      className={`w-full bg-[#181c25] border rounded-lg px-3 py-2 text-xs text-white focus:outline-none font-medium cursor-pointer transition-colors ${
                        !selectedWppInstanceId && !flowWhatsappInstanceId
                          ? 'border-rose-500/80 ring-1 ring-rose-500/40 bg-rose-950/10'
                          : 'border-slate-700/80 focus:border-emerald-500'
                      }`}
                    >
                      <option value="">
                        {flowWhatsappInstanceId
                          ? `Usar WhatsApp padrão do Fluxo (${formatWppInstanceLabel(availableWppInstances.find((i) => i.id === flowWhatsappInstanceId))})`
                          : '-- Selecione um número de WhatsApp (Obrigatório) --'}
                      </option>
                      {availableWppInstances.map((inst) => {
                        const isOnline = inst.connected || inst.status === 'CONNECTED';
                        return (
                          <option key={inst.id} value={inst.id}>
                            {formatWppInstanceLabel(inst)} - {isOnline ? '🟢 Operacional' : '🔴 Desconectado'} {inst.isDefault ? '★ [Principal]' : ''}
                          </option>
                        );
                      })}
                    </select>

                    {!selectedWppInstanceId && !flowWhatsappInstanceId && (
                      <div className="p-2.5 rounded-lg bg-rose-950/40 border border-rose-500/40 flex items-center gap-2 text-rose-300 text-[11px] font-medium animate-in fade-in">
                        <AlertCircle className="w-4 h-4 shrink-0 text-rose-400" />
                        <span>É obrigatório selecionar um WhatsApp conectado para este bloco ou definir o WhatsApp do fluxo antes de ativar a automação.</span>
                      </div>
                    )}
                    {(selectedWppInstanceId || flowWhatsappInstanceId) && (() => {
                      const effectiveId = selectedWppInstanceId || flowWhatsappInstanceId;
                      const inst = availableWppInstances.find((i) => i.id === effectiveId);
                      const isOnline = inst && (inst.connected || inst.status === 'CONNECTED');
                      if (inst && !isOnline) {
                        return (
                          <div className="p-2.5 rounded-lg bg-red-950/40 border border-red-500/40 flex items-center gap-2 text-red-300 text-[11px] font-medium animate-in fade-in">
                            <AlertCircle className="w-4 h-4 shrink-0 text-red-400" />
                            <span>Atenção: A linha selecionada está desconectada. Você não conseguirá ativar o fluxo até reconectar este número.</span>
                          </div>
                        );
                      }
                      return null;
                    })()}

                    <p className="text-[10px] text-slate-400">
                      Escolha qual número fará o disparo desta mensagem. Se deixar automático, utilizará o WhatsApp padrão configurado para o fluxo.
                    </p>
                  </div>

                  <div className="flex items-center justify-between">
                    <label className="text-slate-200 font-bold text-sm flex items-center gap-2">
                      Mensagem
                      <span className="text-[11px] font-normal text-slate-400">
                        ({wppBlocks.length} bloco{wppBlocks.length === 1 ? '' : 's'})
                      </span>
                    </label>
                    <div className="flex items-center gap-1.5 text-slate-400 text-[11px]" title="Os blocos serão enviados em sequência no WhatsApp">
                      <Eye className="w-3.5 h-3.5 text-emerald-400" />
                      <span>Sequência de blocos</span>
                    </div>
                  </div>

                  {/* Container de Blocos */}
                  <div className="border border-slate-800 bg-[#12141a]/60 rounded-2xl p-3.5 space-y-3">
                    {wppBlocks.map((block, index) => (
                      <div key={block.id}>
                        {/* BLOCO TIPO TEXTO */}
                        {block.type === 'text' ? (
                          <div className="relative bg-[#181c25] border border-slate-800 rounded-xl p-3 space-y-2 group shadow-sm hover:border-slate-700 transition-colors">
                            <div className="flex items-center justify-between pb-1 border-b border-slate-800/60">
                              <div className="flex items-center gap-1.5 text-emerald-400 text-[11px] font-semibold">
                                <MessageSquare className="w-3.5 h-3.5" />
                                <span>Bloco {index + 1} - Texto</span>
                              </div>
                              {wppBlocks.length > 1 && (
                                <button
                                  type="button"
                                  onClick={() => handleRemoveBlock(block.id)}
                                  className="text-slate-500 hover:text-red-400 p-1 rounded-md hover:bg-red-950/40 transition-colors cursor-pointer"
                                  title="Remover este bloco"
                                >
                                  <Trash2 className="w-3.5 h-3.5" />
                                </button>
                              )}
                            </div>

                            <div className="relative">
                              <textarea
                                rows={4}
                                value={block.text || ''}
                                onChange={(e) => handleUpdateBlockText(block.id, e.target.value)}
                                placeholder="Digite aqui..."
                                className="w-full p-2.5 pb-6 bg-[#0f1117] border border-slate-800 rounded-lg text-xs text-white placeholder-slate-500 focus:outline-none focus:border-emerald-500 font-sans leading-relaxed resize-y"
                              />
                              <div className="absolute bottom-2 right-2.5 text-[10px] text-slate-500 font-mono pointer-events-none select-none">
                                {(block.text || '').length}/500
                              </div>
                            </div>

                            {/* Tags de variáveis dinâmicas */}
                            <div className="flex items-center gap-1.5 flex-wrap pt-0.5">
                              <span className="text-[10px] text-slate-400">Variáveis:</span>
                              {['{{nome}}', '{{primeiro_nome}}', '{{email}}', '{{telefone}}'].map((v) => (
                                <button
                                  key={v}
                                  type="button"
                                  onClick={() => handleInsertVariableInBlock(block.id, 'text', v)}
                                  className="px-2 py-0.5 rounded bg-slate-800/80 hover:bg-slate-700 text-emerald-300 font-mono text-[10px] border border-slate-700/80 transition-colors cursor-pointer"
                                >
                                  {v}
                                </button>
                              ))}
                            </div>
                          </div>
                        ) : (
                          /* BLOCO TIPO ARQUIVO / MÍDIA */
                          <div className="relative bg-[#181c25] border border-slate-800 rounded-xl p-3 space-y-3 group shadow-sm hover:border-slate-700 transition-colors">
                            <div className="flex items-center justify-between pb-1 border-b border-slate-800/60">
                              <div className="flex items-center gap-1.5 text-sky-400 text-[11px] font-semibold">
                                <Paperclip className="w-3.5 h-3.5" />
                                <span>Bloco {index + 1} - Arquivo</span>
                              </div>

                              <div className="flex items-center gap-2">
                                {/* Seletor de Tipo de Arquivo */}
                                <div className="flex items-center gap-1 bg-[#101217] p-0.5 rounded-lg border border-slate-800">
                                  {[
                                    { type: 'image', label: 'Imagem', icon: ImageIcon },
                                    { type: 'video', label: 'Vídeo', icon: VideoIcon },
                                    { type: 'audio', label: 'Áudio', icon: Mic },
                                    { type: 'file', label: 'Doc', icon: FileText },
                                  ].map((item) => {
                                    const Icon = item.icon;
                                    const isActive = block.type === item.type;
                                    return (
                                      <button
                                        key={item.type}
                                        type="button"
                                        onClick={() => handleUpdateBlockType(block.id, item.type as any)}
                                        className={`px-2 py-0.5 rounded text-[10px] font-semibold flex items-center gap-1 transition-all cursor-pointer ${
                                          isActive
                                            ? 'bg-sky-500/20 text-sky-300 border border-sky-500/40'
                                            : 'text-slate-400 hover:text-white'
                                        }`}
                                      >
                                        <Icon className="w-3 h-3" />
                                        <span>{item.label}</span>
                                      </button>
                                    );
                                  })}
                                </div>

                                {wppBlocks.length > 1 && (
                                  <button
                                    type="button"
                                    onClick={() => handleRemoveBlock(block.id)}
                                    className="text-slate-500 hover:text-red-400 p-1 rounded-md hover:bg-red-950/40 transition-colors cursor-pointer"
                                    title="Remover este bloco"
                                  >
                                    <Trash2 className="w-3.5 h-3.5" />
                                  </button>
                                )}
                              </div>
                            </div>

                            {/* Upload e Pré-visualização */}
                            <div>
                              <input
                                type="file"
                                id={`wpp_file_input_${block.id}`}
                                accept={
                                  block.type === 'image'
                                    ? 'image/*'
                                    : block.type === 'video'
                                    ? 'video/*'
                                    : block.type === 'audio'
                                    ? 'audio/*'
                                    : '*/*'
                                }
                                onChange={(e) => handleBlockFileUpload(block.id, e)}
                                className="hidden"
                              />

                              {uploadingBlockId === block.id ? (
                                <div className="p-5 border-2 border-dashed border-sky-500/40 rounded-xl flex flex-col items-center justify-center gap-2.5 bg-[#0f1117]">
                                  <div className="w-full max-w-xs space-y-1.5">
                                    <div className="flex items-center justify-between text-xs">
                                      <span className="text-slate-300 font-medium">Enviando em segundo plano...</span>
                                      <span className="text-sky-400 font-bold font-mono">{uploadProgress[block.id] || 0}%</span>
                                    </div>
                                    <div className="w-full bg-slate-800 rounded-full h-2 overflow-hidden">
                                      <div
                                        className="bg-sky-500 h-2 rounded-full transition-all duration-200"
                                        style={{ width: `${Math.max(5, uploadProgress[block.id] || 0)}%` }}
                                      />
                                    </div>
                                  </div>
                                  <span className="text-[10px] text-slate-500">O painel continua totalmente utilizável durante o envio.</span>
                                </div>
                              ) : block.mediaUrl ? (
                                <div className="space-y-2">
                                  {block.type === 'image' && (
                                    <div className="relative rounded-xl border border-slate-800 bg-black/50 p-2 flex items-center justify-center">
                                      {/* eslint-disable-next-line @next/next/no-img-element */}
                                      <img
                                        src={block.mediaUrl}
                                        alt="Prévia da Imagem"
                                        loading="lazy"
                                        className="max-h-40 rounded-lg object-contain"
                                      />
                                    </div>
                                  )}
                                  {block.type === 'video' && (
                                    <div className="relative rounded-xl border border-slate-800 bg-black p-2 flex items-center justify-center">
                                      <video
                                        src={block.mediaUrl}
                                        controls
                                        preload="none"
                                        className="max-h-40 rounded-lg w-full"
                                      />
                                    </div>
                                  )}
                                  {block.type === 'audio' && (
                                    <div className="rounded-xl border border-slate-800 bg-[#0f1117] p-2.5">
                                      <div className="text-[10px] text-emerald-400 font-semibold mb-1 flex items-center gap-1">
                                        <Mic className="w-3 h-3" />
                                        <span>Mensagem de Voz Gravada (PTT)</span>
                                      </div>
                                      <audio src={block.mediaUrl} controls preload="none" className="w-full h-8" />
                                    </div>
                                  )}
                                  {block.type === 'file' && (
                                    <div className="rounded-xl border border-slate-800 bg-[#0f1117] p-3 flex items-center gap-2.5">
                                      <FileText className="w-6 h-6 text-sky-400 shrink-0" />
                                      <div className="truncate flex-1">
                                        <span className="text-white text-xs block truncate font-medium">{block.mediaFileName || 'documento.pdf'}</span>
                                        {block.mediaSize && (
                                          <span className="text-[10px] text-slate-500">{(block.mediaSize / 1024 / 1024).toFixed(1)} MB</span>
                                        )}
                                      </div>
                                    </div>
                                  )}

                                  {/* Barra de Ações do Arquivo */}
                                  <div className="flex items-center justify-between p-2 bg-[#0f1117] border border-slate-800 rounded-lg">
                                    <div className="flex items-center gap-2 truncate">
                                      <Paperclip className="w-3.5 h-3.5 text-sky-400 shrink-0" />
                                      <span className="text-slate-200 text-xs truncate max-w-[200px]">
                                        {block.mediaFileName || 'arquivo'}
                                      </span>
                                      {block.mediaSize && (
                                        <span className="text-[10px] text-slate-500">
                                          ({(block.mediaSize / 1024 / 1024).toFixed(1)} MB)
                                        </span>
                                      )}
                                    </div>
                                    <div className="flex items-center gap-2 shrink-0">
                                      <label
                                        htmlFor={`wpp_file_input_${block.id}`}
                                        className="px-2 py-0.5 bg-slate-800 hover:bg-slate-700 text-slate-200 rounded text-[11px] cursor-pointer font-medium"
                                      >
                                        Trocar
                                      </label>
                                      <button
                                        type="button"
                                        onClick={() => handleClearBlockMedia(block.id)}
                                        className="px-2 py-0.5 text-red-400 hover:text-red-300 text-[11px] font-medium cursor-pointer"
                                      >
                                        Remover
                                      </button>
                                    </div>
                                  </div>
                                </div>
                              ) : (
                                <label
                                  htmlFor={`wpp_file_input_${block.id}`}
                                  className="cursor-pointer border-2 border-dashed border-slate-700 hover:border-sky-500/60 rounded-xl p-4 flex flex-col items-center justify-center gap-1.5 hover:bg-slate-800/30 transition-all text-center block"
                                >
                                  <div className="w-8 h-8 rounded-full bg-sky-950/60 border border-sky-800/60 flex items-center justify-center text-sky-400">
                                    <Upload className="w-4 h-4" />
                                  </div>
                                  <span className="font-semibold text-slate-200 text-xs">
                                    Clique para selecionar {block.type === 'image' ? 'imagem' : block.type === 'video' ? 'vídeo' : block.type === 'audio' ? 'áudio' : 'arquivo'} do seu PC
                                  </span>
                                  <span className="text-[10px] text-slate-400">
                                    {block.type === 'image'
                                      ? 'JPG, PNG, WEBP, GIF (até 25MB)'
                                      : block.type === 'video'
                                      ? 'MP4, MOV, WebM (até 50MB)'
                                      : block.type === 'audio'
                                      ? 'MP3, WAV, OGG, M4A, OPUS'
                                      : 'PDF, DOC, ZIP, XLSX'}
                                  </span>
                                </label>
                              )}
                            </div>

                            {/* Legenda do Arquivo (Opcional) */}
                            <div>
                              <label className="block text-slate-300 text-[11px] font-medium mb-1">
                                Legenda do Arquivo (Opcional)
                              </label>
                              <div className="relative">
                                <textarea
                                  rows={2}
                                  value={block.caption || ''}
                                  onChange={(e) => handleUpdateBlockCaption(block.id, e.target.value)}
                                  placeholder="Ex: Olá {{primeiro_nome}}! Confira esse arquivo:"
                                  className="w-full p-2.5 pb-6 bg-[#0f1117] border border-slate-800 rounded-lg text-xs text-white placeholder-slate-500 focus:outline-none focus:border-sky-500 font-sans leading-relaxed resize-y"
                                />
                                <div className="absolute bottom-2 right-2.5 text-[10px] text-slate-500 font-mono pointer-events-none select-none">
                                  {(block.caption || '').length}/500
                                </div>
                              </div>
                              <div className="flex items-center gap-1.5 flex-wrap pt-0.5">
                                <span className="text-[10px] text-slate-400">Variáveis:</span>
                                {['{{nome}}', '{{primeiro_nome}}', '{{email}}', '{{telefone}}'].map((v) => (
                                  <button
                                    key={v}
                                    type="button"
                                    onClick={() => handleInsertVariableInBlock(block.id, 'caption', v)}
                                    className="px-2 py-0.5 rounded bg-slate-800/80 hover:bg-slate-700 text-sky-300 font-mono text-[10px] border border-slate-700/80 transition-colors cursor-pointer"
                                  >
                                    {v}
                                  </button>
                                ))}
                              </div>
                            </div>
                          </div>
                        )}
                      </div>
                    ))}

                    {/* Botão + Adicionar Bloco e Menu Flutuante */}
                    <div className="relative pt-1">
                      <button
                        type="button"
                        onClick={() => setShowAddBlockMenu((prev) => !prev)}
                        className="w-full py-2.5 border-2 border-dashed border-slate-700/80 hover:border-emerald-500/80 bg-slate-900/40 hover:bg-slate-800/40 rounded-xl text-slate-300 font-semibold text-xs flex items-center justify-center gap-2 transition-all cursor-pointer"
                      >
                        <Plus className="w-4 h-4 text-emerald-400" />
                        <span>Adicionar Bloco</span>
                        <ChevronDown className={`w-3.5 h-3.5 text-slate-400 transition-transform ${showAddBlockMenu ? 'rotate-180' : ''}`} />
                      </button>

                      {showAddBlockMenu && (
                        <div className="absolute left-1/2 -translate-x-1/2 bottom-full mb-2 w-64 bg-[#1a1e2b] border border-slate-700 rounded-xl shadow-2xl p-2 z-30 animate-in fade-in zoom-in-95 duration-150">
                          <span className="block px-2.5 py-1 text-[11px] font-bold text-slate-200">
                            Selecione o tipo do bloco:
                          </span>
                          <div className="mt-1 space-y-1">
                            <button
                              type="button"
                              onClick={handleAddTextBlock}
                              className="w-full px-3 py-2 flex items-center gap-2.5 rounded-lg hover:bg-emerald-600/20 hover:text-emerald-300 text-slate-200 text-xs font-medium text-left transition-colors cursor-pointer"
                            >
                              <MessageSquare className="w-4 h-4 text-emerald-400 shrink-0" />
                              <span>Texto</span>
                            </button>
                            <button
                              type="button"
                              onClick={() => handleAddMediaBlock('image')}
                              className="w-full px-3 py-2 flex items-center gap-2.5 rounded-lg hover:bg-sky-600/20 hover:text-sky-300 text-slate-200 text-xs font-medium text-left transition-colors cursor-pointer"
                            >
                              <Paperclip className="w-4 h-4 text-sky-400 shrink-0" />
                              <span>Arquivo (Imagem, Vídeo, Áudio ou Doc)</span>
                            </button>
                          </div>
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              )}

              {/* SE FOR E-MAIL: CONSTRUTOR VISUAL E ASSUNTO / TEXTO */}
              {selectedNode.type === 'email' && (
                <>
                  <div className="p-4 bg-gradient-to-r from-orange-950/60 via-indigo-950/60 to-purple-950/60 border border-orange-500/30 rounded-2xl flex items-center justify-between gap-4 shadow-lg">
                    <div className="flex items-center gap-3">
                      <div className="w-10 h-10 rounded-xl bg-orange-600/30 border border-orange-500/50 flex items-center justify-center text-orange-400 shrink-0">
                        <Sparkles className="w-5 h-5" />
                      </div>
                      <div>
                        <h4 className="font-bold text-white text-xs flex items-center gap-2">
                          Construtor Visual de E-mails
                          {Boolean((selectedNode.data.config as any)?.contentJson) && (
                            <span className="text-[10px] bg-emerald-950 text-emerald-300 border border-emerald-800/60 px-2 py-0.2 rounded-full font-semibold">
                              ✨ Modelo Ativo
                            </span>
                          )}
                        </h4>
                        <p className="text-[11px] text-slate-300 mt-0.5">
                          {Boolean((selectedNode.data.config as any)?.contentJson)
                            ? 'Design visual responsivo ativo. Clique para personalizar os blocos, botões e imagens.'
                            : 'Crie e-mails profissionais com blocos arrastáveis, imagens, botões e vídeos.'}
                        </p>
                      </div>
                    </div>
                    <button
                      type="button"
                      onClick={() => setIsVisualEmailBuilderOpen(true)}
                      className="px-4 py-2 bg-gradient-to-r from-orange-600 to-indigo-600 hover:from-orange-500 hover:to-indigo-500 text-white rounded-xl font-bold text-xs shadow-lg shadow-indigo-600/30 shrink-0 flex items-center gap-1.5 transition-all cursor-pointer"
                    >
                      <Sparkles className="w-3.5 h-3.5" />
                      <span>
                        {Boolean((selectedNode.data.config as any)?.contentJson)
                          ? 'Editar Design Visual'
                          : 'Abrir Construtor Visual'}
                      </span>
                    </button>
                  </div>

                  <div>
                    <label className="block text-slate-300 font-semibold mb-1">Assunto do E-mail</label>
                    <input
                      type="text"
                      defaultValue={(selectedNode.data.config as any)?.subject || ''}
                      id="email_subject_input"
                      placeholder="Ex: Seu link exclusivo de acesso"
                      className="w-full p-2.5 bg-[#12141a] border border-slate-700 rounded-xl text-xs text-white focus:outline-none focus:border-indigo-500"
                    />
                    <div className="flex items-center gap-1.5 flex-wrap mt-1.5">
                      <span className="text-[10px] text-slate-400">Variáveis para o assunto:</span>
                      {['{{nome}}', '{{primeiro_nome}}'].map((v) => (
                        <button
                          key={v}
                          type="button"
                          onClick={() => {
                            const el = document.getElementById('email_subject_input') as HTMLInputElement;
                            if (el) el.value += ` ${v}`;
                          }}
                          className="px-2 py-0.5 rounded bg-slate-800 hover:bg-slate-700 text-orange-300 font-mono text-[10px] border border-slate-700 cursor-pointer"
                        >
                          {v}
                        </button>
                      ))}
                    </div>
                  </div>

                  <div>
                    <label className="block text-slate-300 font-semibold mb-1">Conteúdo do E-mail</label>
                    <textarea
                      rows={6}
                      id="message_body_input"
                      defaultValue={(selectedNode.data.config as any)?.content || ''}
                      placeholder="Olá {{nome}},\n\nAqui está o seu acesso..."
                      className="w-full p-2.5 bg-[#12141a] border border-slate-700 rounded-xl text-xs text-white focus:outline-none focus:border-indigo-500 font-sans leading-relaxed"
                    />
                    <div className="flex items-center gap-1.5 flex-wrap mt-2">
                      <span className="text-[10px] text-slate-400">Variáveis disponíveis:</span>
                      {['{{nome}}', '{{primeiro_nome}}', '{{email}}', '{{telefone}}'].map((v) => (
                        <button
                          key={v}
                          type="button"
                          onClick={() => {
                            const el = document.getElementById('message_body_input') as HTMLTextAreaElement;
                            if (el) el.value += ` ${v}`;
                          }}
                          className="px-2 py-0.5 rounded bg-slate-800 hover:bg-slate-700 text-indigo-300 font-mono text-[10px] border border-slate-700 cursor-pointer"
                        >
                          {v}
                        </button>
                      ))}
                    </div>
                  </div>
                </>
              )}
            </div>

            <div className="pt-4 mt-5 border-t border-slate-800 flex items-center justify-between">
              <button
                type="button"
                onClick={handleDeleteCurrentNode}
                className="text-red-400 hover:text-red-300 flex items-center gap-1 text-xs cursor-pointer"
              >
                <Trash2 className="w-3.5 h-3.5" />
                <span>Excluir Nó</span>
              </button>

              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => setIsMessageDrawerOpen(false)}
                  className="px-4 py-2 border border-slate-700 hover:bg-slate-800 rounded-xl text-slate-300 font-semibold cursor-pointer"
                >
                  Cancelar
                </button>
                <button
                  type="button"
                  onClick={() => {
                    if (selectedNode.type === 'whatsapp') {
                      const incompleteMedia = wppBlocks.find(
                        (b) => b.type !== 'text' && !b.mediaUrl && !b.mediaBase64
                      );
                      if (incompleteMedia) {
                        alert('Por favor, selecione um arquivo para o bloco de arquivo ou remova o bloco antes de salvar.');
                        return;
                      }
                      handleSaveMessage();
                    } else {
                      const bodyEl = document.getElementById('message_body_input') as HTMLTextAreaElement;
                      const subEl = document.getElementById('email_subject_input') as HTMLInputElement;
                      handleSaveMessage(bodyEl?.value || '', subEl?.value || '');
                    }
                  }}
                  className="px-5 py-2 bg-emerald-600 hover:bg-emerald-500 text-white rounded-xl font-semibold shadow-lg shadow-emerald-600/30 flex items-center gap-1.5 cursor-pointer"
                >
                  <Check className="w-4 h-4" />
                  <span>Salvar Mensagem</span>
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ============================================================ */}
      {/* CONSTRUTOR VISUAL PROFISSIONAL DE E-MAILS (JSON BUILDER) */}
      {/* ============================================================ */}
      {isVisualEmailBuilderOpen && selectedNode && (
        <EmailBuilderModal
          isOpen={isVisualEmailBuilderOpen}
          onClose={() => setIsVisualEmailBuilderOpen(false)}
          initialSubject={(selectedNode.data.config as any)?.subject || ''}
          initialContentJson={(selectedNode.data.config as any)?.contentJson || ''}
          onSave={({ subject, contentJson, generatedHtml, plainTextSummary }) => {
            setSequenceNodes((nds) =>
              nds.map((n) => {
                if (n.id === selectedNode.id) {
                  return {
                    ...n,
                    data: {
                      ...n.data,
                      config: {
                        ...((n.data.config as object) || {}),
                        subject,
                        contentJson,
                        generatedHtml,
                        content: plainTextSummary,
                        message: plainTextSummary,
                      },
                    },
                  };
                }
                return n;
              })
            );
            // Atualiza campos visuais caso o drawer simples esteja aberto
            const subEl = document.getElementById('email_subject_input') as HTMLInputElement;
            if (subEl) subEl.value = subject;
            const bodyEl = document.getElementById('message_body_input') as HTMLTextAreaElement;
            if (bodyEl) bodyEl.value = plainTextSummary;
          }}
        />
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
                onClick={() => {
                  setTimerTab('CONTINUOUS');
                  setTimerError(null);
                }}
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
                onClick={() => {
                  setTimerTab('SPECIFIC_DATE');
                  setTimerError(null);
                }}
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

            {/* Notificação de Erro em Vermelho */}
            {timerError && (
              <div className="mt-4 p-3 bg-red-950/70 border border-red-500/60 rounded-xl text-red-200 text-xs font-semibold flex items-center gap-2.5 animate-in fade-in shadow-md shadow-red-950/40">
                <AlertCircle className="w-4 h-4 text-red-400 shrink-0" />
                <span>{timerError}</span>
              </div>
            )}

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
                    min={getLocalDatetimeString(new Date(Date.now() + 60000))}
                    onChange={(e) => {
                      setTimerSpecificDate(e.target.value);
                      if (timerError) {
                        const time = parseTargetDate(e.target.value);
                        if (!isNaN(time) && time > Date.now()) {
                          setTimerError(null);
                        }
                      }
                    }}
                    className={`w-full p-2.5 bg-[#181c25] border rounded-lg text-white font-mono text-xs focus:outline-none transition-all ${
                      timerError && timerTab === 'SPECIFIC_DATE'
                        ? 'border-red-500 ring-2 ring-red-500/40 bg-red-950/20 text-red-100'
                        : 'border-slate-700 focus:border-indigo-500'
                    }`}
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

      {/* ============================================================ */}
      {/* MODAL DE AQUECIMENTO (THROTTLE / LIMITAÇÃO POR MINUTO) */}
      {/* ============================================================ */}
      {isWarmupModalOpen && (
        <div className="fixed inset-0 bg-black/75 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-[#14161d] rounded-2xl shadow-2xl border border-slate-800 max-w-lg w-full p-6 text-xs text-slate-200 animate-in fade-in zoom-in-95 duration-150">
            {/* Cabeçalho */}
            <div className="flex items-center justify-between pb-3 border-b border-slate-800/80">
              <div>
                <span className="text-[10px] text-slate-400 font-mono block">
                  ID - {selectedNode?.id?.replace('seq_', '') || '8719604'}
                </span>
                <h3 className="font-bold text-white text-base">Aquecimento</h3>
              </div>
              <div className="flex items-center gap-2 text-slate-400">
                <button
                  type="button"
                  onClick={() => setIsWarmupModalOpen(false)}
                  className="p-1 hover:text-white rounded-lg hover:bg-slate-800 transition-colors"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>
            </div>

            {/* Texto Explicativo */}
            <p className="text-slate-400 text-xs mt-3 leading-relaxed">
              A etapa Aquecimento serve para limitar a quantidade de leads que passará para a próxima etapa a cada 1 minuto. Número máximo de liberações por minuto é 300 leads.
            </p>

            {/* Campo: Liberações por minuto */}
            <div className="mt-4 p-4 rounded-xl bg-[#1b1e27] border border-slate-800 space-y-1.5">
              <label className="block text-slate-200 font-semibold text-xs">
                Liberações por minuto
              </label>
              <p className="text-[11px] text-slate-400">
                A quantidade de leads que serão liberados por minuto para a próxima etapa
              </p>
              <div className="pt-1.5">
                <input
                  type="number"
                  min={1}
                  max={300}
                  value={warmupRateLimit}
                  onChange={(e) =>
                    setWarmupRateLimit(Math.min(300, Math.max(1, parseInt(e.target.value) || 1)))
                  }
                  className="w-full p-2.5 bg-[#14161d] border border-slate-700/80 rounded-xl text-white font-bold text-sm focus:outline-none focus:border-indigo-500"
                />
                <span className="text-[10px] text-slate-500 block mt-1">
                  {300 - warmupRateLimit} restantes até o limite de 300
                </span>
              </div>
            </div>

            {/* Opção 1: Determinar um intervalo de tempo? */}
            <div className="mt-3 p-4 rounded-xl bg-[#1b1e27] border border-slate-800 space-y-3">
              <div className="flex items-start justify-between gap-3">
                <div className="flex items-start gap-2.5">
                  <div className="p-1.5 rounded-lg bg-sky-500/10 text-sky-400 shrink-0 mt-0.5">
                    <Calendar className="w-4 h-4" />
                  </div>
                  <div>
                    <span className="font-semibold text-slate-200 block text-xs">
                      Determinar um intervalo de tempo?
                    </span>
                    <span className="text-[11px] text-slate-400 block mt-0.5">
                      O aquecimento vai ser utilizado entre os horários de início e fim.
                    </span>
                  </div>
                </div>

                {/* Switch */}
                <button
                  type="button"
                  onClick={() => setWarmupHasInterval(!warmupHasInterval)}
                  className={`w-10 h-5 flex items-center rounded-full p-0.5 transition-colors cursor-pointer shrink-0 mt-1 ${
                    warmupHasInterval ? 'bg-indigo-600' : 'bg-slate-700'
                  }`}
                >
                  <div
                    className={`bg-white w-4 h-4 rounded-full shadow-md transform transition-transform ${
                      warmupHasInterval ? 'translate-x-5' : 'translate-x-0'
                    }`}
                  />
                </button>
              </div>

              {warmupHasInterval && (
                <div className="grid grid-cols-2 gap-3 pt-2 border-t border-slate-800">
                  <div>
                    <label className="block text-[11px] text-slate-300 font-medium mb-1">
                      Iniciar às:
                    </label>
                    <div className="relative">
                      <input
                        type="time"
                        value={warmupIntervalStart}
                        onChange={(e) => setWarmupIntervalStart(e.target.value)}
                        className="w-full p-2 bg-[#14161d] border border-slate-700 rounded-lg text-white text-xs focus:outline-none focus:border-indigo-500"
                      />
                    </div>
                  </div>
                  <div>
                    <label className="block text-[11px] text-slate-300 font-medium mb-1">
                      Terminar às:
                    </label>
                    <div className="relative">
                      <input
                        type="time"
                        value={warmupIntervalEnd}
                        onChange={(e) => setWarmupIntervalEnd(e.target.value)}
                        className="w-full p-2 bg-[#14161d] border border-slate-700 rounded-lg text-white text-xs focus:outline-none focus:border-indigo-500"
                      />
                    </div>
                  </div>
                </div>
              )}
            </div>

            {/* Opção 2: Selecionar os dias da semana? */}
            <div className="mt-3 p-4 rounded-xl bg-[#1b1e27] border border-slate-800 space-y-3">
              <div className="flex items-start justify-between gap-3">
                <div className="flex items-start gap-2.5">
                  <div className="p-1.5 rounded-lg bg-sky-500/10 text-sky-400 shrink-0 mt-0.5">
                    <Clock className="w-4 h-4" />
                  </div>
                  <div>
                    <span className="font-semibold text-slate-200 block text-xs">
                      Selecionar os dias da semana?
                    </span>
                    <span className="text-[11px] text-slate-400 block mt-0.5">
                      Determine quais dias da semana o aquecimento vai ser acionado, por padrão o aquecimento funciona todos os dias.
                    </span>
                  </div>
                </div>

                {/* Switch */}
                <button
                  type="button"
                  onClick={() => setWarmupHasWeekDays(!warmupHasWeekDays)}
                  className={`w-10 h-5 flex items-center rounded-full p-0.5 transition-colors cursor-pointer shrink-0 mt-1 ${
                    warmupHasWeekDays ? 'bg-indigo-600' : 'bg-slate-700'
                  }`}
                >
                  <div
                    className={`bg-white w-4 h-4 rounded-full shadow-md transform transition-transform ${
                      warmupHasWeekDays ? 'translate-x-5' : 'translate-x-0'
                    }`}
                  />
                </button>
              </div>

              {warmupHasWeekDays && (
                <div className="pt-2 border-t border-slate-800 space-y-1.5 max-h-48 overflow-y-auto pr-1">
                  {[
                    'Domingo',
                    'Segunda-feira',
                    'Terça-feira',
                    'Quarta-feira',
                    'Quinta-feira',
                    'Sexta-feira',
                    'Sábado',
                  ].map((day) => {
                    const active = warmupWeekDays.includes(day);
                    return (
                      <div
                        key={day}
                        onClick={() => {
                          if (active) {
                            setWarmupWeekDays(warmupWeekDays.filter((d) => d !== day));
                          } else {
                            setWarmupWeekDays([...warmupWeekDays, day]);
                          }
                        }}
                        className="flex items-center gap-2.5 py-1 px-2 rounded-lg hover:bg-slate-800/60 cursor-pointer transition-colors"
                      >
                        <Check
                          className={`w-4 h-4 ${
                            active ? 'text-emerald-400 stroke-[3]' : 'text-slate-600'
                          }`}
                        />
                        <span
                          className={`text-xs ${
                            active ? 'text-white font-medium' : 'text-slate-500'
                          }`}
                        >
                          {day}
                        </span>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>

            {/* Configurações Avançadas (Accordion) */}
            <div className="mt-3 border border-slate-800 rounded-xl overflow-hidden bg-[#1b1e27]">
              <button
                type="button"
                onClick={() => setWarmupAdvancedOpen(!warmupAdvancedOpen)}
                className="w-full p-3 flex items-center justify-between text-left text-xs font-semibold text-slate-300 hover:text-white"
              >
                <span>Configurações avançadas</span>
                <ChevronDown
                  className={`w-4 h-4 text-slate-400 transition-transform ${
                    warmupAdvancedOpen ? 'rotate-180' : ''
                  }`}
                />
              </button>
              {warmupAdvancedOpen && (
                <div className="p-3 pt-0 border-t border-slate-800/80 text-[11px] text-slate-400 space-y-2">
                  <div className="flex items-center justify-between">
                    <span>Fuso horário:</span>
                    <span className="font-semibold text-slate-200">América/São Paulo</span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span>Tratamento de fila cheia:</span>
                    <span className="font-semibold text-emerald-400">Escalonamento por minuto</span>
                  </div>
                </div>
              )}
            </div>

            {/* Rodapé com botão SALVAR */}
            <div className="pt-4 mt-4 border-t border-slate-800/80 flex items-center justify-between">
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
                  onClick={() => setIsWarmupModalOpen(false)}
                  className="px-4 py-2 border border-slate-700 hover:bg-slate-800 rounded-xl text-slate-300 font-semibold"
                >
                  Cancelar
                </button>
                <button
                  type="button"
                  onClick={handleSaveWarmupConfig}
                  className="px-6 py-2 bg-[#1db954] hover:bg-[#1aa34a] text-black font-bold uppercase tracking-wider text-xs rounded-xl shadow-lg shadow-green-900/30 transition-all cursor-pointer"
                >
                  SALVAR
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* MODAL: Configurar WhatsApp do Fluxo */}
      {isFlowWppModalOpen && (
        <div className="fixed inset-0 bg-black/80 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-[#14161d] rounded-2xl shadow-2xl border border-slate-800 max-w-md w-full p-6 text-xs text-slate-200 animate-in fade-in zoom-in-95 duration-150 space-y-4">
            <div className="flex items-center justify-between pb-3 border-b border-slate-800/80">
              <div className="flex items-center gap-2">
                <div className="p-2 bg-emerald-500/10 text-emerald-400 rounded-lg">
                  <Smartphone className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="font-bold text-white text-base">WhatsApp do Fluxo</h3>
                  <p className="text-[11px] text-slate-400">Linha de envio padrão para esta automação</p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setIsFlowWppModalOpen(false)}
                className="p-1 hover:text-white rounded-lg hover:bg-slate-800 transition-colors"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="space-y-3">
              <label className="block text-slate-300 font-semibold text-xs">
                Selecione o WhatsApp para os disparos:
              </label>
              <select
                value={flowWhatsappInstanceId}
                onChange={(e) => setFlowWhatsappInstanceId(e.target.value)}
                className="w-full bg-[#181c25] border border-slate-700 rounded-xl px-3.5 py-2.5 text-xs text-white focus:outline-none focus:border-emerald-500"
              >
                <option value="">-- Selecione uma linha de WhatsApp --</option>
                {availableWppInstances.map((inst) => (
                  <option key={inst.id} value={inst.id}>
                    {formatWppInstanceLabel(inst)} - {inst.connected ? '🟢 Conectado / Operacional' : '🔴 Desconectado'}
                  </option>
                ))}
              </select>

              {availableWppInstances.length === 0 && (
                <div className="p-3 rounded-xl bg-amber-950/40 border border-amber-500/30 text-amber-300 text-[11px] flex items-center justify-between">
                  <span>Nenhum WhatsApp cadastrado.</span>
                  <a href="/whatsapp" target="_blank" className="underline font-semibold hover:text-amber-200">
                    Cadastrar
                  </a>
                </div>
              )}

              <div className="pt-2 flex items-start gap-2.5 bg-[#181c25] p-3 rounded-xl border border-slate-800">
                <input
                  type="checkbox"
                  id="propagateWpp"
                  checked={propagateWppToAllNodes}
                  onChange={(e) => setPropagateWppToAllNodes(e.target.checked)}
                  className="mt-0.5 rounded border-slate-700 text-emerald-600 focus:ring-emerald-500"
                />
                <label htmlFor="propagateWpp" className="text-[11px] text-slate-300 cursor-pointer leading-tight">
                  <span className="font-semibold block text-slate-200">Aplicar a todos os blocos de WhatsApp</span>
                  Atualiza automaticamente todos os nós de WhatsApp deste fluxo para utilizarem esta linha.
                </label>
              </div>
            </div>

            <div className="pt-4 border-t border-slate-800/80 flex items-center justify-end gap-2">
              <button
                type="button"
                onClick={() => setIsFlowWppModalOpen(false)}
                className="px-4 py-2 border border-slate-700 hover:bg-slate-800 rounded-xl text-slate-300 font-semibold"
              >
                Cancelar
              </button>
              <button
                type="button"
                onClick={() => handleSaveFlowWhatsapp(flowWhatsappInstanceId, propagateWppToAllNodes)}
                className="px-5 py-2 bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-xs rounded-xl shadow-lg shadow-emerald-900/30 transition-all cursor-pointer"
              >
                Salvar Configuração
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal / Painel de Acompanhamento de Automação em Grupos (Requisito 11) */}
      {isGroupPanelOpen && (
        <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4 overflow-y-auto">
          <div className="bg-[#12141a] border border-slate-800 rounded-2xl w-full max-w-4xl max-h-[90vh] flex flex-col shadow-2xl animate-in zoom-in-95 duration-150">
            {/* Cabeçalho */}
            <div className="p-5 border-b border-slate-800 flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-purple-600/20 border border-purple-500/30 flex items-center justify-center text-purple-400">
                  <Users className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="font-bold text-white text-base flex items-center gap-2">
                    Acompanhamento de Automação em Grupos
                    <span className="text-[10px] bg-purple-950/80 text-purple-300 border border-purple-700/60 px-2 py-0.5 rounded-full font-semibold">
                      WhatsApp Groups
                    </span>
                  </h3>
                  <p className="text-xs text-slate-400">
                    Métricas em tempo real, etapas e status de execução por grupo elegível.
                  </p>
                </div>
              </div>

              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={handleSyncAndEnrollGroups}
                  disabled={syncingGroups}
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-purple-600 hover:bg-purple-500 disabled:opacity-50 text-white text-xs font-semibold shadow-md transition-all cursor-pointer"
                  title="Busca grupos elegíveis e inscreve no fluxo"
                >
                  <RefreshCw className={`w-3.5 h-3.5 ${syncingGroups ? 'animate-spin' : ''}`} />
                  <span>{syncingGroups ? 'Sincronizando...' : 'Sincronizar Grupos Elegíveis'}</span>
                </button>
                <button
                  type="button"
                  onClick={() => setIsGroupPanelOpen(false)}
                  className="p-1.5 text-slate-400 hover:text-white rounded-lg hover:bg-slate-800 transition-colors"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>
            </div>

            {/* Conteúdo com Scroll */}
            <div className="p-6 overflow-y-auto space-y-6">
              {/* Cards de Métricas */}
              <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
                <div className="bg-[#181c25] border border-slate-800 p-3.5 rounded-xl">
                  <span className="text-[11px] text-slate-400 font-medium block">Total Grupos</span>
                  <span className="text-2xl font-bold text-white mt-1 block">
                    {groupStats?.totalGroups ?? 0}
                  </span>
                </div>
                <div className="bg-[#181c25] border border-slate-800 p-3.5 rounded-xl">
                  <span className="text-[11px] text-amber-400 font-medium block">Pendentes</span>
                  <span className="text-2xl font-bold text-amber-300 mt-1 block">
                    {groupStats?.pendingCount ?? 0}
                  </span>
                </div>
                <div className="bg-[#181c25] border border-slate-800 p-3.5 rounded-xl">
                  <span className="text-[11px] text-sky-400 font-medium block">Processando</span>
                  <span className="text-2xl font-bold text-sky-300 mt-1 block">
                    {groupStats?.processingCount ?? 0}
                  </span>
                </div>
                <div className="bg-[#181c25] border border-slate-800 p-3.5 rounded-xl">
                  <span className="text-[11px] text-emerald-400 font-medium block">Enviados (Sucesso)</span>
                  <span className="text-2xl font-bold text-emerald-300 mt-1 block">
                    {groupStats?.completedCount ?? 0}
                  </span>
                </div>
                <div className="bg-[#181c25] border border-slate-800 p-3.5 rounded-xl">
                  <span className="text-[11px] text-rose-400 font-medium block">Falhas / Bloqueios</span>
                  <span className="text-2xl font-bold text-rose-300 mt-1 block">
                    {groupStats?.failedCount ?? 0}
                  </span>
                </div>
              </div>

              {/* Tabela de Grupos Inscritos */}
              <div className="bg-[#181c25] border border-slate-800 rounded-xl overflow-hidden">
                <div className="px-4 py-3 border-b border-slate-800 flex items-center justify-between">
                  <span className="font-bold text-xs text-white uppercase tracking-wider">
                    Grupos Inscritos nesta Automação ({groupStats?.enrollments?.length ?? 0})
                  </span>
                  <button
                    type="button"
                    onClick={fetchGroupStats}
                    disabled={loadingGroupStats}
                    className="text-xs text-slate-400 hover:text-white flex items-center gap-1 cursor-pointer"
                  >
                    <RefreshCw className={`w-3 h-3 ${loadingGroupStats ? 'animate-spin' : ''}`} />
                    <span>Atualizar</span>
                  </button>
                </div>

                {loadingGroupStats ? (
                  <div className="p-8 text-center text-xs text-slate-400">
                    Carregando dados dos grupos...
                  </div>
                ) : !groupStats?.enrollments || groupStats.enrollments.length === 0 ? (
                  <div className="p-8 text-center space-y-2">
                    <p className="text-xs text-slate-400">
                      Nenhum grupo elegível inscrito nesta automação até o momento.
                    </p>
                    <p className="text-[11px] text-slate-500">
                      Clique no botão acima para sincronizar e inscrever os grupos onde seu número é Administrador.
                    </p>
                  </div>
                ) : (
                  <div className="overflow-x-auto">
                    <table className="w-full text-left text-xs">
                      <thead className="bg-[#12141a] text-slate-400 border-b border-slate-800 text-[11px]">
                        <tr>
                          <th className="py-2.5 px-4 font-semibold">Grupo</th>
                          <th className="py-2.5 px-4 font-semibold">Permissão</th>
                          <th className="py-2.5 px-4 font-semibold">Etapa Atual</th>
                          <th className="py-2.5 px-4 font-semibold">Status</th>
                          <th className="py-2.5 px-4 font-semibold">Último Detalhe</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-800/60 text-slate-300">
                        {groupStats.enrollments.map((enr: any) => (
                          <tr key={enr.id} className="hover:bg-slate-800/30 transition-colors">
                            <td className="py-3 px-4">
                              <div className="flex items-center gap-2.5">
                                {enr.group?.pictureUrl ? (
                                  <img
                                    src={enr.group.pictureUrl}
                                    alt=""
                                    className="w-8 h-8 rounded-full object-cover border border-slate-700 shrink-0"
                                  />
                                ) : (
                                  <div className="w-8 h-8 rounded-full bg-purple-950/60 border border-purple-800/60 flex items-center justify-center text-purple-300 text-xs font-bold shrink-0">
                                    {(enr.group?.name || 'G')[0]}
                                  </div>
                                )}
                                <div>
                                  <span className="font-semibold text-white block">
                                    {enr.group?.name || 'Grupo sem nome'}
                                  </span>
                                  <span className="text-[10px] text-slate-400 font-mono block">
                                    {enr.group?.participantsCount ?? 0} participantes • {enr.group?.jid}
                                  </span>
                                </div>
                              </div>
                            </td>
                            <td className="py-3 px-4">
                              {enr.group?.adminRole === 'superadmin' ? (
                                <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold bg-amber-950/60 text-amber-300 border border-amber-600/40">
                                  🛡️ Super Admin
                                </span>
                              ) : enr.group?.isAdmin ? (
                                <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-950/60 text-emerald-300 border border-emerald-600/40">
                                  👑 Admin
                                </span>
                              ) : (
                                <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold bg-rose-950/60 text-rose-300 border border-rose-600/40">
                                  ⚠️ Não é Admin
                                </span>
                              )}
                            </td>
                            <td className="py-3 px-4">
                              <span className="font-mono text-[11px] text-slate-300">
                                {enr.currentNodeId || 'Início'}
                              </span>
                            </td>
                            <td className="py-3 px-4">
                              <span
                                className={`inline-block px-2 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider ${
                                  enr.status === 'COMPLETED'
                                    ? 'bg-emerald-950/60 text-emerald-300 border border-emerald-600/40'
                                    : enr.status === 'FAILED'
                                    ? 'bg-rose-950/60 text-rose-300 border border-rose-600/40'
                                    : enr.status === 'WAITING' || enr.status === 'PENDING'
                                    ? 'bg-amber-950/60 text-amber-300 border border-amber-600/40'
                                    : 'bg-sky-950/60 text-sky-300 border border-sky-600/40'
                                }`}
                              >
                                {enr.status === 'COMPLETED'
                                  ? 'Concluído'
                                  : enr.status === 'FAILED'
                                  ? 'Falha'
                                  : enr.status === 'WAITING'
                                  ? 'Aguardando'
                                  : 'Ativo'}
                              </span>
                            </td>
                            <td className="py-3 px-4 text-[11px] text-slate-400 max-w-xs truncate">
                              {enr.lastStep?.errorMessage ? (
                                <span className="text-rose-400 font-medium">{enr.lastStep.errorMessage}</span>
                              ) : enr.lastStep?.executedAt ? (
                                <span>Último envio: {new Date(enr.lastStep.executedAt).toLocaleTimeString('pt-BR')}</span>
                              ) : (
                                <span className="text-slate-600">Nenhum evento registrado</span>
                              )}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            </div>

            {/* Rodapé do Modal */}
            <div className="p-4 border-t border-slate-800 flex items-center justify-end">
              <button
                type="button"
                onClick={() => setIsGroupPanelOpen(false)}
                className="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-semibold rounded-xl transition-colors cursor-pointer"
              >
                Fechar
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
