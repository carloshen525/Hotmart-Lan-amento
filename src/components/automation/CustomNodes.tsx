'use client';

import { memo } from 'react';
import { Handle, Position } from '@xyflow/react';
import {
  Zap,
  Mail,
  MessageSquare,
  Clock,
  Calendar,
  GitFork,
  Tag,
  LogOut,
  XCircle,
  CheckCircle2,
  AlertCircle,
  Globe,
  UserPlus,
} from 'lucide-react';

// Nó de Gatilho (Trigger)
export const TriggerNode = memo(({ data }: any) => {
  const isTagTrigger = data.subtype === 'TAG_ADDED' || !!data.config?.tagName;
  const isWebhookTrigger = data.subtype === 'HOTMART_EVENT' || data.subtype === 'WEBHOOK';
  const isContactTrigger = data.subtype === 'CONTACT_CREATED';

  const getBadge = () => {
    if (isTagTrigger) {
      return (
        <span className="px-2 py-0.5 rounded-full text-[9px] font-semibold bg-purple-500/20 text-purple-300 border border-purple-500/30">
          Tag
        </span>
      );
    }
    if (isWebhookTrigger) {
      return (
        <span className="px-2 py-0.5 rounded-full text-[9px] font-semibold bg-orange-500/20 text-orange-300 border border-orange-500/30">
          Webhook
        </span>
      );
    }
    return (
      <span className="px-2 py-0.5 rounded-full text-[9px] font-semibold bg-indigo-500/20 text-indigo-300 border border-indigo-500/30">
        Início
      </span>
    );
  };

  const getIcon = () => {
    if (isTagTrigger) return <Tag className="w-3.5 h-3.5 text-purple-400" />;
    if (isWebhookTrigger) return <Globe className="w-3.5 h-3.5 text-orange-400" />;
    if (isContactTrigger) return <UserPlus className="w-3.5 h-3.5 text-emerald-400" />;
    return <Zap className="w-3.5 h-3.5 text-indigo-400" />;
  };

  return (
    <div className="bg-slate-900 border-2 border-indigo-500/90 hover:border-indigo-400 rounded-2xl shadow-2xl p-4 w-68 text-xs text-white transition-all">
      <div className="flex items-center justify-between gap-2 mb-2">
        <div className="flex items-center gap-1.5 text-indigo-400 font-bold">
          <div className="w-6 h-6 rounded-lg bg-indigo-500/20 flex items-center justify-center">
            {getIcon()}
          </div>
          <span className="uppercase text-[10px] tracking-wider text-slate-300">Gatilho de Entrada</span>
        </div>
        {getBadge()}
      </div>

      <div className="font-bold text-slate-100 text-sm leading-snug">{data.label}</div>

      {/* Detalhe de Tag de Entrada */}
      {isTagTrigger && data.config?.tagName && (
        <div className="mt-2.5 pt-2 border-t border-slate-800 flex items-center justify-between">
          <div className="flex items-center gap-1.5">
            <span
              className="w-2.5 h-2.5 rounded-full shrink-0"
              style={{ backgroundColor: data.config?.tagColor || '#a855f7' }}
            />
            <span className="font-semibold text-xs text-purple-200 truncate max-w-[140px]">
              {data.config.tagName}
            </span>
          </div>
          {data.config?.leadsCount !== undefined && (
            <span className="text-[10px] font-mono text-slate-400 bg-slate-800 px-2 py-0.5 rounded-md">
              {data.config.leadsCount} leads
            </span>
          )}
        </div>
      )}

      {/* Detalhe de Webhook de Entrada */}
      {isWebhookTrigger && (
        <div className="mt-2.5 pt-2 border-t border-slate-800 space-y-1 text-[11px]">
          <div className="text-orange-300 font-medium">
            Evento: {data.config?.webhookEvent || 'Hotmart Webhook'}
          </div>
          {data.config?.webhookTag && (
            <div className="text-[10px] text-slate-400 flex items-center gap-1">
              <span>Aplica tag:</span>
              <span className="text-purple-300 font-semibold">{data.config.webhookTag}</span>
            </div>
          )}
        </div>
      )}

      {!isTagTrigger && !isWebhookTrigger && (
        <div className="text-[11px] text-slate-400 mt-1">{data.subtype || 'Início da Automação'}</div>
      )}

      {/* Saída */}
      <Handle
        type="source"
        position={Position.Bottom}
        className="!bg-indigo-500 !w-3.5 !h-3.5 !border-2 !border-slate-900"
      />
    </div>
  );
});
TriggerNode.displayName = 'TriggerNode';

// Nó de Ação (Action & Tag)
export const ActionNode = memo(({ data }: any) => {
  const isTagAction = data.subtype === 'ADD_TAG' || data.subtype === 'REMOVE_TAG';
  const isWhatsApp = data.subtype === 'SEND_WHATSAPP';
  const isEmail = data.subtype === 'SEND_EMAIL';

  const getIcon = () => {
    switch (data.subtype) {
      case 'SEND_EMAIL':
        return <Mail className="w-3.5 h-3.5 text-blue-400" />;
      case 'SEND_WHATSAPP':
        return <MessageSquare className="w-3.5 h-3.5 text-emerald-400" />;
      case 'ADD_TAG':
      case 'REMOVE_TAG':
        return <Tag className="w-3.5 h-3.5 text-purple-400" />;
      case 'CANCEL_OTHER_FLOWS':
        return <XCircle className="w-3.5 h-3.5 text-rose-400" />;
      case 'EXIT_FLOW':
        return <LogOut className="w-3.5 h-3.5 text-slate-400" />;
      default:
        return <Zap className="w-3.5 h-3.5 text-indigo-400" />;
    }
  };

  return (
    <div className="bg-slate-900 border border-slate-700/80 hover:border-indigo-400 rounded-2xl shadow-xl p-3.5 w-64 text-xs text-white transition-all">
      <Handle
        type="target"
        position={Position.Top}
        className="!bg-slate-500 !w-3.5 !h-3.5 !border-2 !border-slate-900"
      />

      <div className="flex items-center justify-between gap-2 mb-2">
        <div className="flex items-center gap-1.5 font-bold">
          <div className="w-6 h-6 rounded-lg bg-slate-800 flex items-center justify-center">
            {getIcon()}
          </div>
          <span className="uppercase text-[10px] tracking-wider text-slate-400">
            {isTagAction ? (data.subtype === 'ADD_TAG' ? 'Adicionar Tag' : 'Remover Tag') : 'Ação'}
          </span>
        </div>

        {isTagAction && (
          <span className="px-2 py-0.5 rounded-full text-[10px] font-semibold bg-purple-500/20 text-purple-300 border border-purple-500/30">
            Tag
          </span>
        )}
      </div>

      <div className="font-bold text-slate-100 text-sm leading-snug">{data.label}</div>

      {/* Detalhe de Tag com visual inspirado na plataforma */}
      {isTagAction && (
        <div className="mt-2 pt-2 border-t border-slate-800 flex items-center justify-between">
          <div className="flex items-center gap-1.5">
            <span
              className="w-2.5 h-2.5 rounded-full shrink-0"
              style={{ backgroundColor: data.config?.tagColor || '#a855f7' }}
            />
            <span className="font-semibold text-xs text-purple-200 truncate max-w-[130px]">
              {data.config?.tagName || 'Selecione a Tag'}
            </span>
          </div>
          {data.config?.leadsCount !== undefined && (
            <span className="text-[10px] font-mono text-slate-400 bg-slate-800 px-2 py-0.5 rounded-md">
              {data.config.leadsCount} leads
            </span>
          )}
        </div>
      )}

      {/* Detalhe de WhatsApp */}
      {isWhatsApp && data.config?.text && (
        <div className="mt-2 pt-2 border-t border-slate-800 text-[11px] text-slate-400 truncate">
          💬 &quot;{data.config.text}&quot;
        </div>
      )}

      {/* Detalhe de E-mail */}
      {isEmail && data.config?.subject && (
        <div className="mt-2 pt-2 border-t border-slate-800 text-[11px] text-slate-400 truncate">
          ✉️ {data.config.subject}
        </div>
      )}

      <Handle
        type="source"
        position={Position.Bottom}
        className="!bg-indigo-500 !w-3.5 !h-3.5 !border-2 !border-slate-900"
      />
    </div>
  );
});
ActionNode.displayName = 'ActionNode';

// Nó Condicional (Condition - SE / SENÃO)
export const ConditionNode = memo(({ data }: any) => {
  return (
    <div className="bg-slate-900 border-2 border-amber-500/80 rounded-2xl shadow-xl p-3.5 w-64 text-xs text-white">
      <Handle
        type="target"
        position={Position.Top}
        className="!bg-slate-500 !w-3.5 !h-3.5 !border-2 !border-slate-900"
      />

      <div className="flex items-center gap-2 text-amber-400 font-bold mb-2">
        <div className="w-6 h-6 rounded-lg bg-amber-500/20 flex items-center justify-center">
          <GitFork className="w-3.5 h-3.5 text-amber-400" />
        </div>
        <span className="uppercase text-[10px] tracking-wider">Condição SE / SENÃO</span>
      </div>

      <div className="font-bold text-slate-100 text-sm leading-snug">{data.label}</div>
      <div className="text-[11px] text-slate-400 mt-1">
        Verifica tag: <span className="text-amber-300 font-semibold">{data.config?.tagName || 'Cliente'}</span>
      </div>

      <div className="flex justify-between items-center mt-3 pt-2.5 border-t border-slate-800 text-[10px] font-bold">
        <span className="text-emerald-400 flex items-center gap-1 bg-emerald-950/60 px-2 py-0.5 rounded-full border border-emerald-500/30">
          ✔ SIM
        </span>
        <span className="text-rose-400 flex items-center gap-1 bg-rose-950/60 px-2 py-0.5 rounded-full border border-rose-500/30">
          ✖ NÃO
        </span>
      </div>

      {/* Alça SIM (Verde) */}
      <Handle
        type="source"
        position={Position.Bottom}
        id="yes"
        style={{ left: '25%' }}
        className="!bg-emerald-500 !w-3.5 !h-3.5 !border-2 !border-slate-900"
      />
      {/* Alça NÃO (Vermelha) */}
      <Handle
        type="source"
        position={Position.Bottom}
        id="no"
        style={{ left: '75%' }}
        className="!bg-rose-500 !w-3.5 !h-3.5 !border-2 !border-slate-900"
      />
    </div>
  );
});
ConditionNode.displayName = 'ConditionNode';

// Nó de Temporizador (Delay / Agendamento)
export const DelayNode = memo(({ data }: any) => {
  const isSpecificDate =
    data.config?.timerType === 'SPECIFIC_DATE' ||
    data.config?.delayType === 'specific_date' ||
    !!data.config?.specificDate;

  const unit = data.config?.unit || (data.config?.minutes !== undefined ? 'minutes' : data.config?.hours !== undefined ? 'hours' : 'days');
  const amount = data.config?.value ?? data.config?.duration ?? data.config?.minutes ?? data.config?.hours ?? data.config?.days ?? 1;

  const unitLabel = unit === 'minutes' ? 'Minutos' : unit === 'hours' ? 'Horas' : 'Dias';

  const formatSpecificDate = (isoStr?: string) => {
    if (!isoStr) return 'Não configurado';
    try {
      const d = new Date(isoStr);
      if (isNaN(d.getTime())) return isoStr;
      return `${d.toLocaleDateString('pt-BR')} às ${d.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}`;
    } catch {
      return isoStr;
    }
  };

  return (
    <div className="bg-slate-900 border-2 border-sky-500/80 rounded-2xl shadow-xl p-3.5 w-64 text-xs text-white">
      <Handle
        type="target"
        position={Position.Top}
        className="!bg-slate-500 !w-3.5 !h-3.5 !border-2 !border-slate-900"
      />

      <div className="flex items-center justify-between gap-2 mb-2">
        <div className="flex items-center gap-1.5 text-sky-400 font-bold">
          <div className="w-6 h-6 rounded-lg bg-sky-500/20 flex items-center justify-center">
            {isSpecificDate ? (
              <Calendar className="w-3.5 h-3.5 text-sky-400" />
            ) : (
              <Clock className="w-3.5 h-3.5 text-sky-400" />
            )}
          </div>
          <span className="uppercase text-[10px] tracking-wider">
            {isSpecificDate ? 'Data Específica' : 'Temporizador'}
          </span>
        </div>

        <span className="px-2 py-0.5 rounded-full text-[9px] font-semibold bg-sky-500/20 text-sky-300 border border-sky-500/30">
          {isSpecificDate ? 'Agendado' : `${amount} ${unitLabel.toLowerCase()}`}
        </span>
      </div>

      <div className="font-bold text-slate-100 text-sm leading-snug">{data.label}</div>

      <div className="mt-2 pt-2 border-t border-slate-800 text-[11px] text-slate-300">
        {isSpecificDate ? (
          <div className="flex items-center gap-1 text-sky-200">
            <Calendar className="w-3 h-3 text-sky-400 shrink-0" />
            <span>{formatSpecificDate(data.config?.specificDate)}</span>
          </div>
        ) : (
          <div className="flex items-center gap-1 text-sky-200">
            <Clock className="w-3 h-3 text-sky-400 shrink-0" />
            <span>Aguardar {amount} {unitLabel}</span>
          </div>
        )}
      </div>

      {data.config?.cancelCondition === 'PURCHASE_APPROVED' && (
        <div className="mt-1.5 flex items-center gap-1 text-[10px] text-emerald-400">
          <CheckCircle2 className="w-3 h-3 text-emerald-400 shrink-0" />
          <span>Interrompe se comprar</span>
        </div>
      )}

      <Handle
        type="source"
        position={Position.Bottom}
        className="!bg-sky-500 !w-3.5 !h-3.5 !border-2 !border-slate-900"
      />
    </div>
  );
});
DelayNode.displayName = 'DelayNode';
