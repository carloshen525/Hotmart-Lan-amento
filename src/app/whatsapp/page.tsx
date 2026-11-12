'use client';

import { useState, useEffect } from 'react';
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
} from 'lucide-react';

interface WhatsAppStatus {
  hasInstance?: boolean;
  connected: boolean;
  status: 'CONNECTED' | 'DISCONNECTED' | 'CONNECTING';
  phone?: string | null;
  profileName?: string | null;
  lastConnectedAt?: string | null;
  qrcode?: string | null;
  error?: string;
}

export default function WhatsAppPage() {
  const [data, setData] = useState<WhatsAppStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState(false);
  const [actionMessage, setActionMessage] = useState<string | null>(null);

  // Timer de renovação automática do QR Code
  const [timeLeft, setTimeLeft] = useState(25);

  // Form de envio rápido de mensagem
  const [sendPhone, setSendPhone] = useState('');
  const [sendText, setSendText] = useState('Olá! Mensagem de teste enviada pela sua automação LaunchFlow.');
  const [sending, setSending] = useState(false);
  const [sendResult, setSendResult] = useState<any>(null);

  const fetchStatus = async () => {
    try {
      const res = await fetch('/api/whatsapp');
      const json = await res.json();
      setData(json);
      if (json.status === 'CONNECTING' && json.qrcode) {
        setTimeLeft(25);
      }
    } catch {}
    setLoading(false);
  };

  useEffect(() => {
    fetchStatus();

    // Polling a cada 3.5 segundos para checar se o usuário já escaneou no celular
    const interval = setInterval(() => {
      fetch('/api/whatsapp')
        .then((r) => r.json())
        .then((json) => {
          if (json.connected) {
            setData((prev) => ({ ...prev, ...json }));
          }
        })
        .catch(() => {});
    }, 3500);

    return () => clearInterval(interval);
  }, []);

  // Contagem regressiva de validade do QR Code
  useEffect(() => {
    if (data?.status !== 'CONNECTING' || !data?.qrcode) return;

    const timer = setInterval(() => {
      setTimeLeft((prev) => {
        if (prev <= 1) {
          // Atualiza o QR Code automaticamente para não deixar o usuário escanear código expirado
          handleRefreshQrCode();
          return 25;
        }
        return prev - 1;
      });
    }, 1000);

    return () => clearInterval(timer);
  }, [data?.status, data?.qrcode]);

  // Gera uma nova instância exclusiva e obtém o QR Code
  const handleGenerateInstance = async (forceNew = false) => {
    setActionLoading(true);
    setActionMessage(null);
    try {
      const res = await fetch('/api/whatsapp/connect', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ forceNew }),
      });
      const json = await res.json();
      setData((prev) => ({ ...prev, ...json }));
      setTimeLeft(25);
      if (json.error) {
        setActionMessage(`Aviso: ${json.error}`);
      } else {
        setActionMessage('Nova instância gerada! Escaneie o QR Code abaixo com seu WhatsApp.');
      }
    } catch (err: any) {
      setActionMessage(`Falha ao gerar instância: ${err.message}`);
    } finally {
      setActionLoading(false);
    }
  };

  const handleRefreshQrCode = async () => {
    setActionLoading(true);
    try {
      const res = await fetch('/api/whatsapp/qrcode');
      const json = await res.json();
      setData((prev) => (prev ? { ...prev, ...json } : json));
      setTimeLeft(25);
    } catch {}
    setActionLoading(false);
  };

  const handleDisconnect = async () => {
    if (!confirm('Deseja realmente desconectar seu WhatsApp deste ambiente?')) return;
    setActionLoading(true);
    try {
      await fetch('/api/whatsapp/disconnect', { method: 'POST' });
      fetchStatus();
    } catch {}
    setActionLoading(false);
  };

  const handleReconnect = async () => {
    setActionLoading(true);
    try {
      const res = await fetch('/api/whatsapp/reconnect', { method: 'POST' });
      const json = await res.json();
      setData((prev) => (prev ? { ...prev, ...json } : json));
      setTimeLeft(25);
    } catch {}
    setActionLoading(false);
  };

  const handleSendMessage = async (e: React.FormEvent) => {
    e.preventDefault();
    setSending(true);
    setSendResult(null);
    try {
      const res = await fetch('/api/whatsapp/send', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ phone: sendPhone, text: sendText }),
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

  return (
    <div className="space-y-8 max-w-5xl mx-auto">
      <div>
        <h1 className="text-2xl font-bold text-slate-900 tracking-tight">Conexão do WhatsApp</h1>
        <p className="text-sm text-slate-500 mt-1">
          Gerencie o número do WhatsApp exclusivo deste expert para envios de mensagens e recuperação de vendas.
        </p>
      </div>

      {actionMessage && (
        <div className="p-3.5 rounded-xl bg-indigo-50 text-indigo-900 border border-indigo-200 text-xs font-medium flex items-center gap-2.5">
          <AlertCircle className="w-4 h-4 text-indigo-600 shrink-0" />
          <span>{actionMessage}</span>
        </div>
      )}

      {/* Cartão Principal de Status */}
      <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-6 sm:p-8">
        {loading ? (
          <div className="py-12 text-center text-slate-400 text-xs">
            Verificando status do WhatsApp...
          </div>
        ) : data?.connected ? (
          /* ESTADO 1: CONECTADO */
          <div className="space-y-6">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-6 border-b border-slate-100">
              <div className="flex items-center gap-4">
                <div className="w-14 h-14 rounded-2xl bg-emerald-100 text-emerald-600 flex items-center justify-center font-bold text-xl shadow-inner">
                  <CheckCircle2 className="w-8 h-8" />
                </div>
                <div>
                  <div className="flex items-center gap-2">
                    <span className="w-2.5 h-2.5 rounded-full bg-emerald-500 animate-pulse"></span>
                    <span className="font-bold text-emerald-700 text-base">WhatsApp Conectado</span>
                  </div>
                  <div className="text-xs text-slate-500 mt-0.5">
                    Seu número está pronto para enviar automações e mensagens
                  </div>
                </div>
              </div>

              <div className="flex items-center gap-2">
                <button
                  onClick={handleReconnect}
                  disabled={actionLoading}
                  className="px-3.5 py-2 rounded-lg border border-slate-200 text-slate-700 hover:bg-slate-50 font-semibold text-xs flex items-center gap-1.5 transition-colors cursor-pointer"
                >
                  <RefreshCw className={`w-3.5 h-3.5 ${actionLoading ? 'animate-spin' : ''}`} />
                  <span>Reconectar</span>
                </button>

                <button
                  onClick={handleDisconnect}
                  disabled={actionLoading}
                  className="px-3.5 py-2 rounded-lg bg-red-50 hover:bg-red-100 text-red-600 font-semibold text-xs flex items-center gap-1.5 transition-colors cursor-pointer"
                >
                  <Power className="w-3.5 h-3.5" />
                  <span>Desconectar</span>
                </button>

                <button
                  onClick={() => handleGenerateInstance(true)}
                  disabled={actionLoading}
                  className="px-3.5 py-2 rounded-lg bg-indigo-50 hover:bg-indigo-100 text-indigo-700 font-semibold text-xs flex items-center gap-1.5 transition-colors cursor-pointer"
                  title="Descarta a conexão atual e gera uma instância totalmente nova"
                >
                  <PlusCircle className="w-3.5 h-3.5" />
                  <span>Gerar Nova Instância</span>
                </button>
              </div>
            </div>

            {/* Informações da Conexão */}
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 text-xs">
              <div className="p-4 rounded-xl bg-slate-50 border border-slate-100">
                <span className="text-[10px] text-slate-400 uppercase font-bold block mb-1">
                  Número Conectado
                </span>
                <span className="font-bold text-slate-900 text-sm">
                  {data.phone || 'Número Ativo'}
                </span>
              </div>

              <div className="p-4 rounded-xl bg-slate-50 border border-slate-100">
                <span className="text-[10px] text-slate-400 uppercase font-bold block mb-1">
                  Perfil no WhatsApp
                </span>
                <span className="font-bold text-slate-900 text-sm">
                  {data.profileName || 'Conta Comercial'}
                </span>
              </div>

              <div className="p-4 rounded-xl bg-slate-50 border border-slate-100">
                <span className="text-[10px] text-slate-400 uppercase font-bold block mb-1">
                  Status da Linha
                </span>
                <span className="font-bold text-emerald-600 text-sm flex items-center gap-1">
                  <span>Operacional</span>
                </span>
              </div>
            </div>

            {/* Disparo de Teste */}
            <div className="pt-6 border-t border-slate-100">
              <h3 className="font-bold text-slate-900 text-sm mb-1">Envio de Teste Imediato</h3>
              <p className="text-xs text-slate-500 mb-4">
                Envie uma mensagem de teste para o seu próprio número e valide o recebimento instantâneo.
              </p>

              <form onSubmit={handleSendMessage} className="space-y-3 text-xs max-w-xl">
                <div>
                  <label className="block text-slate-700 font-semibold mb-1">Seu Telefone (com DDI e DDD)</label>
                  <input
                    type="text"
                    required
                    placeholder="+55 11 99999-8888"
                    value={sendPhone}
                    onChange={(e) => setSendPhone(e.target.value)}
                    className="w-full p-2.5 border border-slate-200 rounded-lg text-xs"
                  />
                </div>

                <div>
                  <label className="block text-slate-700 font-semibold mb-1">Mensagem</label>
                  <textarea
                    rows={3}
                    required
                    value={sendText}
                    onChange={(e) => setSendText(e.target.value)}
                    className="w-full p-2.5 border border-slate-200 rounded-lg text-xs"
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
                      ? '✔ Mensagem enviada com sucesso para o WhatsApp!'
                      : `Erro no envio: ${sendResult.error}`}
                  </div>
                )}

                <button
                  type="submit"
                  disabled={sending}
                  className="px-5 py-2.5 bg-emerald-600 hover:bg-emerald-700 text-white font-semibold rounded-lg transition-colors flex items-center gap-2 shadow-sm cursor-pointer"
                >
                  <Send className="w-3.5 h-3.5" />
                  <span>{sending ? 'Disparando...' : 'Enviar Mensagem Agora'}</span>
                </button>
              </form>
            </div>
          </div>
        ) : (
          /* ESTADO 2: DESCONECTADO (COM BOTÃO OU QR CODE) */
          <div className="flex flex-col items-center justify-center text-center py-6">
            <div className="w-16 h-16 rounded-3xl bg-slate-100 text-slate-400 flex items-center justify-center mb-4">
              <QrCode className="w-8 h-8" />
            </div>

            <h2 className="text-lg font-bold text-slate-900 mb-1">
              WhatsApp Desconectado
            </h2>
            <p className="text-xs text-slate-500 max-w-md mb-6">
              Para disparar automações de lançamento e recuperação de vendas por WhatsApp, gere uma nova instância e escaneie o QR Code no seu celular.
            </p>

            {data?.qrcode ? (
              /* EXIBE O QR CODE AO VIVO */
              <div className="space-y-4 flex flex-col items-center">
                <div className="p-4 bg-white border-2 border-indigo-500 rounded-2xl shadow-xl inline-block relative">
                  {data.qrcode.startsWith('data:image') || data.qrcode.startsWith('http') ? (
                    <img
                      src={data.qrcode}
                      alt="QR Code WhatsApp"
                      className="w-64 h-64 object-contain rounded-lg"
                    />
                  ) : (
                    <img
                      src={`data:image/png;base64,${data.qrcode}`}
                      alt="QR Code WhatsApp"
                      className="w-64 h-64 object-contain rounded-lg"
                    />
                  )}

                  {/* Badge de Validade com Contagem Regressiva */}
                  <div className="mt-2 flex items-center justify-center gap-1.5 text-[11px] text-slate-500">
                    <Clock className="w-3.5 h-3.5 text-indigo-600" />
                    <span>
                      Válido por: <strong className="text-indigo-600 font-mono">{timeLeft}s</strong> (atualização automática)
                    </span>
                  </div>
                </div>

                <div className="text-xs text-slate-600 space-y-1">
                  <div className="font-semibold text-slate-800">
                    1. Abra o WhatsApp no celular do Expert
                  </div>
                  <div>2. Toque em <strong>Configurações &gt; Aparelhos Conectados &gt; Conectar um Aparelho</strong></div>
                  <div>3. Aponte a câmera para o QR Code acima</div>
                </div>

                <div className="flex items-center gap-3 pt-2">
                  <button
                    onClick={handleRefreshQrCode}
                    disabled={actionLoading}
                    className="px-4 py-2 border border-slate-200 hover:bg-slate-50 text-slate-700 font-semibold text-xs rounded-lg flex items-center gap-2 transition-colors cursor-pointer"
                  >
                    <RefreshCw className={`w-3.5 h-3.5 ${actionLoading ? 'animate-spin' : ''}`} />
                    <span>Atualizar QR Code</span>
                  </button>

                  <button
                    onClick={() => handleGenerateInstance(true)}
                    disabled={actionLoading}
                    className="px-4 py-2 bg-indigo-50 hover:bg-indigo-100 text-indigo-700 font-semibold text-xs rounded-lg flex items-center gap-2 transition-colors cursor-pointer"
                  >
                    <PlusCircle className="w-3.5 h-3.5" />
                    <span>Gerar Outra Instância</span>
                  </button>
                </div>
              </div>
            ) : (
              /* BOTÃO ÚNICO E DIRETO PARA GERAR NOVA INSTÂNCIA */
              <div className="space-y-4 flex flex-col items-center">
                <button
                  onClick={() => handleGenerateInstance(true)}
                  disabled={actionLoading}
                  className="px-6 py-3.5 bg-indigo-600 hover:bg-indigo-700 text-white font-semibold text-xs rounded-xl shadow-lg shadow-indigo-500/20 flex items-center gap-2.5 transition-all cursor-pointer"
                >
                  <PlusCircle className="w-4 h-4" />
                  <span>{actionLoading ? 'Gerando Nova Instância...' : 'Gerar Nova Instância do WhatsApp'}</span>
                </button>
                <span className="text-[11px] text-slate-400">
                  Cria uma instância exclusiva na Evolution API e exibe o QR Code imediatamente
                </span>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Dicas de Segurança e Isolamento Multi-Tenant */}
      <div className="p-5 rounded-2xl bg-indigo-50/60 border border-indigo-100 text-xs text-indigo-950 flex items-start gap-3">
        <ShieldCheck className="w-5 h-5 text-indigo-600 shrink-0 mt-0.5" />
        <div className="space-y-1">
          <span className="font-bold block">Segurança e Isolamento Multi-Tenant</span>
          <p className="text-slate-600 text-[11px] leading-relaxed">
            Cada expert possui uma conexão de WhatsApp 100% individual e isolada. Os contatos e mensagens deste ambiente nunca são compartilhados ou visualizados por outros clientes.
          </p>
        </div>
      </div>
    </div>
  );
}
