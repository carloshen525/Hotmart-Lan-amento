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
  Mail,
  Flame,
  AlertTriangle,
} from 'lucide-react';

export default function IntegrationsPage() {
  const [tenant, setTenant] = useState<any>(null);
  const [copiedUrl, setCopiedUrl] = useState(false);
  const [copiedToken, setCopiedToken] = useState(false);

  // Simulador Hotmart Form
  const [simEvent, setSimEvent] = useState('PURCHASE_WAITING_PAYMENT');
  const [simEmail, setSimEmail] = useState('lucas.ferreira@gmail.com');
  const [simName, setSimName] = useState('Lucas Ferreira');
  const [simPhone, setSimPhone] = useState('+5511999991111');
  const [simProduct, setSimProduct] = useState('Mentoria Alta Performance 2026');
  const [simPayment, setSimPayment] = useState('PIX');
  const [simValue, setSimValue] = useState('997.00');

  const [simulating, setSimulating] = useState(false);
  const [simResult, setSimResult] = useState<any>(null);

  // Evolution API Status & Teste
  const [evoStatus, setEvoStatus] = useState<any>(null);
  const [testPhone, setTestPhone] = useState('+55');
  const [testText, setTestText] = useState('Olá! Mensagem de teste enviada pela Evolution API no LaunchFlow.');
  const [testingEvo, setTestingEvo] = useState(false);
  const [evoTestResult, setEvoTestResult] = useState<any>(null);

  useEffect(() => {
    fetch('/api/auth/me')
      .then((res) => res.json())
      .then((data) => {
        if (data.activeTenant) setTenant(data.activeTenant);
      })
      .catch(() => {});

    // Checar conexão do WhatsApp do Tenant ativo
    fetch('/api/whatsapp')
      .then((res) => res.json())
      .then((data) => setEvoStatus(data))
      .catch(() => {});
  }, []);

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

  const webhookUrl = typeof window !== 'undefined'
    ? `${window.location.origin}/api/webhooks/hotmart?tenant=${tenant?.id || ''}`
    : `http://localhost:3000/api/webhooks/hotmart`;

  const copyToClipboard = (text: string, isToken: boolean = false) => {
    navigator.clipboard.writeText(text);
    if (isToken) {
      setCopiedToken(true);
      setTimeout(() => setCopiedToken(false), 2000);
    } else {
      setCopiedUrl(true);
      setTimeout(() => setCopiedUrl(false), 2000);
    }
  };

  const handleSimulateWebhook = async (e: React.FormEvent) => {
    e.preventDefault();
    setSimulating(true);
    setSimResult(null);

    try {
      const res = await fetch('/api/webhooks/hotmart/simulate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          eventType: simEvent,
          buyerEmail: simEmail,
          buyerName: simName,
          buyerPhone: simPhone,
          productName: simProduct,
          paymentType: simPayment,
          priceValue: parseFloat(simValue),
        }),
      });

      const data = await res.json();
      setSimResult(data);
    } catch (err: any) {
      setSimResult({ success: false, error: err.message });
    } finally {
      setSimulating(false);
    }
  };

  return (
    <div className="space-y-8 max-w-7xl mx-auto">
      {/* Topo */}
      <div>
        <h1 className="text-2xl font-bold text-slate-900 tracking-tight">Integrações & Webhooks</h1>
        <p className="text-sm text-slate-500 mt-1">
          Conexão oficial da Hotmart, WhatsApp Business Meta Cloud API e Provedores de E-mail.
        </p>
      </div>

      {/* Grid Principal */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
        {/* Card Hotmart Oficial */}
        <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-6 space-y-6">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-gradient-to-tr from-hotmart-orange to-amber-500 flex items-center justify-center text-white shadow-md shadow-orange-500/20">
              <Flame className="w-6 h-6 fill-white" />
            </div>
            <div>
              <h2 className="text-base font-bold text-slate-900">Integração Hotmart (Webhooks 2.0)</h2>
              <span className="text-xs text-emerald-600 font-semibold flex items-center gap-1 mt-0.5">
                <ShieldCheck className="w-3.5 h-3.5" />
                Idempotência e Hottok ativos
              </span>
            </div>
          </div>

          <p className="text-xs text-slate-600 leading-relaxed">
            Cadastre a URL abaixo na sua conta Hotmart (em <strong>Ferramentas &gt; Webhook (API)</strong>) para receber compras, abandono de carrinho e geração de Pix automaticamente no ambiente deste expert.
          </p>

          <div className="space-y-4 text-xs">
            <div>
              <label className="block text-slate-700 font-semibold mb-1">Sua URL Exclusiva de Webhook</label>
              <div className="flex items-center gap-2">
                <input
                  type="text"
                  readOnly
                  value={webhookUrl}
                  className="w-full p-2 bg-slate-50 border border-slate-200 rounded-lg font-mono text-[11px] text-slate-700"
                />
                <button
                  onClick={() => copyToClipboard(webhookUrl)}
                  className="p-2 border border-slate-200 rounded-lg hover:bg-slate-50 text-slate-600"
                  title="Copiar URL"
                >
                  {copiedUrl ? <Check className="w-4 h-4 text-emerald-600" /> : <Copy className="w-4 h-4" />}
                </button>
              </div>
            </div>

            <div>
              <label className="block text-slate-700 font-semibold mb-1">Token de Verificação (Hottok)</label>
              <div className="flex items-center gap-2">
                <input
                  type="text"
                  readOnly
                  value={tenant?.hotmartHottok || 'hottok_configurado'}
                  className="w-full p-2 bg-slate-50 border border-slate-200 rounded-lg font-mono text-[11px] text-slate-700"
                />
                <button
                  onClick={() => copyToClipboard(tenant?.hotmartHottok || '', true)}
                  className="p-2 border border-slate-200 rounded-lg hover:bg-slate-50 text-slate-600"
                  title="Copiar Token"
                >
                  {copiedToken ? <Check className="w-4 h-4 text-emerald-600" /> : <Copy className="w-4 h-4" />}
                </button>
              </div>
            </div>

            <div className="p-3 rounded-lg bg-orange-50 border border-orange-100 text-[11px] text-orange-800">
              <strong>Eventos Hotmart Suportados:</strong> Compra Aprovada, Aguardando Pagamento (Pix/Boleto), Abandono de Carrinho, Reembolso, Chargeback e Compra Cancelada.
            </div>
          </div>
        </div>

        {/* Simulador Interativo da Hotmart */}
        <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-6 space-y-4">
          <div className="flex items-center gap-2 text-indigo-700 font-bold text-base">
            <Sparkles className="w-5 h-5 text-indigo-600" />
            <span>Simulador de Eventos Hotmart em Tempo Real</span>
          </div>
          <p className="text-xs text-slate-500">
            Teste suas automações, tags e cancelamento de cobranças sem precisar passar cartão de crédito real na Hotmart!
          </p>

          <form onSubmit={handleSimulateWebhook} className="space-y-3 text-xs mt-3">
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-slate-700 font-semibold mb-1">Evento Hotmart</label>
                <select
                  value={simEvent}
                  onChange={(e) => setSimEvent(e.target.value)}
                  className="w-full p-2 border border-slate-200 rounded-lg bg-white"
                >
                  <option value="PURCHASE_WAITING_PAYMENT">Aguardando Pagamento (Pix/Boleto)</option>
                  <option value="PURCHASE_APPROVED">Compra Aprovada (Cliente)</option>
                  <option value="PURCHASE_OUT_OF_SHOPPING_CART">Abandono de Carrinho</option>
                  <option value="PURCHASE_REFUNDED">Reembolso</option>
                </select>
              </div>

              <div>
                <label className="block text-slate-700 font-semibold mb-1">Forma de Pagamento</label>
                <select
                  value={simPayment}
                  onChange={(e) => setSimPayment(e.target.value)}
                  className="w-full p-2 border border-slate-200 rounded-lg bg-white"
                >
                  <option value="PIX">Pix</option>
                  <option value="BILLET">Boleto Bancário</option>
                  <option value="CREDIT_CARD">Cartão de Crédito</option>
                </select>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-slate-700 font-semibold mb-1">E-mail do Comprador</label>
                <input
                  type="email"
                  required
                  value={simEmail}
                  onChange={(e) => setSimEmail(e.target.value)}
                  className="w-full p-2 border border-slate-200 rounded-lg"
                />
              </div>

              <div>
                <label className="block text-slate-700 font-semibold mb-1">Nome</label>
                <input
                  type="text"
                  value={simName}
                  onChange={(e) => setSimName(e.target.value)}
                  className="w-full p-2 border border-slate-200 rounded-lg"
                />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-slate-700 font-semibold mb-1">Produto</label>
                <input
                  type="text"
                  value={simProduct}
                  onChange={(e) => setSimProduct(e.target.value)}
                  className="w-full p-2 border border-slate-200 rounded-lg"
                />
              </div>

              <div>
                <label className="block text-slate-700 font-semibold mb-1">Valor (R$)</label>
                <input
                  type="text"
                  value={simValue}
                  onChange={(e) => setSimValue(e.target.value)}
                  className="w-full p-2 border border-slate-200 rounded-lg"
                />
              </div>
            </div>

            <button
              type="submit"
              disabled={simulating}
              className="w-full py-2.5 bg-gradient-to-r from-orange-500 to-amber-500 hover:from-orange-600 hover:to-amber-600 text-white font-semibold rounded-lg shadow-sm transition-all flex items-center justify-center gap-2"
            >
              <Send className="w-3.5 h-3.5" />
              <span>{simulating ? 'Processando Webhook...' : 'Disparar Webhook Simulado'}</span>
            </button>
          </form>

          {/* Resultado da Simulação */}
          {simResult && (
            <div className="mt-3 p-3 rounded-lg bg-slate-900 text-slate-100 text-xs font-mono">
              <div className="text-emerald-400 font-bold mb-1">
                ✔ Resposta do Webhook Hotmart:
              </div>
              <p className="text-[11px] text-slate-300">
                {simResult.result?.actionSummary || simResult.error || 'Processado com sucesso'}
              </p>
              {simResult.result?.duplicate && (
                <p className="text-amber-400 text-[10px] mt-1">
                  (Idempotência ativada: webhook duplicado descartado sem retrabalho)
                </p>
              )}
            </div>
          )}
        </div>
      </div>

      {/* Canais de Envio: Evolution API, WhatsApp Meta Oficial e E-mail */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Card WhatsApp Exclusivo do Expert */}
        <div className="bg-white rounded-2xl border-2 border-indigo-500 shadow-sm p-6 space-y-4 relative overflow-hidden flex flex-col justify-between">
          <div>
            <div className="flex items-center justify-between mb-3">
              <div className="flex items-center gap-3">
                <div className="w-9 h-9 rounded-xl bg-indigo-100 text-indigo-700 flex items-center justify-center">
                  <MessageSquare className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="text-base font-bold text-slate-900">WhatsApp (Evolution API)</h3>
                  <p className="text-xs text-indigo-600 font-semibold">Instância Exclusiva & Custo Zero</p>
                </div>
              </div>

              {evoStatus?.connected ? (
                <span className="px-2.5 py-1 bg-emerald-100 text-emerald-800 rounded-full text-[10px] font-bold flex items-center gap-1.5 border border-emerald-300">
                  <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse"></span>
                  CONECTADO
                </span>
              ) : (
                <span className="px-2.5 py-1 bg-slate-100 text-slate-600 rounded-full text-[10px] font-bold">
                  DESCONECTADO
                </span>
              )}
            </div>

            <p className="text-xs text-slate-600 leading-relaxed">
              O WhatsApp deste expert é 100% isolado. O QR Code é gerado automaticamente pelo backend e nenhum outro usuário tem acesso ao seu número ou mensagens.
            </p>

            {evoStatus?.phone && (
              <div className="mt-3 p-3 bg-slate-50 border border-slate-100 rounded-lg text-xs">
                <span className="text-[10px] text-slate-400 uppercase font-bold block mb-0.5">Número Ativo</span>
                <span className="font-bold text-slate-800">{evoStatus.phone}</span>
              </div>
            )}
          </div>

          <div className="pt-4 border-t border-slate-100">
            <a
              href="/whatsapp"
              className="w-full py-2 bg-indigo-600 hover:bg-indigo-700 text-white font-semibold rounded-lg text-xs transition-colors flex items-center justify-center gap-2 shadow-sm"
            >
              <MessageSquare className="w-3.5 h-3.5" />
              <span>{evoStatus?.connected ? 'Gerenciar WhatsApp' : 'Conectar com QR Code'}</span>
            </a>
          </div>
        </div>

        {/* WhatsApp Meta Cloud API */}
        <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-6 space-y-4">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-emerald-100 text-emerald-700 flex items-center justify-center">
              <ShieldCheck className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-base font-bold text-slate-900">Meta Cloud API (Oficial)</h3>
              <p className="text-xs text-slate-500">Graph API v21.0 sem risco de ban</p>
            </div>
          </div>

          <div className="space-y-3 text-xs">
            <div className="p-3 rounded-lg bg-emerald-50 border border-emerald-100 text-emerald-800 text-[11px]">
              Ideal para grandes volumes e garantia de estabilidade pela infraestrutura oficial da Meta. Requer aprovação prévia de templates.
            </div>

            <div>
              <span className="text-slate-500 block mb-1">Webhook Callback URL:</span>
              <code className="p-2 bg-slate-100 rounded block font-mono text-[10px] text-slate-700 truncate">
                {typeof window !== 'undefined' ? `${window.location.origin}/api/webhooks/whatsapp` : '/api/webhooks/whatsapp'}
              </code>
            </div>
          </div>
        </div>

        {/* E-mail Marketing */}
        <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-6 space-y-4">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-blue-100 text-blue-700 flex items-center justify-center">
              <Mail className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-base font-bold text-slate-900">E-mail Marketing</h3>
              <p className="text-xs text-slate-500">Resend / SES / Simulado</p>
            </div>
          </div>

          <div className="space-y-2 text-xs text-slate-600">
            <div className="p-3 bg-slate-50 rounded-lg border border-slate-100 font-mono text-[10px] space-y-1">
              <div><strong>SPF:</strong> v=spf1 include:resend.com ~all</div>
              <div><strong>DKIM:</strong> resend._domainkey.seudominio</div>
              <div><strong>DMARC:</strong> v=DMARC1; p=none; pct=100</div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
