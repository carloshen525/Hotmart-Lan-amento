'use client';

import { useState, useEffect } from 'react';
import {
  Mail,
  Server,
  Lock,
  Send,
  CheckCircle2,
  AlertCircle,
  Clock,
  Eye,
  EyeOff,
  Save,
  RotateCw,
  ShieldCheck,
  ExternalLink,
  Sparkles,
  ChevronDown,
  ChevronUp,
  Settings,
  HelpCircle,
  Check,
  Globe,
} from 'lucide-react';
import Link from 'next/link';

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
  replyTo: string;
}

interface EmailLogItem {
  id: string;
  to: string;
  subject: string;
  status: 'SENT' | 'FAILED';
  provider: string;
  errorMessage?: string;
  messageId?: string;
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
  helpLinkLabel: string;
  helpHint: string;
  userHint: string;
  badge?: string;
  color: string;
}

const PROVIDER_PRESETS: ProviderPreset[] = [
  {
    id: 'GMAIL',
    name: 'Gmail',
    brand: 'Google',
    smtpHost: 'smtp.gmail.com',
    smtpPort: 587,
    smtpSecure: false,
    helpLink: 'https://myaccount.google.com/apppasswords',
    helpLinkLabel: 'Clique aqui para gerar sua Senha SMTP (Senha de Aplicativo)',
    helpHint:
      'O Google exige uma "Senha de Aplicativo" de 16 caracteres gerada na segurança da sua conta Google (com a verificação em 2 etapas ativada). Não utilize sua senha pessoal de login.',
    userHint: 'Normalmente é o seu endereço de e-mail @gmail.com.',
    badge: 'Popular',
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
    helpLinkLabel: 'Clique aqui para gerar sua Senha de Aplicativo no Google Workspace',
    helpHint:
      'Gere uma Senha de Aplicativo nas configurações de segurança da sua conta Google Workspace corporativa.',
    userHint: 'Seu e-mail corporativo completo (ex: contato@suaempresa.com.br).',
    badge: 'Empresarial',
    color: '#4285f4',
  },
  {
    id: 'OUTLOOK',
    name: 'Outlook / Hotmail',
    brand: 'Microsoft',
    smtpHost: 'smtp-mail.outlook.com',
    smtpPort: 587,
    smtpSecure: false,
    helpLink: 'https://account.live.com/proofs/manage/additional',
    helpLinkLabel: 'Clique aqui para configurar sua Senha SMTP',
    helpHint:
      'Nas opções de segurança adicionais da Microsoft, crie uma Senha de Aplicativo para autorizar envios SMTP.',
    userHint: 'Normalmente é o seu endereço @outlook.com ou @hotmail.com.',
    color: '#0078d4',
  },
  {
    id: 'M365',
    name: 'Microsoft 365',
    brand: 'Microsoft',
    smtpHost: 'smtp.office365.com',
    smtpPort: 587,
    smtpSecure: false,
    helpLink: 'https://mysignins.microsoft.com/security-info',
    helpLinkLabel: 'Clique aqui para configurar sua Senha SMTP',
    helpHint:
      'Nas informações de segurança do Microsoft 365, crie uma Senha de Aplicativo e certifique-se de que o "SMTP AUTH" está ativo para seu usuário.',
    userHint: 'Seu e-mail profissional Microsoft 365.',
    color: '#d83b01',
  },
  {
    id: 'YAHOO',
    name: 'Yahoo Mail',
    brand: 'Yahoo',
    smtpHost: 'smtp.mail.yahoo.com',
    smtpPort: 465,
    smtpSecure: true,
    helpLink: 'https://login.yahoo.com/account/security',
    helpLinkLabel: 'Clique aqui para gerar sua Senha SMTP',
    helpHint:
      'Na página de segurança da conta Yahoo, acesse "Gerar senha do aplicativo" para liberar disparos SMTP.',
    userHint: 'Seu endereço de e-mail completo do Yahoo.',
    color: '#6001d2',
  },
  {
    id: 'ZOHO',
    name: 'Zoho Mail',
    brand: 'Zoho',
    smtpHost: 'smtp.zoho.com',
    smtpPort: 465,
    smtpSecure: true,
    helpLink: 'https://mail.zoho.com/cws/index.do#settings/mailaccounts',
    helpLinkLabel: 'Clique aqui para gerar sua Senha SMTP',
    helpHint:
      'No Zoho Mail, acesse Configurações → Contas de E-mail → Segurança → Senha de Aplicativo.',
    userHint: 'Seu endereço de e-mail cadastrado no Zoho.',
    color: '#009688',
  },
  {
    id: 'ICLOUD',
    name: 'iCloud Mail',
    brand: 'Apple',
    smtpHost: 'smtp.mail.me.com',
    smtpPort: 587,
    smtpSecure: false,
    helpLink: 'https://appleid.apple.com/account/manage',
    helpLinkLabel: 'Clique aqui para gerar sua Senha de Aplicativo no iCloud',
    helpHint:
      'No ID Apple, acesse a seção "Senhas específicas de apps" e gere uma nova senha para o sistema.',
    userHint: 'Seu e-mail @icloud.com ou @me.com.',
    color: '#999999',
  },
  {
    id: 'HOSTINGER',
    name: 'Hostinger',
    brand: 'Hostinger',
    smtpHost: 'smtp.hostinger.com',
    smtpPort: 465,
    smtpSecure: true,
    helpLink:
      'https://support.hostinger.com/en/articles/1583226-how-to-set-up-hostinger-email-on-devices-and-email-clients',
    helpLinkLabel: 'Clique aqui para localizar sua configuração SMTP',
    helpHint:
      'Utilize a mesma senha da sua caixa postal criada no painel hPanel da Hostinger.',
    userHint: 'Normalmente é o mesmo endereço de e-mail informado acima.',
    color: '#673ab7',
  },
  {
    id: 'TITAN',
    name: 'Titan Email',
    brand: 'Titan',
    smtpHost: 'smtp.titan.email',
    smtpPort: 465,
    smtpSecure: true,
    helpLink:
      'https://support.titan.email/hc/en-us/articles/360038337774-Set-up-Titan-on-email-apps-using-IMAP-POP-and-SMTP',
    helpLinkLabel: 'Clique aqui para localizar sua configuração SMTP',
    helpHint:
      'Utilize as credenciais do seu webmail Titan Email configurado em seu domínio.',
    userHint: 'Normalmente é o mesmo endereço de e-mail informado acima.',
    color: '#00838f',
  },
  {
    id: 'LOCAWEB',
    name: 'Locaweb',
    brand: 'Locaweb',
    smtpHost: 'email-ssl.com.br',
    smtpPort: 465,
    smtpSecure: true,
    helpLink: 'https://ajuda.locaweb.com.br/wiki/configuracoes-de-email/',
    helpLinkLabel: 'Clique aqui para localizar sua configuração SMTP',
    helpHint:
      'Na Locaweb, o servidor seguro SSL utiliza o host email-ssl.com.br na porta 465 com a senha da caixa postal.',
    userHint: 'Normalmente é o mesmo endereço de e-mail informado acima.',
    color: '#e53935',
  },
  {
    id: 'KINGHOST',
    name: 'KingHost',
    brand: 'KingHost',
    smtpHost: 'smtps.kinghost.net',
    smtpPort: 465,
    smtpSecure: true,
    helpLink: 'https://king.host/wiki/artigo/configuracoes-de-email/',
    helpLinkLabel: 'Clique aqui para localizar sua configuração SMTP',
    helpHint:
      'Na KingHost, o host seguro é smtps.kinghost.net na porta 465 com SSL ativo.',
    userHint: 'Normalmente é o mesmo endereço de e-mail informado acima.',
    color: '#f57c00',
  },
  {
    id: 'CUSTOM',
    name: 'Personalizado',
    brand: 'Outro',
    smtpHost: '',
    smtpPort: 587,
    smtpSecure: false,
    helpLinkLabel: 'Consulte seu provedor de e-mail para obter as configurações SMTP.',
    helpHint:
      'Preencha manualmente o Servidor SMTP (Host), Porta e Tipo de Segurança fornecidos pela sua hospedagem ou equipe de TI.',
    userHint: 'Informe o usuário fornecido pelo seu provedor SMTP.',
    color: '#475569',
  },
];

export default function EmailSettingsPage() {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [testing, setTesting] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [showAdvanced, setShowAdvanced] = useState(false);

  // Provedor selecionado no assistente
  const [selectedProviderId, setSelectedProviderId] = useState<string>('GMAIL');

  // Formulário
  const [form, setForm] = useState<EmailSettingsState>({
    provider: 'GMAIL',
    smtpHost: 'smtp.gmail.com',
    smtpPort: 587,
    smtpSecure: false,
    smtpUsername: '',
    smtpPassword: '',
    fromName: '',
    fromEmail: '',
    replyTo: '',
  });

  // Teste de conexão
  const [testEmail, setTestEmail] = useState('');
  const [testFeedback, setTestFeedback] = useState<{
    success: boolean;
    message: string;
  } | null>(null);

  // Feedback de salvamento
  const [saveNotice, setSaveNotice] = useState<{
    success: boolean;
    message: string;
  } | null>(null);

  // Logs recentes
  const [logs, setLogs] = useState<EmailLogItem[]>([]);
  const [loadingLogs, setLoadingLogs] = useState(false);

  // Fila de e-mails (Email Queue)
  const [activeBottomTab, setActiveBottomTab] = useState<'queue' | 'logs'>('queue');
  const [queueStats, setQueueStats] = useState({
    pending: 0,
    processing: 0,
    sent: 0,
    failed: 0,
    total: 0,
  });
  const [queueItems, setQueueItems] = useState<any[]>([]);
  const [loadingQueue, setLoadingQueue] = useState(false);
  const [processingQueue, setProcessingQueue] = useState(false);

  // Encontra preset ativo
  const activePreset =
    PROVIDER_PRESETS.find((p) => p.id === selectedProviderId) ||
    PROVIDER_PRESETS[PROVIDER_PRESETS.length - 1];

  // Identifica automaticamente o provedor a partir do host salvo
  const detectProviderFromHost = (host: string): string => {
    if (!host) return 'GMAIL';
    const lower = host.toLowerCase();
    if (lower.includes('gmail') || lower.includes('google')) return 'GMAIL';
    if (lower.includes('office365')) return 'M365';
    if (lower.includes('outlook') || lower.includes('live')) return 'OUTLOOK';
    if (lower.includes('yahoo')) return 'YAHOO';
    if (lower.includes('zoho')) return 'ZOHO';
    if (lower.includes('icloud') || lower.includes('mail.me')) return 'ICLOUD';
    if (lower.includes('hostinger')) return 'HOSTINGER';
    if (lower.includes('titan')) return 'TITAN';
    if (lower.includes('locaweb') || lower.includes('email-ssl.com.br')) return 'LOCAWEB';
    if (lower.includes('kinghost')) return 'KINGHOST';
    return 'CUSTOM';
  };

  const fetchSettings = async (silent = false) => {
    if (!silent) setLoading(true);
    try {
      const res = await fetch('/api/email/settings');
      const data = await res.json();
      if (res.ok && data.settings) {
        const detectedProvider =
          data.settings.provider && data.settings.provider !== 'SMTP'
            ? data.settings.provider
            : detectProviderFromHost(data.settings.smtpHost);

        setSelectedProviderId(detectedProvider);

        setForm((prev) => ({
          provider: detectedProvider,
          smtpHost: data.settings.smtpHost || prev.smtpHost,
          smtpPort: data.settings.smtpPort || prev.smtpPort || 587,
          smtpSecure: Boolean(data.settings.smtpSecure),
          smtpUsername: data.settings.smtpUsername || prev.smtpUsername,
          smtpPassword: prev.smtpPassword || '',
          hasPassword: Boolean(data.settings.hasPassword),
          fromName: data.settings.fromName || prev.fromName,
          fromEmail: data.settings.fromEmail || prev.fromEmail,
          replyTo: data.settings.replyTo || prev.replyTo,
        }));

        if (data.settings.fromEmail && !testEmail) {
          setTestEmail(data.settings.fromEmail);
        }
      }
    } catch {
      // Ignora erro inicial
    } finally {
      if (!silent) setLoading(false);
    }
  };

  const fetchLogs = async () => {
    setLoadingLogs(true);
    try {
      const res = await fetch('/api/email/logs');
      const data = await res.json();
      if (res.ok && data.logs) {
        setLogs(data.logs);
      }
    } catch {
      // Ignora erro
    } finally {
      setLoadingLogs(false);
    }
  };

  const fetchQueue = async () => {
    setLoadingQueue(true);
    try {
      const res = await fetch('/api/email/queue');
      const data = await res.json();
      if (res.ok) {
        if (data.stats) setQueueStats(data.stats);
        if (data.queue) setQueueItems(data.queue);
      }
    } catch {
      // Ignora erro
    } finally {
      setLoadingQueue(false);
    }
  };

  const handleProcessQueue = async () => {
    setProcessingQueue(true);
    try {
      const res = await fetch('/api/email/queue', { method: 'POST' });
      const data = await res.json();
      if (res.ok) {
        fetchQueue();
        fetchLogs();
      }
    } catch {
    } finally {
      setProcessingQueue(false);
    }
  };

  useEffect(() => {
    fetchSettings(false);
    fetchLogs();
    fetchQueue();
  }, []);

  // Quando o usuário escolhe um provedor diferente no assistente inteligente
  const handleSelectProvider = (preset: ProviderPreset) => {
    setSelectedProviderId(preset.id);
    setForm((prev) => ({
      ...prev,
      provider: preset.id,
      smtpHost: preset.smtpHost || (preset.id === 'CUSTOM' ? prev.smtpHost : ''),
      smtpPort: preset.smtpPort,
      smtpSecure: preset.smtpSecure,
    }));
  };

  // Quando o usuário digita o e-mail de envio, sincroniza automaticamente com o Usuário SMTP
  const handleEmailChange = (newEmail: string) => {
    setForm((prev) => {
      // Se o usuário ainda não editou manualmente o username ou se é idêntico ao e-mail anterior, atualiza junto
      const shouldSyncUsername =
        !prev.smtpUsername || prev.smtpUsername === prev.fromEmail;

      return {
        ...prev,
        fromEmail: newEmail,
        smtpUsername: shouldSyncUsername ? newEmail : prev.smtpUsername,
      };
    });

    if (!testEmail) {
      setTestEmail(newEmail);
    }
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    setSaveNotice(null);

    try {
      const res = await fetch('/api/email/settings', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(form),
      });
      const data = await res.json();

      if (res.ok && data.success) {
        setSaveNotice({
          success: true,
          message:
            'Configurações de e-mail salvas com sucesso! A senha foi criptografada e está ativa no sistema.',
        });
        fetchSettings(true);
      } else {
        setSaveNotice({
          success: false,
          message: data.error || 'Erro ao salvar configurações.',
        });
      }
    } catch (err: any) {
      setSaveNotice({
        success: false,
        message: err.message || 'Falha na comunicação com o servidor.',
      });
    } finally {
      setSaving(false);
    }
  };

  const handleTestConnection = async () => {
    const destEmail = testEmail.trim() || form.fromEmail.trim();
    if (!destEmail) {
      alert('Informe um e-mail de destino para enviar a mensagem de teste.');
      return;
    }

    if (!form.fromEmail.trim()) {
      alert('Informe o e-mail que será utilizado para enviar as mensagens.');
      return;
    }

    if (!form.smtpPassword && !form.hasPassword) {
      setTestFeedback({
        success: false,
        message:
          'Informe a Senha SMTP no formulário (no caso do Gmail/Workspace, uma "Senha de Aplicativo") antes de testar.',
      });
      return;
    }

    setTesting(true);
    setTestFeedback(null);

    try {
      const res = await fetch('/api/email/test', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          testEmail: destEmail,
          provider: form.provider,
          smtpHost: form.smtpHost,
          smtpPort: form.smtpPort,
          smtpSecure: form.smtpSecure,
          smtpUsername: form.smtpUsername,
          smtpPassword: form.smtpPassword,
          fromName: form.fromName || 'LaunchFlow',
          fromEmail: form.fromEmail,
          replyTo: form.replyTo,
        }),
      });
      const data = await res.json();

      if (res.ok && data.success) {
        setTestFeedback({
          success: true,
          message:
            data.message ||
            'Configuração realizada com sucesso! As credenciais foram gravadas e o e-mail de teste foi entregue.',
        });
        fetchSettings(true);
        fetchLogs();
      } else {
        setTestFeedback({
          success: false,
          message: data.error || 'Não foi possível conectar ao servidor SMTP.',
        });
        fetchLogs();
      }
    } catch (err: any) {
      setTestFeedback({
        success: false,
        message: err.message || 'Falha ao conectar ao servidor SMTP.',
      });
    } finally {
      setTesting(false);
    }
  };

  return (
    <div className="space-y-6 max-w-7xl mx-auto pb-16">
      {/* Topo / Breadcrumbs */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2 text-xs text-slate-500 mb-1">
            <Link href="/settings" className="hover:text-indigo-600 transition-colors">
              Configurações
            </Link>
            <span>/</span>
            <span className="text-slate-800 font-medium">E-mail</span>
          </div>
          <h1 className="text-2xl font-bold text-slate-900 tracking-tight flex items-center gap-2">
            Assistente de Configuração de E-mail (SMTP)
          </h1>
          <p className="text-sm text-slate-500 mt-0.5">
            Configure o disparo de e-mails do seu lançamento em poucos minutos. Cada expert possui
            seu próprio servidor isolado.
          </p>
        </div>

        <div className="flex items-center gap-2">
          <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-semibold bg-emerald-50 text-emerald-700 border border-emerald-200 shadow-sm">
            <ShieldCheck className="w-4 h-4 text-emerald-600" />
            <span>Criptografia AES-256 Ativa</span>
          </div>
        </div>
      </div>

      {saveNotice && (
        <div
          className={`p-4 rounded-xl border flex items-center justify-between text-sm animate-in fade-in duration-200 ${
            saveNotice.success
              ? 'bg-emerald-50 text-emerald-800 border-emerald-200'
              : 'bg-red-50 text-red-800 border-red-200'
          }`}
        >
          <div className="flex items-center gap-2">
            {saveNotice.success ? (
              <CheckCircle2 className="w-5 h-5 text-emerald-600 shrink-0" />
            ) : (
              <AlertCircle className="w-5 h-5 text-red-600 shrink-0" />
            )}
            <span className="font-medium">{saveNotice.message}</span>
          </div>
          <button
            onClick={() => setSaveNotice(null)}
            className="text-xs font-semibold opacity-70 hover:opacity-100"
          >
            Fechar
          </button>
        </div>
      )}

      {loading ? (
        <div className="p-16 text-center text-slate-400 bg-white rounded-2xl border border-slate-200">
          <RotateCw className="w-7 h-7 animate-spin mx-auto mb-3 text-indigo-600" />
          <p className="text-sm font-semibold text-slate-700">Carregando assistente SMTP...</p>
          <p className="text-xs text-slate-400 mt-1">Buscando configurações salvas do expert</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
          {/* Formulário Principal com o Assistente */}
          <div className="lg:col-span-2 space-y-6">
            <form
              onSubmit={handleSave}
              className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden"
            >
              {/* Cabeçalho do Card */}
              <div className="p-6 border-b border-slate-100 flex items-center justify-between bg-slate-50/60">
                <div className="flex items-center gap-3">
                  <div className="w-9 h-9 rounded-xl bg-indigo-50 border border-indigo-100 flex items-center justify-center text-indigo-600">
                    <Sparkles className="w-5 h-5" />
                  </div>
                  <div>
                    <h2 className="font-bold text-slate-900 text-base">
                      Assistente Inteligente de Configuração
                    </h2>
                    <p className="text-xs text-slate-500">
                      Escolha seu provedor e informe seus dados de envio
                    </p>
                  </div>
                </div>

                <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-slate-100 border border-slate-200 text-slate-700 text-xs font-medium">
                  <Server className="w-3.5 h-3.5 text-slate-500" />
                  <span>Provedor: {activePreset.name}</span>
                </div>
              </div>

              <div className="p-6 space-y-6 text-sm">
                {/* 1. SELEÇÃO DO PROVEDOR DE E-MAIL */}
                <div>
                  <div className="flex items-center justify-between mb-2">
                    <label className="block text-xs font-bold uppercase tracking-wider text-slate-700">
                      1. Provedor de E-mail *
                    </label>
                    <span className="text-[11px] text-slate-400">
                      Preenchimento automático de Host, Porta e Segurança
                    </span>
                  </div>

                  <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-2.5">
                    {PROVIDER_PRESETS.map((preset) => {
                      const isSelected = selectedProviderId === preset.id;
                      return (
                        <button
                          key={preset.id}
                          type="button"
                          onClick={() => handleSelectProvider(preset)}
                          className={`p-3 rounded-xl border text-left flex flex-col justify-between transition-all relative ${
                            isSelected
                              ? 'bg-indigo-50/70 border-indigo-500 shadow-sm ring-1 ring-indigo-500'
                              : 'bg-white border-slate-200 hover:border-slate-300 hover:bg-slate-50/60'
                          }`}
                        >
                          <div className="flex items-center justify-between w-full mb-1.5">
                            <span className="text-base">📧</span>
                            {isSelected && (
                              <div className="w-4 h-4 rounded-full bg-indigo-600 text-white flex items-center justify-center">
                                <Check className="w-2.5 h-2.5 stroke-[3]" />
                              </div>
                            )}
                          </div>
                          <div>
                            <span
                              className={`block font-bold text-xs truncate ${
                                isSelected ? 'text-indigo-900' : 'text-slate-800'
                              }`}
                            >
                              {preset.name}
                            </span>
                            <span className="block text-[10px] text-slate-400 truncate">
                              {preset.brand}
                            </span>
                          </div>
                        </button>
                      );
                    })}
                  </div>
                </div>

                {/* 2. DADOS DO REMETENTE E E-MAIL */}
                <div className="border-t border-slate-100 pt-6">
                  <h3 className="text-xs font-bold uppercase tracking-wider text-slate-700 mb-3">
                    2. Identificação do Remetente
                  </h3>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div>
                      <label className="block text-xs font-semibold text-slate-700 mb-1">
                        Nome do Remetente *
                      </label>
                      <input
                        type="text"
                        required
                        value={form.fromName}
                        onChange={(e) => setForm({ ...form, fromName: e.target.value })}
                        placeholder="Ex: Denis Dominique | Lançamento"
                        className="w-full px-3.5 py-2.5 rounded-xl border border-slate-300 text-slate-900 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
                      />
                      <p className="text-[11px] text-slate-400 mt-1">
                        Nome que seus clientes verão na caixa de entrada.
                      </p>
                    </div>

                    <div>
                      <label className="block text-xs font-semibold text-slate-700 mb-1">
                        E-mail que será utilizado para enviar as mensagens *
                      </label>
                      <input
                        type="email"
                        required
                        value={form.fromEmail}
                        onChange={(e) => handleEmailChange(e.target.value)}
                        placeholder="exemplo@empresa.com"
                        className="w-full px-3.5 py-2.5 rounded-xl border border-slate-300 text-slate-900 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
                      />
                      <p className="text-[11px] text-slate-500 mt-1">
                        Informe o endereço de e-mail que será utilizado para enviar e-mails aos seus
                        clientes.
                      </p>
                    </div>

                    <div className="sm:col-span-2">
                      <label className="block text-xs font-semibold text-slate-700 mb-1">
                        Responder Para (Reply-To) <span className="text-slate-400 font-normal">(Opcional)</span>
                      </label>
                      <input
                        type="email"
                        value={form.replyTo}
                        onChange={(e) => setForm({ ...form, replyTo: e.target.value })}
                        placeholder="suporte@seudominio.com.br"
                        className="w-full px-3.5 py-2.5 rounded-xl border border-slate-300 text-slate-900 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
                      />
                    </div>
                  </div>
                </div>

                {/* 3. AUTENTICAÇÃO SMTP */}
                <div className="border-t border-slate-100 pt-6">
                  <h3 className="text-xs font-bold uppercase tracking-wider text-slate-700 mb-3">
                    3. Autenticação SMTP ({activePreset.name})
                  </h3>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div>
                      <label className="block text-xs font-semibold text-slate-700 mb-1">
                        Usuário SMTP *
                      </label>
                      <input
                        type="text"
                        required
                        value={form.smtpUsername}
                        onChange={(e) => setForm({ ...form, smtpUsername: e.target.value })}
                        placeholder="Normalmente é o mesmo endereço de e-mail informado acima."
                        className="w-full px-3.5 py-2.5 rounded-xl border border-slate-300 text-slate-900 text-sm font-mono focus:outline-none focus:ring-2 focus:ring-indigo-500"
                      />
                      <p className="text-[11px] text-slate-500 mt-1">
                        💡 {activePreset.userHint}
                      </p>
                    </div>

                    <div>
                      <div className="flex items-center justify-between mb-1">
                        <label className="text-xs font-semibold text-slate-700">
                          Senha SMTP *
                        </label>
                        {form.hasPassword && (
                          <span className="text-[10px] font-semibold text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded border border-emerald-200">
                            Senha Gravada
                          </span>
                        )}
                      </div>

                      <div className="relative">
                        <input
                          type={showPassword ? 'text' : 'password'}
                          required={!form.hasPassword}
                          value={form.smtpPassword || ''}
                          onChange={(e) => setForm({ ...form, smtpPassword: e.target.value })}
                          placeholder={
                            form.hasPassword
                              ? '•••••••••••• (Inalterada)'
                              : 'Sua Senha SMTP ou Senha de Aplicativo'
                          }
                          className="w-full pl-3.5 pr-10 py-2.5 rounded-xl border border-slate-300 text-slate-900 text-sm font-mono focus:outline-none focus:ring-2 focus:ring-indigo-500"
                        />
                        <button
                          type="button"
                          onClick={() => setShowPassword(!showPassword)}
                          className="absolute right-3 top-3 text-slate-400 hover:text-slate-600 focus:outline-none"
                        >
                          {showPassword ? (
                            <EyeOff className="w-4 h-4" />
                          ) : (
                            <Eye className="w-4 h-4" />
                          )}
                        </button>
                      </div>

                      {/* Link Azul Oficial Contextual */}
                      <div className="mt-2 text-xs">
                        {activePreset.helpLink ? (
                          <a
                            href={activePreset.helpLink}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="inline-flex items-center gap-1.5 text-blue-600 hover:text-blue-800 font-semibold text-[11px] hover:underline"
                          >
                            <span className="text-blue-500">🔵</span>
                            <span>{activePreset.helpLinkLabel}</span>
                            <ExternalLink className="w-3 h-3 text-blue-500" />
                          </a>
                        ) : (
                          <p className="text-[11px] text-slate-500">
                            {activePreset.helpLinkLabel}
                          </p>
                        )}
                      </div>
                    </div>
                  </div>

                  {/* Dica do Provedor Selecionado */}
                  <div className="mt-4 p-3.5 bg-blue-50/70 border border-blue-200 rounded-xl text-xs text-blue-900 flex items-start gap-2.5">
                    <HelpCircle className="w-4 h-4 text-blue-600 shrink-0 mt-0.5" />
                    <div className="leading-relaxed">
                      <strong className="font-semibold block mb-0.5">
                        Instruções para {activePreset.name}:
                      </strong>
                      <span>{activePreset.helpHint}</span>
                    </div>
                  </div>
                </div>

                {/* 4. PARÂMETROS DO SERVIDOR (EDITÁVEIS) */}
                <div className="border-t border-slate-100 pt-5">
                  <div className="flex items-center justify-between mb-3">
                    <div>
                      <h3 className="text-xs font-bold uppercase tracking-wider text-slate-700">
                        4. Parâmetros do Servidor SMTP
                      </h3>
                      <p className="text-[11px] text-slate-400">
                        Preenchidos automaticamente para {activePreset.name}. Podem ser editados caso necessário.
                      </p>
                    </div>

                    <button
                      type="button"
                      onClick={() => setShowAdvanced(!showAdvanced)}
                      className="text-xs text-indigo-600 hover:text-indigo-800 font-semibold flex items-center gap-1"
                    >
                      <span>{showAdvanced ? 'Ocultar Detalhes' : 'Ver Parâmetros Técnicos'}</span>
                      {showAdvanced ? (
                        <ChevronUp className="w-3.5 h-3.5" />
                      ) : (
                        <ChevronDown className="w-3.5 h-3.5" />
                      )}
                    </button>
                  </div>

                  {/* Sempre visível em resumo, com detalhes expandíveis */}
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 p-4 rounded-xl bg-slate-50 border border-slate-200">
                    <div className="sm:col-span-2">
                      <label className="block text-xs font-semibold text-slate-700 mb-1">
                        Servidor SMTP (Host) *
                      </label>
                      <input
                        type="text"
                        required
                        value={form.smtpHost}
                        onChange={(e) => setForm({ ...form, smtpHost: e.target.value })}
                        placeholder="Ex: smtp.gmail.com"
                        className="w-full px-3 py-2 rounded-lg border border-slate-300 text-slate-900 text-xs font-mono bg-white focus:outline-none focus:ring-2 focus:ring-indigo-500"
                      />
                    </div>

                    <div>
                      <label className="block text-xs font-semibold text-slate-700 mb-1">
                        Porta *
                      </label>
                      <input
                        type="number"
                        required
                        value={form.smtpPort}
                        onChange={(e) =>
                          setForm({ ...form, smtpPort: Number(e.target.value) })
                        }
                        placeholder="587 ou 465"
                        className="w-full px-3 py-2 rounded-lg border border-slate-300 text-slate-900 text-xs font-mono bg-white focus:outline-none focus:ring-2 focus:ring-indigo-500"
                      />
                    </div>

                    <div className="sm:col-span-3">
                      <label className="flex items-center gap-2 cursor-pointer">
                        <input
                          type="checkbox"
                          checked={form.smtpSecure}
                          onChange={(e) =>
                            setForm({ ...form, smtpSecure: e.target.checked })
                          }
                          className="rounded text-indigo-600 focus:ring-indigo-500"
                        />
                        <span className="text-xs text-slate-700 font-medium">
                          Conexão Segura SSL/TLS (Normalmente Porta 465). Deixe desmarcado se estiver utilizando a porta 587 (STARTTLS).
                        </span>
                      </label>
                    </div>
                  </div>
                </div>

                {/* Botão de Salvar */}
                <div className="pt-4 flex items-center justify-between border-t border-slate-100">
                  <span className="text-xs text-slate-400">
                    🔒 Todas as senhas são criptografadas no banco com chave AES-256 isolada.
                  </span>
                  <button
                    type="submit"
                    disabled={saving}
                    className="flex items-center gap-2 px-5 py-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white font-semibold text-xs transition-colors shadow-sm disabled:opacity-50"
                  >
                    {saving ? (
                      <>
                        <RotateCw className="w-3.5 h-3.5 animate-spin" />
                        <span>Salvando...</span>
                      </>
                    ) : (
                      <>
                        <Save className="w-3.5 h-3.5" />
                        <span>Salvar Configurações</span>
                      </>
                    )}
                  </button>
                </div>
              </div>
            </form>
          </div>

          {/* Coluna Lateral: Testar Conexão e Informações */}
          <div className="space-y-6">
            {/* Card de Teste de Conexão */}
            <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-6 space-y-4">
              <div className="flex items-center gap-2 pb-3 border-b border-slate-100">
                <Send className="w-4 h-4 text-indigo-600" />
                <h3 className="font-bold text-slate-900 text-sm">Testar Configuração</h3>
              </div>

              <p className="text-xs text-slate-500 leading-relaxed">
                Valida a autenticação no servidor SMTP e envia um e-mail de teste formatado para
                verificar a entrega real.
              </p>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  E-mail de Destino para Teste
                </label>
                <input
                  type="email"
                  value={testEmail}
                  onChange={(e) => setTestEmail(e.target.value)}
                  placeholder="seu-email@gmail.com"
                  className="w-full px-3.5 py-2 rounded-xl border border-slate-300 text-slate-900 text-xs focus:outline-none focus:ring-2 focus:ring-indigo-500"
                />
              </div>

              <button
                type="button"
                onClick={handleTestConnection}
                disabled={testing}
                className="w-full flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl bg-slate-900 hover:bg-slate-800 text-white font-semibold text-xs transition-colors shadow-sm disabled:opacity-50"
              >
                {testing ? (
                  <>
                    <RotateCw className="w-3.5 h-3.5 animate-spin" />
                    <span>Conectando e Testando...</span>
                  </>
                ) : (
                  <>
                    <Send className="w-3.5 h-3.5" />
                    <span>Testar Configuração</span>
                  </>
                )}
              </button>

              {/* Feedback do Teste com mensagens amigáveis */}
              {testFeedback && (
                <div
                  className={`p-3.5 rounded-xl border text-xs leading-relaxed animate-in fade-in duration-200 ${
                    testFeedback.success
                      ? 'bg-emerald-50 text-emerald-800 border-emerald-200'
                      : 'bg-red-50 text-red-800 border-red-200'
                  }`}
                >
                  <div className="flex items-start gap-2">
                    {testFeedback.success ? (
                      <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0 mt-0.5" />
                    ) : (
                      <AlertCircle className="w-4 h-4 text-red-600 shrink-0 mt-0.5" />
                    )}
                    <div>
                      <strong className="block font-semibold mb-0.5">
                        {testFeedback.success ? '✅ Teste Concluído' : '❌ Falha no Teste'}
                      </strong>
                      <span>{testFeedback.message}</span>
                    </div>
                  </div>
                </div>
              )}
            </div>

            {/* Card com Guia Rápido */}
            <div className="bg-slate-50 rounded-2xl border border-slate-200 p-6 space-y-3">
              <div className="flex items-center gap-2">
                <Sparkles className="w-4 h-4 text-indigo-600" />
                <h4 className="font-bold text-slate-900 text-xs uppercase tracking-wider">
                  Como funciona o assistente?
                </h4>
              </div>
              <ol className="text-xs text-slate-600 space-y-2 list-decimal list-inside leading-relaxed">
                <li>Selecione o provedor do seu e-mail acima.</li>
                <li>Informe o endereço de e-mail que usará nos disparos.</li>
                <li>Clique no link azul para gerar sua senha SMTP.</li>
                <li>Clique em <strong>Testar Configuração</strong> para validar e gravar.</li>
              </ol>
            </div>
          </div>

          {/* SEÇÃO INFERIOR: Fila de Envio (Queue) e Histórico de Disparos (Logs) */}
          <div className="lg:col-span-3 bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
            {/* Cabeçalho com Abas */}
            <div className="p-4 sm:p-5 border-b border-slate-100 flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-slate-50/50">
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => setActiveBottomTab('queue')}
                  className={`flex items-center gap-2 px-3.5 py-1.5 rounded-lg text-xs font-bold transition-colors ${
                    activeBottomTab === 'queue'
                      ? 'bg-indigo-600 text-white shadow-sm'
                      : 'text-slate-600 hover:text-slate-900 hover:bg-slate-200/60'
                  }`}
                >
                  <Clock className="w-3.5 h-3.5" />
                  <span>Fila de Disparos (Email Queue)</span>
                  {queueStats.pending > 0 && (
                    <span className="ml-1 px-1.5 py-0.2 rounded-full text-[10px] bg-amber-400 text-amber-950 font-black">
                      {queueStats.pending}
                    </span>
                  )}
                </button>

                <button
                  type="button"
                  onClick={() => setActiveBottomTab('logs')}
                  className={`flex items-center gap-2 px-3.5 py-1.5 rounded-lg text-xs font-bold transition-colors ${
                    activeBottomTab === 'logs'
                      ? 'bg-indigo-600 text-white shadow-sm'
                      : 'text-slate-600 hover:text-slate-900 hover:bg-slate-200/60'
                  }`}
                >
                  <Send className="w-3.5 h-3.5" />
                  <span>Histórico Recente (Logs)</span>
                </button>
              </div>

              <div className="flex items-center gap-2">
                {activeBottomTab === 'queue' && (
                  <button
                    type="button"
                    onClick={handleProcessQueue}
                    disabled={processingQueue || queueStats.pending === 0}
                    className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-semibold shadow-sm transition-colors disabled:opacity-40"
                  >
                    <RotateCw className={`w-3 h-3 ${processingQueue ? 'animate-spin' : ''}`} />
                    <span>{processingQueue ? 'Processando Fila...' : 'Processar Fila Agora'}</span>
                  </button>
                )}

                <button
                  onClick={() => (activeBottomTab === 'queue' ? fetchQueue() : fetchLogs())}
                  disabled={loadingQueue || loadingLogs}
                  className="text-xs text-indigo-600 hover:text-indigo-800 font-semibold flex items-center gap-1 px-2 py-1 rounded-md hover:bg-indigo-50"
                >
                  <RotateCw
                    className={`w-3 h-3 ${
                      loadingQueue || loadingLogs ? 'animate-spin' : ''
                    }`}
                  />
                  <span>Atualizar</span>
                </button>
              </div>
            </div>

            {/* CONTEÚDO DA ABA 1: FILA DE E-MAILS */}
            {activeBottomTab === 'queue' && (
              <div className="p-5 space-y-5">
                {/* 4 Cards de Estatísticas da Fila */}
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                  <div className="p-3.5 rounded-xl border border-amber-200 bg-amber-50/60 flex flex-col justify-between">
                    <span className="text-[11px] font-bold uppercase tracking-wider text-amber-700">
                      Pendentes
                    </span>
                    <div className="mt-2 flex items-baseline justify-between">
                      <span className="text-2xl font-black text-amber-900 font-mono">
                        {queueStats.pending}
                      </span>
                      <span className="text-[10px] text-amber-700 font-medium">Aguardando</span>
                    </div>
                  </div>

                  <div className="p-3.5 rounded-xl border border-blue-200 bg-blue-50/60 flex flex-col justify-between">
                    <span className="text-[11px] font-bold uppercase tracking-wider text-blue-700">
                      Processando
                    </span>
                    <div className="mt-2 flex items-baseline justify-between">
                      <span className="text-2xl font-black text-blue-900 font-mono">
                        {queueStats.processing}
                      </span>
                      <span className="text-[10px] text-blue-700 font-medium">Em voo</span>
                    </div>
                  </div>

                  <div className="p-3.5 rounded-xl border border-emerald-200 bg-emerald-50/60 flex flex-col justify-between">
                    <span className="text-[11px] font-bold uppercase tracking-wider text-emerald-700">
                      Enviados
                    </span>
                    <div className="mt-2 flex items-baseline justify-between">
                      <span className="text-2xl font-black text-emerald-900 font-mono">
                        {queueStats.sent}
                      </span>
                      <span className="text-[10px] text-emerald-700 font-medium">Sucesso</span>
                    </div>
                  </div>

                  <div className="p-3.5 rounded-xl border border-red-200 bg-red-50/60 flex flex-col justify-between">
                    <span className="text-[11px] font-bold uppercase tracking-wider text-red-700">
                      Falhas
                    </span>
                    <div className="mt-2 flex items-baseline justify-between">
                      <span className="text-2xl font-black text-red-900 font-mono">
                        {queueStats.failed}
                      </span>
                      <span className="text-[10px] text-red-700 font-medium">Erros</span>
                    </div>
                  </div>
                </div>

                {/* Tabela de Itens da Fila */}
                <div className="overflow-x-auto rounded-xl border border-slate-200">
                  <table className="w-full text-left text-xs">
                    <thead className="bg-slate-50 text-slate-500 font-semibold border-b border-slate-100 uppercase tracking-wider text-[10px]">
                      <tr>
                        <th className="p-3.5">Destinatário</th>
                        <th className="p-3.5">Assunto</th>
                        <th className="p-3.5">Status</th>
                        <th className="p-3.5">Tentativas</th>
                        <th className="p-3.5">Data / Agendamento</th>
                        <th className="p-3.5">Detalhes / Erro</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100 text-slate-700">
                      {loadingQueue ? (
                        <tr>
                          <td colSpan={6} className="p-6 text-center text-slate-400">
                            Carregando itens da fila...
                          </td>
                        </tr>
                      ) : queueItems.length === 0 ? (
                        <tr>
                          <td colSpan={6} className="p-6 text-center text-slate-400">
                            Fila vazia. Todos os e-mails estão em dia!
                          </td>
                        </tr>
                      ) : (
                        queueItems.map((item) => (
                          <tr key={item.id} className="hover:bg-slate-50/50">
                            <td className="p-3.5 font-medium text-slate-800">{item.toEmail}</td>
                            <td className="p-3.5 truncate max-w-xs">{item.subject}</td>
                            <td className="p-3.5">
                              <span
                                className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold ${
                                  item.status === 'SENT'
                                    ? 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                                    : item.status === 'PROCESSING'
                                    ? 'bg-blue-50 text-blue-700 border border-blue-200 animate-pulse'
                                    : item.status === 'PENDING'
                                    ? 'bg-amber-50 text-amber-700 border border-amber-200'
                                    : 'bg-red-50 text-red-700 border border-red-200'
                                }`}
                              >
                                {item.status === 'SENT' && <CheckCircle2 className="w-3 h-3" />}
                                {item.status === 'PROCESSING' && (
                                  <RotateCw className="w-3 h-3 animate-spin" />
                                )}
                                {item.status === 'PENDING' && <Clock className="w-3 h-3" />}
                                {item.status === 'FAILED' && <AlertCircle className="w-3 h-3" />}
                                <span>
                                  {item.status === 'SENT'
                                    ? 'Enviado'
                                    : item.status === 'PROCESSING'
                                    ? 'Processando'
                                    : item.status === 'PENDING'
                                    ? 'Pendente'
                                    : 'Falhou'}
                                </span>
                              </span>
                            </td>
                            <td className="p-3.5 font-mono text-[11px] text-slate-600">
                              {item.attempts} / 3
                            </td>
                            <td className="p-3.5 text-slate-500 font-mono text-[11px]">
                              {new Date(item.scheduledAt || item.createdAt).toLocaleString('pt-BR')}
                            </td>
                            <td className="p-3.5 text-slate-400 truncate max-w-xs text-[11px]">
                              {item.errorMessage || (item.sentAt ? `Enviado em ${new Date(item.sentAt).toLocaleTimeString('pt-BR')}` : '-')}
                            </td>
                          </tr>
                        ))
                      )}
                    </tbody>
                  </table>
                </div>
              </div>
            )}

            {/* CONTEÚDO DA ABA 2: LOGS RECENTES */}
            {activeBottomTab === 'logs' && (
              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs">
                  <thead className="bg-slate-50 text-slate-500 font-semibold border-b border-slate-100 uppercase tracking-wider text-[10px]">
                    <tr>
                      <th className="p-3.5">Destinatário</th>
                      <th className="p-3.5">Assunto</th>
                      <th className="p-3.5">Status</th>
                      <th className="p-3.5">Data / Hora</th>
                      <th className="p-3.5">Detalhes</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 text-slate-700">
                    {loadingLogs ? (
                      <tr>
                        <td colSpan={5} className="p-6 text-center text-slate-400">
                          Carregando histórico...
                        </td>
                      </tr>
                    ) : logs.length === 0 ? (
                      <tr>
                        <td colSpan={5} className="p-6 text-center text-slate-400">
                          Nenhum e-mail disparado recentemente por este expert.
                        </td>
                      </tr>
                    ) : (
                      logs.map((log) => (
                        <tr key={log.id} className="hover:bg-slate-50/50">
                          <td className="p-3.5 font-medium text-slate-800">{log.to}</td>
                          <td className="p-3.5 truncate max-w-xs">{log.subject}</td>
                          <td className="p-3.5">
                            <span
                              className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold ${
                                log.status === 'SENT'
                                  ? 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                                  : 'bg-red-50 text-red-700 border border-red-200'
                              }`}
                            >
                              {log.status === 'SENT' ? (
                                <>
                                  <CheckCircle2 className="w-3 h-3" />
                                  <span>Entregue</span>
                                </>
                              ) : (
                                <>
                                  <AlertCircle className="w-3 h-3" />
                                  <span>Falha</span>
                                </>
                              )}
                            </span>
                          </td>
                          <td className="p-3.5 text-slate-500 font-mono text-[11px]">
                            {new Date(log.createdAt).toLocaleString('pt-BR')}
                          </td>
                          <td className="p-3.5 text-slate-400 truncate max-w-xs text-[11px]">
                            {log.errorMessage || log.messageId || '-'}
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
