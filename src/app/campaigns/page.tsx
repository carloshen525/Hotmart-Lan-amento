'use client';

import { useState, useEffect } from 'react';
import { Rocket, Plus, Calendar, Target, CheckCircle2, Copy } from 'lucide-react';

const launchTemplates = [
  {
    type: 'CLASSICO',
    title: 'Lançamento Clássico (CPL 1, 2 e 3)',
    desc: 'Funil de 4 vídeos com captura intensa, aquecimento de 15 dias, abertura de carrinho por 5 dias e encerramento com bônus relâmpago.',
  },
  {
    type: 'SEMENTE',
    title: 'Lançamento Semente (Validação)',
    desc: 'Ideal para validar um novo produto com grupo VIP no WhatsApp e aula única de fechamento ao vivo.',
  },
  {
    type: 'PERPETUO',
    title: 'Funil Perpétuo com Recuperação',
    desc: 'Captação diária no tráfego pago com automação de 7 dias, oferta no 3º dia e recuperação automática de Pix e carrinho.',
  },
  {
    type: 'RECUPERACAO_PIX',
    title: 'Recuperador de Pix e Boleto',
    desc: 'Disparo de WhatsApp aos 15 min, 2h e 24h com chave Pix copia-e-cola e suporte humano.',
  },
  {
    type: 'POS_VENDA',
    title: 'Onboarding & Pós-Venda',
    desc: 'Boas-vindas imediata, dados de acesso ao curso, link da comunidade e pesquisa de perfil do aluno.',
  },
];

export default function CampaignsPage() {
  const [campaigns, setCampaigns] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch('/api/campaigns')
      .then((res) => res.json())
      .then((data) => {
        setCampaigns(data.campaigns || []);
        setLoading(false);
      })
      .catch(() => setLoading(false));
  }, []);

  return (
    <div className="space-y-8 max-w-7xl mx-auto">
      <div>
        <h1 className="text-2xl font-bold text-slate-900 tracking-tight">Campanhas de Lançamento</h1>
        <p className="text-sm text-slate-500 mt-1">
          Modelos estratégicos pré-formatados com automações e metas de captação de leads.
        </p>
      </div>

      {/* Modelos Estratégicos Prontos */}
      <div>
        <h2 className="text-sm font-bold text-slate-800 uppercase tracking-wider mb-4">
          Modelos Prontos de Lançamento Digital
        </h2>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
          {launchTemplates.map((t) => (
            <div
              key={t.type}
              className="bg-white p-5 rounded-xl border border-slate-200 shadow-sm flex flex-col justify-between hover:border-indigo-400 transition-colors"
            >
              <div>
                <div className="flex items-center gap-2 text-indigo-600 font-bold text-xs mb-2">
                  <Rocket className="w-4 h-4" />
                  <span>{t.type}</span>
                </div>
                <h3 className="font-bold text-slate-900 text-sm">{t.title}</h3>
                <p className="text-xs text-slate-500 mt-2 leading-relaxed">{t.desc}</p>
              </div>

              <div className="pt-4 mt-4 border-t border-slate-100 flex items-center justify-between">
                <span className="text-[11px] text-emerald-600 font-semibold flex items-center gap-1">
                  <CheckCircle2 className="w-3.5 h-3.5" />
                  Pronto para usar
                </span>
                <a
                  href="/automations"
                  className="px-3 py-1 bg-indigo-50 hover:bg-indigo-100 text-indigo-700 font-semibold text-xs rounded-lg transition-colors"
                >
                  Ver Fluxo
                </a>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Campanhas Ativas */}
      <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-6">
        <h2 className="text-base font-bold text-slate-900 mb-4">Campanhas Cadastradas no Expert</h2>
        <div className="divide-y divide-slate-100">
          {loading ? (
            <div className="py-6 text-center text-slate-400 text-xs">Carregando campanhas...</div>
          ) : campaigns.length === 0 ? (
            <div className="py-6 text-center text-slate-400 text-xs">Nenhuma campanha criada ainda.</div>
          ) : (
            campaigns.map((c) => (
              <div key={c.id} className="py-4 flex items-center justify-between text-xs">
                <div>
                  <span className="font-bold text-slate-800 text-sm block">{c.name}</span>
                  <span className="text-slate-400">Modelo: {c.modelType}</span>
                </div>
                <div className="flex items-center gap-4 text-slate-600">
                  <span>Meta: {c.goalLeads} leads</span>
                  <span className="px-2 py-0.5 bg-emerald-50 text-emerald-700 font-semibold rounded-full border border-emerald-200 text-[10px]">
                    {c.status}
                  </span>
                </div>
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );
}
