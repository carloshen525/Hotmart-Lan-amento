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
} from 'lucide-react';
import {
  CheckoutPlatformId,
  PLATFORM_PRESETS,
  StandardCheckoutEventType,
} from '@/services/checkout/types';

interface IntegrationItem {
  id: string;
  tenantId: string;
  platform: CheckoutPlatformId;
  name: string;
  status: 'ACTIVE' | 'INACTIVE';
  secretKey?: string | null;
  allowedEvents: string;
  productName?: string | null;
  productId?: string | null;
  createdAt: string;
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
  const [activeTab, setActiveTab] = useState<'checkout' | 'events' | 'simulate' | 'whatsapp'>('checkout');
  const [tenant, setTenant] = useState<any>(null);

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

  // Modal Criar / Editar Integração
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingIntegrationId, setEditingIntegrationId] = useState<string | null>(null);
  const [modalForm, setModalForm] = useState<{
    platform: CheckoutPlatformId;
    name: string;
    productName: string;
    productId: string;
    secretKey: string;
    allowedEvents: StandardCheckoutEventType[];
    status: 'ACTIVE' | 'INACTIVE';
  }>({
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
  });
  const [savingModal, setSavingModal] = useState(false);
  const [modalError, setModalError] = useState<string | null>(null);

  // Copied states
  const [copiedId, setCopiedId] = useState<string | null>(null);

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

  const fetchIntegrations = async () => {
    setLoadingIntegrations(true);
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

  const handleOpenCreateModal = () => {
    setEditingIntegrationId(null);
    setModalForm({
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
    });
    setModalError(null);
    setIsModalOpen(true);
  };

  const handleOpenEditModal = (item: IntegrationItem) => {
    setEditingIntegrationId(item.id);
    let allowed: StandardCheckoutEventType[] = [];
    try {
      allowed = JSON.parse(item.allowedEvents);
    } catch {
      allowed = ['purchase_approved'];
    }

    setModalForm({
      platform: item.platform,
      name: item.name,
      productName: item.productName || '',
      productId: item.productId || '',
      secretKey: item.secretKey || '',
      allowedEvents: allowed,
      status: item.status,
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
        body: JSON.stringify(modalForm),
      });

      const data = await res.json();
      if (res.ok) {
        setIsModalOpen(false);
        fetchIntegrations();
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
    if (!confirm(`Deseja realmente excluir a integração "${name}"? Os webhooks enviados a esta URL deixarão de ser processados.`)) {
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

  const renderPlatformIcon = (platform: CheckoutPlatformId, className: string = 'w-5 h-5') => {
    switch (platform) {
      case 'HOTMART':
        return <Flame className={`${className} text-orange-500 fill-orange-500`} />;
      case 'KIWIFY':
        return <Zap className={`${className} text-emerald-500 fill-emerald-500`} />;
      case 'CAKTO':
        return <ShoppingBag className={`${className} text-rose-500`} />;
      case 'MONETIZZE':
        return <DollarSign className={`${className} text-blue-500`} />;
      case 'PERFECTPAY':
        return <CreditCard className={`${className} text-purple-500`} />;
      case 'EDUZZ':
        return <GraduationCap className={`${className} text-amber-500`} />;
      case 'BRAIP':
        return <PackageCheck className={`${className} text-cyan-600`} />;
      default:
        return <Code className={`${className} text-slate-600`} />;
    }
  };

  const selectedPreset =
    PLATFORM_PRESETS.find((p) => p.id === modalForm.platform) || PLATFORM_PRESETS[0];

  return (
    <div className="space-y-8 max-w-7xl mx-auto">
      {/* Topo com Título e Botão de Ação */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2.5">
            <h1 className="text-2xl font-bold text-slate-900 tracking-tight">
              Plataformas de Checkout & Vendas
            </h1>
            <span className="px-2.5 py-0.5 rounded-full text-[11px] font-bold bg-indigo-50 text-indigo-700 border border-indigo-200">
              Multi-Checkout Ativo
            </span>
          </div>
          <p className="text-sm text-slate-500 mt-1">
            Arquitetura desacoplada: conecte Hotmart, Kiwify, Cakto, Monetizze, PerfectPay, Eduzz,
            Braip e Webhooks personalizados sem alterar automações ou CRM.
          </p>
        </div>

        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={handleOpenCreateModal}
            className="flex items-center gap-2 px-4 py-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white font-semibold text-xs transition-colors shadow-sm"
          >
            <Plus className="w-4 h-4" />
            <span>+ Nova Integração</span>
          </button>
        </div>
      </div>

      {/* 4 Cards de Métricas de Vendas Multi-Plataforma */}
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
      <div className="flex items-center gap-2 border-b border-slate-200 pb-2">
        <button
          type="button"
          onClick={() => setActiveTab('checkout')}
          className={`flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-bold transition-all ${
            activeTab === 'checkout'
              ? 'bg-indigo-600 text-white shadow-sm'
              : 'text-slate-600 hover:text-slate-900 hover:bg-slate-100'
          }`}
        >
          <Layers className="w-3.5 h-3.5" />
          <span>Plataformas Conectadas</span>
          <span className="ml-1 px-1.5 py-0.5 rounded-full text-[10px] bg-white/20">
            {integrations.length}
          </span>
        </button>

        <button
          type="button"
          onClick={() => setActiveTab('events')}
          className={`flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-bold transition-all ${
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
          className={`flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-bold transition-all ${
            activeTab === 'simulate'
              ? 'bg-indigo-600 text-white shadow-sm'
              : 'text-slate-600 hover:text-slate-900 hover:bg-slate-100'
          }`}
        >
          <Sparkles className="w-3.5 h-3.5" />
          <span>Simulador de Checkout</span>
        </button>

        <button
          type="button"
          onClick={() => setActiveTab('whatsapp')}
          className={`flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-bold transition-all ${
            activeTab === 'whatsapp'
              ? 'bg-indigo-600 text-white shadow-sm'
              : 'text-slate-600 hover:text-slate-900 hover:bg-slate-100'
          }`}
        >
          <MessageSquare className="w-3.5 h-3.5" />
          <span>WhatsApp Evolution</span>
        </button>
      </div>

      {/* ABA 1: INTEGRAÇÕES DE CHECKOUT */}
      {activeTab === 'checkout' && (
        <div className="space-y-6">
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
                  Nenhuma plataforma de checkout configurada
                </h3>
                <p className="text-xs text-slate-500 mt-1 leading-relaxed">
                  Crie sua primeira integração para gerar uma URL de webhook única e receber vendas da
                  Hotmart, Kiwify, Cakto, Monetizze ou qualquer outra plataforma.
                </p>
              </div>
              <button
                type="button"
                onClick={handleOpenCreateModal}
                className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white font-semibold text-xs shadow-sm transition-colors"
              >
                <Plus className="w-4 h-4" />
                <span>+ Criar Primeira Integração</span>
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
                          <div className="w-11 h-11 rounded-xl bg-slate-50 border border-slate-100 flex items-center justify-center shadow-sm">
                            {renderPlatformIcon(item.platform, 'w-6 h-6')}
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
                              <strong className="text-slate-700 font-semibold">
                                {item.platform}
                              </strong>
                              {item.productName && ` • Produto: ${item.productName}`}
                            </span>
                          </div>
                        </div>

                        <div className="flex items-center gap-1">
                          <button
                            type="button"
                            onClick={() => handleOpenEditModal(item)}
                            className="p-1.5 rounded-lg text-slate-400 hover:text-slate-700 hover:bg-slate-100 transition-colors"
                            title="Editar integração"
                          >
                            <Edit3 className="w-4 h-4" />
                          </button>
                          <button
                            type="button"
                            onClick={() => handleDeleteIntegration(item.id, item.name)}
                            className="p-1.5 rounded-lg text-slate-400 hover:text-rose-600 hover:bg-rose-50 transition-colors"
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
                            className={`flex items-center gap-1 px-2.5 py-1 rounded-lg text-xs font-semibold transition-colors shrink-0 ${
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
                            className="text-xs font-semibold text-indigo-600 hover:underline"
                          >
                            {copiedId === `secret_${item.id}` ? 'Copiado!' : 'Copiar'}
                          </button>
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
                        className="text-xs font-semibold text-indigo-600 hover:text-indigo-800 flex items-center gap-1"
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

      {/* ABA 2: HISTÓRICO DE WEBHOOKS (LOGS) */}
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
              className="text-xs text-indigo-600 hover:text-indigo-800 font-semibold flex items-center gap-1"
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
                        <div className="flex items-center gap-1.5 font-bold text-slate-800">
                          {renderPlatformIcon(ev.platform as CheckoutPlatformId, 'w-3.5 h-3.5')}
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
                          className="px-2.5 py-1 rounded-lg border border-slate-200 hover:bg-slate-100 text-slate-600 text-xs font-semibold"
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

      {/* ABA 3: SIMULADOR DE CHECKOUT */}
      {activeTab === 'simulate' && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
          {/* Formulário de Simulação */}
          <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-6 space-y-5">
            <div className="flex items-center gap-2 pb-3 border-b border-slate-100">
              <Sparkles className="w-5 h-5 text-indigo-600" />
              <div>
                <h3 className="font-bold text-slate-900 text-sm">
                  Simulador de Webhooks Multi-Checkout
                </h3>
                <p className="text-xs text-slate-500">
                  Emita eventos reais sem precisar comprar produtos na Hotmart, Kiwify ou Cakto.
                </p>
              </div>
            </div>

            <form onSubmit={handleSimulateWebhook} className="space-y-4 text-xs">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block font-semibold text-slate-700 mb-1">
                    Plataforma Simulada
                  </label>
                  <select
                    value={simPlatform}
                    onChange={(e) => setSimPlatform(e.target.value as CheckoutPlatformId)}
                    className="w-full px-3 py-2 rounded-xl border border-slate-300 text-slate-900 bg-white focus:outline-none focus:ring-2 focus:ring-indigo-500 font-semibold"
                  >
                    <option value="HOTMART">Hotmart</option>
                    <option value="KIWIFY">Kiwify</option>
                    <option value="CAKTO">Cakto</option>
                    <option value="MONETIZZE">Monetizze</option>
                    <option value="PERFECTPAY">PerfectPay</option>
                    <option value="EDUZZ">Eduzz</option>
                    <option value="BRAIP">Braip</option>
                    <option value="CUSTOM">Webhook Personalizado</option>
                  </select>
                </div>

                <div>
                  <label className="block font-semibold text-slate-700 mb-1">
                    Tipo de Evento
                  </label>
                  <select
                    value={simEvent}
                    onChange={(e) => setSimEvent(e.target.value as StandardCheckoutEventType)}
                    className="w-full px-3 py-2 rounded-xl border border-slate-300 text-slate-900 bg-white focus:outline-none focus:ring-2 focus:ring-indigo-500 font-semibold"
                  >
                    <option value="purchase_approved">Compra Aprovada</option>
                    <option value="pix_generated">Pix Gerado</option>
                    <option value="billet_printed">Boleto Gerado</option>
                    <option value="cart_abandoned">Carrinho Abandonado</option>
                    <option value="canceled">Cancelamento</option>
                    <option value="refunded">Reembolso</option>
                    <option value="chargeback">Chargeback</option>
                  </select>
                </div>
              </div>

              <div>
                <label className="block font-semibold text-slate-700 mb-1">
                  E-mail do Comprador *
                </label>
                <input
                  type="email"
                  required
                  value={simEmail}
                  onChange={(e) => setSimEmail(e.target.value)}
                  className="w-full px-3 py-2 rounded-xl border border-slate-300 text-slate-900 focus:outline-none focus:ring-2 focus:ring-indigo-500 font-mono"
                />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block font-semibold text-slate-700 mb-1">Nome do Cliente</label>
                  <input
                    type="text"
                    value={simName}
                    onChange={(e) => setSimName(e.target.value)}
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
                className="w-full flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl bg-slate-900 hover:bg-slate-800 text-white font-semibold text-xs transition-colors shadow-sm disabled:opacity-50"
              >
                {simulating ? (
                  <>
                    <RotateCw className="w-3.5 h-3.5 animate-spin" />
                    <span>Disparando e Processando...</span>
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

      {/* ABA 4: WHATSAPP EVOLUTION API */}
      {activeTab === 'whatsapp' && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
          <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-6 space-y-6">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-gradient-to-tr from-emerald-500 to-teal-600 flex items-center justify-center text-white shadow-md shadow-emerald-500/20">
                <MessageSquare className="w-6 h-6 fill-white" />
              </div>
              <div>
                <h2 className="text-base font-bold text-slate-900">WhatsApp Evolution API (Multi-Tenant)</h2>
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
              mensagens de aquecimento, lembretes de Pix e avisos de aula nunca se misturem entre lançamentos.
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
                className="w-full flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white font-semibold text-xs shadow-sm disabled:opacity-50"
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

      {/* MODAL GUIADO: CRIAR OU EDITAR INTEGRAÇÃO */}
      {isModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/60 backdrop-blur-sm animate-in fade-in duration-200">
          <div className="bg-white rounded-3xl max-w-2xl w-full border border-slate-200 shadow-2xl overflow-hidden flex flex-col max-h-[90vh]">
            {/* Cabeçalho do Modal */}
            <div className="p-5 border-b border-slate-100 flex items-center justify-between bg-slate-50/60">
              <div className="flex items-center gap-2.5">
                <div className="w-8 h-8 rounded-xl bg-indigo-600 text-white flex items-center justify-center shadow-sm">
                  <Plug className="w-4 h-4" />
                </div>
                <div>
                  <h3 className="font-bold text-slate-900 text-sm">
                    {editingIntegrationId ? 'Editar Integração' : 'Cadastrar Nova Integração de Checkout'}
                  </h3>
                  <p className="text-[11px] text-slate-400">
                    Selecione a plataforma, configure os eventos e gere sua URL de webhook.
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setIsModalOpen(false)}
                className="p-1 rounded-lg text-slate-400 hover:text-slate-700 hover:bg-slate-200/50"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Corpo do Formulário */}
            <form onSubmit={handleSaveModal} className="p-6 overflow-y-auto space-y-6 text-xs">
              {modalError && (
                <div className="p-3 bg-red-50 border border-red-200 text-red-800 rounded-xl flex items-center gap-2">
                  <AlertCircle className="w-4 h-4 shrink-0 text-red-600" />
                  <span>{modalError}</span>
                </div>
              )}

              {/* 1. Escolha da Plataforma */}
              <div className="space-y-2">
                <label className="font-bold uppercase tracking-wider text-[11px] text-slate-700 block">
                  1. Escolha a Plataforma de Vendas *
                </label>
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5">
                  {PLATFORM_PRESETS.map((p) => {
                    const isSelected = modalForm.platform === p.id;
                    return (
                      <button
                        type="button"
                        key={p.id}
                        onClick={() => setModalForm({ ...modalForm, platform: p.id })}
                        className={`p-3 rounded-2xl border text-left transition-all flex flex-col justify-between h-20 ${
                          isSelected
                            ? 'border-indigo-600 bg-indigo-50/50 shadow-sm ring-1 ring-indigo-500'
                            : 'border-slate-200 hover:border-slate-300 hover:bg-slate-50/50'
                        }`}
                      >
                        <div className="flex items-center justify-between w-full">
                          {renderPlatformIcon(p.id, 'w-4 h-4')}
                          {isSelected && <Check className="w-3.5 h-3.5 text-indigo-600" />}
                        </div>
                        <span className="font-bold text-slate-800 text-xs block">{p.name}</span>
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* Dica da plataforma selecionada com link oficial */}
              <div className="p-3 rounded-xl bg-blue-50/60 border border-blue-200 text-blue-900 flex items-start justify-between gap-2">
                <div className="text-[11px] leading-relaxed">
                  <strong className="block font-semibold mb-0.5">{selectedPreset.name}:</strong>
                  <span>{selectedPreset.description}</span>
                </div>
                {selectedPreset.defaultDocUrl && (
                  <a
                    href={selectedPreset.defaultDocUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="shrink-0 text-blue-600 hover:text-blue-800 flex items-center gap-1 font-semibold text-[11px]"
                  >
                    <span>Manual</span>
                    <ExternalLink className="w-3 h-3" />
                  </a>
                )}
              </div>

              {/* 2. Nome da Integração & Produto */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block font-semibold text-slate-700 mb-1">
                    Nome da Integração *
                  </label>
                  <input
                    type="text"
                    required
                    placeholder="Ex: Curso Marketing Digital 2026"
                    value={modalForm.name}
                    onChange={(e) => setModalForm({ ...modalForm, name: e.target.value })}
                    className="w-full px-3 py-2 rounded-xl border border-slate-300 text-slate-900 focus:outline-none focus:ring-2 focus:ring-indigo-500 text-xs"
                  />
                </div>

                <div>
                  <label className="block font-semibold text-slate-700 mb-1">
                    Produto Vinculado (Opcional)
                  </label>
                  <input
                    type="text"
                    placeholder="Ex: Mentoria Alta Performance"
                    value={modalForm.productName}
                    onChange={(e) => setModalForm({ ...modalForm, productName: e.target.value })}
                    className="w-full px-3 py-2 rounded-xl border border-slate-300 text-slate-900 focus:outline-none focus:ring-2 focus:ring-indigo-500 text-xs"
                  />
                </div>
              </div>

              {/* 3. Chave Secreta / Token de Verificação */}
              <div className="space-y-1">
                <label className="block font-semibold text-slate-700">
                  {selectedPreset.tokenLabel}
                </label>
                <input
                  type="text"
                  placeholder="Cole aqui o token de validação do webhook fornecido pela plataforma"
                  value={modalForm.secretKey}
                  onChange={(e) => setModalForm({ ...modalForm, secretKey: e.target.value })}
                  className="w-full px-3 py-2 rounded-xl border border-slate-300 text-slate-900 font-mono text-xs focus:outline-none focus:ring-2 focus:ring-indigo-500"
                />
                <p className="text-[11px] text-slate-400">{selectedPreset.tokenHint}</p>
              </div>

              {/* 4. Eventos Aceitos (Checkboxes) */}
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <label className="font-bold uppercase tracking-wider text-[11px] text-slate-700">
                    4. Eventos que serão processados
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
                    className="text-[11px] font-semibold text-indigo-600 hover:underline"
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

              {/* Botões do Rodapé */}
              <div className="pt-4 border-t border-slate-100 flex items-center justify-between">
                <span className="text-[11px] text-slate-400">
                  🔒 URL única gerada automaticamente com criptografia e isolamento multi-tenant.
                </span>
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => setIsModalOpen(false)}
                    className="px-4 py-2 rounded-xl border border-slate-300 text-slate-700 font-semibold hover:bg-slate-50 transition-colors"
                  >
                    Cancelar
                  </button>
                  <button
                    type="submit"
                    disabled={savingModal}
                    className="flex items-center gap-1.5 px-5 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white font-semibold shadow-sm transition-colors disabled:opacity-50"
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
                className="p-1 rounded-lg text-slate-400 hover:text-slate-700 hover:bg-slate-200/50"
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
