'use client';

import { useState, useEffect, useRef } from 'react';
import {
  MessageSquare,
  QrCode,
  RefreshCw,
  Power,
  CheckCircle2,
  Clock,
  Send,
  ShieldCheck,
  AlertCircle,
  PlusCircle,
  Trash2,
  Edit2,
  Check,
  X,
  Smartphone,
  Star,
  Users,
  ExternalLink,
  Sliders,
  Play,
  FileText,
  Copy,
  Lock,
  Globe,
  HelpCircle,
  ChevronDown,
  ChevronUp,
  BookOpen,
} from 'lucide-react';

interface WhatsAppInstanceItem {
  id: string;
  name?: string | null;
  instanceName: string;
  phone?: string | null;
  profileName?: string | null;
  status: 'CONNECTED' | 'DISCONNECTED' | 'CONNECTING';
  connected: boolean;
  isDefault?: boolean;
  provider?: 'EVOLUTION' | 'META_CLOUD';
  phoneNumberId?: string | null;
  wabaId?: string | null;
  verifiedName?: string | null;
  qualityRating?: string | null;
  webhookVerifyToken?: string | null;
  fixedDelaySeconds?: number;
  useRandomDelay?: boolean;
  minDelaySeconds?: number;
  maxDelaySeconds?: number;
  lastConnectedAt?: string | null;
  qrcode?: string | null;
}

interface QueueStatsData {
  pendingCount: number;
  processingCount: number;
  sentCount: number;
  failedCount: number;
  totalCount: number;
  currentlySending: {
    id: string;
    phone: string;
    contactName: string | null;
    instanceName: string | null;
    startedAt: string | null;
  } | null;
  nextScheduled: {
    id: string;
    phone: string;
    contactName: string | null;
    scheduledAt: string;
    secondsLeft: number;
  } | null;
  recentItems: Array<{
    id: string;
    phone: string;
    contactName: string | null;
    messageType: string;
    status: string;
    scheduledAt: string;
    sentAt: string | null;
    attempts: number;
    error: string | null;
  }>;
}

export default function WhatsAppPage() {
  const [instances, setInstances] = useState<WhatsAppInstanceItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState(false);
  const [actionMessage, setActionMessage] = useState<string | null>(null);

  // Modal de Conectar Novo Número
  const [isConnectModalOpen, setIsConnectModalOpen] = useState(false);
  const [newNumberName, setNewNumberName] = useState('');
  const [activeModalQrCode, setActiveModalQrCode] = useState<string | null>(null);
  const [activeModalInstanceId, setActiveModalInstanceId] = useState<string | null>(null);
  const [modalLoading, setModalLoading] = useState(false);
  const [modalTimeLeft, setModalTimeLeft] = useState(25);

  const isConnectModalOpenRef = useRef(isConnectModalOpen);
  isConnectModalOpenRef.current = isConnectModalOpen;
  const activeModalInstanceIdRef = useRef(activeModalInstanceId);
  activeModalInstanceIdRef.current = activeModalInstanceId;

  // Edição inline de nome
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editingName, setEditingName] = useState('');

  // Form de envio rápido de mensagem de teste
  const [selectedSenderId, setSelectedSenderId] = useState('');
  const [sendPhone, setSendPhone] = useState('');
  const [sendText, setSendText] = useState('Olá! Mensagem de teste enviada pela sua automação LaunchFlow.');
  const [sending, setSending] = useState(false);
  const [sendResult, setSendResult] = useState<any>(null);

  // Configurações de Cadência e Delay Anti-Bloqueio por Instância
  const [cadenceSettings, setCadenceSettings] = useState<Record<string, {
    fixedDelaySeconds: number;
    useRandomDelay: boolean;
    minDelaySeconds: number;
    maxDelaySeconds: number;
  }>>({});
  const [savingCadenceId, setSavingCadenceId] = useState<string | null>(null);
  const [cadenceSuccessId, setCadenceSuccessId] = useState<string | null>(null);

  // Monitor da Fila do WhatsApp em Tempo Real
  const [queueStats, setQueueStats] = useState<QueueStatsData | null>(null);
  const [processingQueue, setProcessingQueue] = useState(false);

  // Modal de Conectar WhatsApp Business Cloud API Oficial (Meta)
  const [isMetaModalOpen, setIsMetaModalOpen] = useState(false);
  const [metaChannelName, setMetaChannelName] = useState('');
  const [metaPhoneNumberId, setMetaPhoneNumberId] = useState('');
  const [metaWabaId, setMetaWabaId] = useState('');
  const [metaAccessToken, setMetaAccessToken] = useState('');
  const [metaBusinessAccountId, setMetaBusinessAccountId] = useState('');
  const [metaWebhookVerifyToken, setMetaWebhookVerifyToken] = useState('launchflow_meta_verify_token');
  const [metaConnecting, setMetaConnecting] = useState(false);
  const [metaError, setMetaError] = useState<string | null>(null);
  const [metaCopiedField, setMetaCopiedField] = useState<string | null>(null);
  const [showMetaTutorial, setShowMetaTutorial] = useState(false);

  // Modal de Visualização de Templates da Meta
  const [isTemplatesModalOpen, setIsTemplatesModalOpen] = useState(false);
  const [activeTemplatesChannel, setActiveTemplatesChannel] = useState<WhatsAppInstanceItem | null>(null);
  const [channelTemplates, setChannelTemplates] = useState<any[]>([]);
  const [loadingTemplates, setLoadingTemplates] = useState(false);

  const fetchQueueStats = async () => {
    try {
      const res = await fetch(`/api/whatsapp/queue?_t=${Date.now()}`, {
        cache: 'no-store',
      });
      const data = await res.json();
      if (data.stats) {
        setQueueStats(data.stats);
      }
    } catch {}
  };

  const handleUpdateCadenceField = (instanceId: string, field: string, value: any) => {
    setCadenceSettings((prev) => ({
      ...prev,
      [instanceId]: {
        ...(prev[instanceId] || {
          fixedDelaySeconds: 30,
          useRandomDelay: true,
          minDelaySeconds: 20,
          maxDelaySeconds: 45,
        }),
        [field]: value,
      },
    }));
  };

  const handleSaveCadence = async (instanceId: string) => {
    const inst = cadenceSettings[instanceId] || {
      fixedDelaySeconds: 30,
      useRandomDelay: true,
      minDelaySeconds: 20,
      maxDelaySeconds: 45,
    };

    setSavingCadenceId(instanceId);
    try {
      const res = await fetch('/api/whatsapp/update', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          instanceId,
          fixedDelaySeconds: Number(inst.fixedDelaySeconds),
          useRandomDelay: Boolean(inst.useRandomDelay),
          minDelaySeconds: Number(inst.minDelaySeconds),
          maxDelaySeconds: Number(inst.maxDelaySeconds),
        }),
      });
      if (res.ok) {
        setCadenceSuccessId(instanceId);
        setTimeout(() => setCadenceSuccessId(null), 3000);
      } else {
        const errJson = await res.json().catch(() => ({}));
        setActionMessage(`Erro ao salvar cadência: ${errJson.error || 'Falha na requisição'}`);
      }
    } catch (err: any) {
      setActionMessage(`Erro ao salvar cadência: ${err.message}`);
    } finally {
      setSavingCadenceId(null);
    }
  };

  const handleProcessQueueNow = async () => {
    setProcessingQueue(true);
    try {
      const res = await fetch('/api/whatsapp/queue', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ batchSize: 10 }),
      });
      const data = await res.json();
      if (data.stats) setQueueStats(data.stats);
      setActionMessage('✔ Fila acionada em segundo plano.');
    } catch (err: any) {
      setActionMessage(`Falha ao acionar fila: ${err.message}`);
    } finally {
      setProcessingQueue(false);
    }
  };

  const handleManualSync = async () => {
    setLoading(true);
    setActionMessage('Sincronizando números conectados na Evolution API em tempo real...');
    try {
      const res = await fetch(`/api/whatsapp/sync?_t=${Date.now()}`, {
        method: 'POST',
        cache: 'no-store',
        headers: { 'Cache-Control': 'no-cache, no-store' },
      });
      const json = await res.json();
      if (Array.isArray(json.instances) && json.instances.length > 0) {
        setInstances(json.instances);
        setCadenceSettings((prev) => {
          const next = { ...prev };
          for (const inst of json.instances) {
            if (!next[inst.id]) {
              next[inst.id] = {
                fixedDelaySeconds: inst.fixedDelaySeconds ?? 30,
                useRandomDelay: inst.useRandomDelay !== undefined ? inst.useRandomDelay : true,
                minDelaySeconds: inst.minDelaySeconds ?? 20,
                maxDelaySeconds: inst.maxDelaySeconds ?? 45,
              };
            }
          }
          return next;
        });
        const connCount = json.instances.filter((i: any) => i.connected).length;
        setActionMessage(`✔ Sincronização concluída! ${json.instances.length} número(s) cadastrado(s) (${connCount} conectado(s)).`);
      } else {
        await fetchInstances();
        setActionMessage('Sincronização finalizada. Verifique se o QR code já foi escaneado na Evolution API.');
      }
    } catch (err: any) {
      setActionMessage(`Falha na sincronização: ${err.message}`);
      await fetchInstances();
    } finally {
      setLoading(false);
    }
  };

  const fetchInstances = async () => {
    try {
      const res = await fetch(`/api/whatsapp?_t=${Date.now()}`, {
        cache: 'no-store',
        headers: { 'Cache-Control': 'no-cache, no-store' },
      });
      const json = await res.json();
      if (Array.isArray(json.instances)) {
        setInstances(json.instances);
        setCadenceSettings((prev) => {
          const next = { ...prev };
          for (const inst of json.instances) {
            if (!next[inst.id]) {
              next[inst.id] = {
                fixedDelaySeconds: inst.fixedDelaySeconds ?? 30,
                useRandomDelay: inst.useRandomDelay !== undefined ? inst.useRandomDelay : true,
                minDelaySeconds: inst.minDelaySeconds ?? 20,
                maxDelaySeconds: inst.maxDelaySeconds ?? 45,
              };
            }
          }
          return next;
        });
        // Se ainda não selecionou remetente de teste, seleciona o padrão ou primeiro conectado
        if (!selectedSenderId) {
          const defaultInst = json.instances.find((i: any) => i.isDefault && i.connected) || json.instances.find((i: any) => i.connected);
          if (defaultInst) {
            setSelectedSenderId(defaultInst.id);
          }
        }
      } else if (json.hasInstance) {
        // Objeto único de retrocompatibilidade
        setInstances([
          {
            id: json.instanceId || 'default',
            name: json.name || 'WhatsApp Principal',
            instanceName: 'inst_primary',
            phone: json.phone,
            profileName: json.profileName,
            status: json.status,
            connected: json.connected,
            isDefault: true,
            lastConnectedAt: json.lastConnectedAt,
            qrcode: json.qrcode,
          },
        ]);
      } else if (json.error) {
        setActionMessage(`Aviso: ${json.error}`);
      }
    } catch {}
    setLoading(false);
  };

  useEffect(() => {
    fetchInstances();
    fetchQueueStats();

    // Polling a cada 3.5 segundos para checar status em tempo real de todas as linhas e da fila
    const interval = setInterval(() => {
      fetch(`/api/whatsapp?_t=${Date.now()}`, {
        cache: 'no-store',
        headers: { 'Cache-Control': 'no-cache, no-store' },
      })
        .then((r) => r.json())
        .then((json) => {
          if (Array.isArray(json.instances)) {
            setInstances(json.instances);
            setCadenceSettings((prev) => {
              const next = { ...prev };
              for (const inst of json.instances) {
                if (!next[inst.id]) {
                  next[inst.id] = {
                    fixedDelaySeconds: inst.fixedDelaySeconds ?? 30,
                    useRandomDelay: inst.useRandomDelay !== undefined ? inst.useRandomDelay : true,
                    minDelaySeconds: inst.minDelaySeconds ?? 20,
                    maxDelaySeconds: inst.maxDelaySeconds ?? 45,
                  };
                }
              }
              return next;
            });
            // Se o modal de QR code estiver aberto e a instância conectou
            if (isConnectModalOpenRef.current) {
              const connectedMatch = json.instances.find(
                (i: any) =>
                  i.connected &&
                  (i.id === activeModalInstanceIdRef.current ||
                    i.instanceName === activeModalInstanceIdRef.current ||
                    (i.lastConnectedAt && new Date(i.lastConnectedAt).getTime() > Date.now() - 60000))
              );
              if (connectedMatch) {
                setIsConnectModalOpen(false);
                setActiveModalQrCode(null);
                setActiveModalInstanceId(null);
                setActionMessage(`✔ WhatsApp "${connectedMatch.name || connectedMatch.profileName || 'Novo Número'}" conectado com sucesso!`);
              }
            }
          }
        })
        .catch(() => {});

      fetchQueueStats();
    }, 3500);

    // Contagem regressiva suave de 1s para o próximo envio
    const secTimer = setInterval(() => {
      setQueueStats((prev) => {
        if (!prev || !prev.nextScheduled || prev.nextScheduled.secondsLeft <= 0) return prev;
        return {
          ...prev,
          nextScheduled: {
            ...prev.nextScheduled,
            secondsLeft: Math.max(0, prev.nextScheduled.secondsLeft - 1),
          },
        };
      });
    }, 1000);

    return () => {
      clearInterval(interval);
      clearInterval(secTimer);
    };
  }, [activeModalInstanceId, selectedSenderId]);

  // Contagem regressiva de validade do QR Code no modal
  useEffect(() => {
    if (!isConnectModalOpen || !activeModalQrCode) return;

    const timer = setInterval(() => {
      setModalTimeLeft((prev) => {
        if (prev <= 1) {
          handleRefreshModalQr();
          return 25;
        }
        return prev - 1;
      });
    }, 1000);

    return () => clearInterval(timer);
  }, [isConnectModalOpen, activeModalQrCode, activeModalInstanceId]);

  // Abre modal para gerar e conectar um NOVO número
  const handleOpenConnectModal = async () => {
    setIsConnectModalOpen(true);
    setModalLoading(true);
    setActiveModalQrCode(null);
    setActiveModalInstanceId(null);
    setModalTimeLeft(25);
    const defaultLabel = `WhatsApp Linha ${instances.length + 1}`;
    setNewNumberName(defaultLabel);

    try {
      const res = await fetch('/api/whatsapp/connect', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ isNew: true, name: defaultLabel }),
      });
      const data = await res.json();
      if (data.qrcode) {
        setActiveModalQrCode(data.qrcode);
        setActiveModalInstanceId(data.instanceId);
      } else if (data.instanceId) {
        setActiveModalInstanceId(data.instanceId);
        // Tenta obter o QR code fresco especificamente
        const qrRes = await fetch(`/api/whatsapp/qrcode?instanceId=${encodeURIComponent(data.instanceId)}`);
        const qrData = await qrRes.json();
        if (qrData.qrcode) {
          setActiveModalQrCode(qrData.qrcode);
        } else if (qrData.error) {
          setActionMessage(`Aviso: ${qrData.error}`);
        }
      } else if (data.error) {
        setActionMessage(`Aviso: ${data.error}`);
      }
      fetchInstances();
    } catch (err: any) {
      setActionMessage(`Falha ao gerar QR Code: ${err.message}`);
    } finally {
      setModalLoading(false);
    }
  };

  // Atualiza o QR Code do modal
  const handleRefreshModalQr = async () => {
    if (!activeModalInstanceId) return;
    try {
      const res = await fetch(`/api/whatsapp/qrcode?instanceId=${encodeURIComponent(activeModalInstanceId)}`);
      const data = await res.json();
      if (data.qrcode) {
        setActiveModalQrCode(data.qrcode);
        setModalTimeLeft(25);
      }
    } catch {}
  };

  // Reconectar instância específica
  const handleReconnectInstance = async (instanceId: string) => {
    setIsConnectModalOpen(true);
    setModalLoading(true);
    setActiveModalQrCode(null);
    setActiveModalInstanceId(instanceId);
    setModalTimeLeft(25);
    const target = instances.find((i) => i.id === instanceId);
    setNewNumberName(target?.name || 'Reconectar WhatsApp');

    try {
      // 1. Tenta obter o QR code fresco diretamente
      const res = await fetch(`/api/whatsapp/qrcode?instanceId=${encodeURIComponent(instanceId)}`);
      const data = await res.json();
      if (data.qrcode) {
        setActiveModalQrCode(data.qrcode);
      } else {
        // Se a instância estiver fechada/desconectada, reinicia
        const recRes = await fetch('/api/whatsapp/reconnect', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ instanceId }),
        });
        const recData = await recRes.json();
        if (recData.qrcode) {
          setActiveModalQrCode(recData.qrcode);
        } else if (recData.connected) {
          setIsConnectModalOpen(false);
          setActionMessage('Instância reconectada com sucesso!');
        }
      }
      fetchInstances();
    } catch (err: any) {
      setActionMessage(`Falha ao reconectar: ${err.message}`);
    } finally {
      setModalLoading(false);
    }
  };

  // Desconectar instância específica
  const handleDisconnectInstance = async (instance: WhatsAppInstanceItem) => {
    const confirmMsg = `Deseja realmente desconectar o WhatsApp "${instance.name || instance.phone || 'Selecionado'}"?`;
    if (!confirm(confirmMsg)) return;

    setActionLoading(true);
    try {
      await fetch('/api/whatsapp/disconnect', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ instanceId: instance.id }),
      });
      setActionMessage(`WhatsApp "${instance.name || 'Número'}" desconectado.`);
      fetchInstances();
    } catch (err: any) {
      setActionMessage(`Erro ao desconectar: ${err.message}`);
    } finally {
      setActionLoading(false);
    }
  };

  // Excluir número permanentemente
  const handleDeleteInstance = async (instance: WhatsAppInstanceItem) => {
    const confirmMsg = `Excluir permanentemente o número "${instance.name || instance.phone}"? Esta ação removerá a linha da plataforma.`;
    if (!confirm(confirmMsg)) return;

    setActionLoading(true);
    try {
      await fetch('/api/whatsapp/delete', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ instanceId: instance.id }),
      });
      setActionMessage(`Número "${instance.name || 'WhatsApp'}" excluído com sucesso.`);
      fetchInstances();
    } catch (err: any) {
      setActionMessage(`Erro ao excluir: ${err.message}`);
    } finally {
      setActionLoading(false);
    }
  };

  // Abertura do modal Meta Cloud API
  const handleOpenMetaModal = () => {
    setMetaChannelName('');
    setMetaPhoneNumberId('');
    setMetaWabaId('');
    setMetaAccessToken('');
    setMetaBusinessAccountId('');
    setMetaError(null);
    setIsMetaModalOpen(true);
  };

  // Salvar conexão Meta Cloud API
  const handleConnectMetaCloud = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!metaPhoneNumberId.trim() || !metaAccessToken.trim()) {
      setMetaError('O Phone Number ID e o Access Token permanente da Meta são obrigatórios.');
      return;
    }

    setMetaConnecting(true);
    setMetaError(null);

    try {
      const res = await fetch('/api/whatsapp/meta/connect', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: metaChannelName.trim() || undefined,
          phoneNumberId: metaPhoneNumberId.trim(),
          wabaId: metaWabaId.trim() || undefined,
          accessToken: metaAccessToken.trim(),
          businessAccountId: metaBusinessAccountId.trim() || undefined,
          webhookVerifyToken: metaWebhookVerifyToken.trim() || undefined,
        }),
      });

      const data = await res.json();
      if (!res.ok || !data.success) {
        throw new Error(data.error || 'Falha ao conectar canal Meta Cloud API');
      }

      setIsMetaModalOpen(false);
      setActionMessage('Canal WhatsApp Business Cloud API Oficial conectado com sucesso!');
      fetchInstances();
    } catch (err: any) {
      setMetaError(err.message || 'Erro de conexão com a Meta');
    } finally {
      setMetaConnecting(false);
    }
  };

  // Visualizar templates oficiais da Meta
  const handleOpenTemplates = async (inst: WhatsAppInstanceItem) => {
    setActiveTemplatesChannel(inst);
    setIsTemplatesModalOpen(true);
    setLoadingTemplates(true);
    setChannelTemplates([]);

    try {
      const res = await fetch(`/api/whatsapp/meta/templates?instanceId=${encodeURIComponent(inst.id)}`);
      const data = await res.json();
      if (data.templates) {
        setChannelTemplates(data.templates);
      }
    } catch {
    } finally {
      setLoadingTemplates(false);
    }
  };

  // Definir como padrão
  const handleSetDefault = async (instanceId: string) => {
    try {
      await fetch('/api/whatsapp/update', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ instanceId, isDefault: true }),
      });
      fetchInstances();
    } catch {}
  };

  // Salvar renomeação
  const handleSaveRename = async (instanceId: string) => {
    if (!editingName.trim()) return;
    try {
      await fetch('/api/whatsapp/update', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ instanceId, name: editingName.trim() }),
      });
      setEditingId(null);
      fetchInstances();
    } catch {}
  };

  // Disparo de teste
  const handleSendMessage = async (e: React.FormEvent) => {
    e.preventDefault();
    setSending(true);
    setSendResult(null);
    try {
      const res = await fetch('/api/whatsapp/send', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          phone: sendPhone,
          text: sendText,
          whatsappInstanceId: selectedSenderId || undefined,
        }),
      });
      const json = await res.json();
      setSendResult(json);
      if (json.success) {
        setSendPhone('');
      }
    } catch (err: any) {
      setSendResult({ success: false, error: err.message });
    } finally {
      setSending(false);
    }
  };

  const connectedCount = instances.filter((i) => i.connected).length;

  return (
    <div className="space-y-8 max-w-6xl mx-auto pb-12">
      {/* Top Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2.5">
            <h1 className="text-2xl font-bold text-slate-900 tracking-tight">Conexão do WhatsApp</h1>
            <span className="px-2.5 py-0.5 rounded-full bg-emerald-50 text-emerald-700 border border-emerald-200 text-[11px] font-semibold flex items-center gap-1">
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse"></span>
              Multi-Linhas
            </span>
            <span className="px-2.5 py-0.5 rounded-full bg-indigo-50 text-indigo-700 border border-indigo-200 text-[11px] font-semibold">
              Isolamento Multi-Tenant
            </span>
          </div>
          <p className="text-sm text-slate-500 mt-1">
            Cadastre múltiplos números de WhatsApp exclusivos para este Expert. Cada cliente pode conectar quantas linhas desejar, com isolamento completo e seleção por fluxo.
          </p>
        </div>

        <div className="flex items-center gap-2 self-start sm:self-auto shrink-0 flex-wrap">
          <button
            onClick={handleManualSync}
            disabled={loading}
            className="px-3.5 py-2.5 bg-white hover:bg-slate-50 text-slate-700 font-semibold text-xs rounded-xl border border-slate-200 shadow-sm flex items-center gap-1.5 transition-all cursor-pointer"
            title="Sincronizar conexões ativas com a Evolution API e Meta"
          >
            <RefreshCw className={`w-3.5 h-3.5 text-slate-500 ${loading ? 'animate-spin' : ''}`} />
            <span>Sincronizar</span>
          </button>

          <button
            onClick={handleOpenMetaModal}
            disabled={actionLoading}
            className="px-4 py-2.5 bg-blue-600 hover:bg-blue-700 text-white font-semibold text-xs rounded-xl shadow-lg shadow-blue-600/20 flex items-center gap-2 transition-all cursor-pointer"
            title="Conectar canal oficial da Meta WhatsApp Business Cloud API"
          >
            <ShieldCheck className="w-4 h-4 text-blue-200" />
            <span>Conectar Meta Cloud API (Oficial)</span>
          </button>

          <button
            onClick={handleOpenConnectModal}
            disabled={actionLoading}
            className="px-4 py-2.5 bg-emerald-600 hover:bg-emerald-700 text-white font-semibold text-xs rounded-xl shadow-lg shadow-emerald-600/20 flex items-center gap-2 transition-all cursor-pointer"
            title="Conectar linha WhatsApp via Evolution API (QR Code)"
          >
            <QrCode className="w-4 h-4" />
            <span>Adicionar Linha (QR Code)</span>
          </button>
        </div>
      </div>

      {actionMessage && (
        <div className="p-3.5 rounded-xl bg-indigo-50 text-indigo-900 border border-indigo-200 text-xs font-medium flex items-center gap-2.5">
          <AlertCircle className="w-4 h-4 text-indigo-600 shrink-0" />
          <span>{actionMessage}</span>
          <button onClick={() => setActionMessage(null)} className="ml-auto text-indigo-500 hover:text-indigo-800">
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      )}

      {/* Grid de Números Cadastrados */}
      <div className="space-y-4">
        <div className="flex items-center justify-between text-xs text-slate-500 px-1">
          <span className="font-semibold text-slate-700">
            Números Cadastrados ({instances.length}) • {connectedCount} conectado{connectedCount === 1 ? '' : 's'}
          </span>
          <span className="text-[11px] text-slate-400">
            Dica: No editor de fluxo, escolha qual destes números enviará cada mensagem.
          </span>
        </div>

        {loading ? (
          <div className="bg-white rounded-2xl border border-slate-200 p-12 text-center text-slate-400 text-xs shadow-sm">
            <RefreshCw className="w-6 h-6 animate-spin mx-auto mb-2 text-indigo-600" />
            Carregando números de WhatsApp...
          </div>
        ) : instances.length === 0 ? (
          /* Estado Vazio */
          <div className="bg-white rounded-2xl border border-slate-200 p-12 text-center shadow-sm">
            <div className="w-16 h-16 rounded-3xl bg-emerald-50 text-emerald-600 flex items-center justify-center mx-auto mb-4">
              <MessageSquare className="w-8 h-8" />
            </div>
            <h2 className="text-base font-bold text-slate-900 mb-1">Nenhum WhatsApp Conectado</h2>
            <p className="text-xs text-slate-500 max-w-md mx-auto mb-6">
              Conecte sua conta oficial da WhatsApp Business Cloud API (Meta) ou escaneie o QR Code via Evolution API para começar a disparar automações de lançamento, avisos e recuperação de vendas.
            </p>
            <div className="flex flex-wrap items-center justify-center gap-3">
              <button
                onClick={handleOpenMetaModal}
                className="px-5 py-2.5 bg-blue-600 hover:bg-blue-700 text-white font-semibold text-xs rounded-xl shadow-lg shadow-blue-600/20 inline-flex items-center gap-2 cursor-pointer"
              >
                <ShieldCheck className="w-4 h-4 text-blue-200" />
                <span>Conectar Meta Cloud API (Oficial)</span>
              </button>
              <button
                onClick={handleOpenConnectModal}
                className="px-5 py-2.5 bg-emerald-600 hover:bg-emerald-700 text-white font-semibold text-xs rounded-xl shadow-lg shadow-emerald-600/20 inline-flex items-center gap-2 cursor-pointer"
              >
                <QrCode className="w-4 h-4" />
                <span>Conectar via QR Code (Evolution)</span>
              </button>
              <button
                onClick={handleManualSync}
                className="px-4 py-2.5 bg-white hover:bg-slate-50 text-slate-700 font-semibold text-xs rounded-xl border border-slate-200 shadow-sm inline-flex items-center gap-2 cursor-pointer"
              >
                <RefreshCw className="w-3.5 h-3.5 text-slate-500" />
                <span>Sincronizar Linhas</span>
              </button>
            </div>
          </div>
        ) : (
          /* Lista de Cards de Números */
          <div className="grid grid-cols-1 gap-4">
            {instances.map((inst, index) => (
              <div
                key={inst.id}
                className={`bg-white rounded-2xl border transition-all shadow-sm p-6 ${
                  inst.connected
                    ? 'border-emerald-200/80 hover:border-emerald-300'
                    : 'border-slate-200 hover:border-slate-300'
                }`}
              >
                <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4 pb-4 border-b border-slate-100">
                  {/* Identificação e Nome da Linha */}
                  <div className="flex items-center gap-3.5">
                    <div
                      className={`w-12 h-12 rounded-xl flex items-center justify-center font-bold text-lg shrink-0 ${
                        inst.connected
                          ? 'bg-emerald-100 text-emerald-700 shadow-inner'
                          : 'bg-slate-100 text-slate-400'
                      }`}
                    >
                      <Smartphone className="w-6 h-6" />
                    </div>

                    <div>
                      <div className="flex items-center gap-2">
                        {editingId === inst.id ? (
                          <div className="flex items-center gap-1.5">
                            <input
                              type="text"
                              value={editingName}
                              onChange={(e) => setEditingName(e.target.value)}
                              className="px-2 py-0.5 border border-slate-300 rounded text-xs font-semibold text-slate-900 focus:outline-none focus:border-indigo-500"
                              autoFocus
                            />
                            <button
                              onClick={() => handleSaveRename(inst.id)}
                              className="p-1 rounded bg-emerald-50 text-emerald-600 hover:bg-emerald-100"
                              title="Salvar"
                            >
                              <Check className="w-3.5 h-3.5" />
                            </button>
                            <button
                              onClick={() => setEditingId(null)}
                              className="p-1 rounded bg-slate-100 text-slate-500 hover:bg-slate-200"
                              title="Cancelar"
                            >
                              <X className="w-3.5 h-3.5" />
                            </button>
                          </div>
                        ) : (
                          <>
                            <h3 className="font-bold text-slate-900 text-base">
                              {inst.name || `WhatsApp Linha ${index + 1}`}
                            </h3>
                            <button
                              onClick={() => {
                                setEditingId(inst.id);
                                setEditingName(inst.name || `WhatsApp Linha ${index + 1}`);
                              }}
                              className="text-slate-400 hover:text-slate-600 p-0.5 rounded transition-colors"
                              title="Editar apelido desta linha"
                            >
                              <Edit2 className="w-3 h-3" />
                            </button>
                          </>
                        )}

                        {inst.provider === 'META_CLOUD' ? (
                          <span className="px-2 py-0.5 rounded-full bg-blue-50 text-blue-700 border border-blue-200 text-[10px] font-bold flex items-center gap-1">
                            <ShieldCheck className="w-3 h-3 text-blue-600" />
                            Meta Cloud API Oficial
                          </span>
                        ) : (
                          <span className="px-2 py-0.5 rounded-full bg-indigo-50 text-indigo-700 border border-indigo-200 text-[10px] font-bold flex items-center gap-1">
                            Evolution API
                          </span>
                        )}

                        {inst.isDefault && (
                          <span className="px-2 py-0.5 rounded-full bg-amber-50 text-amber-700 border border-amber-200 text-[10px] font-bold flex items-center gap-1">
                            <Star className="w-3 h-3 fill-amber-500 text-amber-500" />
                            Principal
                          </span>
                        )}
                      </div>

                      <div className="flex items-center gap-2 mt-0.5 flex-wrap">
                        <span
                          className={`inline-flex items-center gap-1 text-[11px] font-semibold ${
                            inst.connected ? 'text-emerald-700' : 'text-slate-500'
                          }`}
                        >
                          <span
                            className={`w-2 h-2 rounded-full ${
                              inst.connected
                                ? 'bg-emerald-500 animate-pulse'
                                : inst.status === 'CONNECTING'
                                ? 'bg-amber-500'
                                : 'bg-slate-300'
                            }`}
                          ></span>
                          {inst.connected
                            ? 'Operacional e Pronto'
                            : inst.status === 'CONNECTING'
                            ? 'Aguardando Leitura de QR Code'
                            : 'Desconectado'}
                        </span>
                        <span className="text-slate-300">•</span>
                        <span className="text-[11px] text-slate-400 font-mono">
                          {inst.provider === 'META_CLOUD' && inst.phoneNumberId
                            ? `Phone ID: ${inst.phoneNumberId}`
                            : `ID: ${inst.instanceName}`}
                        </span>
                        {inst.provider === 'META_CLOUD' && inst.wabaId && (
                          <>
                            <span className="text-slate-300">•</span>
                            <span className="text-[11px] text-slate-400 font-mono">
                              WABA: {inst.wabaId}
                            </span>
                          </>
                        )}
                        {inst.verifiedName && (
                          <>
                            <span className="text-slate-300">•</span>
                            <span className="text-[11px] text-emerald-600 font-semibold">
                              ✓ {inst.verifiedName}
                            </span>
                          </>
                        )}
                      </div>
                    </div>
                  </div>

                  {/* Ações da Linha */}
                  <div className="flex items-center gap-2 flex-wrap">
                    {!inst.isDefault && (
                      <button
                        onClick={() => handleSetDefault(inst.id)}
                        className="px-3 py-1.5 rounded-lg border border-slate-200 text-slate-600 hover:bg-slate-50 text-xs font-semibold flex items-center gap-1 transition-colors cursor-pointer"
                        title="Tornar este o número padrão para novos envios"
                      >
                        <Star className="w-3.5 h-3.5 text-slate-400" />
                        <span>Tornar Padrão</span>
                      </button>
                    )}

                    {inst.provider === 'META_CLOUD' ? (
                      <>
                        <button
                          onClick={() => handleOpenTemplates(inst)}
                          className="px-3 py-1.5 rounded-lg border border-blue-200 bg-blue-50 text-blue-700 hover:bg-blue-100 font-semibold text-xs flex items-center gap-1.5 transition-colors cursor-pointer"
                          title="Visualizar templates oficiais aprovados na Meta"
                        >
                          <FileText className="w-3.5 h-3.5 text-blue-600" />
                          <span>Templates Oficiais</span>
                        </button>
                        <button
                          onClick={handleManualSync}
                          disabled={actionLoading}
                          className="px-3 py-1.5 rounded-lg border border-slate-200 text-slate-700 hover:bg-slate-50 font-semibold text-xs flex items-center gap-1.5 transition-colors cursor-pointer"
                          title="Verificar status da conexão na Meta Graph API"
                        >
                          <RefreshCw className="w-3.5 h-3.5" />
                          <span>Verificar Status</span>
                        </button>
                      </>
                    ) : (
                      <button
                        onClick={() => handleReconnectInstance(inst.id)}
                        disabled={actionLoading}
                        className="px-3 py-1.5 rounded-lg border border-slate-200 text-slate-700 hover:bg-slate-50 font-semibold text-xs flex items-center gap-1.5 transition-colors cursor-pointer"
                        title="Reconectar ou gerar novo QR Code desta linha"
                      >
                        <RefreshCw className="w-3.5 h-3.5" />
                        <span>{inst.connected ? 'Reconectar' : 'Conectar via QR Code'}</span>
                      </button>
                    )}

                    {inst.connected && (
                      <button
                        onClick={() => handleDisconnectInstance(inst)}
                        disabled={actionLoading}
                        className="px-3 py-1.5 rounded-lg bg-red-50 hover:bg-red-100 text-red-600 font-semibold text-xs flex items-center gap-1.5 transition-colors cursor-pointer"
                        title="Desconectar este WhatsApp"
                      >
                        <Power className="w-3.5 h-3.5" />
                        <span>Desconectar</span>
                      </button>
                    )}

                    <button
                      onClick={() => handleDeleteInstance(inst)}
                      disabled={actionLoading}
                      className="p-1.5 rounded-lg text-slate-400 hover:text-red-600 hover:bg-red-50 transition-colors cursor-pointer"
                      title="Excluir permanentemente este número"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                </div>

                {/* Dados da Linha */}
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 text-xs mt-4">
                  <div className="p-3.5 rounded-xl bg-slate-50 dark:bg-[#0b0f1a] border border-slate-100 dark:border-slate-800">
                    <span className="text-[10px] text-slate-400 uppercase font-bold block mb-1">
                      Número Conectado
                    </span>
                    <span className="font-bold text-slate-900 dark:text-slate-100 text-sm font-mono">
                      {inst.phone || (inst.connected ? 'Identificando...' : 'Não conectado')}
                    </span>
                  </div>

                  <div className="p-3.5 rounded-xl bg-slate-50 dark:bg-[#0b0f1a] border border-slate-100 dark:border-slate-800">
                    <span className="text-[10px] text-slate-400 uppercase font-bold block mb-1">
                      Perfil no WhatsApp
                    </span>
                    <span className="font-bold text-slate-900 dark:text-slate-100 text-sm truncate block">
                      {inst.profileName || 'Conta Comercial'}
                    </span>
                  </div>

                  <div className="p-3.5 rounded-xl bg-slate-50 dark:bg-[#0b0f1a] border border-slate-100 dark:border-slate-800">
                    <span className="text-[10px] text-slate-400 uppercase font-bold block mb-1">
                      Disponibilidade
                    </span>
                    <span className="font-semibold text-indigo-700 dark:text-indigo-400 text-xs flex items-center gap-1">
                      <Users className="w-3.5 h-3.5 text-indigo-500" />
                      <span>Todos os Experts</span>
                    </span>
                  </div>
                </div>

                {/* Configuração de Cadência e Delay Anti-Bloqueio da Linha */}
                <div className="mt-4 pt-4 border-t border-slate-100 dark:border-slate-800/80 bg-slate-50/70 dark:bg-[#0b0f1a] rounded-xl p-4">
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 mb-3">
                    <div className="flex items-center gap-2">
                      <Sliders className="w-4 h-4 text-emerald-600 dark:text-emerald-400" />
                      <span className="font-bold text-slate-800 dark:text-slate-100 text-xs">
                        Cadência de Envio (Delay Anti-Bloqueio entre Contatos)
                      </span>
                    </div>
                    <span className="text-[11px] text-slate-400">
                      Aplica intervalo apenas entre contatos diferentes (respeitando timers do fluxo)
                    </span>
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-3 gap-3 items-end">
                    <div>
                      <label className="block text-[11px] font-semibold text-slate-700 dark:text-slate-300 mb-1">
                        Modo de Intervalo
                      </label>
                      <div className="flex items-center gap-2">
                        <label className="inline-flex items-center gap-1.5 text-xs text-slate-700 dark:text-slate-200 cursor-pointer">
                          <input
                            type="radio"
                            name={`delay_mode_${inst.id}`}
                            checked={Boolean(cadenceSettings[inst.id]?.useRandomDelay ?? inst.useRandomDelay ?? true)}
                            onChange={() => handleUpdateCadenceField(inst.id, 'useRandomDelay', true)}
                            className="text-emerald-600 focus:ring-emerald-500"
                          />
                          <span>Aleatório (Recomendado)</span>
                        </label>
                        <label className="inline-flex items-center gap-1.5 text-xs text-slate-700 dark:text-slate-200 cursor-pointer ml-2">
                          <input
                            type="radio"
                            name={`delay_mode_${inst.id}`}
                            checked={!Boolean(cadenceSettings[inst.id]?.useRandomDelay ?? inst.useRandomDelay ?? true)}
                            onChange={() => handleUpdateCadenceField(inst.id, 'useRandomDelay', false)}
                            className="text-emerald-600 focus:ring-emerald-500"
                          />
                          <span>Fixo</span>
                        </label>
                      </div>
                    </div>

                    {Boolean(cadenceSettings[inst.id]?.useRandomDelay ?? inst.useRandomDelay ?? true) ? (
                      <>
                        <div>
                          <label className="block text-[11px] font-semibold text-slate-700 dark:text-slate-300 mb-1">
                            Intervalo Mínimo (segundos)
                          </label>
                          <input
                            type="number"
                            min={1}
                            max={600}
                            value={cadenceSettings[inst.id]?.minDelaySeconds ?? inst.minDelaySeconds ?? 20}
                            onChange={(e) => handleUpdateCadenceField(inst.id, 'minDelaySeconds', Number(e.target.value))}
                            className="w-full p-2 border border-slate-200 dark:border-slate-700 rounded-lg text-xs bg-white dark:bg-[#131b2c] text-slate-900 dark:text-slate-100 focus:outline-none focus:border-emerald-500"
                          />
                        </div>
                        <div>
                          <label className="block text-[11px] font-semibold text-slate-700 dark:text-slate-300 mb-1">
                            Intervalo Máximo (segundos)
                          </label>
                          <div className="flex items-center gap-2">
                            <input
                              type="number"
                              min={1}
                              max={600}
                              value={cadenceSettings[inst.id]?.maxDelaySeconds ?? inst.maxDelaySeconds ?? 45}
                              onChange={(e) => handleUpdateCadenceField(inst.id, 'maxDelaySeconds', Number(e.target.value))}
                              className="w-full p-2 border border-slate-200 dark:border-slate-700 rounded-lg text-xs bg-white dark:bg-[#131b2c] text-slate-900 dark:text-slate-100 focus:outline-none focus:border-emerald-500"
                            />
                            <button
                              onClick={() => handleSaveCadence(inst.id)}
                              disabled={savingCadenceId === inst.id}
                              className="px-3 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg text-xs font-semibold whitespace-nowrap cursor-pointer transition-colors shadow-sm disabled:opacity-50"
                            >
                              {savingCadenceId === inst.id ? 'Salvando...' : cadenceSuccessId === inst.id ? '✔ Salvo!' : 'Salvar'}
                            </button>
                          </div>
                        </div>
                      </>
                    ) : (
                      <div className="md:col-span-2">
                        <label className="block text-[11px] font-semibold text-slate-700 dark:text-slate-300 mb-1">
                          Delay Fixo entre Contatos (segundos)
                        </label>
                        <div className="flex items-center gap-2">
                          <input
                            type="number"
                            min={1}
                            max={600}
                            value={cadenceSettings[inst.id]?.fixedDelaySeconds ?? inst.fixedDelaySeconds ?? 30}
                            onChange={(e) => handleUpdateCadenceField(inst.id, 'fixedDelaySeconds', Number(e.target.value))}
                            className="w-full max-w-[200px] p-2 border border-slate-200 dark:border-slate-700 rounded-lg text-xs bg-white dark:bg-[#131b2c] text-slate-900 dark:text-slate-100 focus:outline-none focus:border-emerald-500"
                          />
                          <button
                            onClick={() => handleSaveCadence(inst.id)}
                            disabled={savingCadenceId === inst.id}
                            className="px-3 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg text-xs font-semibold whitespace-nowrap cursor-pointer transition-colors shadow-sm disabled:opacity-50"
                          >
                            {savingCadenceId === inst.id ? 'Salvando...' : cadenceSuccessId === inst.id ? '✔ Salvo!' : 'Salvar'}
                          </button>
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Monitor da Fila de Disparos em Tempo Real (Cadência Anti-Bloqueio) */}
      <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-6">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-4 pb-3 border-b border-slate-100">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-indigo-50 text-indigo-600 flex items-center justify-center font-bold">
              <Clock className="w-4 h-4" />
            </div>
            <div>
              <h3 className="font-bold text-slate-900 text-base">Fila de Disparos WhatsApp (Controle de Cadência)</h3>
              <p className="text-xs text-slate-500">
                Gerenciamento ordenado com atraso natural entre contatos para proteger as linhas contra bloqueios.
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={fetchQueueStats}
              className="px-3 py-1.5 bg-slate-50 hover:bg-slate-100 text-slate-700 text-xs font-semibold rounded-lg border border-slate-200 transition-colors flex items-center gap-1.5 cursor-pointer"
            >
              <RefreshCw className="w-3.5 h-3.5 text-slate-500" />
              <span>Atualizar Fila</span>
            </button>

            <button
              onClick={handleProcessQueueNow}
              disabled={processingQueue}
              className="px-3 py-1.5 bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-semibold rounded-lg shadow-sm transition-colors flex items-center gap-1.5 cursor-pointer disabled:opacity-50"
            >
              <Play className="w-3.5 h-3.5" />
              <span>{processingQueue ? 'Processando...' : 'Processar Fila Agora'}</span>
            </button>
          </div>
        </div>

        {/* Cards de Métricas da Fila */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs mb-4">
          <div className="p-3.5 rounded-xl bg-amber-50/70 border border-amber-200">
            <span className="text-[10px] uppercase font-bold text-amber-700 block mb-1">
              Aguardando Envio
            </span>
            <span className="text-xl font-bold text-amber-900 font-mono">
              {queueStats?.pendingCount ?? 0}
            </span>
            <span className="text-[10px] text-amber-600 block mt-0.5">
              Na fila com atraso agendado
            </span>
          </div>

          <div className="p-3.5 rounded-xl bg-blue-50/70 border border-blue-200">
            <span className="text-[10px] uppercase font-bold text-blue-700 block mb-1">
              Disparando Agora
            </span>
            <div className="truncate">
              <span className="text-sm font-bold text-blue-900 block truncate">
                {queueStats?.currentlySending?.contactName || queueStats?.currentlySending?.phone || 'Fila Ociosa'}
              </span>
              <span className="text-[10px] text-blue-600 block truncate mt-0.5 font-mono">
                {queueStats?.currentlySending ? queueStats.currentlySending.phone : 'Nenhum disparo em andamento'}
              </span>
            </div>
          </div>

          <div className="p-3.5 rounded-xl bg-purple-50/70 border border-purple-200">
            <span className="text-[10px] uppercase font-bold text-purple-700 block mb-1">
              Próximo Envio Em
            </span>
            {queueStats?.nextScheduled ? (
              <div>
                <span className="text-xl font-bold text-purple-900 font-mono">
                  {queueStats.nextScheduled.secondsLeft > 0
                    ? `${queueStats.nextScheduled.secondsLeft}s`
                    : 'Iminente'}
                </span>
                <span className="text-[10px] text-purple-600 block truncate mt-0.5">
                  Para {queueStats.nextScheduled.contactName || queueStats.nextScheduled.phone}
                </span>
              </div>
            ) : (
              <div>
                <span className="text-sm font-bold text-purple-800">Sem agendamentos</span>
                <span className="text-[10px] text-purple-500 block mt-0.5">Tudo em dia</span>
              </div>
            )}
          </div>

          <div className="p-3.5 rounded-xl bg-emerald-50/70 border border-emerald-200">
            <span className="text-[10px] uppercase font-bold text-emerald-700 block mb-1">
              Enviadas com Sucesso
            </span>
            <span className="text-xl font-bold text-emerald-900 font-mono">
              {queueStats?.sentCount ?? 0}
            </span>
            <span className="text-[10px] text-emerald-600 block mt-0.5">
              {queueStats?.failedCount ? `${queueStats.failedCount} falha(s)` : '100% de sucesso'}
            </span>
          </div>
        </div>

        {/* Lista das Próximas Mensagens ou Histórico */}
        {queueStats?.recentItems && queueStats.recentItems.length > 0 && (
          <div className="border border-slate-100 rounded-xl overflow-hidden text-xs">
            <div className="bg-slate-50 px-3.5 py-2 font-semibold text-slate-700 text-[11px] border-b border-slate-100 flex items-center justify-between">
              <span>Últimas Mensagens na Fila</span>
              <span className="text-[10px] text-slate-400 font-normal">Exibindo até 10 mensagens mais recentes</span>
            </div>
            <div className="divide-y divide-slate-100 max-h-48 overflow-y-auto">
              {queueStats.recentItems.map((item) => (
                <div key={item.id} className="px-3.5 py-2 flex items-center justify-between gap-2 hover:bg-slate-50/50">
                  <div className="flex items-center gap-2 min-w-0">
                    <span className={`w-2 h-2 rounded-full shrink-0 ${
                      item.status === 'SENT' ? 'bg-emerald-500' :
                      item.status === 'PROCESSING' ? 'bg-blue-500 animate-pulse' :
                      item.status === 'FAILED' ? 'bg-red-500' : 'bg-amber-400'
                    }`} />
                    <span className="font-semibold text-slate-800 truncate">
                      {item.contactName || item.phone}
                    </span>
                    <span className="text-[11px] text-slate-400 font-mono">
                      {item.phone}
                    </span>
                  </div>

                  <div className="flex items-center gap-3 shrink-0 text-[11px]">
                    <span className="text-slate-400">
                      {item.status === 'PENDING' ? `Agendado: ${new Date(item.scheduledAt).toLocaleTimeString('pt-BR')}` :
                       item.status === 'SENT' ? `Enviado às ${item.sentAt ? new Date(item.sentAt).toLocaleTimeString('pt-BR') : ''}` :
                       item.status}
                    </span>
                    <span className={`px-2 py-0.5 rounded text-[10px] font-bold ${
                      item.status === 'SENT' ? 'bg-emerald-100 text-emerald-800' :
                      item.status === 'PROCESSING' ? 'bg-blue-100 text-blue-800' :
                      item.status === 'FAILED' ? 'bg-red-100 text-red-800' :
                      'bg-amber-100 text-amber-800'
                    }`}>
                      {item.status === 'PENDING' ? 'Na Fila' :
                       item.status === 'PROCESSING' ? 'Enviando' :
                       item.status === 'SENT' ? 'Enviado' : 'Falha'}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* Painel de Disparo de Teste Imediato com Seleção de Linha */}
      {connectedCount > 0 && (
        <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-6 sm:p-8">
          <div className="flex items-center gap-3 mb-1">
            <div className="w-9 h-9 rounded-xl bg-emerald-50 text-emerald-600 flex items-center justify-center font-bold">
              <Send className="w-4 h-4" />
            </div>
            <div>
              <h3 className="font-bold text-slate-900 text-base">Envio de Teste Imediato</h3>
              <p className="text-xs text-slate-500">
                Selecione qual número cadastrado enviará a mensagem de teste e valide a entrega instantaneamente.
              </p>
            </div>
          </div>

          <form onSubmit={handleSendMessage} className="space-y-4 text-xs max-w-2xl mt-5">
            <div>
              <label className="block text-slate-700 font-semibold mb-1">
                Número de Envio (Remetente)
              </label>
              <select
                value={selectedSenderId}
                onChange={(e) => setSelectedSenderId(e.target.value)}
                className="w-full p-2.5 bg-white border border-slate-200 rounded-lg text-xs font-medium text-slate-900 focus:outline-none focus:border-emerald-500"
              >
                {instances
                  .filter((i) => i.connected)
                  .map((i) => (
                    <option key={i.id} value={i.id}>
                      {i.name || 'WhatsApp'} {i.phone ? `(${i.phone})` : ''} {i.isDefault ? '★ [Padrão]' : ''}
                    </option>
                  ))}
              </select>
            </div>

            <div>
              <label className="block text-slate-700 font-semibold mb-1">
                Telefone de Destino (com DDI e DDD)
              </label>
              <input
                type="text"
                required
                placeholder="+55 34 99999-8888"
                value={sendPhone}
                onChange={(e) => setSendPhone(e.target.value)}
                className="w-full p-2.5 border border-slate-200 rounded-lg text-xs focus:outline-none focus:border-emerald-500"
              />
            </div>

            <div>
              <label className="block text-slate-700 font-semibold mb-1">Mensagem de Teste</label>
              <textarea
                rows={3}
                required
                value={sendText}
                onChange={(e) => setSendText(e.target.value)}
                className="w-full p-2.5 border border-slate-200 rounded-lg text-xs focus:outline-none focus:border-emerald-500"
              />
            </div>

            {sendResult && (
              <div
                className={`p-3 rounded-lg text-xs font-semibold ${
                  sendResult.success
                    ? 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                    : 'bg-red-50 text-red-700 border border-red-200'
                }`}
              >
                {sendResult.success
                  ? '✔ Mensagem de teste enviada com sucesso para o WhatsApp!'
                  : `Erro no envio: ${sendResult.error}`}
              </div>
            )}

            <button
              type="submit"
              disabled={sending}
              className="px-5 py-2.5 bg-emerald-600 hover:bg-emerald-700 text-white font-semibold rounded-lg transition-colors flex items-center gap-2 shadow-sm cursor-pointer"
            >
              <Send className="w-3.5 h-3.5" />
              <span>{sending ? 'Disparando...' : 'Enviar Mensagem de Teste'}</span>
            </button>
          </form>
        </div>
      )}

      {/* Dicas de Compartilhamento Global entre Experts */}
      <div className="p-5 rounded-2xl bg-indigo-50/70 border border-indigo-100 text-xs text-indigo-950 flex items-start gap-3.5 shadow-sm">
        <ShieldCheck className="w-5 h-5 text-indigo-600 shrink-0 mt-0.5" />
        <div className="space-y-1">
          <span className="font-bold text-slate-900 block">
            Ambiente Multi-Linhas do Expert (Isolamento Multi-Tenant)
          </span>
          <p className="text-slate-600 text-[11px] leading-relaxed">
            Ao conectar novos números de WhatsApp, todos eles ficam vinculados exclusivamente a este Expert/Tenant com isolamento total de dados e mensagens.
            Ao criar ou editar um fluxo de automação, você pode escolher exatamente qual número fará o disparo de cada mensagem.
          </p>
        </div>
      </div>

      {/* MODAL PARA CONECTAR NOVO NÚMERO / ESCANEAR QR CODE */}
      {isConnectModalOpen && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-2xl border border-slate-200 max-w-md w-full p-6 text-xs text-slate-800 relative">
            <div className="flex items-center justify-between pb-3 border-b border-slate-100">
              <div className="flex items-center gap-2">
                <div className="w-8 h-8 rounded-lg bg-emerald-100 text-emerald-700 flex items-center justify-center font-bold">
                  <QrCode className="w-4 h-4" />
                </div>
                <div>
                  <h3 className="font-bold text-slate-900 text-sm">Conectar WhatsApp</h3>
                  <p className="text-[11px] text-slate-400">Escaneie o código QR com seu celular</p>
                </div>
              </div>
              <button
                onClick={() => {
                  setIsConnectModalOpen(false);
                  setActiveModalQrCode(null);
                  setActiveModalInstanceId(null);
                }}
                className="text-slate-400 hover:text-slate-600 p-1 rounded-lg"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="mt-4 space-y-4 flex flex-col items-center">
              {modalLoading ? (
                <div className="py-16 text-center space-y-2">
                  <RefreshCw className="w-8 h-8 animate-spin text-emerald-600 mx-auto" />
                  <p className="text-slate-500 font-medium">Gerando QR Code limpo...</p>
                </div>
              ) : activeModalQrCode ? (
                <>
                  <div className="p-3 bg-white border-2 border-emerald-500 rounded-2xl shadow-lg relative">
                    <img
                      src={
                        activeModalQrCode.startsWith('data:image') || activeModalQrCode.startsWith('http')
                          ? activeModalQrCode
                          : `data:image/png;base64,${activeModalQrCode}`
                      }
                      alt="QR Code WhatsApp"
                      className="w-56 h-56 object-contain rounded-lg"
                    />

                    {/* Contagem regressiva */}
                    <div className="mt-2 flex items-center justify-center gap-1 text-[11px] text-slate-500">
                      <Clock className="w-3.5 h-3.5 text-emerald-600" />
                      <span>
                        Atualização em: <strong className="text-emerald-700 font-mono">{modalTimeLeft}s</strong>
                      </span>
                    </div>
                  </div>

                  <div className="text-xs text-slate-600 space-y-1 text-left w-full bg-slate-50 p-3 rounded-xl border border-slate-100">
                    <div className="font-semibold text-slate-800">No seu WhatsApp:</div>
                    <div>1. Abra o WhatsApp no celular</div>
                    <div>2. Vá em <strong>Aparelhos Conectados &gt; Conectar um Aparelho</strong></div>
                    <div>3. Aponte a câmera para o QR Code acima</div>
                  </div>

                  <div className="flex items-center gap-2 w-full pt-1">
                    <button
                      onClick={handleRefreshModalQr}
                      className="flex-1 py-2 border border-slate-200 hover:bg-slate-50 text-slate-700 font-semibold rounded-lg flex items-center justify-center gap-1.5 transition-colors cursor-pointer"
                    >
                      <RefreshCw className="w-3.5 h-3.5" />
                      <span>Atualizar Código</span>
                    </button>
                    <button
                      onClick={() => {
                        setIsConnectModalOpen(false);
                        setActiveModalQrCode(null);
                        setActiveModalInstanceId(null);
                      }}
                      className="px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 font-semibold rounded-lg transition-colors cursor-pointer"
                    >
                      Concluir
                    </button>
                  </div>
                </>
              ) : (
                <div className="py-8 text-center space-y-3">
                  <p className="text-slate-500 font-medium">Aguardando geração do código QR...</p>
                  <button
                    onClick={() => {
                      if (activeModalInstanceId) {
                        handleReconnectInstance(activeModalInstanceId);
                      } else {
                        handleOpenConnectModal();
                      }
                    }}
                    className="px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white font-semibold rounded-lg text-xs transition-colors cursor-pointer"
                  >
                    Tentar Novamente
                  </button>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* MODAL PARA CONECTAR META WHATSAPP BUSINESS CLOUD API OFICIAL */}
      {isMetaModalOpen && (
        <div className="fixed inset-0 bg-black/70 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-white dark:bg-[#0c1322] rounded-2xl shadow-2xl border border-slate-200 dark:border-slate-800 max-w-2xl w-full p-6 text-xs text-slate-800 dark:text-slate-200 relative max-h-[92vh] overflow-y-auto">
            <div className="flex items-center justify-between pb-3 border-b border-slate-100 dark:border-slate-800">
              <div className="flex items-center gap-2">
                <div className="w-8 h-8 rounded-lg bg-blue-100 dark:bg-blue-950/80 text-blue-700 dark:text-blue-400 flex items-center justify-center font-bold">
                  <ShieldCheck className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="font-bold text-slate-900 dark:text-white text-sm">Conectar WhatsApp Cloud API Oficial (Meta)</h3>
                  <p className="text-[11px] text-slate-500 dark:text-slate-400">Integração oficial sem risco de banimento de número</p>
                </div>
              </div>
              <button
                onClick={() => setIsMetaModalOpen(false)}
                className="text-slate-400 hover:text-slate-600 dark:text-slate-400 dark:hover:text-slate-200 p-1 rounded-lg cursor-pointer transition-colors"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Painel de Atalhos Rápidos e Tutorial para Leigos */}
            <div className="mt-4 bg-gradient-to-r from-blue-50/90 via-indigo-50/60 to-blue-50/90 dark:from-[#11192e] dark:via-[#131f3a] dark:to-[#11192e] border border-blue-200/90 dark:border-blue-900/60 rounded-xl p-3.5 space-y-2.5">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-1.5 text-blue-950 dark:text-blue-200 font-bold text-xs">
                  <BookOpen className="w-4 h-4 text-blue-600 dark:text-blue-400" />
                  <span>Onde pegar as credenciais na Meta? (Atalhos Oficiais)</span>
                </div>
                <button
                  type="button"
                  onClick={() => setShowMetaTutorial(!showMetaTutorial)}
                  className="text-[11px] font-semibold text-blue-700 hover:text-blue-900 dark:text-blue-300 dark:hover:text-blue-100 flex items-center gap-1 cursor-pointer bg-white/90 hover:bg-white dark:bg-[#162340] dark:hover:bg-[#1c2c52] px-2.5 py-1 rounded-lg border border-blue-200 dark:border-blue-800/80 shadow-xs transition-colors"
                >
                  {showMetaTutorial ? (
                    <>
                      <span>Ocultar Instruções</span>
                      <ChevronUp className="w-3.5 h-3.5 text-blue-600 dark:text-blue-400" />
                    </>
                  ) : (
                    <>
                      <span>Guia Passo a Passo (Leigos)</span>
                      <ChevronDown className="w-3.5 h-3.5 text-blue-600 dark:text-blue-400" />
                    </>
                  )}
                </button>
              </div>

              {/* 3 Botões de Atalho com 1 Clique */}
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 pt-0.5">
                <a
                  href="https://developers.facebook.com/apps/"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="p-2.5 bg-white hover:bg-blue-50 dark:bg-[#152037] dark:hover:bg-[#1b2946] border border-blue-200 hover:border-blue-400 dark:border-slate-700/80 dark:hover:border-blue-500 rounded-lg flex items-center justify-between gap-1 text-[11px] font-semibold text-blue-900 dark:text-slate-100 shadow-xs transition-all group"
                  title="Abre o painel Meta Developers para pegar o Phone Number ID e configurar o Webhook"
                >
                  <div className="flex flex-col min-w-0">
                    <span className="truncate text-blue-950 dark:text-slate-100 font-bold">1. Meta Developers</span>
                    <span className="text-[10px] text-slate-500 dark:text-slate-400 font-normal truncate">Phone ID e Webhook</span>
                  </div>
                  <ExternalLink className="w-3.5 h-3.5 text-blue-500 dark:text-blue-400 group-hover:translate-x-0.5 group-hover:-translate-y-0.5 transition-transform shrink-0" />
                </a>

                <a
                  href="https://business.facebook.com/settings/system-users"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="p-2.5 bg-white hover:bg-blue-50 dark:bg-[#152037] dark:hover:bg-[#1b2946] border border-blue-200 hover:border-blue-400 dark:border-slate-700/80 dark:hover:border-blue-500 rounded-lg flex items-center justify-between gap-1 text-[11px] font-semibold text-blue-900 dark:text-slate-100 shadow-xs transition-all group"
                  title="Abre direto Usuários do Sistema para gerar o Token Permanente que nunca expira"
                >
                  <div className="flex flex-col min-w-0">
                    <span className="truncate text-blue-950 dark:text-slate-100 font-bold">2. Usuários do Sistema</span>
                    <span className="text-[10px] text-slate-500 dark:text-slate-400 font-normal truncate">Token Permanente</span>
                  </div>
                  <ExternalLink className="w-3.5 h-3.5 text-blue-500 dark:text-blue-400 group-hover:translate-x-0.5 group-hover:-translate-y-0.5 transition-transform shrink-0" />
                </a>

                <a
                  href="https://business.facebook.com/wa/manage/phone-numbers/"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="p-2.5 bg-white hover:bg-blue-50 dark:bg-[#152037] dark:hover:bg-[#1b2946] border border-blue-200 hover:border-blue-400 dark:border-slate-700/80 dark:hover:border-blue-500 rounded-lg flex items-center justify-between gap-1 text-[11px] font-semibold text-blue-900 dark:text-slate-100 shadow-xs transition-all group"
                  title="Abre o WhatsApp Manager para conferir seus números ativos e o WABA ID"
                >
                  <div className="flex flex-col min-w-0">
                    <span className="truncate text-blue-950 dark:text-slate-100 font-bold">3. WhatsApp Manager</span>
                    <span className="text-[10px] text-slate-500 dark:text-slate-400 font-normal truncate">WABA ID e Números</span>
                  </div>
                  <ExternalLink className="w-3.5 h-3.5 text-blue-500 dark:text-blue-400 group-hover:translate-x-0.5 group-hover:-translate-y-0.5 transition-transform shrink-0" />
                </a>
              </div>

              {/* Guia Didático Detalhado */}
              {showMetaTutorial && (
                <div className="mt-2 pt-2.5 border-t border-blue-200/70 dark:border-slate-800 space-y-3 text-[11px] text-slate-700 dark:text-slate-300 bg-white dark:bg-[#070c17] p-3.5 rounded-lg border border-slate-100 dark:border-slate-800/80 shadow-sm animate-in fade-in duration-200">
                  <div>
                    <span className="font-bold text-blue-950 dark:text-blue-300 flex items-center gap-1 text-xs">
                      <span>📌</span>
                      <span>Passo 1: Phone Number ID e WABA ID (Meta Developers)</span>
                    </span>
                    <ol className="list-decimal list-inside space-y-1 text-slate-700 dark:text-slate-300 pl-1 mt-1">
                      <li>Abra <a href="https://developers.facebook.com/apps/" target="_blank" rel="noopener noreferrer" className="text-blue-600 dark:text-blue-400 font-semibold underline">developers.facebook.com/apps</a> e clique no seu App.</li>
                      <li>No menu lateral esquerdo, clique em <strong>WhatsApp &gt; Configuração da API</strong> (ou <em>API Setup</em>).</li>
                      <li>Copie o <strong>Identificador do número de telefone (Phone Number ID)</strong> e a <strong>Identificação da conta (WABA ID)</strong>.</li>
                    </ol>
                  </div>

                  <div>
                    <span className="font-bold text-blue-950 dark:text-blue-300 flex items-center gap-1 text-xs">
                      <span>🔑</span>
                      <span>Passo 2: Gerar o Access Token Permanente (Que nunca expira)</span>
                    </span>
                    <ol className="list-decimal list-inside space-y-1 text-slate-700 dark:text-slate-300 pl-1 mt-1">
                      <li>Abra <a href="https://business.facebook.com/settings/system-users" target="_blank" rel="noopener noreferrer" className="text-blue-600 dark:text-blue-400 font-semibold underline">business.facebook.com/settings/system-users</a>.</li>
                      <li>Crie ou selecione um <strong>Usuário do Sistema</strong> com função <strong>Administrador</strong>.</li>
                      <li>Clique em <strong>Atribuir ativos</strong>, selecione seu aplicativo do WhatsApp e marque <em>Controle Total</em>.</li>
                      <li>Clique em <strong>Gerar novo token</strong>, selecione seu App, coloque a expiração em <strong>Nunca</strong> e marque as duas permissões: <code className="bg-blue-100 dark:bg-blue-950/80 text-blue-800 dark:text-blue-300 border border-blue-200/60 dark:border-blue-800/60 px-1 py-0.5 rounded font-mono">whatsapp_business_messaging</code> e <code className="bg-blue-100 dark:bg-blue-950/80 text-blue-800 dark:text-blue-300 border border-blue-200/60 dark:border-blue-800/60 px-1 py-0.5 rounded font-mono">whatsapp_business_management</code>.</li>
                      <li>Clique em <strong>Gerar Token</strong>, copie o código longo que começa com <code className="font-mono bg-slate-100 dark:bg-slate-800 px-1 py-0.5 rounded text-slate-800 dark:text-slate-200">EAAB...</code> e cole no campo de Access Token abaixo.</li>
                    </ol>
                  </div>

                  <div>
                    <span className="font-bold text-blue-950 dark:text-blue-300 flex items-center gap-1 text-xs">
                      <span>🌐</span>
                      <span>Passo 3: Configurar o Webhook da Meta</span>
                    </span>
                    <p className="text-slate-700 dark:text-slate-300 pl-1 mt-1 leading-relaxed">
                      No painel da Meta (<a href="https://developers.facebook.com/apps/" target="_blank" rel="noopener noreferrer" className="text-blue-600 dark:text-blue-400 font-semibold underline">developers.facebook.com/apps</a>), acesse <strong>WhatsApp &gt; Configuração</strong>. Na caixinha <strong>Webhook</strong>, clique em <strong>Editar</strong>, cole a URL de Retorno e o Token de Verificação fornecidos no bloco azul desta janela e salve. Depois clique em <strong>Gerenciar campos</strong> e ative o campo <strong>messages</strong>.
                    </p>
                  </div>
                </div>
              )}
            </div>

            <form onSubmit={handleConnectMetaCloud} className="mt-4 space-y-4">
              {metaError && (
                <div className="p-3 rounded-xl bg-red-50 dark:bg-red-950/60 text-red-700 dark:text-red-300 border border-red-200 dark:border-red-900/60 text-xs flex items-center gap-2">
                  <AlertCircle className="w-4 h-4 shrink-0" />
                  <span>{metaError}</span>
                </div>
              )}

              <div className="space-y-1.5">
                <label className="block text-slate-700 dark:text-slate-200 font-bold text-xs">
                  Nome / Apelido da Linha
                </label>
                <input
                  type="text"
                  placeholder="Ex: WhatsApp Oficial Vendas, Suporte Lançamento..."
                  value={metaChannelName}
                  onChange={(e) => setMetaChannelName(e.target.value)}
                  className="w-full px-3.5 py-2.5 bg-slate-50 dark:bg-[#111927] border border-slate-200 dark:border-slate-700 rounded-xl text-xs text-slate-900 dark:text-slate-100 focus:outline-none focus:border-blue-500 focus:bg-white dark:focus:bg-[#141f33]"
                />
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <div className="flex items-center justify-between">
                    <label className="text-slate-700 dark:text-slate-200 font-bold text-xs">
                      Phone Number ID <span className="text-red-500">*</span>
                    </label>
                    <a
                      href="https://developers.facebook.com/apps/"
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-[10px] text-blue-600 hover:text-blue-800 dark:text-blue-400 dark:hover:text-blue-300 hover:underline inline-flex items-center gap-0.5"
                      title="Abre o painel da Meta para localizar seu Phone Number ID"
                    >
                      <span>Onde pegar?</span>
                      <ExternalLink className="w-2.5 h-2.5" />
                    </a>
                  </div>
                  <input
                    type="text"
                    required
                    placeholder="Ex: 104928374659201"
                    value={metaPhoneNumberId}
                    onChange={(e) => setMetaPhoneNumberId(e.target.value)}
                    className="w-full px-3.5 py-2.5 bg-slate-50 dark:bg-[#111927] border border-slate-200 dark:border-slate-700 rounded-xl text-xs font-mono text-slate-900 dark:text-slate-100 focus:outline-none focus:border-blue-500 focus:bg-white dark:focus:bg-[#141f33]"
                  />
                  <span className="text-[10px] text-slate-400 dark:text-slate-400 block">ID do número gerado na Meta (Configuração da API)</span>
                </div>

                <div className="space-y-1.5">
                  <div className="flex items-center justify-between">
                    <label className="text-slate-700 dark:text-slate-200 font-bold text-xs">
                      WABA ID (WhatsApp Account ID)
                    </label>
                    <a
                      href="https://business.facebook.com/wa/manage/phone-numbers/"
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-[10px] text-blue-600 hover:text-blue-800 dark:text-blue-400 dark:hover:text-blue-300 hover:underline inline-flex items-center gap-0.5"
                      title="Abre o WhatsApp Manager para conferir seu WABA ID"
                    >
                      <span>Ver no Gerenciador</span>
                      <ExternalLink className="w-2.5 h-2.5" />
                    </a>
                  </div>
                  <input
                    type="text"
                    placeholder="Ex: 102938475619283"
                    value={metaWabaId}
                    onChange={(e) => setMetaWabaId(e.target.value)}
                    className="w-full px-3.5 py-2.5 bg-slate-50 dark:bg-[#111927] border border-slate-200 dark:border-slate-700 rounded-xl text-xs font-mono text-slate-900 dark:text-slate-100 focus:outline-none focus:border-blue-500 focus:bg-white dark:focus:bg-[#141f33]"
                  />
                  <span className="text-[10px] text-slate-400 dark:text-slate-400 block">Necessário para listar templates aprovados</span>
                </div>
              </div>

              <div className="space-y-1.5">
                <div className="flex items-center justify-between">
                  <label className="text-slate-700 dark:text-slate-200 font-bold text-xs">
                    Access Token Permanente da Meta <span className="text-red-500">*</span>
                  </label>
                  <a
                    href="https://business.facebook.com/settings/system-users"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-[10px] text-blue-600 hover:text-blue-800 dark:text-blue-400 dark:hover:text-blue-300 hover:underline inline-flex items-center gap-0.5 font-semibold"
                    title="Abre direto a tela de Usuários do Sistema no Gerenciador de Negócios"
                  >
                    <span>Gerar no Gerenciador de Negócios</span>
                    <ExternalLink className="w-2.5 h-2.5" />
                  </a>
                </div>
                <div className="relative">
                  <input
                    type="password"
                    required
                    placeholder="EAABwz..."
                    value={metaAccessToken}
                    onChange={(e) => setMetaAccessToken(e.target.value)}
                    className="w-full px-3.5 py-2.5 bg-slate-50 dark:bg-[#111927] border border-slate-200 dark:border-slate-700 rounded-xl text-xs font-mono text-slate-900 dark:text-slate-100 focus:outline-none focus:border-blue-500 focus:bg-white dark:focus:bg-[#141f33] pr-9"
                  />
                  <Lock className="w-4 h-4 text-slate-400 absolute right-3 top-1/2 -translate-y-1/2 pointer-events-none" />
                </div>
                <span className="text-[10px] text-slate-400 dark:text-slate-400 block">
                  Token do Usuário do Sistema (System User) com permissões <code className="text-blue-600 dark:text-blue-400 font-mono">whatsapp_business_messaging</code> e <code className="text-blue-600 dark:text-blue-400 font-mono">whatsapp_business_management</code>
                </span>
              </div>

              <div className="space-y-1.5">
                <div className="flex items-center justify-between">
                  <label className="text-slate-700 dark:text-slate-200 font-bold text-xs">
                    Business Account ID (Opcional)
                  </label>
                  <a
                    href="https://business.facebook.com/settings/"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-[10px] text-slate-500 hover:text-slate-700 dark:text-slate-400 dark:hover:text-slate-200 hover:underline inline-flex items-center gap-0.5"
                    title="Abre as Configurações do Negócio na Meta"
                  >
                    <span>Ver no Gerenciador</span>
                    <ExternalLink className="w-2.5 h-2.5" />
                  </a>
                </div>
                <input
                  type="text"
                  placeholder="Ex: 987654321098765"
                  value={metaBusinessAccountId}
                  onChange={(e) => setMetaBusinessAccountId(e.target.value)}
                  className="w-full px-3.5 py-2.5 bg-slate-50 dark:bg-[#111927] border border-slate-200 dark:border-slate-700 rounded-xl text-xs font-mono text-slate-900 dark:text-slate-100 focus:outline-none focus:border-blue-500 focus:bg-white dark:focus:bg-[#141f33]"
                />
              </div>

              {/* Informações para configuração de Webhook na Meta */}
              <div className="p-3.5 rounded-xl bg-blue-50/70 dark:bg-[#11192e] border border-blue-200/80 dark:border-blue-900/60 space-y-2 text-xs">
                <div className="font-bold text-blue-900 dark:text-blue-300 flex items-center gap-1.5 text-xs">
                  <Globe className="w-3.5 h-3.5 text-blue-600 dark:text-blue-400" />
                  <span>Configuração do Webhook no Meta for Developers</span>
                </div>
                <p className="text-slate-600 dark:text-slate-300 text-[11px]">
                  Cole os dados abaixo no painel da Meta (WhatsApp &gt; Configuração &gt; Webhook) para receber mensagens e confirmações de entrega:
                </p>

                <div className="space-y-1.5 pt-1">
                  <div>
                    <span className="text-[10px] font-bold text-slate-500 dark:text-slate-400 uppercase">URL de Retorno de Chamada (Callback URL)</span>
                    <div className="flex items-center gap-1.5 mt-0.5">
                      <input
                        type="text"
                        readOnly
                        value={typeof window !== 'undefined' ? `${window.location.origin}/api/webhooks/whatsapp/meta` : '/api/webhooks/whatsapp/meta'}
                        className="flex-1 px-2.5 py-1.5 bg-white dark:bg-[#070c17] border border-blue-200 dark:border-slate-700 rounded-lg text-[11px] font-mono text-slate-800 dark:text-slate-100 select-all"
                      />
                      <button
                        type="button"
                        onClick={() => {
                          const url = typeof window !== 'undefined' ? `${window.location.origin}/api/webhooks/whatsapp/meta` : '';
                          navigator.clipboard.writeText(url);
                          setMetaCopiedField('url');
                          setTimeout(() => setMetaCopiedField(null), 2000);
                        }}
                        className="px-2.5 py-1.5 rounded-lg bg-blue-600 hover:bg-blue-700 text-white font-semibold text-[11px] transition-colors"
                      >
                        {metaCopiedField === 'url' ? 'Copiado!' : 'Copiar'}
                      </button>
                    </div>
                  </div>

                  <div>
                    <span className="text-[10px] font-bold text-slate-500 dark:text-slate-400 uppercase">Token de Verificação (Verify Token)</span>
                    <div className="flex items-center gap-1.5 mt-0.5">
                      <input
                        type="text"
                        readOnly
                        value={metaWebhookVerifyToken}
                        className="flex-1 px-2.5 py-1.5 bg-white dark:bg-[#070c17] border border-blue-200 dark:border-slate-700 rounded-lg text-[11px] font-mono text-slate-800 dark:text-slate-100 select-all"
                      />
                      <button
                        type="button"
                        onClick={() => {
                          navigator.clipboard.writeText(metaWebhookVerifyToken);
                          setMetaCopiedField('token');
                          setTimeout(() => setMetaCopiedField(null), 2000);
                        }}
                        className="px-2.5 py-1.5 rounded-lg bg-blue-600 hover:bg-blue-700 text-white font-semibold text-[11px] transition-colors"
                      >
                        {metaCopiedField === 'token' ? 'Copiado!' : 'Copiar'}
                      </button>
                    </div>
                  </div>

                  <div className="text-[10px] text-blue-800 dark:text-blue-300 font-semibold pt-0.5">
                    Campo a assinar no webhook da Meta: <code className="bg-blue-100 dark:bg-blue-950 text-blue-900 dark:text-blue-300 border border-blue-200/60 dark:border-blue-800/60 px-1 py-0.5 rounded font-mono">messages</code>
                  </div>
                </div>
              </div>

              <div className="flex items-center justify-end gap-2 pt-2 border-t border-slate-100 dark:border-slate-800">
                <button
                  type="button"
                  onClick={() => setIsMetaModalOpen(false)}
                  className="px-4 py-2 rounded-xl border border-slate-200 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-800 font-semibold text-xs text-slate-700 dark:text-slate-300 cursor-pointer transition-colors"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={metaConnecting}
                  className="px-5 py-2 rounded-xl bg-blue-600 hover:bg-blue-700 text-white font-semibold text-xs shadow-lg shadow-blue-600/20 flex items-center gap-2 cursor-pointer transition-all disabled:opacity-50"
                >
                  {metaConnecting ? (
                    <>
                      <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                      <span>Validando com a Meta...</span>
                    </>
                  ) : (
                    <>
                      <Check className="w-4 h-4" />
                      <span>Testar e Conectar Canal Oficial</span>
                    </>
                  )}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* MODAL DE TEMPLATES OFICIAIS DA META */}
      {isTemplatesModalOpen && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-2xl border border-slate-200 max-w-2xl w-full p-6 text-xs text-slate-800 relative max-h-[85vh] flex flex-col">
            <div className="flex items-center justify-between pb-3 border-b border-slate-100 shrink-0">
              <div className="flex items-center gap-2">
                <div className="w-8 h-8 rounded-lg bg-blue-100 text-blue-700 flex items-center justify-center font-bold">
                  <FileText className="w-4 h-4" />
                </div>
                <div>
                  <h3 className="font-bold text-slate-900 text-sm">
                    Templates Oficiais: {activeTemplatesChannel?.name || 'Meta'}
                  </h3>
                  <p className="text-[11px] text-slate-400">
                    Modelos de mensagens aprovados pela Meta para disparo de lançamentos e avisos
                  </p>
                </div>
              </div>
              <button
                onClick={() => setIsTemplatesModalOpen(false)}
                className="text-slate-400 hover:text-slate-600 p-1 rounded-lg cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="my-4 overflow-y-auto flex-1 space-y-3 pr-1">
              {loadingTemplates ? (
                <div className="py-12 text-center text-slate-400 space-y-2">
                  <RefreshCw className="w-6 h-6 animate-spin mx-auto text-blue-600" />
                  <p>Consultando templates aprovados na Meta Graph API...</p>
                </div>
              ) : channelTemplates.length === 0 ? (
                <div className="py-12 text-center text-slate-400 bg-slate-50 rounded-xl border border-slate-100">
                  <FileText className="w-8 h-8 mx-auto mb-2 text-slate-300" />
                  <p className="font-semibold text-slate-700">Nenhum template encontrado nesta conta.</p>
                  <p className="text-[11px] mt-1 max-w-sm mx-auto">
                    Certifique-se de preencher o <strong>WABA ID</strong> nas configurações do canal e de criar templates no WhatsApp Business Manager da Meta.
                  </p>
                </div>
              ) : (
                channelTemplates.map((tpl) => {
                  const bodyComponent = tpl.components?.find((c: any) => c.type === 'BODY');
                  const isApproved = tpl.status === 'APPROVED';

                  return (
                    <div
                      key={tpl.id || tpl.name}
                      className="p-4 rounded-xl border border-slate-200 hover:border-blue-300 transition-all bg-white shadow-xs space-y-2"
                    >
                      <div className="flex items-center justify-between gap-2 flex-wrap">
                        <div className="flex items-center gap-2">
                          <span className="font-bold text-slate-900 text-xs">{tpl.name}</span>
                          <span className="text-[10px] text-slate-400 uppercase font-mono">
                            ({tpl.language || 'pt_BR'})
                          </span>
                        </div>
                        <div className="flex items-center gap-1.5">
                          <span className="px-2 py-0.5 rounded text-[10px] font-semibold bg-slate-100 text-slate-600">
                            {tpl.category}
                          </span>
                          <span
                            className={`px-2 py-0.5 rounded text-[10px] font-bold ${
                              isApproved
                                ? 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                                : 'bg-amber-50 text-amber-700 border border-amber-200'
                            }`}
                          >
                            {tpl.status}
                          </span>
                        </div>
                      </div>

                      {bodyComponent?.text && (
                        <div className="text-[11px] text-slate-600 bg-slate-50 p-2.5 rounded-lg border border-slate-100 whitespace-pre-wrap font-sans">
                          {bodyComponent.text}
                        </div>
                      )}
                    </div>
                  );
                })
              )}
            </div>

            <div className="pt-3 border-t border-slate-100 flex items-center justify-end shrink-0">
              <button
                type="button"
                onClick={() => setIsTemplatesModalOpen(false)}
                className="px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 font-semibold rounded-xl text-xs transition-colors cursor-pointer"
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
