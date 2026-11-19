'use client';

import { useState, useEffect } from 'react';
import {
  Plug,
  Copy,
  Check,
  Sparkles,
  ShieldCheck,
  Send,
  MessageSquare,
  Flame,
  AlertTriangle,
  Zap,
  ShoppingBag,
  DollarSign,
  CreditCard,
  GraduationCap,
  PackageCheck,
  Code,
  Plus,
  Trash2,
  Edit3,
  Clock,
  CheckCircle2,
  AlertCircle,
  RotateCw,
  ExternalLink,
  X,
  Layers,
  Tags,
  Globe,
  Search,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  Terminal,
  FileText,
  Users,
  ArrowLeft,
  BookOpen,
} from 'lucide-react';
import {
  CheckoutPlatformId,
  PLATFORM_PRESETS,
  PlatformCategory,
  StandardCheckoutEventType,
} from '@/services/checkout/types';
import { WordPressIntegrationTab } from '@/components/integrations/WordPressIntegrationTab';
import { PlatformLogo } from '@/components/integrations/PlatformLogos';

interface TagItem {
  id: string;
  name: string;
  color: string;
}

interface IntegrationItem {
  id: string;
  tenantId: string;
  platform: CheckoutPlatformId;
  name: string;
  status: 'ACTIVE' | 'INACTIVE';
  secretKey?: string | null;
  webhookUrl?: string | null;
  allowedEvents: string;
  productName?: string | null;
  productId?: string | null;
  fieldMapping?: {
    name?: string;
    email?: string;
    phone?: string;
  } | null;
  createdAt: string;
  integrationTags?: Array<{
    id: string;
    tagId: string;
    tag: {
      id: string;
      name: string;
      color: string;
    };
  }>;
  _count?: {
    webhookEvents: number;
    products: number;
  };
}

interface WebhookEventItem {
  id: string;
  platform: string;
  eventType: string;
  status: string;
  customerEmail?: string | null;
  customerName?: string | null;
  customerPhone?: string | null;
  productName?: string | null;
  priceValue?: number | null;
  paymentType?: string | null;
  transactionId?: string | null;
  errorMessage?: string | null;
  payload: string;
  createdAt: string;
}

const AVAILABLE_EVENTS: { id: StandardCheckoutEventType; label: string; desc: string }[] = [
  { id: 'purchase_approved', label: 'Compra Aprovada', desc: 'Venda confirmada / pagamento compensado' },
  { id: 'pix_generated', label: 'Pix Gerado', desc: 'Chave Pix criada aguardando liquidação' },
  { id: 'billet_printed', label: 'Boleto Gerado', desc: 'Boleto bancário emitido pelo cliente' },
  { id: 'purchase_waiting_payment', label: 'Aguardando Pagamento', desc: 'Pedido pendente de aprovação' },
  { id: 'cart_abandoned', label: 'Carrinho Abandonado', desc: 'Cliente preencheu dados mas não concluiu' },
  { id: 'canceled', label: 'Cancelamento', desc: 'Pedido ou assinatura cancelada' },
  { id: 'refunded', label: 'Reembolso', desc: 'Valor estornado ao cliente' },
  { id: 'chargeback', label: 'Chargeback', desc: 'Disputa aberta junto à operadora do cartão' },
];

export default function IntegrationsPage() {
  const [activeTab, setActiveTab] = useState<
    'checkout' | 'catalog' | 'public_api' | 'wordpress' | 'events' | 'simulate' | 'whatsapp'
  >('checkout');
  const [tenant, setTenant] = useState<any>(null);
  const [wpCount, setWpCount] = useState(0);

  // Integrações
  const [integrations, setIntegrations] = useState<IntegrationItem[]>([]);
  const [stats, setStats] = useState({
    totalIntegrations: 0,
    totalEvents: 0,
    approvedCount: 0,
    waitingCount: 0,
    abandonedCount: 0,
  });
  const [loadingIntegrations, setLoadingIntegrations] = useState(true);

  // Histórico de Webhooks
  const [events, setEvents] = useState<WebhookEventItem[]>([]);
  const [loadingEvents, setLoadingEvents] = useState(false);
  const [selectedEventForModal, setSelectedEventForModal] = useState<WebhookEventItem | null>(null);

  // Catálogo (App Store) Modal & Filtro
  const [isCatalogModalOpen, setIsCatalogModalOpen] = useState(false);
  const [catalogSearchQuery, setCatalogSearchQuery] = useState('');
  const [catalogCategoryFilter, setCatalogCategoryFilter] = useState<'ALL' | PlatformCategory>('ALL');

  // Modal Criar / Editar Integração
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingIntegrationId, setEditingIntegrationId] = useState<string | null>(null);
  const [modalForm, setModalForm] = useState<{
    generatedUniqueId: string;
    platform: CheckoutPlatformId;
    name: string;
    productName: string;
    productId: string;
    secretKey: string;
    allowedEvents: StandardCheckoutEventType[];
    status: 'ACTIVE' | 'INACTIVE';
    selectedTagIds: string[];
    fieldMapping: {
      name: string;
      email: string;
      phone: string;
    };
  }>({
    generatedUniqueId: '',
    platform: 'HOTMART',
    name: '',
    productName: '',
    productId: '',
    secretKey: '',
    allowedEvents: [
      'purchase_approved',
      'pix_generated',
      'billet_printed',
      'purchase_waiting_payment',
      'cart_abandoned',
      'canceled',
      'refunded',
      'chargeback',
    ],
    status: 'ACTIVE',
    selectedTagIds: [],
    fieldMapping: {
      name: 'payload.name',
      email: 'payload.email',
      phone: 'payload.phone',
    },
  });
  const [savingModal, setSavingModal] = useState(false);
  const [modalError, setModalError] = useState<string | null>(null);

  // Tags para aplicação automática
  const [availableTags, setAvailableTags] = useState<TagItem[]>([]);
  const [newTagName, setNewTagName] = useState('');
  const [creatingTag, setCreatingTag] = useState(false);

  // Copied states
  const [copiedId, setCopiedId] = useState<string | null>(null);

  // Webhook recém-criado com sucesso para exibição imediata
  const [createdWebhookSuccess, setCreatedWebhookSuccess] = useState<{
    id: string;
    name: string;
    platform: string;
    url: string;
  } | null>(null);

  // Simulador Multi-Plataforma
  const [simPlatform, setSimPlatform] = useState<CheckoutPlatformId>('HOTMART');
  const [simEvent, setSimEvent] = useState<StandardCheckoutEventType>('purchase_approved');
  const [simEmail, setSimEmail] = useState('comprador.teste@gmail.com');
  const [simName, setSimName] = useState('Carlos Aluno VIP');
  const [simPhone, setSimPhone] = useState('+5511999998888');
  const [simProduct, setSimProduct] = useState('Formação Lançador Pro 2026');
  const [simPayment, setSimPayment] = useState('PIX');
  const [simValue, setSimValue] = useState('997.00');
  const [simulating, setSimulating] = useState(false);
  const [simResult, setSimResult] = useState<any>(null);

  // Evolution API
  const [evoStatus, setEvoStatus] = useState<any>(null);
  const [testPhone, setTestPhone] = useState('+55');
  const [testText, setTestText] = useState('Olá! Mensagem de teste enviada pela Evolution API no LaunchFlow.');
  const [testingEvo, setTestingEvo] = useState(false);
  const [evoTestResult, setEvoTestResult] = useState<any>(null);

  const fetchWpCount = async () => {
    try {
      const res = await fetch('/api/wordpress/integrations');
      const data = await res.json();
      if (res.ok && data.integrations) {
        setWpCount(data.integrations.length);
      }
    } catch {}
  };

  const fetchIntegrations = async () => {
    setLoadingIntegrations(true);
    fetchWpCount();
    try {
      const res = await fetch('/api/checkout/integrations');
      const data = await res.json();
      if (res.ok) {
        setIntegrations(data.integrations || []);
        if (data.stats) setStats(data.stats);
      }
    } catch {
    } finally {
      setLoadingIntegrations(false);
    }
  };

  const fetchEvents = async () => {
    setLoadingEvents(true);
    try {
      const res = await fetch('/api/checkout/webhooks/events?limit=50');
      const data = await res.json();
      if (res.ok) {
        setEvents(data.events || []);
      }
    } catch {
    } finally {
      setLoadingEvents(false);
    }
  };

  const fetchTags = async () => {
    try {
      const res = await fetch('/api/tags');
      const data = await res.json();
      if (data.tags) {
        setAvailableTags(data.tags);
      }
    } catch {}
  };

  const handleCreateNewTagInline = async () => {
    if (!newTagName.trim()) return;
    setCreatingTag(true);
    try {
      const res = await fetch('/api/tags', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: newTagName.trim() }),
      });
      const data = await res.json();
      if (data.tag) {
        setAvailableTags((prev) => {
          if (prev.some((t) => t.id === data.tag.id)) return prev;
          return [...prev, data.tag];
        });
        setModalForm((prev) => ({
          ...prev,
          selectedTagIds: prev.selectedTagIds.includes(data.tag.id)
            ? prev.selectedTagIds
            : [...prev.selectedTagIds, data.tag.id],
        }));
        setNewTagName('');
      }
    } catch {}
    setCreatingTag(false);
  };

  useEffect(() => {
    fetch('/api/auth/me')
      .then((res) => res.json())
      .then((data) => {
        if (data.activeTenant) setTenant(data.activeTenant);
      })
      .catch(() => {});

    fetch('/api/whatsapp')
      .then((res) => res.json())
      .then((data) => setEvoStatus(data))
      .catch(() => {});

    fetchIntegrations();
    fetchTags();
  }, []);

  useEffect(() => {
    if (activeTab === 'events') {
      fetchEvents();
    }
  }, [activeTab]);

  const copyToClipboard = (text: string, id: string) => {
    navigator.clipboard.writeText(text);
    setCopiedId(id);
    setTimeout(() => setCopiedId(null), 2500);
  };

  const getWebhookUrl = (integrationId: string) => {
    const origin = typeof window !== 'undefined' ? window.location.origin : 'http://localhost:3000';
    return `${origin}/api/webhooks/checkout/${integrationId}`;
  };

  const getDirectWebhookUrl = () => {
    const origin = typeof window !== 'undefined' ? window.location.origin : 'http://localhost:3000';
    return `${origin}/api/webhooks/hotmart?tenant=${tenant?.id || ''}`;
  };

  // Abre o catálogo da App Store para escolher a plataforma
  const handleOpenCreateModal = () => {
    setIsCatalogModalOpen(true);
  };

  // Quando o usuário clica em uma das 67 plataformas no catálogo
  const handleSelectPlatformFromCatalog = (platformId: CheckoutPlatformId) => {
    const preset = PLATFORM_PRESETS.find((p) => p.id === platformId) || PLATFORM_PRESETS[0];
    const genId = Math.random().toString(36).substring(2, 10);
    const genSecret = 'whsec_' + Math.random().toString(36).substring(2, 14);

    setEditingIntegrationId(null);
    setCreatedWebhookSuccess(null);
    setModalForm({
      generatedUniqueId: genId,
      platform: platformId,
      name: `${preset.name} - Conexão`,
      productName: '',
      productId: '',
      secretKey: genSecret,
      allowedEvents: [
        'purchase_approved',
        'pix_generated',
        'billet_printed',
        'purchase_waiting_payment',
        'cart_abandoned',
        'canceled',
        'refunded',
        'chargeback',
      ],
      status: 'ACTIVE',
      selectedTagIds: [],
      fieldMapping: {
        name: 'payload.name',
        email: 'payload.email',
        phone: 'payload.phone',
      },
    });
    setModalError(null);
    setIsCatalogModalOpen(false);
    setIsModalOpen(true);
  };

  const handleOpenEditModal = (item: IntegrationItem) => {
    setEditingIntegrationId(item.id);
    setCreatedWebhookSuccess(null);
    let allowed: StandardCheckoutEventType[] = [];
    try {
      allowed = JSON.parse(item.allowedEvents);
    } catch {
      allowed = ['purchase_approved'];
    }

    setModalForm({
      generatedUniqueId: item.id,
      platform: item.platform,
      name: item.name,
      productName: item.productName || '',
      productId: item.productId || '',
      secretKey: item.secretKey || '',
      allowedEvents: allowed,
      status: item.status,
      selectedTagIds: (item.integrationTags || []).map((it) => it.tagId),
      fieldMapping: {
        name: item.fieldMapping?.name || 'payload.name',
        email: item.fieldMapping?.email || 'payload.email',
        phone: item.fieldMapping?.phone || 'payload.phone',
      },
    });
    setModalError(null);
    setIsModalOpen(true);
  };

  const handleSaveModal = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!modalForm.name.trim()) {
      setModalError('Informe um nome identificador para a integração.');
      return;
    }
    if (modalForm.allowedEvents.length === 0) {
      setModalError('Selecione ao menos 1 evento de webhook para receber.');
      return;
    }

    setSavingModal(true);
    setModalError(null);

    try {
      const url = editingIntegrationId
        ? `/api/checkout/integrations/${editingIntegrationId}`
        : '/api/checkout/integrations';
      const method = editingIntegrationId ? 'PUT' : 'POST';

      const res = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...modalForm,
          tagIds: modalForm.selectedTagIds,
          customId: !editingIntegrationId ? modalForm.generatedUniqueId : undefined,
          fieldMapping: modalForm.fieldMapping,
        }),
      });

      const data = await res.json();
      if (res.ok) {
        fetchIntegrations();
        const integrationId = editingIntegrationId || data.integration?.id || modalForm.generatedUniqueId;
        if (integrationId) {
          setCreatedWebhookSuccess({
            id: integrationId,
            name: modalForm.name,
            platform: modalForm.platform,
            url: getWebhookUrl(integrationId),
          });
        } else {
          setIsModalOpen(false);
        }
      } else {
        setModalError(data.error || 'Erro ao salvar integração.');
      }
    } catch (err: any) {
      setModalError(err.message || 'Falha de comunicação.');
    } finally {
      setSavingModal(false);
    }
  };

  const handleDeleteIntegration = async (id: string, name: string) => {
    if (
      !confirm(
        `Deseja realmente excluir a integração "${name}"? Os webhooks enviados a esta URL deixarão de ser processados.`
      )
    ) {
      return;
    }

    try {
      const res = await fetch(`/api/checkout/integrations/${id}`, { method: 'DELETE' });
      if (res.ok) {
        fetchIntegrations();
      }
    } catch {}
  };

  const handleSimulateWebhook = async (e: React.FormEvent) => {
    e.preventDefault();
    setSimulating(true);
    setSimResult(null);

    try {
      const res = await fetch('/api/checkout/webhooks/simulate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          platform: simPlatform,
          eventType: simEvent,
          buyerEmail: simEmail,
          buyerName: simName,
          buyerPhone: simPhone,
          productName: simProduct,
          paymentType: simPayment,
          priceValue: parseFloat(simValue) || 997.0,
        }),
      });
      const data = await res.json();
      setSimResult(data);
      fetchEvents();
      fetchIntegrations();
    } catch (err: any) {
      setSimResult({ success: false, error: err.message });
    } finally {
      setSimulating(false);
    }
  };

  const handleTestEvolution = async (e: React.FormEvent) => {
    e.preventDefault();
    setTestingEvo(true);
    setEvoTestResult(null);
    try {
      const res = await fetch('/api/integrations/evolution', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ phone: testPhone, text: testText }),
      });
      const data = await res.json();
      setEvoTestResult(data);
    } catch (err: any) {
      setEvoTestResult({ success: false, error: err.message });
    } finally {
      setTestingEvo(false);
    }
  };

  // Renderiza o emblema e ícone visual oficial de cada plataforma
  const renderPlatformBrandLogo = (platformId: string) => {
    return <PlatformLogo platformId={platformId} size={40} />;
  };

  const selectedPreset =
    PLATFORM_PRESETS.find((p) => p.id === modalForm.platform) || PLATFORM_PRESETS[0];

  // Filtro de plataformas no catálogo
  const filteredPlatforms = PLATFORM_PRESETS.filter((p) => {
    const matchesSearch =
      p.name.toLowerCase().includes(catalogSearchQuery.toLowerCase()) ||
      p.description.toLowerCase().includes(catalogSearchQuery.toLowerCase());
    const matchesCategory =
      catalogCategoryFilter === 'ALL' || p.category === catalogCategoryFilter;
    return matchesSearch && matchesCategory;
  });

  return (
    <div className="space-y-8 max-w-7xl mx-auto">
      {/* Topo com Título e Botão de Ação */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2.5">
            <h1 className="text-2xl font-bold text-slate-900 tracking-tight">
              Central de Integrações & Webhooks
            </h1>
            <span className="px-2.5 py-0.5 rounded-full text-[11px] font-bold bg-indigo-50 text-indigo-700 border border-indigo-200">
              {PLATFORM_PRESETS.length} Plataformas Disponíveis
            </span>
          </div>
          <p className="text-sm text-slate-500 mt-1">
            Conecte plataformas de vendas, CRMs, e-commerces, formulários de captura ou crie webhooks
            universais JSON com ingestão e deduplicação de leads no CRM.
          </p>
        </div>

        <div className="flex items-center gap-2.5 flex-wrap">
          <button
            type="button"
            onClick={() => setActiveTab('catalog')}
            className="flex items-center gap-2 px-3.5 py-2.5 rounded-xl border border-slate-300 bg-white hover:bg-slate-50 text-slate-700 font-bold text-xs transition-colors shadow-2xs cursor-pointer"
          >
            <ShoppingBag className="w-4 h-4 text-indigo-600" />
            <span>Catálogo (App Store)</span>
          </button>

          <button
            type="button"
            onClick={handleOpenCreateModal}
            className="flex items-center gap-2 px-4 py-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white font-semibold text-xs transition-colors shadow-sm cursor-pointer"
          >
            <Plus className="w-4 h-4" />
            <span>+ Nova Integração</span>
          </button>
        </div>
      </div>

      {/* 5 Cards de Métricas */}
      <div className="grid grid-cols-2 sm:grid-cols-5 gap-3.5">
        <div className="p-4 rounded-2xl bg-white border border-slate-200 shadow-sm flex flex-col justify-between">
          <span className="text-[11px] font-bold uppercase tracking-wider text-slate-400">
            Integrações
          </span>
          <div className="mt-2 flex items-baseline justify-between">
            <span className="text-2xl font-black text-slate-900 font-mono">
              {stats.totalIntegrations}
            </span>
            <span className="text-[10px] text-indigo-600 font-bold">Ativas</span>
          </div>
        </div>

        <div className="p-4 rounded-2xl bg-white border border-slate-200 shadow-sm flex flex-col justify-between">
          <span className="text-[11px] font-bold uppercase tracking-wider text-emerald-700">
            Compras Aprovadas
          </span>
          <div className="mt-2 flex items-baseline justify-between">
            <span className="text-2xl font-black text-emerald-900 font-mono">
              {stats.approvedCount}
            </span>
            <span className="text-[10px] text-emerald-600 font-semibold">Alunos/Clientes</span>
          </div>
        </div>

        <div className="p-4 rounded-2xl bg-white border border-slate-200 shadow-sm flex flex-col justify-between">
          <span className="text-[11px] font-bold uppercase tracking-wider text-amber-700">
            Aguardando Pgto
          </span>
          <div className="mt-2 flex items-baseline justify-between">
            <span className="text-2xl font-black text-amber-900 font-mono">
              {stats.waitingCount}
            </span>
            <span className="text-[10px] text-amber-600 font-semibold">Pix / Boletos</span>
          </div>
        </div>

        <div className="p-4 rounded-2xl bg-white border border-slate-200 shadow-sm flex flex-col justify-between">
          <span className="text-[11px] font-bold uppercase tracking-wider text-rose-700">
            Carrinhos Abandonados
          </span>
          <div className="mt-2 flex items-baseline justify-between">
            <span className="text-2xl font-black text-rose-900 font-mono">
              {stats.abandonedCount}
            </span>
            <span className="text-[10px] text-rose-600 font-semibold">Recuperação</span>
          </div>
        </div>

        <div className="p-4 rounded-2xl bg-white border border-slate-200 shadow-sm flex flex-col justify-between">
          <span className="text-[11px] font-bold uppercase tracking-wider text-blue-700">
            Total de Webhooks
          </span>
          <div className="mt-2 flex items-baseline justify-between">
            <span className="text-2xl font-black text-blue-900 font-mono">
              {stats.totalEvents}
            </span>
            <span className="text-[10px] text-blue-600 font-semibold">Eventos</span>
          </div>
        </div>
      </div>

      {/* Navegação por Abas */}
      <div className="flex items-center gap-2 border-b border-slate-200 pb-2 overflow-x-auto">
        <button
          type="button"
          onClick={() => setActiveTab('checkout')}
          className={`flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-bold transition-all cursor-pointer whitespace-nowrap ${
            activeTab === 'checkout'
              ? 'bg-indigo-600 text-white shadow-sm'
              : 'text-slate-600 hover:text-slate-900 hover:bg-slate-100'
          }`}
        >
          <Layers className="w-3.5 h-3.5" />
          <span>Integrações Conectadas</span>
          <span className="ml-1 px-1.5 py-0.5 rounded-full text-[10px] bg-white/20">
            {integrations.length}
          </span>
        </button>

        <button
          type="button"
          onClick={() => setActiveTab('catalog')}
          className={`flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-bold transition-all cursor-pointer whitespace-nowrap ${
            activeTab === 'catalog'
              ? 'bg-indigo-600 text-white shadow-sm'
              : 'text-slate-600 hover:text-slate-900 hover:bg-slate-100'
          }`}
        >
          <ShoppingBag className="w-3.5 h-3.5" />
          <span>Catálogo (App Store)</span>
          <span className="ml-1 px-1.5 py-0.5 rounded-full text-[10px] bg-emerald-100 text-emerald-800 font-bold">
            67
          </span>
        </button>

        <button
          type="button"
          onClick={() => setActiveTab('public_api')}
          className={`flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-bold transition-all cursor-pointer whitespace-nowrap ${
            activeTab === 'public_api'
              ? 'bg-indigo-600 text-white shadow-sm'
              : 'text-slate-600 hover:text-slate-900 hover:bg-slate-100'
          }`}
        >
          <Terminal className="w-3.5 h-3.5" />
          <span>API Pública de Leads</span>
        </button>

        <button
          type="button"
          onClick={() => setActiveTab('wordpress')}
          className={`flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-bold transition-all cursor-pointer whitespace-nowrap ${
            activeTab === 'wordpress'
              ? 'bg-sky-600 text-white shadow-sm'
              : 'text-slate-600 hover:text-slate-900 hover:bg-slate-100'
          }`}
        >
          <Globe className="w-3.5 h-3.5 text-sky-400" />
          <span>WordPress & Elementor</span>
          <span
            className={`ml-1 px-1.5 py-0.5 rounded-full text-[10px] ${
              activeTab === 'wordpress' ? 'bg-white/20' : 'bg-slate-200 text-slate-700 font-bold'
            }`}
          >
            {wpCount}
          </span>
        </button>

        <button
          type="button"
          onClick={() => setActiveTab('events')}
          className={`flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-bold transition-all cursor-pointer whitespace-nowrap ${
            activeTab === 'events'
              ? 'bg-indigo-600 text-white shadow-sm'
              : 'text-slate-600 hover:text-slate-900 hover:bg-slate-100'
          }`}
        >
          <Clock className="w-3.5 h-3.5" />
          <span>Histórico de Webhooks</span>
        </button>

        <button
          type="button"
          onClick={() => setActiveTab('simulate')}
          className={`flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-bold transition-all cursor-pointer whitespace-nowrap ${
            activeTab === 'simulate'
              ? 'bg-indigo-600 text-white shadow-sm'
              : 'text-slate-600 hover:text-slate-900 hover:bg-slate-100'
          }`}
        >
          <Sparkles className="w-3.5 h-3.5" />
          <span>Simulador</span>
        </button>

        <button
          type="button"
          onClick={() => setActiveTab('whatsapp')}
          className={`flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-bold transition-all cursor-pointer whitespace-nowrap ${
            activeTab === 'whatsapp'
              ? 'bg-indigo-600 text-white shadow-sm'
              : 'text-slate-600 hover:text-slate-900 hover:bg-slate-100'
          }`}
        >
          <MessageSquare className="w-3.5 h-3.5" />
          <span>WhatsApp Evolution</span>
        </button>
      </div>

      {/* ABA 1: INTEGRAÇÕES CONECTADAS */}
      {activeTab === 'checkout' && (
        <div className="space-y-6">
          {/* BANNER OFICIAL: WEBHOOK RÁPIDO PARA COPIAR E COLAR NA HOTMART */}
          <div className="p-5 rounded-2xl bg-gradient-to-r from-orange-50 via-amber-50/70 to-orange-50/50 dark:from-orange-950/40 dark:via-amber-950/25 dark:to-orange-950/20 border border-orange-200/90 dark:border-orange-500/30 shadow-2xs flex flex-col lg:flex-row lg:items-center justify-between gap-4">
            <div className="flex items-center gap-3.5">
              <div className="w-11 h-11 rounded-2xl bg-gradient-to-tr from-orange-500 to-amber-500 text-white flex items-center justify-center shadow-md shadow-orange-500/20 shrink-0">
                <Flame className="w-6 h-6 fill-white" />
              </div>
              <div>
                <div className="flex items-center gap-2">
                  <h3 className="font-bold text-slate-900 dark:text-white text-sm sm:text-base">
                    URL para envio de dados na Hotmart (Webhook)
                  </h3>
                  <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-orange-100 dark:bg-orange-500/20 text-orange-800 dark:text-orange-300 border border-orange-200 dark:border-orange-500/30">
                    Oficial 2.0
                  </span>
                </div>
                <p className="text-xs text-slate-600 dark:text-slate-300 mt-0.5 leading-relaxed">
                  Copie esta URL e cole diretamente no campo <strong>&quot;URL para envio de dados&quot;</strong> na tela de Webhooks da Hotmart.
                </p>
              </div>
            </div>

            <div className="flex items-center gap-2 bg-white dark:bg-slate-900/90 p-2 rounded-xl border border-orange-200 dark:border-orange-500/30 shrink-0 shadow-2xs">
              <input
                type="text"
                readOnly
                value={getDirectWebhookUrl()}
                className="text-xs font-mono text-slate-800 dark:text-orange-200 bg-transparent w-48 sm:w-72 focus:outline-none select-all"
              />
              <button
                type="button"
                onClick={() => copyToClipboard(getDirectWebhookUrl(), 'main_banner_direct')}
                className={`flex items-center gap-1.5 px-3.5 py-2 rounded-lg text-xs font-bold transition-all shrink-0 cursor-pointer ${
                  copiedId === 'main_banner_direct'
                    ? 'bg-emerald-600 text-white'
                    : 'bg-slate-900 hover:bg-slate-800 text-white shadow-xs'
                }`}
              >
                {copiedId === 'main_banner_direct' ? (
                  <>
                    <Check className="w-3.5 h-3.5" />
                    <span>Copiado!</span>
                  </>
                ) : (
                  <>
                    <Copy className="w-3.5 h-3.5" />
                    <span>Copiar Webhook</span>
                  </>
                )}
              </button>
            </div>
          </div>

          {loadingIntegrations ? (
            <div className="p-12 text-center text-slate-400 bg-white rounded-2xl border border-slate-200">
              <RotateCw className="w-6 h-6 animate-spin mx-auto mb-2 text-indigo-500" />
              <p className="text-xs">Carregando integrações do expert...</p>
            </div>
          ) : integrations.length === 0 ? (
            <div className="bg-white rounded-2xl border border-dashed border-slate-300 p-12 text-center space-y-4">
              <div className="w-12 h-12 rounded-2xl bg-indigo-50 text-indigo-600 mx-auto flex items-center justify-center">
                <Plug className="w-6 h-6" />
              </div>
              <div className="max-w-md mx-auto">
                <h3 className="font-bold text-slate-900 text-sm">
                  Nenhuma plataforma integrada ainda
                </h3>
                <p className="text-xs text-slate-500 mt-1 leading-relaxed">
                  Escolha qualquer uma das 67 ferramentas (Hotmart, Kiwify, Eduzz, Braip, WooCommerce,
                  Active Campaign, Formulários HTML, Custom JSON, etc.) para conectar ao LaunchFlow.
                </p>
              </div>
              <button
                type="button"
                onClick={handleOpenCreateModal}
                className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white font-semibold text-xs shadow-sm transition-colors cursor-pointer"
              >
                <Plus className="w-4 h-4" />
                <span>Escolher Plataforma no Catálogo</span>
              </button>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              {integrations.map((item) => {
                const webhookUrl = getWebhookUrl(item.id);
                const isCopied = copiedId === item.id;
                let parsedAllowed: string[] = [];
                try {
                  parsedAllowed = JSON.parse(item.allowedEvents);
                } catch {
                  parsedAllowed = [];
                }

                return (
                  <div
                    key={item.id}
                    className="bg-white rounded-2xl border border-slate-200 shadow-sm p-6 space-y-5 hover:border-slate-300 transition-all flex flex-col justify-between"
                  >
                    <div className="space-y-4">
                      {/* Cabeçalho do Card */}
                      <div className="flex items-start justify-between gap-3">
                        <div className="flex items-center gap-3">
                          <div className="w-11 h-11 rounded-xl bg-slate-900 flex items-center justify-center shadow-sm shrink-0">
                            {renderPlatformBrandLogo(item.platform)}
                          </div>
                          <div>
                            <div className="flex items-center gap-2">
                              <h3 className="font-bold text-slate-900 text-base">{item.name}</h3>
                              <span
                                className={`px-2 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider ${
                                  item.status === 'ACTIVE'
                                    ? 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                                    : 'bg-slate-100 text-slate-600'
                                }`}
                              >
                                {item.status === 'ACTIVE' ? 'Ativa' : 'Pausada'}
                              </span>
                            </div>
                            <span className="text-xs text-slate-400 font-medium">
                              Plataforma:{' '}
                              <strong className="text-slate-700 font-semibold">{item.platform}</strong>
                              {item.productName && ` • Produto: ${item.productName}`}
                            </span>
                          </div>
                        </div>

                        <div className="flex items-center gap-1">
                          <button
                            type="button"
                            onClick={() => handleOpenEditModal(item)}
                            className="p-1.5 rounded-lg text-slate-400 hover:text-slate-700 hover:bg-slate-100 transition-colors cursor-pointer"
                            title="Editar integração"
                          >
                            <Edit3 className="w-4 h-4" />
                          </button>
                          <button
                            type="button"
                            onClick={() => handleDeleteIntegration(item.id, item.name)}
                            className="p-1.5 rounded-lg text-slate-400 hover:text-rose-600 hover:bg-rose-50 transition-colors cursor-pointer"
                            title="Excluir integração"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        </div>
                      </div>

                      {/* URL Única de Webhook com botão de cópia */}
                      <div className="space-y-1.5">
                        <div className="flex items-center justify-between text-xs">
                          <label className="font-bold uppercase tracking-wider text-[10px] text-slate-500">
                            URL do Webhook Exclusiva
                          </label>
                          <span className="text-[10px] text-slate-400">Postback HTTP / POST</span>
                        </div>
                        <div className="flex items-center gap-2 p-2 rounded-xl bg-slate-50 border border-slate-200">
                          <input
                            type="text"
                            readOnly
                            value={webhookUrl}
                            className="flex-1 bg-transparent text-xs font-mono text-slate-800 focus:outline-none select-all"
                          />
                          <button
                            type="button"
                            onClick={() => copyToClipboard(webhookUrl, item.id)}
                            className={`flex items-center gap-1 px-2.5 py-1 rounded-lg text-xs font-semibold transition-colors shrink-0 cursor-pointer ${
                              isCopied
                                ? 'bg-emerald-600 text-white'
                                : 'bg-slate-900 hover:bg-slate-800 text-white'
                            }`}
                          >
                            {isCopied ? (
                              <>
                                <Check className="w-3 h-3" />
                                <span>Copiado!</span>
                              </>
                            ) : (
                              <>
                                <Copy className="w-3 h-3" />
                                <span>Copiar Webhook</span>
                              </>
                            )}
                          </button>
                        </div>
                      </div>

                      {/* Chave Secreta se existir */}
                      {item.secretKey && (
                        <div className="text-[11px] flex items-center justify-between p-2 rounded-lg bg-indigo-50/50 border border-indigo-100 text-indigo-900">
                          <div className="flex items-center gap-1.5">
                            <ShieldCheck className="w-3.5 h-3.5 text-indigo-600" />
                            <span>
                              Token/Chave Secreta: <code className="font-mono">{item.secretKey}</code>
                            </span>
                          </div>
                          <button
                            type="button"
                            onClick={() => copyToClipboard(item.secretKey!, `secret_${item.id}`)}
                            className="text-xs font-semibold text-indigo-600 hover:underline cursor-pointer"
                          >
                            {copiedId === `secret_${item.id}` ? 'Copiado!' : 'Copiar'}
                          </button>
                        </div>
                      )}

                      {/* Tags aplicadas automaticamente */}
                      {item.integrationTags && item.integrationTags.length > 0 && (
                        <div className="space-y-1.5 pt-1">
                          <span className="text-[10px] font-bold uppercase tracking-wider text-slate-500 block">
                            Tags automáticas ({item.integrationTags.length}):
                          </span>
                          <div className="flex flex-wrap gap-1.5">
                            {item.integrationTags.map((it) => (
                              <span
                                key={it.id || it.tagId}
                                className="inline-flex items-center px-2 py-0.5 rounded-md text-[11px] font-semibold text-white shadow-2xs"
                                style={{ backgroundColor: it.tag?.color || '#6366f1' }}
                              >
                                #{it.tag?.name}
                              </span>
                            ))}
                          </div>
                        </div>
                      )}

                      {/* Eventos Aceitos (Badges) */}
                      <div className="space-y-1">
                        <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400 block">
                          Eventos Aceitos:
                        </span>
                        <div className="flex flex-wrap gap-1">
                          {parsedAllowed.map((ev) => (
                            <span
                              key={ev}
                              className="px-2 py-0.5 rounded-md text-[10px] font-medium bg-slate-100 text-slate-700 border border-slate-200"
                            >
                              {ev.replace(/_/g, ' ')}
                            </span>
                          ))}
                        </div>
                      </div>
                    </div>

                    {/* Rodapé do Card */}
                    <div className="pt-4 border-t border-slate-100 flex items-center justify-between text-xs text-slate-400">
                      <span>{item._count?.webhookEvents || 0} webhooks processados</span>
                      <button
                        type="button"
                        onClick={() => {
                          setSimPlatform(item.platform);
                          setSimProduct(item.productName || 'Mentoria VIP');
                          setActiveTab('simulate');
                        }}
                        className="text-xs font-semibold text-indigo-600 hover:text-indigo-800 flex items-center gap-1 cursor-pointer"
                      >
                        <Sparkles className="w-3 h-3" />
                        <span>Simular Evento</span>
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* ABA 2: CATÁLOGO DE PLATAFORMAS (APP STORE) INLINE */}
      {activeTab === 'catalog' && (
        <div className="bg-[#12141a] rounded-3xl p-6 text-white space-y-6 border border-zinc-800 shadow-xl">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-4 border-b border-zinc-800">
            <div>
              <h2 className="text-xl font-bold tracking-tight text-white">
                Escolha a plataforma que você deseja integrar
              </h2>
              <p className="text-xs text-zinc-400 mt-1">
                Selecione uma plataforma abaixo para conectar e gerar seu webhook dedicado.
              </p>
            </div>

            {/* Categorias Pills */}
            <div className="flex items-center gap-1.5 flex-wrap">
              {[
                { id: 'ALL', label: 'Todas' },
                { id: 'PAYMENT', label: 'Pagamentos' },
                { id: 'MARKETING', label: 'Marketing/CRM' },
                { id: 'ECOMMERCE', label: 'E-commerce' },
                { id: 'FORMS', label: 'Formulários' },
                { id: 'CUSTOM', label: 'Custom' },
              ].map((cat) => (
                <button
                  key={cat.id}
                  type="button"
                  onClick={() => setCatalogCategoryFilter(cat.id as any)}
                  className={`px-3 py-1 rounded-full text-xs font-semibold transition-colors cursor-pointer ${
                    catalogCategoryFilter === cat.id
                      ? 'bg-indigo-600 text-white'
                      : 'bg-zinc-800/80 text-zinc-400 hover:text-white hover:bg-zinc-700'
                  }`}
                >
                  {cat.label}
                </button>
              ))}
            </div>
          </div>

          {/* Campo de Busca */}
          <div className="relative">
            <Search className="w-4 h-4 text-zinc-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              placeholder="Buscar plataforma por nome..."
              value={catalogSearchQuery}
              onChange={(e) => setCatalogSearchQuery(e.target.value)}
              className="w-full bg-[#181a20] border border-zinc-700/60 rounded-xl pl-10 pr-4 py-2.5 text-sm text-white placeholder-zinc-500 focus:outline-none focus:border-indigo-500"
            />
          </div>

          {/* Grade 3 Colunas de Plataformas */}
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
            {filteredPlatforms.map((p) => (
              <button
                key={p.id}
                type="button"
                onClick={() => handleSelectPlatformFromCatalog(p.id)}
                className="flex items-center gap-3.5 p-3.5 rounded-2xl bg-[#181a20] hover:bg-[#20232c] border border-zinc-800/80 hover:border-indigo-500/60 transition-all text-left group cursor-pointer"
              >
                <div className="shrink-0">{renderPlatformBrandLogo(p.id)}</div>
                <div className="min-w-0 flex-1">
                  <h4 className="text-sm font-semibold text-white group-hover:text-indigo-400 transition-colors truncate">
                    {p.name}
                  </h4>
                </div>
              </button>
            ))}

            {/* Card "+ Solicitar nova integração" */}
            <div className="flex items-center gap-3.5 p-3.5 rounded-2xl bg-[#181a20] border border-dashed border-zinc-700 transition-all text-left">
              <div className="w-10 h-10 rounded-full bg-indigo-600/30 text-indigo-400 flex items-center justify-center shrink-0">
                <Plus className="w-5 h-5" />
              </div>
              <div className="min-w-0 flex-1">
                <h4 className="text-sm font-semibold text-white">Solicitar nova integração</h4>
              </div>
            </div>
          </div>

          {/* Rodapé do Catálogo */}
          <div className="flex items-center justify-end gap-6 pt-4 border-t border-zinc-800 text-xs text-zinc-400">
            <div className="flex items-center gap-1.5">
              <span>500</span>
              <ChevronDown className="w-3.5 h-3.5" />
            </div>
            <div>
              1-{filteredPlatforms.length} de {PLATFORM_PRESETS.length}
            </div>
            <div className="flex items-center gap-2">
              <button className="p-1 hover:text-white disabled:opacity-30" disabled>
                <ChevronLeft className="w-4 h-4" />
              </button>
              <button className="p-1 hover:text-white disabled:opacity-30" disabled>
                <ChevronRight className="w-4 h-4" />
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ABA 3: API PÚBLICA DE LEADS */}
      {activeTab === 'public_api' && (
        <div className="space-y-6">
          <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-6 space-y-4">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-slate-900 text-white flex items-center justify-center">
                <Terminal className="w-5 h-5 text-indigo-400" />
              </div>
              <div>
                <h2 className="text-base font-bold text-slate-900">
                  API Pública de Ingestão de Leads
                </h2>
                <p className="text-xs text-slate-500">
                  Permite que qualquer sistema externo (App, CRM, Backend, Formulário ou Script) envie leads diretamente para o LaunchFlow.
                </p>
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-3 pt-2">
              <div className="p-3 rounded-xl bg-slate-50 border border-slate-200">
                <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400 block mb-1">
                  Endpoint HTTP
                </span>
                <code className="text-xs font-mono font-bold text-slate-900">
                  POST /api/leads
                </code>
              </div>
              <div className="p-3 rounded-xl bg-slate-50 border border-slate-200">
                <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400 block mb-1">
                  Autenticação
                </span>
                <span className="text-xs font-semibold text-slate-800">
                  Bearer Token, x-api-key ou Chave da Integração
                </span>
              </div>
              <div className="p-3 rounded-xl bg-slate-50 border border-slate-200">
                <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400 block mb-1">
                  Deduplicação
                </span>
                <span className="text-xs font-semibold text-emerald-700">
                  Automática por Telefone ou E-mail
                </span>
              </div>
            </div>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* Exemplo de Chamada cURL */}
            <div className="bg-slate-900 rounded-2xl p-6 text-white space-y-4 shadow-sm">
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold text-slate-400 uppercase tracking-wider">
                  Exemplo de Envio via cURL
                </span>
                <button
                  type="button"
                  onClick={() =>
                    copyToClipboard(
                      `curl -X POST "${typeof window !== 'undefined' ? window.location.origin : 'https://seusite.com'}/api/leads" \\\n  -H "Content-Type: application/json" \\\n  -H "Authorization: Bearer SEU_TOKEN_AQUI" \\\n  -d '{\n    "name": "João da Silva",\n    "email": "joao@email.com",\n    "phone": "5511999998888",\n    "tags": ["Lead Orgânico", "Lançamento"],\n    "source": "Aplicativo Mobile"\n  }'`,
                      'curl_leads_copy'
                    )
                  }
                  className="flex items-center gap-1 px-3 py-1 rounded-lg bg-zinc-800 hover:bg-zinc-700 text-xs text-white font-semibold cursor-pointer"
                >
                  {copiedId === 'curl_leads_copy' ? (
                    <>
                      <Check className="w-3.5 h-3.5 text-emerald-400" />
                      <span>Copiado!</span>
                    </>
                  ) : (
                    <>
                      <Copy className="w-3.5 h-3.5" />
                      <span>Copiar cURL</span>
                    </>
                  )}
                </button>
              </div>

              <pre className="p-4 bg-black/60 rounded-xl text-xs font-mono text-emerald-400 overflow-x-auto leading-relaxed">
{`curl -X POST "${typeof window !== 'undefined' ? window.location.origin : 'https://seusite.com'}/api/leads" \\
  -H "Content-Type: application/json" \\
  -H "Authorization: Bearer SEU_TOKEN_AQUI" \\
  -d '{
    "name": "João da Silva",
    "email": "joao@email.com",
    "phone": "5511999998888",
    "tags": ["Lead Orgânico", "Lançamento"],
    "source": "Aplicativo Mobile"
  }'`}
              </pre>

              <div className="p-3 bg-zinc-800/80 rounded-xl text-[11px] text-zinc-300 space-y-1">
                <strong>Resposta JSON esperada (200 / 201):</strong>
                <pre className="font-mono text-zinc-400">
{`{
  "success": true,
  "lead": {
    "id": "cm...",
    "name": "João da Silva",
    "phone": "5511999998888",
    "email": "joao@email.com",
    "tags": [...]
  },
  "appliedTags": ["Lead Orgânico", "Lançamento"]
}`}
                </pre>
              </div>
            </div>

            {/* Documentação dos Campos */}
            <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-6 space-y-4">
              <h3 className="font-bold text-slate-900 text-sm">Estrutura do Payload Aceito</h3>
              <div className="space-y-3 text-xs">
                <div className="p-3 rounded-xl bg-slate-50 border border-slate-200">
                  <div className="flex items-center justify-between mb-1">
                    <code className="font-bold text-indigo-600">phone</code>
                    <span className="text-[10px] text-emerald-700 font-bold bg-emerald-100 px-2 py-0.5 rounded-full">
                      Recomendado
                    </span>
                  </div>
                  <p className="text-slate-600">
                    Número do WhatsApp ou telefone com DDD (ex: <code>5511999998888</code>). É a chave primária para envios via WhatsApp.
                  </p>
                </div>

                <div className="p-3 rounded-xl bg-slate-50 border border-slate-200">
                  <div className="flex items-center justify-between mb-1">
                    <code className="font-bold text-indigo-600">email</code>
                    <span className="text-[10px] text-slate-500 font-semibold">Opcional se telefone fornecido</span>
                  </div>
                  <p className="text-slate-600">
                    Endereço de e-mail do lead para mensagens e controle de duplicidade.
                  </p>
                </div>

                <div className="p-3 rounded-xl bg-slate-50 border border-slate-200">
                  <div className="flex items-center justify-between mb-1">
                    <code className="font-bold text-indigo-600">tags</code>
                    <span className="text-[10px] text-slate-500 font-semibold">Array de strings</span>
                  </div>
                  <p className="text-slate-600">
                    Lista de nomes de tags a serem vinculadas ao contato (ex: <code>[&quot;VIP&quot;, &quot;Comprador&quot;]</code>).
                  </p>
                </div>

                <div className="p-3 rounded-xl bg-slate-50 border border-slate-200">
                  <div className="flex items-center justify-between mb-1">
                    <code className="font-bold text-indigo-600">targetAutomationId</code>
                    <span className="text-[10px] text-slate-500 font-semibold">Opcional</span>
                  </div>
                  <p className="text-slate-600">
                    ID da automação de fluxo para matricular imediatamente o contato após o cadastro.
                  </p>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ABA 4: WORDPRESS & ELEMENTOR */}
      {activeTab === 'wordpress' && (
        <WordPressIntegrationTab
          tenant={tenant}
          availableTags={availableTags}
          onRefreshTags={fetchTags}
          onCreateTagInline={async (name: string) => {
            const res = await fetch('/api/tags', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ name }),
            });
            const data = await res.json();
            if (data.tag) {
              await fetchTags();
              return data.tag;
            }
            return null;
          }}
        />
      )}

      {/* ABA 5: HISTÓRICO DE WEBHOOKS (LOGS) */}
      {activeTab === 'events' && (
        <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden space-y-4">
          <div className="p-5 border-b border-slate-100 flex items-center justify-between bg-slate-50/50">
            <div className="flex items-center gap-2">
              <Clock className="w-4 h-4 text-slate-500" />
              <h3 className="font-bold text-slate-900 text-sm">
                Histórico Recente de Webhooks Recebidos
              </h3>
            </div>
            <button
              onClick={fetchEvents}
              disabled={loadingEvents}
              className="text-xs text-indigo-600 hover:text-indigo-800 font-semibold flex items-center gap-1 cursor-pointer"
            >
              <RotateCw className={`w-3.5 h-3.5 ${loadingEvents ? 'animate-spin' : ''}`} />
              <span>Atualizar</span>
            </button>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="bg-slate-50 text-slate-500 font-semibold border-b border-slate-100 uppercase tracking-wider text-[10px]">
                <tr>
                  <th className="p-3.5">Plataforma</th>
                  <th className="p-3.5">Evento Recebido</th>
                  <th className="p-3.5">Cliente</th>
                  <th className="p-3.5">Produto & Valor</th>
                  <th className="p-3.5">Status</th>
                  <th className="p-3.5">Data / Hora</th>
                  <th className="p-3.5 text-right">Ação</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 text-slate-700">
                {loadingEvents ? (
                  <tr>
                    <td colSpan={7} className="p-8 text-center text-slate-400">
                      Carregando histórico de webhooks...
                    </td>
                  </tr>
                ) : events.length === 0 ? (
                  <tr>
                    <td colSpan={7} className="p-8 text-center text-slate-400">
                      Nenhum webhook recebido ainda. Envie eventos pela Hotmart/Kiwify ou utilize o simulador.
                    </td>
                  </tr>
                ) : (
                  events.map((ev) => (
                    <tr key={ev.id} className="hover:bg-slate-50/50">
                      <td className="p-3.5">
                        <div className="flex items-center gap-2 font-bold text-slate-800">
                          <div className="w-6 h-6 rounded-full bg-slate-900 flex items-center justify-center shrink-0">
                            {renderPlatformBrandLogo(ev.platform)}
                          </div>
                          <span>{ev.platform}</span>
                        </div>
                      </td>
                      <td className="p-3.5">
                        <span className="font-mono font-semibold text-[11px] text-slate-800">
                          {ev.eventType}
                        </span>
                      </td>
                      <td className="p-3.5">
                        <div className="font-medium text-slate-800">{ev.customerName || 'Cliente'}</div>
                        <div className="text-[11px] text-slate-400">{ev.customerEmail}</div>
                      </td>
                      <td className="p-3.5">
                        <div className="font-medium text-slate-800 truncate max-w-xs">
                          {ev.productName || 'Produto'}
                        </div>
                        {ev.priceValue ? (
                          <div className="text-[11px] text-emerald-600 font-mono font-semibold">
                            R$ {ev.priceValue.toFixed(2)} ({ev.paymentType || 'OTHER'})
                          </div>
                        ) : null}
                      </td>
                      <td className="p-3.5">
                        <span
                          className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold ${
                            ev.status === 'PROCESSED'
                              ? 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                              : ev.status === 'IGNORED'
                              ? 'bg-amber-50 text-amber-700 border border-amber-200'
                              : 'bg-red-50 text-red-700 border border-red-200'
                          }`}
                        >
                          {ev.status === 'PROCESSED' ? (
                            <>
                              <CheckCircle2 className="w-3 h-3" />
                              <span>Processado</span>
                            </>
                          ) : ev.status === 'IGNORED' ? (
                            <>
                              <AlertCircle className="w-3 h-3" />
                              <span>Ignorado</span>
                            </>
                          ) : (
                            <>
                              <AlertTriangle className="w-3 h-3" />
                              <span>Falha</span>
                            </>
                          )}
                        </span>
                      </td>
                      <td className="p-3.5 text-slate-500 font-mono text-[11px]">
                        {new Date(ev.createdAt).toLocaleString('pt-BR')}
                      </td>
                      <td className="p-3.5 text-right">
                        <button
                          type="button"
                          onClick={() => setSelectedEventForModal(ev)}
                          className="px-2.5 py-1 rounded-lg border border-slate-200 hover:bg-slate-100 text-slate-600 text-xs font-semibold cursor-pointer"
                        >
                          Ver Payload
                        </button>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* ABA 6: SIMULADOR DE CHECKOUT */}
      {activeTab === 'simulate' && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
          {/* Formulário de Simulação */}
          <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-6 space-y-5">
            <div>
              <h3 className="font-bold text-slate-900 text-base">Simulador de Webhooks</h3>
              <p className="text-xs text-slate-500 mt-0.5">
                Teste em tempo real o recebimento de compras, carrinhos abandonados e tags no CRM.
              </p>
            </div>

            <form onSubmit={handleSimulateWebhook} className="space-y-4 text-xs">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block font-semibold text-slate-700 mb-1">Plataforma</label>
                  <select
                    value={simPlatform}
                    onChange={(e) => setSimPlatform(e.target.value as CheckoutPlatformId)}
                    className="w-full px-3 py-2 rounded-xl border border-slate-300 text-slate-900 bg-white focus:outline-none focus:ring-2 focus:ring-indigo-500"
                  >
                    {PLATFORM_PRESETS.map((p) => (
                      <option key={p.id} value={p.id}>
                        {p.name}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block font-semibold text-slate-700 mb-1">Evento</label>
                  <select
                    value={simEvent}
                    onChange={(e) => setSimEvent(e.target.value as StandardCheckoutEventType)}
                    className="w-full px-3 py-2 rounded-xl border border-slate-300 text-slate-900 bg-white focus:outline-none focus:ring-2 focus:ring-indigo-500"
                  >
                    {AVAILABLE_EVENTS.map((ev) => (
                      <option key={ev.id} value={ev.id}>
                        {ev.label}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              <div>
                <label className="block font-semibold text-slate-700 mb-1">Nome do Comprador</label>
                <input
                  type="text"
                  value={simName}
                  onChange={(e) => setSimName(e.target.value)}
                  className="w-full px-3 py-2 rounded-xl border border-slate-300 text-slate-900 focus:outline-none focus:ring-2 focus:ring-indigo-500"
                />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block font-semibold text-slate-700 mb-1">E-mail do Comprador</label>
                  <input
                    type="email"
                    value={simEmail}
                    onChange={(e) => setSimEmail(e.target.value)}
                    className="w-full px-3 py-2 rounded-xl border border-slate-300 text-slate-900 focus:outline-none focus:ring-2 focus:ring-indigo-500"
                  />
                </div>

                <div>
                  <label className="block font-semibold text-slate-700 mb-1">Telefone (WhatsApp)</label>
                  <input
                    type="text"
                    value={simPhone}
                    onChange={(e) => setSimPhone(e.target.value)}
                    className="w-full px-3 py-2 rounded-xl border border-slate-300 text-slate-900 focus:outline-none focus:ring-2 focus:ring-indigo-500 font-mono"
                  />
                </div>
              </div>

              <div>
                <label className="block font-semibold text-slate-700 mb-1">Nome do Produto</label>
                <input
                  type="text"
                  value={simProduct}
                  onChange={(e) => setSimProduct(e.target.value)}
                  className="w-full px-3 py-2 rounded-xl border border-slate-300 text-slate-900 focus:outline-none focus:ring-2 focus:ring-indigo-500"
                />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block font-semibold text-slate-700 mb-1">Forma de Pagamento</label>
                  <select
                    value={simPayment}
                    onChange={(e) => setSimPayment(e.target.value)}
                    className="w-full px-3 py-2 rounded-xl border border-slate-300 text-slate-900 bg-white focus:outline-none focus:ring-2 focus:ring-indigo-500"
                  >
                    <option value="PIX">PIX</option>
                    <option value="CREDIT_CARD">Cartão de Crédito</option>
                    <option value="BILLET">Boleto Bancário</option>
                  </select>
                </div>

                <div>
                  <label className="block font-semibold text-slate-700 mb-1">Valor (R$)</label>
                  <input
                    type="text"
                    value={simValue}
                    onChange={(e) => setSimValue(e.target.value)}
                    className="w-full px-3 py-2 rounded-xl border border-slate-300 text-slate-900 focus:outline-none focus:ring-2 focus:ring-indigo-500 font-mono"
                  />
                </div>
              </div>

              <button
                type="submit"
                disabled={simulating}
                className="w-full flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl bg-slate-900 hover:bg-slate-800 text-white font-semibold text-xs transition-colors shadow-sm disabled:opacity-50 cursor-pointer"
              >
                {simulating ? (
                  <>
                    <RotateCw className="w-3.5 h-3.5 animate-spin" />
                    <span>Processando Webhook...</span>
                  </>
                ) : (
                  <>
                    <Send className="w-3.5 h-3.5" />
                    <span>Simular Disparo de Webhook</span>
                  </>
                )}
              </button>
            </form>
          </div>

          {/* Resultado da Simulação */}
          <div className="space-y-6">
            <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-6 space-y-4">
              <h4 className="font-bold text-slate-900 text-xs uppercase tracking-wider">
                Resultado do Processamento
              </h4>

              {simResult ? (
                <div className="space-y-3">
                  <div
                    className={`p-4 rounded-xl border text-xs leading-relaxed ${
                      simResult.success
                        ? 'bg-emerald-50 text-emerald-900 border-emerald-200'
                        : 'bg-red-50 text-red-900 border-red-200'
                    }`}
                  >
                    <div className="flex items-start gap-2">
                      {simResult.success ? (
                        <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0 mt-0.5" />
                      ) : (
                        <AlertCircle className="w-4 h-4 text-red-600 shrink-0 mt-0.5" />
                      )}
                      <div>
                        <strong className="block font-semibold mb-0.5">
                          {simResult.success ? '✅ Webhook Processado com Sucesso' : '❌ Falha'}
                        </strong>
                        <p>{simResult.actionSummary || simResult.error}</p>
                      </div>
                    </div>
                  </div>

                  {simResult.simulatedPayload && (
                    <div>
                      <span className="text-[11px] font-semibold text-slate-600 block mb-1">
                        Payload enviado ao Adapter {simResult.platform}:
                      </span>
                      <pre className="p-3 bg-slate-900 text-emerald-400 rounded-xl text-[10px] font-mono overflow-x-auto max-h-60">
                        {JSON.stringify(simResult.simulatedPayload, null, 2)}
                      </pre>
                    </div>
                  )}
                </div>
              ) : (
                <div className="p-8 text-center text-slate-400 text-xs">
                  Preencha o formulário ao lado e clique em Simular para visualizar o processamento do
                  adapter e as regras de automação disparadas.
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* ABA 7: WHATSAPP EVOLUTION */}
      {activeTab === 'whatsapp' && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
          <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-6 space-y-6">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-gradient-to-tr from-emerald-500 to-teal-600 flex items-center justify-center text-white shadow-md shadow-emerald-500/20">
                <MessageSquare className="w-6 h-6 fill-white" />
              </div>
              <div>
                <h2 className="text-base font-bold text-slate-900">WhatsApp Evolution API</h2>
                <span
                  className={`text-xs font-semibold flex items-center gap-1 mt-0.5 ${
                    evoStatus?.status === 'CONNECTED' ? 'text-emerald-600' : 'text-amber-600'
                  }`}
                >
                  <ShieldCheck className="w-3.5 h-3.5" />
                  {evoStatus?.status === 'CONNECTED'
                    ? 'Instância Conectada e Isolada'
                    : 'Instância Desconectada'}
                </span>
              </div>
            </div>

            <p className="text-xs text-slate-600 leading-relaxed">
              Cada expert possui sua própria instância dedicada no WhatsApp, garantindo que
              mensagens de aquecimento, lembretes de Pix e avisos de aula nunca se misturem.
            </p>

            <form onSubmit={handleTestEvolution} className="space-y-4 text-xs">
              <div>
                <label className="block font-semibold text-slate-700 mb-1">Telefone com DDD *</label>
                <input
                  type="text"
                  required
                  placeholder="+556282002147"
                  value={testPhone}
                  onChange={(e) => setTestPhone(e.target.value)}
                  className="w-full px-3 py-2 rounded-xl border border-slate-300 text-slate-900 focus:outline-none focus:ring-2 focus:ring-emerald-500 font-mono"
                />
              </div>

              <div>
                <label className="block font-semibold text-slate-700 mb-1">Mensagem de Teste</label>
                <textarea
                  rows={3}
                  value={testText}
                  onChange={(e) => setTestText(e.target.value)}
                  className="w-full px-3 py-2 rounded-xl border border-slate-300 text-slate-900 focus:outline-none focus:ring-2 focus:ring-emerald-500"
                />
              </div>

              <button
                type="submit"
                disabled={testingEvo}
                className="w-full flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white font-semibold text-xs shadow-sm disabled:opacity-50 cursor-pointer"
              >
                {testingEvo ? (
                  <>
                    <RotateCw className="w-3.5 h-3.5 animate-spin" />
                    <span>Enviando pelo WhatsApp...</span>
                  </>
                ) : (
                  <>
                    <Send className="w-3.5 h-3.5" />
                    <span>Enviar Teste via WhatsApp</span>
                  </>
                )}
              </button>
            </form>

            {evoTestResult && (
              <div
                className={`p-3.5 rounded-xl border text-xs leading-relaxed ${
                  evoTestResult.success
                    ? 'bg-emerald-50 text-emerald-800 border-emerald-200'
                    : 'bg-red-50 text-red-800 border-red-200'
                }`}
              >
                <strong className="block font-semibold mb-0.5">
                  {evoTestResult.success ? '✅ Enviado com Sucesso' : '❌ Falha no Envio'}
                </strong>
                <span>{evoTestResult.message || evoTestResult.error}</span>
              </div>
            )}
          </div>
        </div>
      )}

      {/* MODAL 1: APP STORE CATALOG (Escolha a plataforma que você deseja integrar) */}
      {isCatalogModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-md animate-in fade-in duration-200">
          <div className="bg-[#12141a] rounded-3xl max-w-4xl w-full border border-zinc-800 shadow-2xl overflow-hidden flex flex-col max-h-[90vh] text-white">
            {/* Header Modal */}
            <div className="p-5 border-b border-zinc-800/80 flex items-center justify-between shrink-0">
              <h2 className="text-lg sm:text-xl font-bold tracking-tight text-white">
                Escolha a plataforma que você deseja integrar
              </h2>
              <button
                type="button"
                onClick={() => setIsCatalogModalOpen(false)}
                className="p-1 rounded-lg text-zinc-400 hover:text-white hover:bg-zinc-800 transition-colors cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Busca & Categorias */}
            <div className="px-5 pt-4 pb-2 space-y-3 shrink-0">
              <div className="relative">
                <Search className="w-4 h-4 text-zinc-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
                <input
                  type="text"
                  placeholder="Buscar"
                  value={catalogSearchQuery}
                  onChange={(e) => setCatalogSearchQuery(e.target.value)}
                  className="w-full bg-[#181a20] border border-zinc-700/60 rounded-xl pl-10 pr-4 py-2.5 text-sm text-white placeholder-zinc-500 focus:outline-none focus:border-indigo-500"
                />
              </div>

              <div className="flex items-center gap-1.5 overflow-x-auto pb-1">
                {[
                  { id: 'ALL', label: 'Todas (67)' },
                  { id: 'PAYMENT', label: 'Pagamentos' },
                  { id: 'MARKETING', label: 'Marketing/CRM' },
                  { id: 'ECOMMERCE', label: 'E-commerce' },
                  { id: 'FORMS', label: 'Formulários' },
                  { id: 'CUSTOM', label: 'Custom' },
                ].map((cat) => (
                  <button
                    key={cat.id}
                    type="button"
                    onClick={() => setCatalogCategoryFilter(cat.id as any)}
                    className={`px-3 py-1 rounded-full text-xs font-semibold transition-colors cursor-pointer whitespace-nowrap ${
                      catalogCategoryFilter === cat.id
                        ? 'bg-indigo-600 text-white'
                        : 'bg-zinc-800/70 text-zinc-400 hover:text-white hover:bg-zinc-700'
                    }`}
                  >
                    {cat.label}
                  </button>
                ))}
              </div>
            </div>

            {/* Grade 3 Colunas de Plataformas */}
            <div className="p-5 overflow-y-auto grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3 flex-1">
              {filteredPlatforms.map((p) => (
                <button
                  key={p.id}
                  type="button"
                  onClick={() => handleSelectPlatformFromCatalog(p.id)}
                  className="flex items-center gap-3.5 p-3.5 rounded-2xl bg-[#181a20] hover:bg-[#20232c] border border-zinc-800/80 hover:border-indigo-500 transition-all text-left group cursor-pointer"
                >
                  <div className="shrink-0">{renderPlatformBrandLogo(p.id)}</div>
                  <div className="min-w-0 flex-1">
                    <h4 className="text-sm font-semibold text-white group-hover:text-indigo-400 transition-colors truncate">
                      {p.name}
                    </h4>
                  </div>
                </button>
              ))}

              {/* Card "+ Solicitar nova integração" */}
              <div className="flex items-center gap-3.5 p-3.5 rounded-2xl bg-[#181a20] border border-dashed border-zinc-700 transition-all text-left">
                <div className="w-10 h-10 rounded-full bg-indigo-600/30 text-indigo-400 flex items-center justify-center shrink-0">
                  <Plus className="w-5 h-5" />
                </div>
                <div className="min-w-0 flex-1">
                  <h4 className="text-sm font-semibold text-white">Solicitar nova integração</h4>
                </div>
              </div>
            </div>

            {/* Footer do Catálogo Modal */}
            <div className="p-4 border-t border-zinc-800 bg-[#15171e] shrink-0 flex items-center justify-end gap-6 text-xs text-zinc-400">
              <div className="flex items-center gap-1.5 cursor-pointer hover:text-white">
                <span>500</span>
                <ChevronDown className="w-3.5 h-3.5" />
              </div>
              <div>
                1-{filteredPlatforms.length} de {PLATFORM_PRESETS.length}
              </div>
              <div className="flex items-center gap-2">
                <button className="p-1 hover:text-white disabled:opacity-30" disabled>
                  <ChevronLeft className="w-4 h-4" />
                </button>
                <button className="p-1 hover:text-white disabled:opacity-30" disabled>
                  <ChevronRight className="w-4 h-4" />
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* MODAL 2: CONFIGURAR INTEGRAÇÃO ESCOLHIDA */}
      {isModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/60 backdrop-blur-sm animate-in fade-in duration-200">
          <div className="bg-white rounded-3xl max-w-2xl w-full border border-slate-200 shadow-2xl overflow-hidden flex flex-col max-h-[92vh]">
            {/* Cabeçalho do Modal */}
            <div className="p-5 border-b border-slate-100 flex items-center justify-between bg-slate-50/60 shrink-0">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-slate-900 flex items-center justify-center shadow-sm shrink-0">
                  {renderPlatformBrandLogo(modalForm.platform)}
                </div>
                <div>
                  <h3 className="font-bold text-slate-900 text-sm">
                    {createdWebhookSuccess
                      ? 'Webhook Gerado com Sucesso!'
                      : editingIntegrationId
                      ? `Configurar ${selectedPreset.name}`
                      : `Conectar ${selectedPreset.name}`}
                  </h3>
                  <p className="text-[11px] text-slate-500">
                    {selectedPreset.description || 'Configuração de webhook e mapeamento no CRM.'}
                  </p>
                </div>
              </div>

              <div className="flex items-center gap-1">
                {!editingIntegrationId && !createdWebhookSuccess && (
                  <button
                    type="button"
                    onClick={() => {
                      setIsModalOpen(false);
                      setIsCatalogModalOpen(true);
                    }}
                    className="px-2.5 py-1 text-xs text-indigo-600 hover:bg-indigo-50 font-semibold rounded-lg flex items-center gap-1 cursor-pointer"
                  >
                    <ArrowLeft className="w-3.5 h-3.5" />
                    <span>Trocar Plataforma</span>
                  </button>
                )}
                <button
                  type="button"
                  onClick={() => {
                    setCreatedWebhookSuccess(null);
                    setIsModalOpen(false);
                  }}
                  className="p-1 rounded-lg text-slate-400 hover:text-slate-700 hover:bg-slate-200/50 cursor-pointer"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>
            </div>

            {/* SE JÁ SALVOU COM SUCESSO: TELA DE COPIAR WEBHOOK */}
            {createdWebhookSuccess ? (
              <div className="p-6 space-y-6 text-center overflow-y-auto animate-in fade-in duration-200">
                <div className="w-16 h-16 rounded-3xl bg-emerald-50 text-emerald-600 mx-auto flex items-center justify-center shadow-sm">
                  <CheckCircle2 className="w-8 h-8" />
                </div>

                <div className="space-y-1">
                  <h3 className="text-lg font-bold text-slate-900">
                    Integração &quot;{createdWebhookSuccess.name}&quot; Ativada! 🎉
                  </h3>
                  <p className="text-xs text-slate-500 max-w-md mx-auto leading-relaxed">
                    Aqui está a URL exclusiva gerada para o seu webhook. Copie e cole na tela da{' '}
                    <strong>{selectedPreset.name}</strong>.
                  </p>
                </div>

                {/* Campo com a URL e botão de Copiar */}
                <div className="p-4 rounded-2xl bg-slate-50 border border-slate-200 space-y-2 text-left">
                  <label className="text-[10px] font-bold uppercase tracking-wider text-slate-500 block">
                    URL do Webhook (Cole na plataforma externa):
                  </label>
                  <div className="flex items-center gap-2 p-2 rounded-xl bg-white border border-slate-300 shadow-2xs">
                    <input
                      type="text"
                      readOnly
                      value={createdWebhookSuccess.url}
                      className="flex-1 bg-transparent text-xs font-mono text-slate-900 focus:outline-none select-all"
                    />
                    <button
                      type="button"
                      onClick={() => copyToClipboard(createdWebhookSuccess.url, 'success_modal_copy')}
                      className={`flex items-center gap-1.5 px-4 py-2 rounded-lg text-xs font-bold transition-all shrink-0 cursor-pointer ${
                        copiedId === 'success_modal_copy'
                          ? 'bg-emerald-600 text-white'
                          : 'bg-indigo-600 hover:bg-indigo-700 text-white shadow-sm'
                      }`}
                    >
                      {copiedId === 'success_modal_copy' ? (
                        <>
                          <Check className="w-4 h-4" />
                          <span>Copiado com Sucesso!</span>
                        </>
                      ) : (
                        <>
                          <Copy className="w-4 h-4" />
                          <span>Copiar Webhook</span>
                        </>
                      )}
                    </button>
                  </div>
                </div>

                <div className="pt-4 border-t border-slate-100 flex justify-end">
                  <button
                    type="button"
                    onClick={() => {
                      setCreatedWebhookSuccess(null);
                      setIsModalOpen(false);
                    }}
                    className="px-6 py-2.5 rounded-xl bg-slate-900 hover:bg-slate-800 text-white font-semibold text-xs transition-colors shadow-sm cursor-pointer"
                  >
                    Concluído / Fechar
                  </button>
                </div>
              </div>
            ) : (
              /* FORMULÁRIO DE CADASTRO / EDIÇÃO */
              <form onSubmit={handleSaveModal} className="flex flex-col flex-1 overflow-hidden text-xs">
                <div className="p-6 overflow-y-auto space-y-6 flex-1">
                  {modalError && (
                    <div className="p-3 bg-red-50 border border-red-200 text-red-800 rounded-xl flex items-center gap-2">
                      <AlertCircle className="w-4 h-4 shrink-0 text-red-600" />
                      <span>{modalError}</span>
                    </div>
                  )}

                  {/* DESTAQUE: URL EXCLUSIVA DO WEBHOOK */}
                  <div className="p-4 rounded-2xl bg-indigo-50/80 border border-indigo-200 space-y-2">
                    <div className="flex items-center justify-between">
                      <label className="font-bold uppercase tracking-wider text-[11px] text-indigo-950 flex items-center gap-1.5">
                        <Sparkles className="w-3.5 h-3.5 text-indigo-600" />
                        <span>URL do Webhook Exclusiva para esta Integração</span>
                      </label>
                      <span className="text-[10px] font-bold text-emerald-700 bg-emerald-100 px-2.5 py-0.5 rounded-full border border-emerald-200">
                        100% Exclusiva e Isolada
                      </span>
                    </div>

                    <div className="flex items-center gap-2 p-2 rounded-xl bg-white border border-indigo-200 shadow-2xs">
                      <input
                        type="text"
                        readOnly
                        value={getWebhookUrl(editingIntegrationId || modalForm.generatedUniqueId)}
                        className="flex-1 bg-transparent text-xs font-mono text-slate-800 focus:outline-none select-all font-semibold"
                      />
                      <button
                        type="button"
                        onClick={() =>
                          copyToClipboard(
                            getWebhookUrl(editingIntegrationId || modalForm.generatedUniqueId),
                            'modal_url_preview'
                          )
                        }
                        className={`flex items-center gap-1 px-3 py-1.5 rounded-lg text-xs font-bold transition-all shrink-0 cursor-pointer ${
                          copiedId === 'modal_url_preview'
                            ? 'bg-emerald-600 text-white'
                            : 'bg-indigo-600 hover:bg-indigo-700 text-white shadow-xs'
                        }`}
                      >
                        {copiedId === 'modal_url_preview' ? (
                          <>
                            <Check className="w-3.5 h-3.5" />
                            <span>Copiado!</span>
                          </>
                        ) : (
                          <>
                            <Copy className="w-3.5 h-3.5" />
                            <span>Copiar Webhook</span>
                          </>
                        )}
                      </button>
                    </div>
                    <p className="text-[11px] text-indigo-900 leading-relaxed">
                      👉 Cole esta URL no painel da sua ferramenta externa (
                      <strong>{selectedPreset.name}</strong>).
                    </p>
                  </div>

                  {/* Nome da Integração, Produto & Status */}
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                    <div className="sm:col-span-1">
                      <label className="block font-semibold text-slate-700 mb-1">
                        Nome da Integração *
                      </label>
                      <input
                        type="text"
                        required
                        placeholder="Ex: Vendas Curso 2026"
                        value={modalForm.name}
                        onChange={(e) => setModalForm({ ...modalForm, name: e.target.value })}
                        className="w-full px-3 py-2 rounded-xl border border-slate-300 text-slate-900 focus:outline-none focus:ring-2 focus:ring-indigo-500 text-xs bg-white"
                      />
                    </div>

                    <div className="sm:col-span-1">
                      <label className="block font-semibold text-slate-700 mb-1">
                        Produto Vinculado (Opcional)
                      </label>
                      <input
                        type="text"
                        placeholder="Ex: Mentoria VIP"
                        value={modalForm.productName}
                        onChange={(e) =>
                          setModalForm({ ...modalForm, productName: e.target.value })
                        }
                        className="w-full px-3 py-2 rounded-xl border border-slate-300 text-slate-900 focus:outline-none focus:ring-2 focus:ring-indigo-500 text-xs bg-white"
                      />
                    </div>

                    <div className="sm:col-span-1">
                      <label className="block font-semibold text-slate-700 mb-1">
                        Status da Integração
                      </label>
                      <select
                        value={modalForm.status}
                        onChange={(e) =>
                          setModalForm({ ...modalForm, status: e.target.value as any })
                        }
                        className="w-full px-3 py-2 rounded-xl border border-slate-300 text-slate-900 focus:outline-none focus:ring-2 focus:ring-indigo-500 text-xs bg-white font-medium"
                      >
                        <option value="ACTIVE">🟢 Ativa (Processando)</option>
                        <option value="INACTIVE">⏸ Inativa (Pausada)</option>
                      </select>
                    </div>
                  </div>

                  {/* Chave Secreta / Token de Validação */}
                  <div className="space-y-1">
                    <div className="flex items-center justify-between">
                      <label className="block font-semibold text-slate-700">
                        Chave Secreta / {selectedPreset.tokenLabel}
                      </label>
                      <span className="text-[10px] text-slate-400">Token de segurança</span>
                    </div>
                    <input
                      type="text"
                      placeholder="Token ou chave secreta de validação"
                      value={modalForm.secretKey}
                      onChange={(e) => setModalForm({ ...modalForm, secretKey: e.target.value })}
                      className="w-full px-3 py-2 rounded-xl border border-slate-300 text-slate-900 font-mono text-xs focus:outline-none focus:ring-2 focus:ring-indigo-500 bg-white"
                    />
                    <p className="text-[11px] text-slate-400">{selectedPreset.tokenHint}</p>
                  </div>

                  {/* CASO SEJA INTEGRAÇÃO CUSTOM: MAPEAMENTO DE CAMPOS JSON */}
                  {modalForm.platform === 'CUSTOM' && (
                    <div className="p-4 bg-slate-50 rounded-2xl border border-slate-200 space-y-3">
                      <div className="flex items-center gap-2">
                        <Code className="w-4 h-4 text-indigo-600" />
                        <h4 className="font-bold text-xs text-slate-800 uppercase tracking-wider">
                          Mapeamento de Dados JSON
                        </h4>
                      </div>
                      <p className="text-[11px] text-slate-500 leading-relaxed">
                        Defina em quais propriedades do JSON os dados do lead estarão localizados:
                      </p>
                      <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5">
                        <div>
                          <label className="text-[11px] font-semibold text-slate-700 block mb-1">
                            Nome:
                          </label>
                          <input
                            type="text"
                            value={modalForm.fieldMapping.name}
                            onChange={(e) =>
                              setModalForm({
                                ...modalForm,
                                fieldMapping: { ...modalForm.fieldMapping, name: e.target.value },
                              })
                            }
                            placeholder="payload.name"
                            className="w-full px-3 py-1.5 bg-white border border-slate-300 rounded-lg text-xs font-mono"
                          />
                        </div>
                        <div>
                          <label className="text-[11px] font-semibold text-slate-700 block mb-1">
                            E-mail:
                          </label>
                          <input
                            type="text"
                            value={modalForm.fieldMapping.email}
                            onChange={(e) =>
                              setModalForm({
                                ...modalForm,
                                fieldMapping: { ...modalForm.fieldMapping, email: e.target.value },
                              })
                            }
                            placeholder="payload.email"
                            className="w-full px-3 py-1.5 bg-white border border-slate-300 rounded-lg text-xs font-mono"
                          />
                        </div>
                        <div>
                          <label className="text-[11px] font-semibold text-slate-700 block mb-1">
                            Telefone / WhatsApp:
                          </label>
                          <input
                            type="text"
                            value={modalForm.fieldMapping.phone}
                            onChange={(e) =>
                              setModalForm({
                                ...modalForm,
                                fieldMapping: { ...modalForm.fieldMapping, phone: e.target.value },
                              })
                            }
                            placeholder="payload.phone"
                            className="w-full px-3 py-1.5 bg-white border border-slate-300 rounded-lg text-xs font-mono"
                          />
                        </div>
                      </div>
                    </div>
                  )}

                  {/* CASO SEJA FORMULÁRIO DE CAPTURA HTML: CÓDIGO PRONTO */}
                  {selectedPreset.category === 'FORMS' && (
                    <div className="p-4 bg-slate-50 rounded-2xl border border-slate-200 space-y-2">
                      <div className="flex items-center justify-between">
                        <label className="font-bold uppercase tracking-wider text-[11px] text-slate-800 flex items-center gap-1.5">
                          <Code className="w-3.5 h-3.5 text-indigo-600" />
                          <span>Código HTML para Captura de Leads</span>
                        </label>
                        <button
                          type="button"
                          onClick={() =>
                            copyToClipboard(
                              `<form action="${getWebhookUrl(
                                editingIntegrationId || modalForm.generatedUniqueId
                              )}" method="POST">\n  <input type="text" name="name" placeholder="Nome Completo" required />\n  <input type="email" name="email" placeholder="E-mail" required />\n  <input type="tel" name="phone" placeholder="WhatsApp (DDD + Número)" required />\n  <button type="submit">Cadastrar</button>\n</form>`,
                              'form_code_copy'
                            )
                          }
                          className="text-[11px] text-indigo-600 font-bold hover:underline cursor-pointer"
                        >
                          {copiedId === 'form_code_copy' ? 'Copiado!' : 'Copiar Snippet HTML'}
                        </button>
                      </div>
                      <pre className="p-3 bg-slate-900 text-emerald-400 rounded-xl text-[10px] font-mono overflow-x-auto leading-relaxed">
{`<form action="${getWebhookUrl(editingIntegrationId || modalForm.generatedUniqueId)}" method="POST">
  <input type="text" name="name" placeholder="Nome Completo" required />
  <input type="email" name="email" placeholder="E-mail" required />
  <input type="tel" name="phone" placeholder="WhatsApp (DDD + Número)" required />
  <button type="submit">Cadastrar</button>
</form>`}
                      </pre>
                    </div>
                  )}

                  {/* CASO SEJA DADOS DOS LEADS: GUIA DA API */}
                  {modalForm.platform === 'LEAD_DATA' && (
                    <div className="p-4 bg-blue-50/70 border border-blue-200 rounded-2xl text-blue-900 space-y-2">
                      <div className="flex items-center gap-2">
                        <Users className="w-4 h-4 text-blue-600" />
                        <h4 className="font-bold text-xs uppercase tracking-wider">
                          Acesso para Plataformas Externas
                        </h4>
                      </div>
                      <p className="text-[11px] leading-relaxed">
                        Sua aplicação externa pode enviar leads diretamente fazendo um <code>POST /api/leads</code> com o cabeçalho <code>Authorization: Bearer {modalForm.secretKey}</code>.
                      </p>
                    </div>
                  )}

                  {/* Tags aplicadas automaticamente */}
                  <div className="space-y-3 p-4 bg-slate-50 rounded-2xl border border-slate-200">
                    <div>
                      <label className="font-bold uppercase tracking-wider text-[11px] text-slate-800 flex items-center gap-1.5">
                        <Tags className="w-3.5 h-3.5 text-indigo-600" />
                        <span>Tags aplicadas automaticamente</span>
                      </label>
                      <p className="text-[11px] text-slate-500 mt-0.5 leading-relaxed">
                        Sempre que um lead for criado ou atualizado via este webhook, estas tags serão
                        aplicadas no CRM (sem duplicidade).
                      </p>
                    </div>

                    <div className="flex flex-wrap gap-1.5 min-h-[36px] p-2 bg-white rounded-xl border border-slate-200">
                      {modalForm.selectedTagIds.length === 0 ? (
                        <span className="text-[11px] text-slate-400 italic">
                          Nenhuma tag vinculada ainda.
                        </span>
                      ) : (
                        modalForm.selectedTagIds.map((tagId) => {
                          const tag = availableTags.find((t) => t.id === tagId);
                          return (
                            <span
                              key={tagId}
                              className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg text-xs font-semibold text-white shadow-2xs"
                              style={{ backgroundColor: tag?.color || '#6366f1' }}
                            >
                              #{tag?.name || 'Tag'}
                              <button
                                type="button"
                                onClick={() =>
                                  setModalForm({
                                    ...modalForm,
                                    selectedTagIds: modalForm.selectedTagIds.filter((id) => id !== tagId),
                                  })
                                }
                                className="p-0.5 hover:bg-black/20 rounded-full transition-colors ml-0.5 cursor-pointer"
                                title="Remover tag"
                              >
                                <X className="w-3 h-3" />
                              </button>
                            </span>
                          );
                        })
                      )}
                    </div>

                    <div className="flex items-center gap-2 pt-1">
                      <input
                        type="text"
                        placeholder="Digitar nova tag..."
                        value={newTagName}
                        onChange={(e) => setNewTagName(e.target.value)}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter') {
                            e.preventDefault();
                            handleCreateNewTagInline();
                          }
                        }}
                        className="flex-1 px-3 py-1.5 bg-white border border-slate-300 rounded-lg text-xs focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 outline-none"
                      />
                      <button
                        type="button"
                        disabled={creatingTag || !newTagName.trim()}
                        onClick={handleCreateNewTagInline}
                        className="px-3.5 py-1.5 bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg text-xs font-semibold transition-all disabled:opacity-50 shrink-0 flex items-center gap-1 cursor-pointer shadow-xs"
                      >
                        <Plus className="w-3.5 h-3.5" />
                        <span>{creatingTag ? 'Criando...' : '+ Criar Nova Tag'}</span>
                      </button>
                    </div>

                    {availableTags.length > 0 && (
                      <div className="space-y-1.5 pt-1">
                        <span className="text-[10px] font-bold uppercase tracking-wider text-slate-500 block">
                          Tags existentes disponíveis:
                        </span>
                        <div className="flex flex-wrap gap-1.5 max-h-24 overflow-y-auto p-2 bg-white/70 rounded-lg border border-slate-100">
                          {availableTags.map((t) => {
                            const isSelected = modalForm.selectedTagIds.includes(t.id);
                            return (
                              <button
                                key={t.id}
                                type="button"
                                onClick={() => {
                                  if (isSelected) {
                                    setModalForm({
                                      ...modalForm,
                                      selectedTagIds: modalForm.selectedTagIds.filter((id) => id !== t.id),
                                    });
                                  } else {
                                    setModalForm({
                                      ...modalForm,
                                      selectedTagIds: [...modalForm.selectedTagIds, t.id],
                                    });
                                  }
                                }}
                                className={`px-2.5 py-1 rounded-lg text-xs font-semibold transition-all flex items-center gap-1 cursor-pointer ${
                                  isSelected
                                    ? 'bg-slate-900 text-white shadow-xs'
                                    : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
                                }`}
                              >
                                <span>#{t.name}</span>
                                {isSelected && <Check className="w-3 h-3 text-emerald-400" />}
                              </button>
                            );
                          })}
                        </div>
                      </div>
                    )}
                  </div>

                  {/* Eventos Aceitos (Checkboxes) */}
                  <div className="space-y-2">
                    <div className="flex items-center justify-between">
                      <label className="font-bold uppercase tracking-wider text-[11px] text-slate-700">
                        Eventos que serão processados
                      </label>
                      <button
                        type="button"
                        onClick={() => {
                          if (modalForm.allowedEvents.length === AVAILABLE_EVENTS.length) {
                            setModalForm({ ...modalForm, allowedEvents: [] });
                          } else {
                            setModalForm({
                              ...modalForm,
                              allowedEvents: AVAILABLE_EVENTS.map((e) => e.id),
                            });
                          }
                        }}
                        className="text-[11px] font-semibold text-indigo-600 hover:underline cursor-pointer"
                      >
                        {modalForm.allowedEvents.length === AVAILABLE_EVENTS.length
                          ? 'Desmarcar todos'
                          : 'Marcar todos'}
                      </button>
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 p-3 bg-slate-50 rounded-2xl border border-slate-200">
                      {AVAILABLE_EVENTS.map((ev) => {
                        const isChecked = modalForm.allowedEvents.includes(ev.id);
                        return (
                          <label
                            key={ev.id}
                            className={`flex items-start gap-2.5 p-2 rounded-xl border cursor-pointer transition-colors ${
                              isChecked
                                ? 'bg-white border-indigo-200 shadow-2xs'
                                : 'bg-transparent border-transparent opacity-60 hover:opacity-100'
                            }`}
                          >
                            <input
                              type="checkbox"
                              checked={isChecked}
                              onChange={(e) => {
                                if (e.target.checked) {
                                  setModalForm({
                                    ...modalForm,
                                    allowedEvents: [...modalForm.allowedEvents, ev.id],
                                  });
                                } else {
                                  setModalForm({
                                    ...modalForm,
                                    allowedEvents: modalForm.allowedEvents.filter((id) => id !== ev.id),
                                  });
                                }
                              }}
                              className="mt-0.5 rounded text-indigo-600 focus:ring-indigo-500"
                            />
                            <div>
                              <strong className="block font-semibold text-slate-800 text-[11px]">
                                {ev.label}
                              </strong>
                              <span className="text-[10px] text-slate-400">{ev.desc}</span>
                            </div>
                          </label>
                        );
                      })}
                    </div>
                  </div>
                </div>

                {/* Botões do Rodapé */}
                <div className="p-4 border-t border-slate-200 bg-slate-50/90 shrink-0 flex items-center justify-between">
                  <span className="text-[11px] text-slate-500 hidden sm:inline">
                    🔒 URL exclusiva gerada para {selectedPreset.name}.
                  </span>
                  <div className="flex items-center gap-2 ml-auto">
                    <button
                      type="button"
                      onClick={() => setIsModalOpen(false)}
                      className="px-4 py-2 rounded-xl border border-slate-300 text-slate-700 font-semibold hover:bg-slate-100 transition-colors cursor-pointer"
                    >
                      Cancelar
                    </button>
                    <button
                      type="submit"
                      disabled={savingModal}
                      className="flex items-center gap-1.5 px-5 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white font-semibold shadow-sm transition-colors disabled:opacity-50 cursor-pointer"
                    >
                      {savingModal ? (
                        <>
                          <RotateCw className="w-3.5 h-3.5 animate-spin" />
                          <span>Salvando...</span>
                        </>
                      ) : (
                        <>
                          <Check className="w-3.5 h-3.5" />
                          <span>{editingIntegrationId ? 'Salvar Alterações' : 'Salvar Integração'}</span>
                        </>
                      )}
                    </button>
                  </div>
                </div>
              </form>
            )}
          </div>
        </div>
      )}

      {/* MODAL DETALHE DO PAYLOAD DO EVENTO */}
      {selectedEventForModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/60 backdrop-blur-sm animate-in fade-in duration-200">
          <div className="bg-white rounded-3xl max-w-2xl w-full border border-slate-200 shadow-2xl overflow-hidden flex flex-col max-h-[85vh]">
            <div className="p-4 border-b border-slate-100 flex items-center justify-between bg-slate-50/60">
              <div className="flex items-center gap-2">
                <Code className="w-4 h-4 text-slate-700" />
                <h4 className="font-bold text-slate-900 text-xs">
                  Payload JSON: {selectedEventForModal.platform} • {selectedEventForModal.eventType}
                </h4>
              </div>
              <button
                type="button"
                onClick={() => setSelectedEventForModal(null)}
                className="p-1 rounded-lg text-slate-400 hover:text-slate-700 hover:bg-slate-200/50 cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
            <div className="p-4 overflow-y-auto">
              <pre className="p-3.5 bg-slate-900 text-emerald-400 rounded-xl text-[11px] font-mono overflow-x-auto">
                {(() => {
                  try {
                    return JSON.stringify(JSON.parse(selectedEventForModal.payload), null, 2);
                  } catch {
                    return selectedEventForModal.payload;
                  }
                })()}
              </pre>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
