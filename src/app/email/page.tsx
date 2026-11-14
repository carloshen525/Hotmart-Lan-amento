'use client';

import { useState, useEffect } from 'react';
import {
  Mail,
  CheckCircle2,
  AlertCircle,
  Clock,
  Send,
  Power,
  RefreshCw,
  ExternalLink,
  ShieldCheck,
  Eye,
  EyeOff,
  Sparkles,
  Server,
  Edit2,
  Check,
  XCircle,
} from 'lucide-react';

interface EmailSettingsState {
  id?: string;
  provider: string;
  smtpHost: string;
  smtpPort: number;
  smtpSecure: boolean;
  smtpUsername: string;
  smtpPassword?: string;
  hasPassword?: boolean;
  fromName: string;
  fromEmail: string;
  replyTo?: string;
}

interface EmailLogItem {
  id: string;
  to: string;
  subject: string;
  status: 'SENT' | 'FAILED';
  provider: string;
  errorMessage?: string;
  createdAt: string;
}

interface ProviderPreset {
  id: string;
  name: string;
  brand: string;
  smtpHost: string;
  smtpPort: number;
  smtpSecure: boolean;
  helpLink?: string;
  helpLabel?: string;
  hint: string;
  color: string;
}

const PROVIDERS: ProviderPreset[] = [
  {
    id: 'GMAIL',
    name: 'Gmail',
    brand: 'Google',
    smtpHost: 'smtp.gmail.com',
    smtpPort: 587,
    smtpSecure: false,
    helpLink: 'https://myaccount.google.com/apppasswords',
    helpLabel: 'Gerar Senha de Aplicativo no Google',
    hint: 'O Google exige uma "Senha de Aplicativo" de 16 caracteres gerada na segurança da sua conta Google (com verificação em 2 etapas ativada).',
    color: '#ea4335',
  },
  {
    id: 'GOOGLE_WORKSPACE',
    name: 'Google Workspace',
    brand: 'Google',
    smtpHost: 'smtp.gmail.com',
    smtpPort: 587,
    smtpSecure: false,
    helpLink: 'https://myaccount.google.com/apppasswords',
    helpLabel: 'Gerar Senha de Aplicativo Workspace',
    hint: 'Gere a Senha de Aplicativo nas configurações de segurança do seu Google Workspace corporativo.',
    color: '#4285f4',
  },
  {
    id: 'OUTLOOK',
    name: 'Outlook / Hotmail',
    brand: 'Microsoft',
    smtpHost: 'smtp-mail.outlook.com',
    smtpPort: 587,
    smtpSecure: false,
    hint: 'Utilize seu e-mail da Microsoft e senha ou senha de aplicativo da conta Microsoft.',
    color: '#0078d4',
  },
  {
    id: 'RESEND',
    name: 'Resend',
    brand: 'Resend',
    smtpHost: 'smtp.resend.com',
    smtpPort: 465,
    smtpSecure: true,
    helpLink: 'https://resend.com/api-keys',
    helpLabel: 'Pegar API Key no Resend',
    hint: 'Utilize usuário "resend" e sua API Key (inicia com re_) como senha.',
    color: '#000000',
  },
  {
    id: 'HOSTINGER',
    name: 'Hostinger',
    brand: 'Hostinger',
    smtpHost: 'smtp.hostinger.com',
    smtpPort: 465,
    smtpSecure: true,
    hint: 'Servidor oficial Hostinger com criptografia SSL porta 465.',
    color: '#673ab7',
  },
  {
    id: 'CUSTOM',
    name: 'Outro Servidor SMTP',
    brand: 'Personalizado',
    smtpHost: '',
    smtpPort: 587,
    smtpSecure: false,
    hint: 'Configure qualquer servidor SMTP corporativo ou de hospedagem (cPanel, Locaweb, Amazon SES, Brevo, etc).',
    color: '#4f46e5',
  },
];

export default function EmailConnectionPage() {
  const [loading, setLoading] = useState(true);
  const [data, setData] = useState<{ configured: boolean; settings: EmailSettingsState | null } | null>(null);
  const [actionLoading, setActionLoading] = useState(false);
  const [actionMessage, setActionMessage] = useState<{ type: 'success' | 'error' | 'info'; text: string } | null>(null);

  // Modo de edição caso já esteja conectado
  const [isEditing, setIsEditing] = useState(false);

  // Formulário de Conexão Rápida
  const [selectedProvider, setSelectedProvider] = useState<string>('GMAIL');
  const [fromName, setFromName] = useState('');
  const [fromEmail, setFromEmail] = useState('');
  const [smtpPassword, setSmtpPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [smtpHost, setSmtpHost] = useState('smtp.gmail.com');
  const [smtpPort, setSmtpPort] = useState(587);
  const [smtpSecure, setSmtpSecure] = useState(false);
  const [smtpUsername, setSmtpUsername] = useState('');
  const [replyTo, setReplyTo] = useState('');

  // Formulário de Teste de Envio Imediato
  const [testEmail, setTestEmail] = useState('');
  const [testSubject, setTestSubject] = useState('Teste de Conexão - LaunchFlow');
  const [testMessage, setTestMessage] = useState('Olá! Este é um e-mail de teste para validar o recebimento imediato via automação LaunchFlow.');
  const [sendingTest, setSendingTest] = useState(false);
  const [testResult, setTestResult] = useState<{ success: boolean; message?: string; error?: string } | null>(null);

  // Histórico de Logs de E-mail
  const [logs, setLogs] = useState<EmailLogItem[]>([]);
  const [loadingLogs, setLoadingLogs] = useState(false);

  // Carrega status da conexão
  const fetchStatus = async () => {
    try {
      const res = await fetch('/api/email/settings');
      const json = await res.json();
      setData(json);

      if (json.configured && json.settings) {
        setFromName(json.settings.fromName || '');
        setFromEmail(json.settings.fromEmail || '');
        setSelectedProvider(json.settings.provider || 'GMAIL');
        setSmtpHost(json.settings.smtpHost || '');
        setSmtpPort(json.settings.smtpPort || 587);
        setSmtpSecure(Boolean(json.settings.smtpSecure));
        setSmtpUsername(json.settings.smtpUsername || '');
        setReplyTo(json.settings.replyTo || '');
      }
    } catch (err: any) {
      console.error('Erro ao buscar status de e-mail:', err);
    } finally {
      setLoading(false);
    }
  };

  // Carrega histórico recente de disparos
  const fetchLogs = async () => {
    setLoadingLogs(true);
    try {
      const res = await fetch('/api/email/logs');
      const json = await res.json();
      if (json.logs) {
        setLogs(json.logs.slice(0, 5));
      }
    } catch {}
    setLoadingLogs(false);
  };

  useEffect(() => {
    fetchStatus();
    fetchLogs();
  }, []);

  // Altera os parâmetros padrão ao selecionar outro provedor
  const handleSelectProvider = (providerId: string) => {
    setSelectedProvider(providerId);
    const preset = PROVIDERS.find((p) => p.id === providerId);
    if (preset) {
      if (preset.id !== 'CUSTOM') {
        setSmtpHost(preset.smtpHost);
        setSmtpPort(preset.smtpPort);
        setSmtpSecure(preset.smtpSecure);
      }
    }
  };

  // Conectar E-mail Rápido com Validação Imediata
  const handleConnect = async (e: React.FormEvent) => {
    e.preventDefault();
    setActionLoading(true);
    setActionMessage(null);

    const preset = PROVIDERS.find((p) => p.id === selectedProvider);
    const host = selectedProvider === 'CUSTOM' ? smtpHost : (preset?.smtpHost || smtpHost);
    const port = selectedProvider === 'CUSTOM' ? Number(smtpPort) : (preset?.smtpPort || smtpPort);
    const secure = selectedProvider === 'CUSTOM' ? smtpSecure : Boolean(preset?.smtpSecure);
    const user = (selectedProvider === 'RESEND' ? (smtpUsername || 'resend') : (smtpUsername || fromEmail)).trim();

    if (!fromEmail || !fromName) {
      setActionMessage({ type: 'error', text: 'Preencha o Nome do Remetente e o seu Endereço de E-mail.' });
      setActionLoading(false);
      return;
    }

    if (!data?.configured && !smtpPassword) {
      setActionMessage({ type: 'error', text: 'Informe a Senha ou Senha de Aplicativo para conectar.' });
      setActionLoading(false);
      return;
    }

    try {
      // Salva as configurações de conexão
      const res = await fetch('/api/email/settings', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          provider: selectedProvider,
          smtpHost: host,
          smtpPort: port,
          smtpSecure: secure,
          smtpUsername: user,
          smtpPassword: smtpPassword || undefined,
          fromName,
          fromEmail,
          replyTo: replyTo || fromEmail,
        }),
      });

      const json = await res.json();

      if (!res.ok || json.error) {
        throw new Error(json.error || 'Falha ao salvar conexão.');
      }

      setActionMessage({
        type: 'success',
        text: 'E-mail conectado com sucesso! Sua conta está autenticada e pronta para disparos.',
      });
      setIsEditing(false);
      await fetchStatus();
      await fetchLogs();
    } catch (err: any) {
      setActionMessage({
        type: 'error',
        text: `Erro ao conectar: ${err.message}`,
      });
    } finally {
      setActionLoading(false);
    }
  };

  // Desconectar E-mail
  const handleDisconnect = async () => {
    if (!confirm('Deseja realmente desconectar esta conta de e-mail? Disparos automáticos por e-mail ficarão suspensos até que uma nova conta seja conectada.')) {
      return;
    }

    setActionLoading(true);
    setActionMessage(null);

    try {
      const res = await fetch('/api/email/settings', { method: 'DELETE' });
      const json = await res.json();

      if (json.success) {
        setActionMessage({
          type: 'info',
          text: 'Conta de e-mail desconectada com sucesso.',
        });
        setSmtpPassword('');
        setIsEditing(false);
        await fetchStatus();
      } else {
        throw new Error(json.error || 'Falha ao desconectar.');
      }
    } catch (err: any) {
      setActionMessage({
        type: 'error',
        text: `Erro ao desconectar: ${err.message}`,
      });
    } finally {
      setActionLoading(false);
    }
  };

  // Envio de Teste Imediato (igual ao da tela de WhatsApp)
  const handleSendTest = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!testEmail) {
      setTestResult({ success: false, error: 'Digite o e-mail de destino para o teste.' });
      return;
    }

    setSendingTest(true);
    setTestResult(null);

    try {
      const res = await fetch('/api/email/send', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          to: testEmail,
          subject: testSubject,
          html: `
            <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 24px; border: 1px solid #e2e8f0; border-radius: 12px; background-color: #ffffff;">
              <h2 style="color: #4f46e5; margin-top: 0;">✔ Teste de Conexão Bem-Sucedido!</h2>
              <p style="color: #334155; font-size: 15px; line-height: 1.5;">${testMessage}</p>
              <div style="margin-top: 24px; padding: 12px; background-color: #f8fafc; border-radius: 8px; font-size: 13px; color: #64748b;">
                <strong>Remetente:</strong> ${data?.settings?.fromName} (${data?.settings?.fromEmail})<br />
                <strong>Data do Envio:</strong> ${new Date().toLocaleString('pt-BR')}
              </div>
            </div>
          `,
          text: testMessage,
        }),
      });

      const json = await res.json();
      if (res.ok && json.success) {
        setTestResult({
          success: true,
          message: `E-mail de teste entregue com sucesso para ${testEmail}! (ID: ${json.messageId || 'ok'})`,
        });
        setTestEmail('');
        fetchLogs();
      } else {
        setTestResult({
          success: false,
          error: json.error || 'Falha ao entregar e-mail de teste.',
        });
      }
    } catch (err: any) {
      setTestResult({
        success: false,
        error: err.message || 'Erro de comunicação ao disparar teste.',
      });
    } finally {
      setSendingTest(false);
    }
  };

  const activePreset = PROVIDERS.find((p) => p.id === (data?.settings?.provider || selectedProvider));

  return (
    <div className="space-y-8 max-w-5xl mx-auto">
      {/* Cabeçalho */}
      <div>
        <h1 className="text-2xl font-bold text-slate-900 tracking-tight">Conexão de E-mail</h1>
        <p className="text-sm text-slate-500 mt-1">
          Gerencie a conta de e-mail exclusiva deste expert para disparos automáticos, confirmações e recuperação de vendas.
        </p>
      </div>

      {/* Banner de Mensagens de Ação */}
      {actionMessage && (
        <div
          className={`p-3.5 rounded-xl text-xs font-medium flex items-center gap-2.5 transition-all ${
            actionMessage.type === 'success'
              ? 'bg-emerald-50 text-emerald-900 border border-emerald-200'
              : actionMessage.type === 'error'
              ? 'bg-rose-50 text-rose-900 border border-rose-200'
              : 'bg-indigo-50 text-indigo-900 border border-indigo-200'
          }`}
        >
          {actionMessage.type === 'success' ? (
            <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
          ) : actionMessage.type === 'error' ? (
            <AlertCircle className="w-4 h-4 text-rose-600 shrink-0" />
          ) : (
            <AlertCircle className="w-4 h-4 text-indigo-600 shrink-0" />
          )}
          <span>{actionMessage.text}</span>
        </div>
      )}

      {/* Cartão Principal de Status */}
      <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-6 sm:p-8">
        {loading ? (
          <div className="py-12 text-center text-slate-400 text-xs flex flex-col items-center justify-center gap-2">
            <RefreshCw className="w-5 h-5 animate-spin text-indigo-600" />
            <span>Verificando status do e-mail...</span>
          </div>
        ) : data?.configured && !isEditing ? (
          /* ============================================================ */
          /* ESTADO 1: E-MAIL CONECTADO                                   */
          /* ============================================================ */
          <div className="space-y-6">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-6 border-b border-slate-100">
              <div className="flex items-center gap-4">
                <div className="w-14 h-14 rounded-2xl bg-emerald-100 text-emerald-600 flex items-center justify-center font-bold text-xl shadow-inner">
                  <CheckCircle2 className="w-8 h-8" />
                </div>
                <div>
                  <div className="flex items-center gap-2">
                    <span className="w-2.5 h-2.5 rounded-full bg-emerald-500 animate-pulse"></span>
                    <span className="font-bold text-emerald-700 text-base">E-mail Conectado</span>
                  </div>
                  <div className="text-xs text-slate-500 mt-0.5">
                    Sua conta está autenticada e pronta para enviar automações e mensagens
                  </div>
                </div>
              </div>

              <div className="flex items-center gap-2">
                <button
                  onClick={() => setIsEditing(true)}
                  disabled={actionLoading}
                  className="px-3.5 py-2 rounded-lg border border-slate-200 text-slate-700 hover:bg-slate-50 font-semibold text-xs flex items-center gap-1.5 transition-colors cursor-pointer"
                >
                  <Edit2 className="w-3.5 h-3.5" />
                  <span>Alterar Dados</span>
                </button>

                <button
                  onClick={handleDisconnect}
                  disabled={actionLoading}
                  className="px-3.5 py-2 rounded-lg bg-red-50 hover:bg-red-100 text-red-600 font-semibold text-xs flex items-center gap-1.5 transition-colors cursor-pointer"
                >
                  <Power className="w-3.5 h-3.5" />
                  <span>Desconectar</span>
                </button>
              </div>
            </div>

            {/* Informações da Conexão em Grid (igual ao WhatsApp) */}
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 text-xs">
              <div className="p-4 rounded-xl bg-slate-50 border border-slate-100">
                <span className="text-[10px] text-slate-400 uppercase font-bold block mb-1">
                  E-mail Remetente
                </span>
                <span className="font-bold text-slate-900 text-sm truncate block" title={data.settings?.fromEmail}>
                  {data.settings?.fromEmail || 'Não informado'}
                </span>
              </div>

              <div className="p-4 rounded-xl bg-slate-50 border border-slate-100">
                <span className="text-[10px] text-slate-400 uppercase font-bold block mb-1">
                  Nome de Exibição
                </span>
                <span className="font-bold text-slate-900 text-sm truncate block" title={data.settings?.fromName}>
                  {data.settings?.fromName || 'LaunchFlow'}
                </span>
              </div>

              <div className="p-4 rounded-xl bg-slate-50 border border-slate-100">
                <span className="text-[10px] text-slate-400 uppercase font-bold block mb-1">
                  Provedor & Status
                </span>
                <span className="font-bold text-emerald-600 text-sm flex items-center gap-1.5">
                  <ShieldCheck className="w-4 h-4 text-emerald-500" />
                  <span>{activePreset?.name || data.settings?.provider || 'SMTP'} (Ativo)</span>
                </span>
              </div>
            </div>

            {/* Disparo de Teste Imediato (igual ao WhatsApp) */}
            <div className="pt-6 border-t border-slate-100">
              <h3 className="font-bold text-slate-900 text-sm mb-1">Envio de Teste Imediato</h3>
              <p className="text-xs text-slate-500 mb-4">
                Envie um e-mail de teste para a sua própria caixa de entrada e valide a entrega instantânea.
              </p>

              <form onSubmit={handleSendTest} className="space-y-3 text-xs max-w-xl">
                <div>
                  <label className="block text-slate-700 font-semibold mb-1">Seu E-mail de Teste</label>
                  <input
                    type="email"
                    required
                    placeholder="exemplo@gmail.com"
                    value={testEmail}
                    onChange={(e) => setTestEmail(e.target.value)}
                    className="w-full p-2.5 border border-slate-200 rounded-lg text-xs focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 outline-none"
                  />
                </div>

                <div>
                  <label className="block text-slate-700 font-semibold mb-1">Assunto do E-mail</label>
                  <input
                    type="text"
                    required
                    value={testSubject}
                    onChange={(e) => setTestSubject(e.target.value)}
                    className="w-full p-2.5 border border-slate-200 rounded-lg text-xs focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 outline-none"
                  />
                </div>

                <div>
                  <label className="block text-slate-700 font-semibold mb-1">Mensagem</label>
                  <textarea
                    rows={3}
                    required
                    value={testMessage}
                    onChange={(e) => setTestMessage(e.target.value)}
                    className="w-full p-2.5 border border-slate-200 rounded-lg text-xs focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 outline-none"
                  />
                </div>

                {testResult && (
                  <div
                    className={`p-3 rounded-lg text-xs font-semibold ${
                      testResult.success
                        ? 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                        : 'bg-red-50 text-red-700 border border-red-200'
                    }`}
                  >
                    {testResult.success
                      ? `✔ ${testResult.message}`
                      : `Erro no envio: ${testResult.error}`}
                  </div>
                )}

                <button
                  type="submit"
                  disabled={sendingTest}
                  className="px-5 py-2.5 bg-indigo-600 hover:bg-indigo-700 text-white font-semibold rounded-lg transition-colors flex items-center gap-2 shadow-sm cursor-pointer disabled:opacity-50"
                >
                  <Send className="w-3.5 h-3.5" />
                  <span>{sendingTest ? 'Enviando e-mail de teste...' : 'Enviar E-mail Agora'}</span>
                </button>
              </form>
            </div>

            {/* Últimos Disparos de E-mail */}
            {logs.length > 0 && (
              <div className="pt-6 border-t border-slate-100">
                <h3 className="font-bold text-slate-900 text-sm mb-2">Últimos E-mails Disparados</h3>
                <div className="space-y-2">
                  {logs.map((log) => (
                    <div
                      key={log.id}
                      className="p-3 rounded-xl bg-slate-50 border border-slate-100 flex items-center justify-between text-xs"
                    >
                      <div className="flex items-center gap-3">
                        <div
                          className={`w-7 h-7 rounded-lg flex items-center justify-center font-bold ${
                            log.status === 'SENT'
                              ? 'bg-emerald-100 text-emerald-700'
                              : 'bg-rose-100 text-rose-700'
                          }`}
                        >
                          {log.status === 'SENT' ? (
                            <CheckCircle2 className="w-4 h-4" />
                          ) : (
                            <XCircle className="w-4 h-4" />
                          )}
                        </div>
                        <div>
                          <span className="font-semibold text-slate-800 block">{log.subject}</span>
                          <span className="text-[11px] text-slate-400">Para: {log.to}</span>
                        </div>
                      </div>
                      <div className="text-right">
                        <span
                          className={`px-2 py-0.5 rounded text-[10px] font-bold ${
                            log.status === 'SENT'
                              ? 'bg-emerald-100 text-emerald-700'
                              : 'bg-rose-100 text-rose-700'
                          }`}
                        >
                          {log.status === 'SENT' ? 'Enviado' : 'Falhou'}
                        </span>
                        <span className="text-[10px] text-slate-400 block mt-0.5">
                          {new Date(log.createdAt).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}
                        </span>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        ) : (
          /* ============================================================ */
          /* ESTADO 2: E-MAIL DESCONECTADO (CONEXÃO RÁPIDA EM 1 CLIQUE)   */
          /* ============================================================ */
          <div className="space-y-6">
            <div className="flex flex-col items-center justify-center text-center py-4">
              <div className="w-16 h-16 rounded-3xl bg-indigo-50 text-indigo-600 flex items-center justify-center mb-4 shadow-sm">
                <Mail className="w-8 h-8" />
              </div>

              <h2 className="text-lg font-bold text-slate-900 mb-1">
                {isEditing ? 'Atualizar Conexão de E-mail' : 'Conexão Rápida de E-mail'}
              </h2>
              <p className="text-xs text-slate-500 max-w-md mb-6">
                Conecte seu e-mail em menos de 1 minuto para disparar automações de boas-vindas, confirmação e recuperação de vendas.
              </p>

              {isEditing && (
                <button
                  type="button"
                  onClick={() => setIsEditing(false)}
                  className="mb-4 text-xs font-semibold text-slate-500 hover:text-slate-800 underline"
                >
                  Cancelar Edição e Voltar ao Status Conectado
                </button>
              )}
            </div>

            {/* Seletor de Provedor Rápido */}
            <div>
              <label className="block text-xs font-bold uppercase text-slate-400 tracking-wider mb-2">
                1. Escolha o seu Provedor
              </label>
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                {PROVIDERS.map((p) => {
                  const isSelected = selectedProvider === p.id;
                  return (
                    <button
                      key={p.id}
                      type="button"
                      onClick={() => handleSelectProvider(p.id)}
                      className={`p-3.5 rounded-xl border text-left transition-all cursor-pointer flex flex-col justify-between ${
                        isSelected
                          ? 'border-indigo-600 bg-indigo-50/50 ring-2 ring-indigo-600/20 shadow-sm'
                          : 'border-slate-200 hover:border-slate-300 hover:bg-slate-50/50'
                      }`}
                    >
                      <div className="flex items-center justify-between mb-1.5">
                        <span className="font-bold text-xs text-slate-900">{p.name}</span>
                        {isSelected && <Check className="w-3.5 h-3.5 text-indigo-600" />}
                      </div>
                      <span className="text-[11px] text-slate-400">{p.brand}</span>
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Dica Contextual do Provedor Selecionado */}
            {activePreset && (
              <div className="p-3.5 rounded-xl bg-slate-50 border border-slate-200/80 text-xs text-slate-600 space-y-1.5">
                <div className="flex items-center justify-between">
                  <span className="font-semibold text-slate-800 flex items-center gap-1.5">
                    <Sparkles className="w-3.5 h-3.5 text-indigo-600" />
                    Como conectar o {activePreset.name}:
                  </span>
                  {activePreset.helpLink && (
                    <a
                      href={activePreset.helpLink}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-indigo-600 hover:text-indigo-700 font-semibold flex items-center gap-1 text-[11px]"
                    >
                      <span>{activePreset.helpLabel || 'Ajuda'}</span>
                      <ExternalLink className="w-3 h-3" />
                    </a>
                  )}
                </div>
                <p className="text-[11px] text-slate-500 leading-relaxed">{activePreset.hint}</p>
              </div>
            )}

            {/* Formulário de Conexão */}
            <form onSubmit={handleConnect} className="space-y-4 pt-2">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-xs">
                <div>
                  <label className="block text-slate-700 font-semibold mb-1">
                    Nome do Remetente *
                  </label>
                  <input
                    type="text"
                    required
                    placeholder="Ex: Carlos | Lançamento"
                    value={fromName}
                    onChange={(e) => setFromName(e.target.value)}
                    className="w-full p-2.5 border border-slate-200 rounded-lg text-xs focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 outline-none"
                  />
                  <span className="text-[10px] text-slate-400 mt-0.5 block">Nome visível para quem recebe o e-mail</span>
                </div>

                <div>
                  <label className="block text-slate-700 font-semibold mb-1">
                    Seu Endereço de E-mail *
                  </label>
                  <input
                    type="email"
                    required
                    placeholder="exemplo@gmail.com"
                    value={fromEmail}
                    onChange={(e) => setFromEmail(e.target.value)}
                    className="w-full p-2.5 border border-slate-200 rounded-lg text-xs focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 outline-none"
                  />
                  <span className="text-[10px] text-slate-400 mt-0.5 block">E-mail que efetuará os disparos</span>
                </div>
              </div>

              {/* Campo de Senha / Senha de Aplicativo */}
              <div className="text-xs">
                <label className="block text-slate-700 font-semibold mb-1">
                  {selectedProvider === 'GMAIL' || selectedProvider === 'GOOGLE_WORKSPACE'
                    ? 'Senha de Aplicativo (16 letras) *'
                    : selectedProvider === 'RESEND'
                    ? 'API Key do Resend (inicia com re_) *'
                    : 'Senha do E-mail / SMTP *'}
                </label>
                <div className="relative">
                  <input
                    type={showPassword ? 'text' : 'password'}
                    required={!data?.configured}
                    placeholder={
                      data?.configured
                        ? '•••••••••••••••• (deixe em branco para manter a atual)'
                        : selectedProvider === 'GMAIL'
                        ? 'xxxx xxxx xxxx xxxx'
                        : 'Sua senha'
                    }
                    value={smtpPassword}
                    onChange={(e) => setSmtpPassword(e.target.value)}
                    className="w-full p-2.5 pr-10 border border-slate-200 rounded-lg text-xs focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 outline-none font-mono"
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword(!showPassword)}
                    className="absolute right-3 top-2.5 text-slate-400 hover:text-slate-600"
                  >
                    {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </button>
                </div>
              </div>

              {/* Campos Avançados para Servidor Personalizado */}
              {selectedProvider === 'CUSTOM' && (
                <div className="p-4 rounded-xl bg-slate-50 border border-slate-200 space-y-3 text-xs">
                  <div className="font-semibold text-slate-800 flex items-center gap-1.5">
                    <Server className="w-3.5 h-3.5 text-indigo-600" />
                    <span>Configurações do Servidor SMTP</span>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                    <div className="sm:col-span-2">
                      <label className="block text-slate-600 font-medium mb-1">Host SMTP</label>
                      <input
                        type="text"
                        placeholder="smtp.meudominio.com"
                        value={smtpHost}
                        onChange={(e) => setSmtpHost(e.target.value)}
                        className="w-full p-2 border border-slate-200 rounded text-xs bg-white"
                      />
                    </div>
                    <div>
                      <label className="block text-slate-600 font-medium mb-1">Porta</label>
                      <input
                        type="number"
                        placeholder="587"
                        value={smtpPort}
                        onChange={(e) => setSmtpPort(Number(e.target.value))}
                        className="w-full p-2 border border-slate-200 rounded text-xs bg-white"
                      />
                    </div>
                  </div>

                  <div className="flex items-center gap-2 pt-1">
                    <input
                      type="checkbox"
                      id="smtpSecure"
                      checked={smtpSecure}
                      onChange={(e) => setSmtpSecure(e.target.checked)}
                      className="rounded border-slate-300 text-indigo-600"
                    />
                    <label htmlFor="smtpSecure" className="text-slate-600 text-xs">
                      Usar conexão SSL/TLS segura (obrigatório para porta 465)
                    </label>
                  </div>
                </div>
              )}

              {/* Botão de Conexão Rápida */}
              <div className="pt-2">
                <button
                  type="submit"
                  disabled={actionLoading}
                  className="w-full sm:w-auto px-8 py-3 bg-indigo-600 hover:bg-indigo-700 text-white font-bold text-xs rounded-xl shadow-md shadow-indigo-600/20 transition-all flex items-center justify-center gap-2 cursor-pointer disabled:opacity-50"
                >
                  {actionLoading ? (
                    <>
                      <RefreshCw className="w-4 h-4 animate-spin" />
                      <span>Conectando e Validando...</span>
                    </>
                  ) : (
                    <>
                      <Check className="w-4 h-4" />
                      <span>Conectar E-mail Agora</span>
                    </>
                  )}
                </button>
              </div>
            </form>
          </div>
        )}
      </div>

      {/* Dicas de Segurança & Anti-Spam (semelhante ao WhatsApp) */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-xs">
        <div className="p-4 rounded-xl bg-white border border-slate-200 flex items-start gap-3">
          <div className="w-8 h-8 rounded-lg bg-emerald-50 text-emerald-600 flex items-center justify-center shrink-0">
            <ShieldCheck className="w-4 h-4" />
          </div>
          <div>
            <span className="font-bold text-slate-900 block mb-0.5">Segurança & Criptografia</span>
            <span className="text-slate-500 text-[11px] leading-relaxed">
              Suas credenciais são criptografadas com chave AES-256 e protegidas com isolamento estrito entre experts.
            </span>
          </div>
        </div>

        <div className="p-4 rounded-xl bg-white border border-slate-200 flex items-start gap-3">
          <div className="w-8 h-8 rounded-lg bg-indigo-50 text-indigo-600 flex items-center justify-center shrink-0">
            <Sparkles className="w-4 h-4" />
          </div>
          <div>
            <span className="font-bold text-slate-900 block mb-0.5">Entregabilidade Anti-Spam</span>
            <span className="text-slate-500 text-[11px] leading-relaxed">
              Cabeçalhos automáticos anti-spam, tags de rastreamento de IDs e suporte total a Gmail, Outlook e Apple Mail.
            </span>
          </div>
        </div>
      </div>
    </div>
  );
}
