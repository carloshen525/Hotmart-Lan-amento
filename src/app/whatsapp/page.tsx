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
  lastConnectedAt?: string | null;
  qrcode?: string | null;
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

  const fetchInstances = async () => {
    try {
      const res = await fetch('/api/whatsapp');
      const json = await res.json();
      if (Array.isArray(json.instances)) {
        setInstances(json.instances);
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
      }
    } catch {}
    setLoading(false);
  };

  useEffect(() => {
    fetchInstances();

    // Polling a cada 3.5 segundos para checar status em tempo real de todas as linhas
    const interval = setInterval(() => {
      fetch('/api/whatsapp')
        .then((r) => r.json())
        .then((json) => {
          if (Array.isArray(json.instances)) {
            setInstances(json.instances);
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
    }, 3500);

    return () => clearInterval(interval);
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

        <div className="flex items-center gap-2 self-start sm:self-auto shrink-0">
          <button
            onClick={() => {
              setLoading(true);
              fetchInstances();
            }}
            disabled={loading}
            className="px-3.5 py-2.5 bg-white hover:bg-slate-50 text-slate-700 font-semibold text-xs rounded-xl border border-slate-200 shadow-sm flex items-center gap-1.5 transition-all cursor-pointer"
            title="Sincronizar conexões ativas com a Evolution API"
          >
            <RefreshCw className={`w-3.5 h-3.5 text-slate-500 ${loading ? 'animate-spin' : ''}`} />
            <span>Sincronizar</span>
          </button>

          <button
            onClick={handleOpenConnectModal}
            disabled={actionLoading}
            className="px-4 py-2.5 bg-emerald-600 hover:bg-emerald-700 text-white font-semibold text-xs rounded-xl shadow-lg shadow-emerald-600/20 flex items-center gap-2 transition-all cursor-pointer"
          >
            <PlusCircle className="w-4 h-4" />
            <span>Adicionar Novo Número</span>
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
              Adicione o seu primeiro número para começar a disparar automações de lançamento, avisos e recuperação de vendas.
            </p>
            <button
              onClick={handleOpenConnectModal}
              className="px-5 py-2.5 bg-emerald-600 hover:bg-emerald-700 text-white font-semibold text-xs rounded-xl shadow-lg shadow-emerald-600/20 inline-flex items-center gap-2 cursor-pointer"
            >
              <PlusCircle className="w-4 h-4" />
              <span>Conectar Primeiro WhatsApp</span>
            </button>
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

                        {inst.isDefault && (
                          <span className="px-2 py-0.5 rounded-full bg-amber-50 text-amber-700 border border-amber-200 text-[10px] font-bold flex items-center gap-1">
                            <Star className="w-3 h-3 fill-amber-500 text-amber-500" />
                            Principal
                          </span>
                        )}
                      </div>

                      <div className="flex items-center gap-2 mt-0.5">
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
                          ID: {inst.instanceName}
                        </span>
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

                    <button
                      onClick={() => handleReconnectInstance(inst.id)}
                      disabled={actionLoading}
                      className="px-3 py-1.5 rounded-lg border border-slate-200 text-slate-700 hover:bg-slate-50 font-semibold text-xs flex items-center gap-1.5 transition-colors cursor-pointer"
                      title="Reconectar ou gerar novo QR Code desta linha"
                    >
                      <RefreshCw className="w-3.5 h-3.5" />
                      <span>{inst.connected ? 'Reconectar' : 'Conectar via QR Code'}</span>
                    </button>

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
                  <div className="p-3.5 rounded-xl bg-slate-50 border border-slate-100">
                    <span className="text-[10px] text-slate-400 uppercase font-bold block mb-1">
                      Número Conectado
                    </span>
                    <span className="font-bold text-slate-900 text-sm font-mono">
                      {inst.phone || (inst.connected ? 'Identificando...' : 'Não conectado')}
                    </span>
                  </div>

                  <div className="p-3.5 rounded-xl bg-slate-50 border border-slate-100">
                    <span className="text-[10px] text-slate-400 uppercase font-bold block mb-1">
                      Perfil no WhatsApp
                    </span>
                    <span className="font-bold text-slate-900 text-sm truncate block">
                      {inst.profileName || 'Conta Comercial'}
                    </span>
                  </div>

                  <div className="p-3.5 rounded-xl bg-slate-50 border border-slate-100">
                    <span className="text-[10px] text-slate-400 uppercase font-bold block mb-1">
                      Disponibilidade
                    </span>
                    <span className="font-semibold text-indigo-700 text-xs flex items-center gap-1">
                      <Users className="w-3.5 h-3.5 text-indigo-500" />
                      <span>Todos os Experts</span>
                    </span>
                  </div>
                </div>
              </div>
            ))}
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
    </div>
  );
}
