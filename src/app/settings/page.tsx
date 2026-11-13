'use client';

import { useState, useEffect } from 'react';
import { Settings, Plus, Building, ShieldCheck, Mail, Phone, Flame, Check, Trash2, Sparkles } from 'lucide-react';

export default function SettingsPage() {
  const [tenants, setTenants] = useState<any[]>([]);
  const [activeTenant, setActiveTenant] = useState<any>(null);
  const [isCreating, setIsCreating] = useState(false);

  // Form novo expert
  const [name, setName] = useState('');
  const [slug, setSlug] = useState('');
  const [description, setDescription] = useState('');
  const [emailSender, setEmailSender] = useState('');
  const [whatsappNumber, setWhatsappNumber] = useState('');
  const [hotmartHottok, setHotmartHottok] = useState('');
  const [notice, setNotice] = useState<string | null>(null);

  const fetchTenants = () => {
    fetch('/api/tenants')
      .then((res) => res.json())
      .then((data) => setTenants(data.tenants || []));

    fetch('/api/auth/me')
      .then((res) => res.json())
      .then((data) => setActiveTenant(data.activeTenant));
  };

  useEffect(() => {
    fetchTenants();
  }, []);

  const handleCreateExpert = async (e: React.FormEvent) => {
    e.preventDefault();
    setNotice(null);

    try {
      const res = await fetch('/api/tenants', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name,
          slug,
          description,
          emailSender,
          whatsappNumber,
          hotmartHottok,
        }),
      });

      if (res.ok) {
        setNotice('Novo expert cadastrado com sucesso!');
        setName('');
        setSlug('');
        setDescription('');
        setIsCreating(false);
        fetchTenants();
      }
    } catch {
      setNotice('Erro ao cadastrar');
    }
  };

  const handleDeleteExpert = async (id: string, name: string) => {
    if (!confirm(`Tem certeza que deseja excluir o expert "${name}" e todos os seus contatos, tags e automações?`)) return;
    setNotice(null);

    try {
      const res = await fetch(`/api/tenants/${id}`, { method: 'DELETE' });
      if (res.ok) {
        setNotice(`Expert "${name}" excluído com sucesso.`);
        fetchTenants();
      }
    } catch {
      setNotice('Erro ao excluir expert.');
    }
  };

  const handleCleanAllDemo = async () => {
    if (!confirm('Deseja excluir todos os experts de teste e demonstração de uma vez?')) return;
    setNotice(null);

    try {
      const res = await fetch('/api/tenants/clean-demo', { method: 'POST' });
      const json = await res.json();
      setNotice(`${json.deletedCount || 0} experts de demonstração foram excluídos.`);
      fetchTenants();
    } catch {
      setNotice('Erro ao limpar demonstração.');
    }
  };

  return (
    <div className="space-y-8 max-w-7xl mx-auto">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-900 tracking-tight">Configurações & Gestão de Experts</h1>
          <p className="text-sm text-slate-500 mt-1">
            Ambientes multi-tenant com contatos, tags, webhooks Hotmart, WhatsApp e E-mail 100% isolados.
          </p>
        </div>
        <a
          href="/settings/email"
          className="inline-flex items-center gap-2 px-4 py-2 bg-slate-900 hover:bg-slate-800 text-white rounded-xl text-xs font-bold transition-all shadow-md"
        >
          <Mail className="w-4 h-4 text-indigo-400" />
          <span>Configurações de E-mail (SMTP)</span>
        </a>
      </div>

      {notice && (
        <div className="p-3 rounded-lg bg-emerald-50 text-emerald-700 text-xs font-semibold border border-emerald-200">
          {notice}
        </div>
      )}

      {/* Grid de Experts */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-6 col-span-1 space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-bold text-slate-800 uppercase tracking-wider">Seus Experts</h2>
            <button
              onClick={() => setIsCreating(!isCreating)}
              className="text-xs font-semibold text-indigo-600 hover:text-indigo-800 flex items-center gap-1"
            >
              <Plus className="w-3.5 h-3.5" />
              <span>Novo Expert</span>
            </button>
          </div>

          <div className="space-y-2">
            {tenants.length === 0 ? (
              <div className="p-4 rounded-xl bg-slate-50 border border-dashed border-slate-200 text-center text-xs text-slate-400">
                Nenhum expert cadastrado. Clique em <strong>+ Novo Expert</strong> para cadastrar seu primeiro ambiente.
              </div>
            ) : (
              tenants.map((t) => (
                <div
                  key={t.id}
                  className={`p-3 rounded-xl border text-xs flex items-center justify-between transition-colors ${
                    activeTenant?.id === t.id
                      ? 'border-indigo-600 bg-indigo-50/50 text-indigo-950 font-medium'
                      : 'border-slate-200 bg-white hover:bg-slate-50 text-slate-700'
                  }`}
                >
                  <div className="flex-1 min-w-0 pr-2">
                    <div className="font-bold truncate">{t.name}</div>
                    <div className="text-[10px] text-slate-400 truncate">/{t.slug}</div>
                  </div>

                  <div className="flex items-center gap-1.5 shrink-0">
                    {activeTenant?.id === t.id ? (
                      <span className="px-2 py-0.5 bg-indigo-600 text-white rounded text-[10px] font-semibold">
                        Ativo
                      </span>
                    ) : (
                      <button
                        onClick={async () => {
                          await fetch('/api/auth/switch-tenant', {
                            method: 'POST',
                            headers: { 'Content-Type': 'application/json' },
                            body: JSON.stringify({ tenantId: t.id }),
                          });
                          window.location.reload();
                        }}
                        className="text-indigo-600 font-semibold hover:underline px-1.5 py-0.5"
                      >
                        Ativar
                      </button>
                    )}

                    <button
                      onClick={() => handleDeleteExpert(t.id, t.name)}
                      className="p-1 text-slate-300 hover:text-red-600 transition-colors rounded hover:bg-red-50"
                      title="Excluir este expert"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>
              ))
            )}
          </div>

          {tenants.length > 0 && (
            <div className="pt-2">
              <button
                onClick={handleCleanAllDemo}
                className="w-full py-1.5 text-[11px] font-semibold text-slate-400 hover:text-red-600 transition-colors flex items-center justify-center gap-1"
              >
                <Trash2 className="w-3 h-3" />
                <span>Excluir Todos de Demonstração</span>
              </button>
            </div>
          )}
        </div>

        {/* Detalhes ou Formulário de Cadastro */}
        <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-6 col-span-2">
          {isCreating ? (
            <div>
              <h2 className="text-base font-bold text-slate-900 mb-1">Cadastrar Novo Expert</h2>
              <p className="text-xs text-slate-500 mb-6">
                Cria um ambiente exclusivo com listas de leads e credenciais próprias.
              </p>

              <form onSubmit={handleCreateExpert} className="space-y-4 text-xs">
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-slate-700 font-semibold mb-1">Nome do Expert / Produtor *</label>
                    <input
                      type="text"
                      required
                      value={name}
                      onChange={(e) => {
                        setName(e.target.value);
                        setSlug(e.target.value.toLowerCase().replace(/\s+/g, '-'));
                      }}
                      placeholder="Ex: Dra. Juliana Santos"
                      className="w-full p-2 border border-slate-200 rounded-lg"
                    />
                  </div>

                  <div>
                    <label className="block text-slate-700 font-semibold mb-1">Slug (Identificador URL) *</label>
                    <input
                      type="text"
                      required
                      value={slug}
                      onChange={(e) => setSlug(e.target.value)}
                      placeholder="dra-juliana-santos"
                      className="w-full p-2 border border-slate-200 rounded-lg font-mono"
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-slate-700 font-semibold mb-1">Descrição do Nicho / Produto</label>
                  <textarea
                    rows={2}
                    value={description}
                    onChange={(e) => setDescription(e.target.value)}
                    placeholder="Ex: Cursos online e mentorias sobre estética facial..."
                    className="w-full p-2 border border-slate-200 rounded-lg"
                  />
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-slate-700 font-semibold mb-1">E-mail Remetente Oficial</label>
                    <input
                      type="email"
                      value={emailSender}
                      onChange={(e) => setEmailSender(e.target.value)}
                      placeholder="contato@expert.com.br"
                      className="w-full p-2 border border-slate-200 rounded-lg"
                    />
                  </div>

                  <div>
                    <label className="block text-slate-700 font-semibold mb-1">WhatsApp Oficial do Expert</label>
                    <input
                      type="text"
                      value={whatsappNumber}
                      onChange={(e) => setWhatsappNumber(e.target.value)}
                      placeholder="+5511999998888"
                      className="w-full p-2 border border-slate-200 rounded-lg"
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-slate-700 font-semibold mb-1">Token Hottok Hotmart</label>
                  <input
                    type="text"
                    value={hotmartHottok}
                    onChange={(e) => setHotmartHottok(e.target.value)}
                    placeholder="hottok_secreto_fornecido_pela_hotmart"
                    className="w-full p-2 border border-slate-200 rounded-lg font-mono"
                  />
                </div>

                <div className="pt-4 flex items-center justify-end gap-2 border-t border-slate-100">
                  <button
                    type="button"
                    onClick={() => setIsCreating(false)}
                    className="px-4 py-2 border border-slate-200 text-slate-600 rounded-lg hover:bg-slate-50 font-medium"
                  >
                    Cancelar
                  </button>
                  <button
                    type="submit"
                    className="px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg font-semibold shadow-sm"
                  >
                    Salvar e Ativar Expert
                  </button>
                </div>
              </form>
            </div>
          ) : (
            <div>
              <h2 className="text-base font-bold text-slate-900 mb-1">
                Configurações do Expert: {activeTenant?.name}
              </h2>
              <p className="text-xs text-slate-500 mb-6">
                Parâmetros vigentes de comunicação e integrações.
              </p>

              <div className="space-y-4 text-xs">
                <div className="grid grid-cols-2 gap-4">
                  <div className="p-3 rounded-lg bg-slate-50 border border-slate-100">
                    <span className="text-[10px] text-slate-400 uppercase font-bold block mb-1">E-mail de Envio</span>
                    <span className="font-semibold text-slate-800">{activeTenant?.emailSender || 'Não configurado'}</span>
                  </div>
                  <div className="p-3 rounded-lg bg-slate-50 border border-slate-100">
                    <span className="text-[10px] text-slate-400 uppercase font-bold block mb-1">WhatsApp Conectado</span>
                    <span className="font-semibold text-slate-800">{activeTenant?.whatsappNumber || 'Não configurado'}</span>
                  </div>
                </div>

                <div className="p-3 rounded-lg bg-slate-50 border border-slate-100">
                  <span className="text-[10px] text-slate-400 uppercase font-bold block mb-1">Token Hottok Hotmart</span>
                  <span className="font-mono text-slate-700 font-semibold">{activeTenant?.hotmartHottok || 'Token padrão'}</span>
                </div>

                <div className="p-4 rounded-xl bg-indigo-50/60 border border-indigo-100 text-indigo-950 space-y-2 mt-4">
                  <div className="flex items-center gap-2 font-bold text-xs text-indigo-700">
                    <ShieldCheck className="w-4 h-4" />
                    <span>Conformidade com a LGPD e Segurança de Dados</span>
                  </div>
                  <p className="text-[11px] leading-relaxed text-indigo-900">
                    Todos os contatos cadastrados gravam carimbo de data/hora de consentimento. O link de descadastramento automático é incluído em todos os e-mails disparados pela plataforma.
                  </p>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
