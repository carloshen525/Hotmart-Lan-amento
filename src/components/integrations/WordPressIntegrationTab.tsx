'use client';

import { useState, useEffect } from 'react';
import {
  Globe,
  Plus,
  Copy,
  Check,
  Edit3,
  Trash2,
  Clock,
  Sparkles,
  Sliders,
  CheckCircle2,
  AlertCircle,
  X,
  ExternalLink,
  ShieldCheck,
  Tag as TagIcon,
  HelpCircle,
  FileCode,
  RotateCw,
  Search,
  Key,
  Layers,
  ArrowRight,
  Eye,
  CheckSquare,
  AlertTriangle,
} from 'lucide-react';
import {
  FormIntegrationDTO,
  FormPlatformId,
  STANDARD_FORM_FIELDS,
} from '@/services/wordpress/types';

interface WordPressIntegrationTabProps {
  tenant: any;
  availableTags: Array<{ id: string; name: string; color: string }>;
  onRefreshTags: () => Promise<void>;
  onCreateTagInline: (name: string) => Promise<any>;
}

export function WordPressIntegrationTab({
  tenant,
  availableTags,
  onRefreshTags,
  onCreateTagInline,
}: WordPressIntegrationTabProps) {
  // Lista de integrações
  const [integrations, setIntegrations] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  // Automações disponíveis
  const [automations, setAutomations] = useState<any[]>([]);

  // Modal de Criação / Edição
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [savingModal, setSavingModal] = useState(false);
  const [modalError, setModalError] = useState<string | null>(null);

  const [modalForm, setModalForm] = useState<{
    uniqueId: string;
    name: string;
    platform: FormPlatformId;
    status: 'ACTIVE' | 'INACTIVE';
    secretKey: string;
    allowReentry: 'ALWAYS' | 'NEVER';
    targetAutomationId: string;
    selectedTagIds: string[];
  }>({
    uniqueId: '',
    name: '',
    platform: 'ELEMENTOR',
    status: 'ACTIVE',
    secretKey: '',
    allowReentry: 'ALWAYS',
    targetAutomationId: '',
    selectedTagIds: [],
  });

  // Inline tag creation
  const [newTagName, setNewTagName] = useState('');
  const [creatingTag, setCreatingTag] = useState(false);

  // Modal de Mapeamento Visual
  const [isMappingModalOpen, setIsMappingModalOpen] = useState(false);
  const [mappingIntegration, setMappingIntegration] = useState<any | null>(null);
  const [fieldMapping, setFieldMapping] = useState<Record<string, string>>({});
  const [savingMapping, setSavingMapping] = useState(false);

  // Modal de Teste
  const [isTestModalOpen, setIsTestModalOpen] = useState(false);
  const [testIntegration, setTestIntegration] = useState<any | null>(null);
  const [testForm, setTestForm] = useState({
    name: 'Carlos Aluno VIP',
    email: 'carlos.vip@gmail.com',
    phone: '+5511998877665',
    utmSource: 'instagram_ads',
    utmMedium: 'stories',
    utmCampaign: 'workshop_lancamento',
    pageUrl: 'https://meusite.com.br/inscricao-workshop',
    forceRealTest: false,
  });
  const [runningTest, setRunningTest] = useState(false);
  const [testResult, setTestResult] = useState<any | null>(null);

  // Modal de Histórico / Logs
  const [isHistoryModalOpen, setIsHistoryModalOpen] = useState(false);
  const [historyIntegration, setHistoryIntegration] = useState<any | null>(null);
  const [events, setEvents] = useState<any[]>([]);
  const [loadingEvents, setLoadingEvents] = useState(false);
  const [selectedEventDetails, setSelectedEventDetails] = useState<any | null>(null);

  // Copied IDs
  const [copiedId, setCopiedId] = useState<string | null>(null);

  // Webhook recém-criado para destaque
  const [createdSuccess, setCreatedSuccess] = useState<{
    id: string;
    name: string;
    url: string;
  } | null>(null);

  // Carrega integrações
  const fetchIntegrations = async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/wordpress/integrations');
      const data = await res.json();
      if (res.ok) {
        setIntegrations(data.integrations || []);
      }
    } catch {
    } finally {
      setLoading(false);
    }
  };

  // Carrega automações ativas
  const fetchAutomations = async () => {
    try {
      const res = await fetch('/api/automations');
      const data = await res.json();
      if (data.automations) {
        setAutomations(data.automations);
      }
    } catch {}
  };

  useEffect(() => {
    fetchIntegrations();
    fetchAutomations();
  }, []);

  const getWebhookUrl = (id: string) => {
    const origin = typeof window !== 'undefined' ? window.location.origin : 'http://localhost:3000';
    return `${origin}/api/webhooks/wordpress/${id}`;
  };

  const copyToClipboard = (text: string, id: string) => {
    navigator.clipboard.writeText(text);
    setCopiedId(id);
    setTimeout(() => setCopiedId(null), 2500);
  };

  // Abertura do modal de criação
  const handleOpenCreateModal = () => {
    setEditingId(null);
    setCreatedSuccess(null);
    const genId = 'wp_' + Math.random().toString(36).substring(2, 8);
    const genSecret = 'whsec_' + Math.random().toString(36).substring(2, 12);

    setModalForm({
      uniqueId: genId,
      name: '',
      platform: 'ELEMENTOR',
      status: 'ACTIVE',
      secretKey: genSecret,
      allowReentry: 'ALWAYS',
      targetAutomationId: '',
      selectedTagIds: [],
    });
    setModalError(null);
    setIsModalOpen(true);
  };

  // Abertura do modal de edição
  const handleOpenEditModal = (item: any) => {
    setEditingId(item.id);
    setCreatedSuccess(null);

    setModalForm({
      uniqueId: item.id,
      name: item.name,
      platform: item.platform || 'ELEMENTOR',
      status: item.status || 'ACTIVE',
      secretKey: item.secretKey || '',
      allowReentry: item.allowReentry || 'ALWAYS',
      targetAutomationId: item.targetAutomationId || '',
      selectedTagIds: (item.integrationTags || []).map((it: any) => it.tagId),
    });
    setModalError(null);
    setIsModalOpen(true);
  };

  // Salvar formulário de integração
  const handleSaveModal = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!modalForm.name.trim()) {
      setModalError('Informe um nome identificador para a integração.');
      return;
    }

    setSavingModal(true);
    setModalError(null);

    try {
      const url = editingId
        ? `/api/wordpress/integrations/${editingId}`
        : '/api/wordpress/integrations';
      const method = editingId ? 'PUT' : 'POST';

      const res = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: modalForm.name.trim(),
          platform: modalForm.platform,
          status: modalForm.status,
          secretKey: modalForm.secretKey.trim() || undefined,
          allowReentry: modalForm.allowReentry,
          targetAutomationId: modalForm.targetAutomationId || null,
          tagIds: modalForm.selectedTagIds,
          customId: !editingId ? modalForm.uniqueId : undefined,
        }),
      });

      const data = await res.json();
      if (res.ok) {
        await fetchIntegrations();
        const integrationId = editingId || data.integration?.id || modalForm.uniqueId;
        if (!editingId) {
          setCreatedSuccess({
            id: integrationId,
            name: modalForm.name,
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

  // Exclusão de integração
  const handleDeleteIntegration = async (id: string, name: string) => {
    if (
      !confirm(
        `Deseja realmente excluir a integração "${name}"? Os formulários que apontam para este webhook deixarão de capturar leads.`
      )
    ) {
      return;
    }

    try {
      const res = await fetch(`/api/wordpress/integrations/${id}`, { method: 'DELETE' });
      if (res.ok) {
        fetchIntegrations();
      }
    } catch {}
  };

  // Criação de tag inline
  const handleCreateTag = async () => {
    if (!newTagName.trim()) return;
    setCreatingTag(true);
    try {
      const tag = await onCreateTagInline(newTagName.trim());
      if (tag) {
        setModalForm((prev) => ({
          ...prev,
          selectedTagIds: prev.selectedTagIds.includes(tag.id)
            ? prev.selectedTagIds
            : [...prev.selectedTagIds, tag.id],
        }));
        setNewTagName('');
      }
    } finally {
      setCreatingTag(false);
    }
  };

  // Mapeamento visual de campos
  const handleOpenMappingModal = (item: any) => {
    setMappingIntegration(item);
    let parsedMapping: Record<string, string> = {};
    try {
      if (item.fieldMapping) {
        parsedMapping =
          typeof item.fieldMapping === 'string'
            ? JSON.parse(item.fieldMapping)
            : item.fieldMapping;
      }
    } catch {}

    setFieldMapping(parsedMapping);
    setIsMappingModalOpen(true);
  };

  const handleSaveMapping = async () => {
    if (!mappingIntegration) return;
    setSavingMapping(true);

    try {
      const res = await fetch(`/api/wordpress/integrations/${mappingIntegration.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ fieldMapping }),
      });

      if (res.ok) {
        setIsMappingModalOpen(false);
        fetchIntegrations();
      }
    } finally {
      setSavingMapping(false);
    }
  };

  // Auto-detectar campos com base na amostra de payload
  const handleAutoDetectFields = () => {
    if (!mappingIntegration?.samplePayload) return;
    try {
      const sample =
        typeof mappingIntegration.samplePayload === 'string'
          ? JSON.parse(mappingIntegration.samplePayload)
          : mappingIntegration.samplePayload;

      const detected: Record<string, string> = {};

      const sampleKeys = Object.keys(sample);

      for (const field of STANDARD_FORM_FIELDS) {
        for (const alias of field.aliases) {
          const match = sampleKeys.find((k) => k.toLowerCase() === alias.toLowerCase());
          if (match) {
            detected[field.key] = match;
            break;
          }
        }
      }

      setFieldMapping((prev) => ({ ...prev, ...detected }));
    } catch {}
  };

  // Abertura do modal de Teste
  const handleOpenTestModal = (item: any) => {
    setTestIntegration(item);
    setTestResult(null);
    setIsTestModalOpen(true);
  };

  const handleRunTest = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!testIntegration) return;
    setRunningTest(true);
    setTestResult(null);

    try {
      const res = await fetch(`/api/wordpress/integrations/${testIntegration.id}/test`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: testForm.name,
          email: testForm.email,
          phone: testForm.phone,
          utmSource: testForm.utmSource,
          utmMedium: testForm.utmMedium,
          utmCampaign: testForm.utmCampaign,
          pageUrl: testForm.pageUrl,
          forceRealTest: testForm.forceRealTest,
        }),
      });

      const data = await res.json();
      setTestResult(data);
      fetchIntegrations();
    } catch (err: any) {
      setTestResult({ success: false, error: err.message });
    } finally {
      setRunningTest(false);
    }
  };

  // Histórico de eventos
  const handleOpenHistoryModal = async (item: any) => {
    setHistoryIntegration(item);
    setIsHistoryModalOpen(true);
    setLoadingEvents(true);
    setSelectedEventDetails(null);

    try {
      const res = await fetch(`/api/wordpress/integrations/${item.id}/events`);
      const data = await res.json();
      if (res.ok) {
        setEvents(data.events || []);
      }
    } finally {
      setLoadingEvents(false);
    }
  };

  // Métricas agregadas
  const totalEventsCount = integrations.reduce((acc, it) => acc + (it.totalEvents || 0), 0);
  const totalNewCount = integrations.reduce((acc, it) => acc + (it.newContacts || 0), 0);
  const totalUpdatedCount = integrations.reduce((acc, it) => acc + (it.updatedContacts || 0), 0);

  return (
    <div className="space-y-6">
      {/* Top Header & Métricas */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2.5">
            <h2 className="text-xl font-bold text-slate-900 tracking-tight flex items-center gap-2">
              <Globe className="w-6 h-6 text-sky-600" />
              <span>WordPress & Elementor Pro</span>
            </h2>
            <span className="px-2.5 py-0.5 rounded-full text-[11px] font-bold bg-sky-50 text-sky-700 border border-sky-200">
              Captação Direta de Leads
            </span>
          </div>
          <p className="text-sm text-slate-500 mt-1">
            Conecte formulários do Elementor Pro e WordPress diretamente à LaunchFlow sem intermediários
            pagos. Cada formulário possui seu próprio webhook exclusivo, tags e regras de automação.
          </p>
        </div>

        <button
          type="button"
          onClick={handleOpenCreateModal}
          className="flex items-center gap-2 px-4 py-2.5 rounded-xl bg-sky-600 hover:bg-sky-700 text-white font-semibold text-xs transition-colors shadow-sm cursor-pointer shrink-0"
        >
          <Plus className="w-4 h-4" />
          <span>+ Nova Integração WordPress</span>
        </button>
      </div>

      {/* Cards de Métricas de Captação */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3.5">
        <div className="p-4 rounded-2xl bg-white border border-slate-200 shadow-sm flex flex-col justify-between">
          <span className="text-[11px] font-bold uppercase tracking-wider text-slate-400">
            Formulários Conectados
          </span>
          <div className="mt-2 flex items-baseline justify-between">
            <span className="text-2xl font-black text-slate-900 font-mono">
              {integrations.length}
            </span>
            <span className="text-[10px] text-sky-600 font-bold">1:1 Exclusivos</span>
          </div>
        </div>

        <div className="p-4 rounded-2xl bg-white border border-slate-200 shadow-sm flex flex-col justify-between">
          <span className="text-[11px] font-bold uppercase tracking-wider text-emerald-700">
            Novos Leads Criados
          </span>
          <div className="mt-2 flex items-baseline justify-between">
            <span className="text-2xl font-black text-emerald-900 font-mono">{totalNewCount}</span>
            <span className="text-[10px] text-emerald-600 font-semibold">No CRM</span>
          </div>
        </div>

        <div className="p-4 rounded-2xl bg-white border border-slate-200 shadow-sm flex flex-col justify-between">
          <span className="text-[11px] font-bold uppercase tracking-wider text-indigo-700">
            Leads Atualizados
          </span>
          <div className="mt-2 flex items-baseline justify-between">
            <span className="text-2xl font-black text-indigo-900 font-mono">
              {totalUpdatedCount}
            </span>
            <span className="text-[10px] text-indigo-600 font-semibold">Reentradas</span>
          </div>
        </div>

        <div className="p-4 rounded-2xl bg-white border border-slate-200 shadow-sm flex flex-col justify-between">
          <span className="text-[11px] font-bold uppercase tracking-wider text-sky-700">
            Total de Inscrições
          </span>
          <div className="mt-2 flex items-baseline justify-between">
            <span className="text-2xl font-black text-sky-900 font-mono">{totalEventsCount}</span>
            <span className="text-[10px] text-sky-600 font-semibold">Webhooks</span>
          </div>
        </div>
      </div>

      {/* Banner Passo a Passo: Elementor Pro */}
      <div className="p-4 rounded-2xl bg-gradient-to-r from-sky-50 via-indigo-50/60 to-purple-50/40 dark:from-sky-950/40 dark:via-indigo-950/30 dark:to-purple-950/20 border border-sky-200/80 dark:border-sky-500/30 shadow-xs">
        <div className="flex items-start gap-3.5">
          <div className="w-9 h-9 rounded-xl bg-sky-600 text-white flex items-center justify-center shrink-0 shadow-sm">
            <Globe className="w-5 h-5" />
          </div>
          <div className="flex-1 text-xs">
            <h4 className="font-bold text-slate-900 dark:text-white text-sm">
              Como conectar seu formulário do Elementor Pro em 3 passos rápidos:
            </h4>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-3 mt-2.5">
              <div className="p-2.5 bg-white/80 dark:bg-slate-900/80 rounded-xl border border-sky-200/60 dark:border-sky-500/30">
                <span className="font-bold text-sky-700 dark:text-sky-300 block mb-0.5">1. Crie a Integração</span>
                <p className="text-slate-600 dark:text-slate-300 text-[11px]">
                  Clique em <strong>+ Nova Integração</strong>, defina as tags e copie a URL exclusiva do Webhook.
                </p>
              </div>
              <div className="p-2.5 bg-white/80 dark:bg-slate-900/80 rounded-xl border border-sky-200/60 dark:border-sky-500/30">
                <span className="font-bold text-sky-700 dark:text-sky-300 block mb-0.5">2. Configure no Elementor</span>
                <p className="text-slate-600 dark:text-slate-300 text-[11px]">
                  No Elementor Pro, acesse <strong>Ações Após o Envio (Actions After Submit)</strong> e adicione <strong>Webhook</strong>.
                </p>
              </div>
              <div className="p-2.5 bg-white/80 dark:bg-slate-900/80 rounded-xl border border-sky-200/60 dark:border-sky-500/30">
                <span className="font-bold text-sky-700 dark:text-sky-300 block mb-0.5">3. Cole a URL e Salve</span>
                <p className="text-slate-600 dark:text-slate-300 text-[11px]">
                  Cole a URL fornecida no campo <strong>URL do Webhook</strong> e publique a página. Pronto!
                </p>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Lista de Integrações WordPress / Elementor */}
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <h3 className="font-bold text-slate-800 text-sm flex items-center gap-2">
            <span>Formulários Cadastrados</span>
            <span className="px-2 py-0.5 rounded-full bg-slate-100 text-slate-600 text-xs font-semibold">
              {integrations.length}
            </span>
          </h3>
        </div>

        {loading ? (
          <div className="p-12 text-center bg-white rounded-2xl border border-slate-200 shadow-sm">
            <div className="w-8 h-8 border-2 border-sky-600 border-t-transparent rounded-full animate-spin mx-auto mb-2" />
            <p className="text-xs text-slate-500 font-medium">Carregando integrações do WordPress...</p>
          </div>
        ) : integrations.length === 0 ? (
          <div className="p-12 text-center bg-white rounded-2xl border-2 border-dashed border-slate-200 shadow-sm">
            <Globe className="w-12 h-12 text-slate-300 mx-auto mb-3" />
            <h4 className="font-bold text-slate-800 text-sm">Nenhum formulário integrado ainda</h4>
            <p className="text-xs text-slate-500 max-w-md mx-auto mt-1 mb-4">
              Crie seu primeiro webhook exclusivo para capturar inscrições de workshops, e-books e lançamentos
              direto do Elementor.
            </p>
            <button
              type="button"
              onClick={handleOpenCreateModal}
              className="px-4 py-2 bg-sky-600 hover:bg-sky-700 text-white rounded-xl text-xs font-semibold shadow-sm transition-colors cursor-pointer"
            >
              + Criar Primeira Integração
            </button>
          </div>
        ) : (
          <div className="grid grid-cols-1 gap-4">
            {integrations.map((item) => {
              const webhookUrl = getWebhookUrl(item.id);
              const isCopied = copiedId === item.id;
              const tags = item.integrationTags || [];

              return (
                <div
                  key={item.id}
                  className="p-5 rounded-2xl bg-white border border-slate-200 shadow-sm hover:border-sky-300 hover:shadow-md transition-all flex flex-col gap-4"
                >
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                    <div className="flex items-center gap-3">
                      <div className="w-11 h-11 rounded-2xl bg-sky-50 border border-sky-200 flex items-center justify-center text-sky-600 font-bold shrink-0">
                        <Globe className="w-6 h-6" />
                      </div>
                      <div>
                        <div className="flex items-center gap-2">
                          <h4 className="font-bold text-slate-900 text-sm">{item.name}</h4>
                          <span
                            className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${
                              item.status === 'ACTIVE'
                                ? 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                                : 'bg-slate-100 text-slate-600 border border-slate-200'
                            }`}
                          >
                            {item.status === 'ACTIVE' ? 'Ativa' : 'Pausada'}
                          </span>
                          <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-sky-50 text-sky-700 border border-sky-200">
                            Elementor
                          </span>
                        </div>
                        <p className="text-[11px] text-slate-400 mt-0.5">
                          Expert: <strong className="text-slate-600">{tenant?.name || 'Ambiente Ativo'}</strong>
                          {item.lastEventAt && (
                            <span className="ml-2 border-l border-slate-200 pl-2">
                              Último evento: {new Date(item.lastEventAt).toLocaleString('pt-BR')}
                            </span>
                          )}
                        </p>
                      </div>
                    </div>

                    <div className="flex items-center gap-1.5 flex-wrap">
                      <button
                        type="button"
                        onClick={() => handleOpenMappingModal(item)}
                        className="px-3 py-1.5 rounded-xl border border-slate-200 hover:border-sky-300 bg-white hover:bg-sky-50 text-slate-700 hover:text-sky-700 font-semibold text-xs flex items-center gap-1.5 transition-colors cursor-pointer"
                        title="Configurar mapeamento visual de campos"
                      >
                        <Sliders className="w-3.5 h-3.5 text-sky-600" />
                        <span>Mapear Campos</span>
                      </button>

                      <button
                        type="button"
                        onClick={() => handleOpenTestModal(item)}
                        className="px-3 py-1.5 rounded-xl border border-slate-200 hover:border-emerald-300 bg-white hover:bg-emerald-50 text-slate-700 hover:text-emerald-700 font-semibold text-xs flex items-center gap-1.5 transition-colors cursor-pointer"
                        title="Simular ou testar envio de formulário"
                      >
                        <Sparkles className="w-3.5 h-3.5 text-emerald-600" />
                        <span>Testar</span>
                      </button>

                      <button
                        type="button"
                        onClick={() => handleOpenHistoryModal(item)}
                        className="px-3 py-1.5 rounded-xl border border-slate-200 hover:border-indigo-300 bg-white hover:bg-indigo-50 text-slate-700 hover:text-indigo-700 font-semibold text-xs flex items-center gap-1.5 transition-colors cursor-pointer"
                        title="Ver histórico de inscrições recebidas"
                      >
                        <Clock className="w-3.5 h-3.5 text-indigo-600" />
                        <span>Histórico</span>
                      </button>

                      <button
                        type="button"
                        onClick={() => handleOpenEditModal(item)}
                        className="p-1.5 text-slate-400 hover:text-slate-700 rounded-lg hover:bg-slate-100 transition-colors cursor-pointer"
                        title="Editar configurações"
                      >
                        <Edit3 className="w-4 h-4" />
                      </button>

                      <button
                        type="button"
                        onClick={() => handleDeleteIntegration(item.id, item.name)}
                        className="p-1.5 text-slate-400 hover:text-rose-600 rounded-lg hover:bg-rose-50 transition-colors cursor-pointer"
                        title="Excluir integração"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  </div>

                  {/* Campo de URL exclusiva do Webhook */}
                  <div className="flex items-center gap-2 p-2 rounded-xl bg-slate-50 border border-slate-200 text-xs">
                    <span className="font-bold text-slate-500 text-[10px] uppercase px-1.5 shrink-0">
                      Webhook Exclusivo:
                    </span>
                    <input
                      type="text"
                      readOnly
                      value={webhookUrl}
                      className="bg-transparent text-slate-800 font-mono text-[11px] flex-1 outline-none select-all truncate"
                    />
                    <button
                      type="button"
                      onClick={() => copyToClipboard(webhookUrl, item.id)}
                      className={`px-3 py-1 rounded-lg text-xs font-bold flex items-center gap-1.5 transition-all cursor-pointer ${
                        isCopied
                          ? 'bg-emerald-600 text-white'
                          : 'bg-white border border-slate-300 text-slate-700 hover:bg-slate-100'
                      }`}
                    >
                      {isCopied ? (
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

                  {/* Informações de Tags e Métricas da Integração */}
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pt-1 border-t border-slate-100 text-xs">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="text-[11px] font-semibold text-slate-400 flex items-center gap-1">
                        <TagIcon className="w-3 h-3" />
                        Tags automáticas:
                      </span>
                      {tags.length === 0 ? (
                        <span className="text-[11px] text-slate-400 italic">Nenhuma tag vinculada</span>
                      ) : (
                        tags.map((t: any) => (
                          <span
                            key={t.tagId || t.id}
                            className="px-2 py-0.5 rounded-md text-[10px] font-semibold border"
                            style={{
                              backgroundColor: `${t.tag?.color || '#0ea5e9'}15`,
                              borderColor: `${t.tag?.color || '#0ea5e9'}40`,
                              color: t.tag?.color || '#0ea5e9',
                            }}
                          >
                            {t.tag?.name}
                          </span>
                        ))
                      )}
                    </div>

                    <div className="flex items-center gap-4 text-slate-500 text-[11px] shrink-0">
                      <span>
                        Inscrições: <strong className="text-slate-800">{item.totalEvents || 0}</strong>
                      </span>
                      <span>
                        Novos: <strong className="text-emerald-700">{item.newContacts || 0}</strong>
                      </span>
                      <span>
                        Atualizados: <strong className="text-indigo-700">{item.updatedContacts || 0}</strong>
                      </span>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* ============================================================ */}
      {/* MODAL 1: CADASTRAR / EDITAR INTEGRAÇÃO WORDPRESS / ELEMENTOR */}
      {/* ============================================================ */}
      {isModalOpen && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-xs z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-3xl shadow-2xl border border-slate-200 max-w-xl w-full p-6 text-xs text-slate-700 max-h-[90vh] overflow-y-auto animate-in fade-in zoom-in-95 duration-150">
            {createdSuccess ? (
              <div className="space-y-4 py-2">
                <div className="w-12 h-12 rounded-2xl bg-emerald-100 text-emerald-600 flex items-center justify-center mx-auto">
                  <CheckCircle2 className="w-7 h-7" />
                </div>
                <div className="text-center">
                  <h3 className="font-bold text-slate-900 text-base">Integração Criada com Sucesso!</h3>
                  <p className="text-slate-500 text-xs mt-1">
                    Copie a URL exclusiva abaixo e cole na ação de <strong>Webhook</strong> do Elementor.
                  </p>
                </div>

                <div className="p-4 bg-slate-50 border border-slate-200 rounded-2xl space-y-2">
                  <span className="text-[11px] font-bold text-slate-500 uppercase tracking-wider block">
                    URL Exclusiva do Webhook
                  </span>
                  <div className="flex items-center gap-2">
                    <input
                      type="text"
                      readOnly
                      value={createdSuccess.url}
                      className="bg-white border border-slate-300 p-2.5 rounded-xl text-xs font-mono flex-1 select-all"
                    />
                    <button
                      type="button"
                      onClick={() => copyToClipboard(createdSuccess.url, 'success_modal')}
                      className={`px-4 py-2.5 rounded-xl font-bold text-xs flex items-center gap-1.5 transition-colors cursor-pointer ${
                        copiedId === 'success_modal'
                          ? 'bg-emerald-600 text-white'
                          : 'bg-sky-600 hover:bg-sky-700 text-white'
                      }`}
                    >
                      {copiedId === 'success_modal' ? (
                        <>
                          <Check className="w-4 h-4" />
                          <span>Copiado!</span>
                        </>
                      ) : (
                        <>
                          <Copy className="w-4 h-4" />
                          <span>Copiar</span>
                        </>
                      )}
                    </button>
                  </div>
                </div>

                <div className="pt-2 flex justify-end">
                  <button
                    type="button"
                    onClick={() => {
                      setIsModalOpen(false);
                      setCreatedSuccess(null);
                    }}
                    className="px-5 py-2.5 bg-slate-900 hover:bg-slate-800 text-white rounded-xl font-semibold text-xs cursor-pointer"
                  >
                    Concluir e Voltar
                  </button>
                </div>
              </div>
            ) : (
              <form onSubmit={handleSaveModal} className="space-y-4">
                <div className="flex items-center justify-between pb-3 border-b border-slate-100">
                  <div className="flex items-center gap-2.5">
                    <div className="w-8 h-8 rounded-xl bg-sky-100 text-sky-600 flex items-center justify-center font-bold">
                      <Globe className="w-4 h-4" />
                    </div>
                    <div>
                      <h3 className="font-bold text-slate-900 text-sm">
                        {editingId ? 'Editar Integração WordPress' : 'Nova Integração WordPress / Elementor'}
                      </h3>
                      <p className="text-[11px] text-slate-500">
                        Captação de leads e inscrição de formulários
                      </p>
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={() => setIsModalOpen(false)}
                    className="text-slate-400 hover:text-slate-600 p-1"
                  >
                    <X className="w-4 h-4" />
                  </button>
                </div>

                {modalError && (
                  <div className="p-3 bg-rose-50 border border-rose-200 rounded-xl text-rose-700 text-xs flex items-center gap-2">
                    <AlertCircle className="w-4 h-4 shrink-0" />
                    <span>{modalError}</span>
                  </div>
                )}

                {/* Nome da Integração */}
                <div>
                  <label className="block text-slate-700 font-bold mb-1">
                    Nome da Integração *
                  </label>
                  <input
                    type="text"
                    required
                    value={modalForm.name}
                    onChange={(e) => setModalForm((prev) => ({ ...prev, name: e.target.value }))}
                    placeholder="Ex: Inscrição Workshop 2026, E-book Tráfego..."
                    className="w-full p-2.5 bg-slate-50 border border-slate-300 rounded-xl text-xs text-slate-900 focus:outline-none focus:border-sky-500"
                  />
                </div>

                {/* Expert selecionado automaticamente */}
                <div className="p-3 bg-slate-50 border border-slate-200 rounded-xl flex items-center justify-between">
                  <div>
                    <span className="text-[10px] font-bold uppercase text-slate-400 block">
                      Expert / Tenant Ativo
                    </span>
                    <span className="font-bold text-slate-900 text-xs">
                      {tenant?.name || 'Meu Expert Principal'}
                    </span>
                  </div>
                  <span className="px-2 py-0.5 rounded-full text-[10px] bg-emerald-100 text-emerald-800 font-bold flex items-center gap-1">
                    <ShieldCheck className="w-3 h-3" />
                    Ambiente Isolado
                  </span>
                </div>

                {/* Plataforma */}
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-slate-700 font-bold mb-1">Plataforma / Origem</label>
                    <select
                      value={modalForm.platform}
                      onChange={(e) =>
                        setModalForm((prev) => ({ ...prev, platform: e.target.value as any }))
                      }
                      className="w-full p-2.5 bg-slate-50 border border-slate-300 rounded-xl text-xs text-slate-900 focus:outline-none focus:border-sky-500"
                    >
                      <option value="ELEMENTOR">Elementor / Elementor Pro</option>
                      <option value="WORDPRESS">WordPress Geral</option>
                      <option value="CONTACT_FORM_7">Contact Form 7</option>
                      <option value="WPFORMS">WPForms</option>
                      <option value="CUSTOM">Outro Formulário HTML</option>
                    </select>
                  </div>

                  <div>
                    <label className="block text-slate-700 font-bold mb-1">Status</label>
                    <select
                      value={modalForm.status}
                      onChange={(e) =>
                        setModalForm((prev) => ({ ...prev, status: e.target.value as any }))
                      }
                      className="w-full p-2.5 bg-slate-50 border border-slate-300 rounded-xl text-xs text-slate-900 focus:outline-none focus:border-sky-500"
                    >
                      <option value="ACTIVE">Ativa (Recebendo leads)</option>
                      <option value="INACTIVE">Pausada</option>
                    </select>
                  </div>
                </div>

                {/* URL do Webhook Exclusivo */}
                <div>
                  <label className="block text-slate-700 font-bold mb-1 flex items-center justify-between">
                    <span>URL Exclusiva do Webhook</span>
                    <span className="text-[10px] font-mono text-sky-600">Gerada 1:1</span>
                  </label>
                  <div className="flex items-center gap-2">
                    <input
                      type="text"
                      readOnly
                      value={getWebhookUrl(modalForm.uniqueId)}
                      className="w-full p-2.5 bg-slate-100 border border-slate-300 rounded-xl text-xs text-slate-700 font-mono select-all truncate"
                    />
                    <button
                      type="button"
                      onClick={() => copyToClipboard(getWebhookUrl(modalForm.uniqueId), 'modal_unique')}
                      className="px-3 py-2.5 bg-white border border-slate-300 hover:bg-slate-50 rounded-xl text-slate-700 text-xs font-semibold shrink-0 cursor-pointer"
                    >
                      {copiedId === 'modal_unique' ? 'Copiado!' : 'Copiar'}
                    </button>
                  </div>
                </div>

                {/* Chave Secreta Opcional */}
                <div>
                  <label className="block text-slate-700 font-bold mb-1 flex items-center justify-between">
                    <span>Chave Secreta de Autenticação (Opcional)</span>
                    <button
                      type="button"
                      onClick={() =>
                        setModalForm((prev) => ({
                          ...prev,
                          secretKey: 'whsec_' + Math.random().toString(36).substring(2, 12),
                        }))
                      }
                      className="text-[10px] text-sky-600 hover:underline flex items-center gap-1 cursor-pointer"
                    >
                      <RotateCw className="w-2.5 h-2.5" />
                      Regenerar Chave
                    </button>
                  </label>
                  <input
                    type="text"
                    value={modalForm.secretKey}
                    onChange={(e) =>
                      setModalForm((prev) => ({ ...prev, secretKey: e.target.value }))
                    }
                    placeholder="whsec_..."
                    className="w-full p-2.5 bg-slate-50 border border-slate-300 rounded-xl text-xs text-slate-900 font-mono focus:outline-none focus:border-sky-500"
                  />
                  <p className="text-[10px] text-slate-400 mt-1">
                    Protege contra envios não autorizados. No Elementor, passe no header{' '}
                    <code>X-Webhook-Secret</code> ou query parameter <code>?secret=...</code>
                  </p>
                </div>

                {/* Tags aplicadas automaticamente */}
                <div className="space-y-2 pt-1 border-t border-slate-100">
                  <div className="flex items-center justify-between">
                    <label className="text-slate-800 font-bold text-xs flex items-center gap-1.5">
                      <TagIcon className="w-3.5 h-3.5 text-sky-600" />
                      <span>Tags aplicadas automaticamente</span>
                    </label>
                    <span className="text-[10px] text-slate-400 font-medium">
                      {modalForm.selectedTagIds.length} selecionada(s)
                    </span>
                  </div>

                  {/* Campo inline para criar nova tag */}
                  <div className="flex items-center gap-1.5">
                    <input
                      type="text"
                      value={newTagName}
                      onChange={(e) => setNewTagName(e.target.value)}
                      placeholder="Criar nova tag (ex: Aluno Workshop)..."
                      className="flex-1 p-2 bg-slate-50 border border-slate-300 rounded-lg text-xs text-slate-900 focus:outline-none focus:border-sky-500"
                    />
                    <button
                      type="button"
                      disabled={creatingTag || !newTagName.trim()}
                      onClick={handleCreateTag}
                      className="px-3 py-2 bg-slate-800 hover:bg-slate-700 disabled:opacity-50 text-white rounded-lg text-xs font-semibold shrink-0 cursor-pointer"
                    >
                      {creatingTag ? 'Criando...' : '+ Criar Tag'}
                    </button>
                  </div>

                  {/* Seletor múltiplo das tags cadastradas */}
                  <div className="p-2.5 bg-slate-50 border border-slate-200 rounded-xl max-h-36 overflow-y-auto space-y-1">
                    {availableTags.length === 0 ? (
                      <p className="text-slate-400 text-[11px] text-center py-2">
                        Nenhuma tag encontrada. Crie uma acima.
                      </p>
                    ) : (
                      <div className="flex flex-wrap gap-1.5">
                        {availableTags.map((t) => {
                          const isSelected = modalForm.selectedTagIds.includes(t.id);
                          return (
                            <button
                              key={t.id}
                              type="button"
                              onClick={() => {
                                setModalForm((prev) => ({
                                  ...prev,
                                  selectedTagIds: isSelected
                                    ? prev.selectedTagIds.filter((id) => id !== t.id)
                                    : [...prev.selectedTagIds, t.id],
                                }));
                              }}
                              className={`px-2.5 py-1 rounded-lg text-xs font-semibold flex items-center gap-1.5 transition-all cursor-pointer border ${
                                isSelected
                                  ? 'bg-sky-600 text-white border-sky-600 shadow-xs'
                                  : 'bg-white text-slate-700 border-slate-300 hover:bg-slate-100'
                              }`}
                            >
                              <span>{t.name}</span>
                              {isSelected ? <Check className="w-3 h-3" /> : <Plus className="w-3 h-3 opacity-40" />}
                            </button>
                          );
                        })}
                      </div>
                    )}
                  </div>
                </div>

                {/* Comportamento de Contatos Existentes */}
                <div className="space-y-1.5 pt-1 border-t border-slate-100">
                  <label className="block text-slate-800 font-bold text-xs">
                    Comportamento de Contatos Existentes
                  </label>
                  <div className="grid grid-cols-2 gap-2 text-xs">
                    <label
                      className={`p-2.5 rounded-xl border flex items-start gap-2 cursor-pointer transition-all ${
                        modalForm.allowReentry === 'ALWAYS'
                          ? 'border-sky-500 bg-sky-50/50 text-sky-950 font-semibold'
                          : 'border-slate-200 hover:bg-slate-50 text-slate-600'
                      }`}
                    >
                      <input
                        type="radio"
                        name="reentry"
                        checked={modalForm.allowReentry === 'ALWAYS'}
                        onChange={() => setModalForm((prev) => ({ ...prev, allowReentry: 'ALWAYS' }))}
                        className="mt-0.5 text-sky-600"
                      />
                      <div className="text-[11px] leading-snug">
                        <strong>Permitir reentrada</strong>
                        <p className="text-[10px] text-slate-500 mt-0.5">
                          Dispara automações e renova mensagens a cada nova inscrição.
                        </p>
                      </div>
                    </label>

                    <label
                      className={`p-2.5 rounded-xl border flex items-start gap-2 cursor-pointer transition-all ${
                        modalForm.allowReentry === 'NEVER'
                          ? 'border-sky-500 bg-sky-50/50 text-sky-950 font-semibold'
                          : 'border-slate-200 hover:bg-slate-50 text-slate-600'
                      }`}
                    >
                      <input
                        type="radio"
                        name="reentry"
                        checked={modalForm.allowReentry === 'NEVER'}
                        onChange={() => setModalForm((prev) => ({ ...prev, allowReentry: 'NEVER' }))}
                        className="mt-0.5 text-sky-600"
                      />
                      <div className="text-[11px] leading-snug">
                        <strong>Atualizar sem reentrar</strong>
                        <p className="text-[10px] text-slate-500 mt-0.5">
                          Apenas atualiza dados cadastrais sem reiniciar o funil do lead.
                        </p>
                      </div>
                    </label>
                  </div>
                </div>

                {/* Automação Vinculada (Opcional) */}
                <div className="pt-1 border-t border-slate-100">
                  <label className="block text-slate-700 font-bold mb-1 flex items-center justify-between">
                    <span>Vincular Diretamente a uma Automação (Opcional)</span>
                    <span className="text-[10px] text-slate-400">Além dos gatilhos por tag</span>
                  </label>
                  <select
                    value={modalForm.targetAutomationId}
                    onChange={(e) =>
                      setModalForm((prev) => ({ ...prev, targetAutomationId: e.target.value }))
                    }
                    className="w-full p-2.5 bg-slate-50 border border-slate-300 rounded-xl text-xs text-slate-900 focus:outline-none focus:border-sky-500"
                  >
                    <option value="">Nenhuma automação direta (usar gatilhos de tags)</option>
                    {automations.map((auto) => (
                      <option key={auto.id} value={auto.id}>
                        {auto.name} ({auto.status === 'ACTIVE' ? 'Ativa' : 'Pausada'})
                      </option>
                    ))}
                  </select>
                </div>

                {/* Botões do Rodapé */}
                <div className="pt-3 border-t border-slate-100 flex items-center justify-end gap-2">
                  <button
                    type="button"
                    onClick={() => setIsModalOpen(false)}
                    className="px-4 py-2 border border-slate-300 hover:bg-slate-100 rounded-xl text-slate-700 font-semibold cursor-pointer"
                  >
                    Cancelar
                  </button>
                  <button
                    type="submit"
                    disabled={savingModal}
                    className="px-5 py-2 bg-sky-600 hover:bg-sky-700 text-white rounded-xl font-bold flex items-center gap-1.5 shadow-sm transition-colors cursor-pointer disabled:opacity-60"
                  >
                    {savingModal ? 'Salvando...' : 'Salvar Integração'}
                  </button>
                </div>
              </form>
            )}
          </div>
        </div>
      )}

      {/* ============================================================ */}
      {/* MODAL 2: MAPEAMENTO VISUAL DE CAMPOS (ELEMENTOR -> CRM)       */}
      {/* ============================================================ */}
      {isMappingModalOpen && mappingIntegration && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-xs z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-3xl shadow-2xl border border-slate-200 max-w-2xl w-full p-6 text-xs text-slate-700 max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between pb-3 border-b border-slate-100">
              <div className="flex items-center gap-2.5">
                <div className="w-8 h-8 rounded-xl bg-sky-100 text-sky-600 flex items-center justify-center font-bold">
                  <Sliders className="w-4 h-4" />
                </div>
                <div>
                  <h3 className="font-bold text-slate-900 text-sm">
                    Mapeamento Visual de Campos — {mappingIntegration.name}
                  </h3>
                  <p className="text-[11px] text-slate-500">
                    Defina como cada campo do Elementor será associado ao CRM da LaunchFlow
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setIsMappingModalOpen(false)}
                className="text-slate-400 hover:text-slate-600 p-1 cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Amostra capturada e botão de auto-detecção */}
            <div className="mt-4 p-3 bg-slate-50 border border-slate-200 rounded-2xl flex items-center justify-between gap-3">
              <div>
                <span className="text-[10px] font-bold uppercase text-slate-400 block">
                  Amostra de Dados Recebida
                </span>
                <span className="text-xs text-slate-700">
                  {mappingIntegration.samplePayload
                    ? 'Último payload real capturado com sucesso do Elementor.'
                    : 'Nenhum envio real capturado ainda. Envie um teste para popular os campos.'}
                </span>
              </div>
              {mappingIntegration.samplePayload && (
                <button
                  type="button"
                  onClick={handleAutoDetectFields}
                  className="px-3 py-1.5 bg-sky-600 hover:bg-sky-700 text-white rounded-xl text-xs font-bold flex items-center gap-1.5 shrink-0 cursor-pointer shadow-xs"
                >
                  <Sparkles className="w-3.5 h-3.5" />
                  <span>Auto-Detectar</span>
                </button>
              )}
            </div>

            {/* Tabela de Mapeamento dos Campos */}
            <div className="mt-4 space-y-3">
              <div className="grid grid-cols-2 gap-2 font-bold text-[11px] text-slate-500 uppercase px-1">
                <span>Campo no CRM LaunchFlow</span>
                <span>Nome do Campo no Elementor / Form</span>
              </div>

              <div className="space-y-2 max-h-80 overflow-y-auto p-1">
                {STANDARD_FORM_FIELDS.map((f) => {
                  const currentValue = fieldMapping[f.key] || '';
                  return (
                    <div
                      key={f.key}
                      className="grid grid-cols-2 gap-3 items-center p-2.5 rounded-xl bg-slate-50/70 border border-slate-200 hover:bg-slate-100/70 transition-colors"
                    >
                      <div>
                        <div className="flex items-center gap-1.5">
                          <span className="font-bold text-slate-900 text-xs">{f.label}</span>
                          {f.required && (
                            <span className="text-[10px] text-rose-500 font-bold">*</span>
                          )}
                        </div>
                        <span className="text-[10px] text-slate-400 block leading-tight">
                          {f.description}
                        </span>
                      </div>

                      <input
                        type="text"
                        value={currentValue}
                        onChange={(e) =>
                          setFieldMapping((prev) => ({ ...prev, [f.key]: e.target.value }))
                        }
                        placeholder={`Padrão automático (${f.aliases[0] || f.key})`}
                        className="w-full p-2 bg-white border border-slate-300 rounded-lg text-xs font-mono text-slate-800 focus:outline-none focus:border-sky-500"
                      />
                    </div>
                  );
                })}
              </div>
            </div>

            <div className="pt-4 mt-4 border-t border-slate-100 flex items-center justify-end gap-2">
              <button
                type="button"
                onClick={() => setIsMappingModalOpen(false)}
                className="px-4 py-2 border border-slate-300 hover:bg-slate-100 rounded-xl text-slate-700 font-semibold cursor-pointer"
              >
                Cancelar
              </button>
              <button
                type="button"
                onClick={handleSaveMapping}
                disabled={savingMapping}
                className="px-5 py-2 bg-sky-600 hover:bg-sky-700 text-white rounded-xl font-bold flex items-center gap-1.5 shadow-sm transition-colors cursor-pointer disabled:opacity-60"
              >
                {savingMapping ? 'Salvando...' : 'Salvar Mapeamento'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ============================================================ */}
      {/* MODAL 3: TESTAR INTEGRAÇÃO (SIMULADO OU REAL)                 */}
      {/* ============================================================ */}
      {isTestModalOpen && testIntegration && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-xs z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-3xl shadow-2xl border border-slate-200 max-w-xl w-full p-6 text-xs text-slate-700 max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between pb-3 border-b border-slate-100">
              <div className="flex items-center gap-2.5">
                <div className="w-8 h-8 rounded-xl bg-emerald-100 text-emerald-600 flex items-center justify-center font-bold">
                  <Sparkles className="w-4 h-4" />
                </div>
                <div>
                  <h3 className="font-bold text-slate-900 text-sm">
                    Testar Integração — {testIntegration.name}
                  </h3>
                  <p className="text-[11px] text-slate-500">
                    Valide o processamento de formulários sem riscos
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setIsTestModalOpen(false)}
                className="text-slate-400 hover:text-slate-600 p-1 cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <form onSubmit={handleRunTest} className="mt-4 space-y-3">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-slate-700 font-bold mb-1">Nome Completo</label>
                  <input
                    type="text"
                    required
                    value={testForm.name}
                    onChange={(e) => setTestForm((prev) => ({ ...prev, name: e.target.value }))}
                    className="w-full p-2 bg-slate-50 border border-slate-300 rounded-lg text-xs"
                  />
                </div>
                <div>
                  <label className="block text-slate-700 font-bold mb-1">E-mail do Lead *</label>
                  <input
                    type="email"
                    required
                    value={testForm.email}
                    onChange={(e) => setTestForm((prev) => ({ ...prev, email: e.target.value }))}
                    className="w-full p-2 bg-slate-50 border border-slate-300 rounded-lg text-xs"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-slate-700 font-bold mb-1">WhatsApp / Telefone</label>
                  <input
                    type="text"
                    value={testForm.phone}
                    onChange={(e) => setTestForm((prev) => ({ ...prev, phone: e.target.value }))}
                    className="w-full p-2 bg-slate-50 border border-slate-300 rounded-lg text-xs"
                  />
                </div>
                <div>
                  <label className="block text-slate-700 font-bold mb-1">UTM Source</label>
                  <input
                    type="text"
                    value={testForm.utmSource}
                    onChange={(e) => setTestForm((prev) => ({ ...prev, utmSource: e.target.value }))}
                    className="w-full p-2 bg-slate-50 border border-slate-300 rounded-lg text-xs"
                  />
                </div>
              </div>

              <div>
                <label className="block text-slate-700 font-bold mb-1">URL da Página de Teste</label>
                <input
                  type="text"
                  value={testForm.pageUrl}
                  onChange={(e) => setTestForm((prev) => ({ ...prev, pageUrl: e.target.value }))}
                  className="w-full p-2 bg-slate-50 border border-slate-300 rounded-lg text-xs"
                />
              </div>

              {/* Opção de Teste Real vs Simulado */}
              <div className="p-3 bg-slate-50 rounded-xl border border-slate-200 space-y-1.5">
                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={testForm.forceRealTest}
                    onChange={(e) =>
                      setTestForm((prev) => ({ ...prev, forceRealTest: e.target.checked }))
                    }
                    className="w-4 h-4 text-emerald-600 rounded"
                  />
                  <span className="font-bold text-slate-800 text-xs">
                    Teste Real (Cadastrar contato no CRM e acionar automações reais)
                  </span>
                </label>
                <p className="text-[11px] text-slate-500 pl-6 leading-relaxed">
                  {testForm.forceRealTest
                    ? '⚠️ Atenção: Este teste criará ou atualizará o lead no CRM de verdade e acionará os disparos configurados.'
                    : 'Modo seguro (padrão): Apenas simula a leitura, mapeamento de campos e regras sem alterar contatos ou disparar mensagens.'}
                </p>
              </div>

              <div className="flex justify-end pt-2">
                <button
                  type="submit"
                  disabled={runningTest}
                  className="px-5 py-2.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl font-bold flex items-center gap-1.5 shadow-sm transition-colors cursor-pointer disabled:opacity-60"
                >
                  {runningTest ? (
                    <>
                      <RotateCw className="w-3.5 h-3.5 animate-spin" />
                      <span>Processando...</span>
                    </>
                  ) : (
                    <>
                      <Sparkles className="w-3.5 h-3.5" />
                      <span>{testForm.forceRealTest ? 'Executar Teste Real' : 'Simular Teste'}</span>
                    </>
                  )}
                </button>
              </div>
            </form>

            {/* Resultado do Teste */}
            {testResult && (
              <div className="mt-4 p-4 rounded-2xl bg-slate-50 border border-slate-200 space-y-2">
                <div className="flex items-center gap-2">
                  {testResult.result?.success ? (
                    <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
                  ) : (
                    <AlertCircle className="w-4 h-4 text-rose-600 shrink-0" />
                  )}
                  <h4 className="font-bold text-slate-900 text-xs">
                    {testResult.result?.success ? 'Teste Concluído com Sucesso!' : 'Falha no Teste'}
                  </h4>
                </div>
                <p className="text-[11px] text-slate-600">
                  {testResult.result?.actionSummary || testResult.error}
                </p>

                {testResult.result?.tagsApplied && testResult.result.tagsApplied.length > 0 && (
                  <div className="pt-2 flex items-center gap-1.5 flex-wrap">
                    <span className="text-[10px] font-bold text-slate-500">Tags Aplicadas:</span>
                    {testResult.result.tagsApplied.map((tag: string) => (
                      <span
                        key={tag}
                        className="px-2 py-0.5 rounded bg-sky-100 text-sky-800 text-[10px] font-semibold"
                      >
                        {tag}
                      </span>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      )}

      {/* ============================================================ */}
      {/* MODAL 4: HISTÓRICO DE EVENTOS E INSCRIÇÕES                    */}
      {/* ============================================================ */}
      {isHistoryModalOpen && historyIntegration && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-xs z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-3xl shadow-2xl border border-slate-200 max-w-3xl w-full p-6 text-xs text-slate-700 max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between pb-3 border-b border-slate-100">
              <div className="flex items-center gap-2.5">
                <div className="w-8 h-8 rounded-xl bg-indigo-100 text-indigo-600 flex items-center justify-center font-bold">
                  <Clock className="w-4 h-4" />
                </div>
                <div>
                  <h3 className="font-bold text-slate-900 text-sm">
                    Histórico de Inscrições — {historyIntegration.name}
                  </h3>
                  <p className="text-[11px] text-slate-500">
                    Registro de requisições recebidas do Elementor com dados higienizados
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setIsHistoryModalOpen(false)}
                className="text-slate-400 hover:text-slate-600 p-1 cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="mt-4">
              {loadingEvents ? (
                <div className="p-8 text-center text-slate-500">Carregando histórico...</div>
              ) : events.length === 0 ? (
                <div className="p-8 text-center text-slate-400">
                  Nenhum evento registrado ainda para esta integração.
                </div>
              ) : (
                <div className="space-y-2 max-h-96 overflow-y-auto pr-1">
                  {events.map((ev) => (
                    <div
                      key={ev.id}
                      className="p-3 rounded-xl bg-slate-50 border border-slate-200 hover:bg-slate-100/70 transition-colors flex flex-col gap-1.5"
                    >
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2">
                          <span
                            className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${
                              ev.status === 'PROCESSED'
                                ? 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                                : 'bg-rose-50 text-rose-700 border border-rose-200'
                            }`}
                          >
                            {ev.status}
                          </span>
                          <span className="font-bold text-slate-900 text-xs">
                            {ev.contactEmail || 'E-mail não identificado'}
                          </span>
                        </div>
                        <span className="text-[10px] text-slate-400">
                          {new Date(ev.createdAt).toLocaleString('pt-BR')}
                        </span>
                      </div>

                      <div className="flex items-center justify-between text-[11px] text-slate-500">
                        <span>Lead: {ev.contactName || '—'} | Telefone: {ev.contactPhone || '—'}</span>
                        <button
                          type="button"
                          onClick={() =>
                            setSelectedEventDetails(selectedEventDetails?.id === ev.id ? null : ev)
                          }
                          className="text-sky-600 hover:underline font-semibold cursor-pointer"
                        >
                          {selectedEventDetails?.id === ev.id ? 'Ocultar Detalhes' : 'Ver Payload'}
                        </button>
                      </div>

                      {selectedEventDetails?.id === ev.id && (
                        <div className="mt-2 p-2.5 bg-slate-900 text-slate-200 rounded-lg font-mono text-[10px] overflow-x-auto space-y-1">
                          <span className="text-slate-400 block">// Payload recebido:</span>
                          <pre>{JSON.stringify(JSON.parse(ev.payload || '{}'), null, 2)}</pre>
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>

            <div className="pt-3 mt-4 border-t border-slate-100 flex justify-end">
              <button
                type="button"
                onClick={() => setIsHistoryModalOpen(false)}
                className="px-4 py-2 bg-slate-900 hover:bg-slate-800 text-white rounded-xl font-semibold text-xs cursor-pointer"
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
