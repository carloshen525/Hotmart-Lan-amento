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
  ChevronRight,
  ExternalLink,
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

export default function EmailSettingsPage() {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [testing, setTesting] = useState(false);
  const [showPassword, setShowPassword] = useState(false);

  // Formulário
  const [form, setForm] = useState<EmailSettingsState>({
    provider: 'SMTP',
    smtpHost: '',
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

  const fetchSettings = async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/email/settings');
      const data = await res.json();
      if (res.ok && data.settings) {
        setForm({
          provider: data.settings.provider || 'SMTP',
          smtpHost: data.settings.smtpHost || '',
          smtpPort: data.settings.smtpPort || 587,
          smtpSecure: Boolean(data.settings.smtpSecure),
          smtpUsername: data.settings.smtpUsername || '',
          smtpPassword: data.settings.smtpPassword || '',
          hasPassword: data.settings.hasPassword,
          fromName: data.settings.fromName || '',
          fromEmail: data.settings.fromEmail || '',
          replyTo: data.settings.replyTo || '',
        });
        if (data.settings.fromEmail) {
          setTestEmail(data.settings.fromEmail);
        }
      }
    } catch {
      // Ignora erro inicial
    } finally {
      setLoading(false);
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

  useEffect(() => {
    fetchSettings();
    fetchLogs();
  }, []);

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
          message: 'Configurações de e-mail salvas com sucesso! A senha foi criptografada.',
        });
        fetchSettings();
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
    if (!testEmail.trim()) {
      alert('Informe um e-mail de destino para o teste.');
      return;
    }

    setTesting(true);
    setTestFeedback(null);

    try {
      const res = await fetch('/api/email/test', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          testEmail: testEmail.trim(),
          smtpHost: form.smtpHost,
          smtpPort: form.smtpPort,
          smtpSecure: form.smtpSecure,
          smtpUsername: form.smtpUsername,
          smtpPassword: form.smtpPassword,
          fromName: form.fromName,
          fromEmail: form.fromEmail,
          replyTo: form.replyTo,
        }),
      });
      const data = await res.json();

      if (res.ok && data.success) {
        setTestFeedback({
          success: true,
          message: data.message || 'Conexão e disparo de teste realizados com sucesso!',
        });
        fetchLogs();
      } else {
        setTestFeedback({
          success: false,
          message: data.error || 'Erro ao testar conexão SMTP.',
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
    <div className="space-y-8 max-w-6xl mx-auto pb-12">
      {/* Navegação e Título */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 border-b border-slate-200 pb-5">
        <div>
          <div className="flex items-center gap-2 text-xs font-semibold text-slate-500 mb-1">
            <Link href="/settings" className="hover:text-indigo-600 transition-colors">
              Configurações
            </Link>
            <ChevronRight className="w-3.5 h-3.5" />
            <span className="text-slate-800">E-mail Multi-Tenant</span>
          </div>
          <h1 className="text-2xl font-bold text-slate-900 tracking-tight flex items-center gap-2.5">
            <Mail className="w-6 h-6 text-indigo-600" />
            Configurações de E-mail (SMTP)
          </h1>
          <p className="text-sm text-slate-500 mt-0.5">
            Cada expert possui seu próprio servidor SMTP isolado. Credenciais nunca são compartilhadas.
          </p>
        </div>

        <div className="flex items-center gap-2">
          <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-semibold bg-emerald-50 text-emerald-700 border border-emerald-200">
            <ShieldCheck className="w-4 h-4 text-emerald-600" />
            <span>Criptografia AES-256 Ativa</span>
          </div>
        </div>
      </div>

      {saveNotice && (
        <div
          className={`p-4 rounded-xl border flex items-center justify-between text-sm ${
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
            <span>{saveNotice.message}</span>
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
        <div className="p-12 text-center text-slate-400 bg-white rounded-2xl border border-slate-200">
          <RotateCw className="w-6 h-6 animate-spin mx-auto mb-2 text-indigo-600" />
          <p className="text-sm font-medium">Carregando configurações de e-mail...</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
          {/* Formulário Principal (2 Colunas) */}
          <div className="lg:col-span-2 space-y-6">
            <form onSubmit={handleSave} className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
              <div className="p-6 border-b border-slate-100 flex items-center justify-between bg-slate-50/50">
                <div className="flex items-center gap-2.5">
                  <Server className="w-5 h-5 text-indigo-600" />
                  <h2 className="font-bold text-slate-900 text-base">Parâmetros do Servidor SMTP</h2>
                </div>
                <span className="text-xs font-mono font-medium px-2 py-0.5 rounded bg-slate-200 text-slate-700">
                  Provedor: {form.provider}
                </span>
              </div>

              <div className="p-6 space-y-5 text-sm">
                {/* Dados do Remetente */}
                <div>
                  <h3 className="text-xs font-bold uppercase tracking-wider text-slate-500 mb-3">
                    Identificação do Remetente
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
                        placeholder="Ex: Denis Dominique | Launch"
                        className="w-full px-3.5 py-2.5 rounded-xl border border-slate-300 text-slate-900 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
                      />
                    </div>

                    <div>
                      <label className="block text-xs font-semibold text-slate-700 mb-1">
                        E-mail de Envio (From) *
                      </label>
                      <input
                        type="email"
                        required
                        value={form.fromEmail}
                        onChange={(e) => setForm({ ...form, fromEmail: e.target.value })}
                        placeholder="contato@seudominio.com.br"
                        className="w-full px-3.5 py-2.5 rounded-xl border border-slate-300 text-slate-900 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
                      />
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

                <div className="border-t border-slate-100 pt-5">
                  <h3 className="text-xs font-bold uppercase tracking-wider text-slate-500 mb-3">
                    Conexão e Autenticação SMTP
                  </h3>
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                    <div className="sm:col-span-2">
                      <label className="block text-xs font-semibold text-slate-700 mb-1">
                        Servidor SMTP (Host) *
                      </label>
                      <input
                        type="text"
                        required
                        value={form.smtpHost}
                        onChange={(e) => setForm({ ...form, smtpHost: e.target.value })}
                        placeholder="smtp.hostinger.com ou email-smtp.us-east-1.amazonaws.com"
                        className="w-full px-3.5 py-2.5 rounded-xl border border-slate-300 text-slate-900 text-sm font-mono focus:outline-none focus:ring-2 focus:ring-indigo-500"
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
                        onChange={(e) => setForm({ ...form, smtpPort: Number(e.target.value) })}
                        placeholder="587"
                        className="w-full px-3.5 py-2.5 rounded-xl border border-slate-300 text-slate-900 text-sm font-mono focus:outline-none focus:ring-2 focus:ring-indigo-500"
                      />
                    </div>

                    <div className="sm:col-span-3">
                      <label className="flex items-center gap-2.5 cursor-pointer p-3 bg-slate-50 rounded-xl border border-slate-200">
                        <input
                          type="checkbox"
                          checked={form.smtpSecure}
                          onChange={(e) => setForm({ ...form, smtpSecure: e.target.checked })}
                          className="rounded text-indigo-600 focus:ring-indigo-500"
                        />
                        <div>
                          <span className="font-semibold text-slate-800 text-xs block">
                            Conexão Segura SSL/TLS (Normalmente Porta 465)
                          </span>
                          <span className="text-slate-500 text-[11px]">
                            Deixe desmarcado se estiver utilizando a porta 587 (STARTTLS).
                          </span>
                        </div>
                      </label>
                    </div>

                    <div className="sm:col-span-3 sm:grid sm:grid-cols-2 gap-4">
                      <div>
                        <label className="block text-xs font-semibold text-slate-700 mb-1">
                          Usuário SMTP *
                        </label>
                        <input
                          type="text"
                          required
                          value={form.smtpUsername}
                          onChange={(e) => setForm({ ...form, smtpUsername: e.target.value })}
                          placeholder="usuario@dominio.com ou access_key"
                          className="w-full px-3.5 py-2.5 rounded-xl border border-slate-300 text-slate-900 text-sm font-mono focus:outline-none focus:ring-2 focus:ring-indigo-500"
                        />
                      </div>

                      <div>
                        <div className="flex items-center justify-between mb-1">
                          <label className="text-xs font-semibold text-slate-700">
                            Senha SMTP *
                          </label>
                          {form.hasPassword && (
                            <span className="text-[10px] text-emerald-600 font-bold bg-emerald-50 px-1.5 py-0.2 rounded border border-emerald-200">
                              Senha Gravada
                            </span>
                          )}
                        </div>
                        <div className="relative">
                          <input
                            type={showPassword ? 'text' : 'password'}
                            value={form.smtpPassword}
                            onChange={(e) => setForm({ ...form, smtpPassword: e.target.value })}
                            placeholder={form.hasPassword ? '•••••••••••• (Inalterada)' : 'Sua senha SMTP'}
                            className="w-full pl-3.5 pr-10 py-2.5 rounded-xl border border-slate-300 text-slate-900 text-sm font-mono focus:outline-none focus:ring-2 focus:ring-indigo-500"
                          />
                          <button
                            type="button"
                            onClick={() => setShowPassword(!showPassword)}
                            className="absolute right-3 top-3 text-slate-400 hover:text-slate-600"
                          >
                            {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                          </button>
                        </div>
                        <p className="text-[11px] text-slate-400 mt-1 flex items-center gap-1">
                          <Lock className="w-3 h-3 text-emerald-600" />
                          <span>Criptografada com AES-256 no banco de dados.</span>
                        </p>
                      </div>
                    </div>
                  </div>
                </div>
              </div>

              {/* Botão Salvar */}
              <div className="p-4 bg-slate-50 border-t border-slate-100 flex items-center justify-end">
                <button
                  type="submit"
                  disabled={saving}
                  className="px-6 py-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white font-bold text-xs uppercase tracking-wider flex items-center gap-2 shadow-md shadow-indigo-600/20 transition-all disabled:opacity-50"
                >
                  <Save className="w-4 h-4" />
                  <span>{saving ? 'Gravando...' : 'Salvar Configurações'}</span>
                </button>
              </div>
            </form>
          </div>

          {/* Coluna Lateral: Teste de Disparo & Status */}
          <div className="space-y-6">
            {/* Card de Teste de Conexão */}
            <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-6 space-y-4">
              <div className="flex items-center gap-2.5 text-slate-900 font-bold text-base">
                <Send className="w-5 h-5 text-indigo-600" />
                <h3>Testar Conexão e Envio</h3>
              </div>
              <p className="text-xs text-slate-500 leading-relaxed">
                Valida a autenticação no servidor SMTP e envia um e-mail de teste formatado para verificar a entrega.
              </p>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  E-mail de Destino para Teste
                </label>
                <input
                  type="email"
                  value={testEmail}
                  onChange={(e) => setTestEmail(e.target.value)}
                  placeholder="seu-email@teste.com"
                  className="w-full px-3.5 py-2.5 rounded-xl border border-slate-300 text-slate-900 text-xs focus:outline-none focus:ring-2 focus:ring-indigo-500"
                />
              </div>

              <button
                type="button"
                onClick={handleTestConnection}
                disabled={testing || !form.smtpHost || !form.smtpUsername}
                className="w-full py-2.5 px-4 rounded-xl bg-slate-900 hover:bg-slate-800 text-white text-xs font-bold flex items-center justify-center gap-2 shadow-md transition-all disabled:opacity-40 disabled:cursor-not-allowed"
              >
                {testing ? (
                  <>
                    <RotateCw className="w-4 h-4 animate-spin text-indigo-400" />
                    <span>Conectando ao SMTP...</span>
                  </>
                ) : (
                  <>
                    <Send className="w-4 h-4 text-emerald-400" />
                    <span>Testar Conexão</span>
                  </>
                )}
              </button>

              {testFeedback && (
                <div
                  className={`p-3.5 rounded-xl text-xs border ${
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
                    <span className="leading-snug">{testFeedback.message}</span>
                  </div>
                </div>
              )}
            </div>

            {/* Card de Provedores Futuros Suportados */}
            <div className="bg-slate-50 rounded-2xl border border-slate-200/80 p-5 space-y-3">
              <span className="text-[11px] font-bold text-slate-600 uppercase tracking-wider block">
                Arquitetura Extensível
              </span>
              <p className="text-xs text-slate-500 leading-relaxed">
                O <strong>Email Service</strong> utiliza uma camada desacoplada de provedores. No futuro, você poderá ativar provedores diretos por API sem mudar nenhuma automação:
              </p>
              <div className="flex flex-wrap gap-1.5 pt-1">
                {['SMTP (Ativo)', 'AWS SES', 'Resend', 'Mailgun', 'Brevo'].map((p) => (
                  <span
                    key={p}
                    className={`text-[10px] font-semibold px-2 py-0.5 rounded-md border ${
                      p.includes('Ativo')
                        ? 'bg-emerald-50 text-emerald-700 border-emerald-300'
                        : 'bg-white text-slate-500 border-slate-200'
                    }`}
                  >
                    {p}
                  </span>
                ))}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Seção de Histórico de Envios Recentes */}
      <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
        <div className="p-5 border-b border-slate-100 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Clock className="w-5 h-5 text-indigo-600" />
            <h3 className="font-bold text-slate-900 text-base">Histórico de Disparos Recentes</h3>
          </div>
          <button
            onClick={fetchLogs}
            disabled={loadingLogs}
            className="text-xs font-semibold text-indigo-600 hover:text-indigo-700 flex items-center gap-1"
          >
            <RotateCw className={`w-3.5 h-3.5 ${loadingLogs ? 'animate-spin' : ''}`} />
            <span>Atualizar</span>
          </button>
        </div>

        {logs.length === 0 ? (
          <div className="p-8 text-center text-slate-400 text-xs">
            Nenhum disparo registrado para este expert ainda. Realize um teste de conexão acima.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="bg-slate-50 border-b border-slate-200 text-slate-500 font-semibold uppercase tracking-wider">
                <tr>
                  <th className="py-3 px-4">Status</th>
                  <th className="py-3 px-4">Destinatário</th>
                  <th className="py-3 px-4">Assunto</th>
                  <th className="py-3 px-4">Provedor</th>
                  <th className="py-3 px-4">Data / Hora</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {logs.map((log) => (
                  <tr key={log.id} className="hover:bg-slate-50/70 transition-colors">
                    <td className="py-3 px-4">
                      {log.status === 'SENT' ? (
                        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-50 text-emerald-700 border border-emerald-200">
                          <CheckCircle2 className="w-3 h-3 text-emerald-600" />
                          ENVIADO
                        </span>
                      ) : (
                        <span
                          className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold bg-red-50 text-red-700 border border-red-200"
                          title={log.errorMessage || 'Falha no envio'}
                        >
                          <AlertCircle className="w-3 h-3 text-red-600" />
                          FALHOU
                        </span>
                      )}
                    </td>
                    <td className="py-3 px-4 font-mono font-medium text-slate-800">
                      {log.to}
                    </td>
                    <td className="py-3 px-4 font-medium text-slate-700 max-w-xs truncate">
                      {log.subject}
                      {log.errorMessage && (
                        <span className="block text-[10px] text-red-500 truncate" title={log.errorMessage}>
                          {log.errorMessage}
                        </span>
                      )}
                    </td>
                    <td className="py-3 px-4 text-slate-500 font-mono">
                      {log.provider}
                    </td>
                    <td className="py-3 px-4 text-slate-500 whitespace-nowrap">
                      {new Date(log.createdAt).toLocaleString('pt-BR')}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
