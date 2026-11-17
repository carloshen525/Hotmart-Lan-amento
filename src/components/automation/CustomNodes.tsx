'use client';

import { memo } from 'react';
import { Handle, Position } from '@xyflow/react';
import {
  Tag,
  Clock,
  Play,
  Mail,
  MessageSquare,
  AlertCircle,
  Settings,
  Flame,
  Globe,
} from 'lucide-react';

// ============================================================
// NÍVEL 1: NÓS DO FLUXO PRINCIPAL (MACRO)
// ============================================================

// 1. Nó de Tag (Gatilho de Entrada / Saída) - Suporta Tags de Entrada e Exclusão
export const TagNode = memo(({ data, selected }: any) => {
  const count = data.config?.leadsCount ?? data.leadsCount ?? 0;
  const isGroup = data.config?.targetType === 'GROUP' || data.isGroup || data.targetType === 'GROUP';
  const unitLabel = isGroup ? (count === 1 ? 'grupo' : 'grupos') : (count === 1 ? 'lead' : 'leads');
  const entryTags: string[] =
    data.config?.entryTags ||
    data.config?.tagNames ||
    (data.config?.tagName ? [data.config.tagName] : data.tagName ? [data.tagName] : []);
  const exclusionTags: string[] = data.config?.exclusionTags || [];
  const hasConfig = entryTags.length > 0;
  const matchMode = data.config?.matchMode || 'ALL'; // 'ALL' = TODAS simultâneas

  return (
    <div className="flex flex-col items-center group cursor-pointer select-none">
      {/* Caixa do Ícone */}
      <div
        className={`relative w-14 h-14 rounded-2xl flex items-center justify-center transition-all duration-200 ${
          selected
            ? 'bg-slate-700 ring-2 ring-indigo-400 shadow-lg shadow-indigo-500/20'
            : 'bg-[#555861] hover:bg-[#60636d] shadow-md'
        }`}
      >
        {/* Handle de Entrada (Esquerda) */}
        <Handle
          type="target"
          position={Position.Left}
          className="!w-3 !h-3 !bg-slate-400 !border-2 !border-[#181a20] -ml-1 hover:!bg-white"
        />

        {/* Ícone de Tag */}
        <Tag className="w-6 h-6 text-white stroke-[2]" />

        {/* Badge vermelho de Atenção se não configurado */}
        {!hasConfig && (
          <div className="absolute -top-1.5 -right-1.5 w-5 h-5 rounded-full bg-red-600 border-2 border-[#181a20] flex items-center justify-center text-white font-bold text-[10px] shadow-sm animate-pulse">
            !
          </div>
        )}

        {/* Handle de Saída (Direita) */}
        <Handle
          type="source"
          position={Position.Right}
          className="!w-3 !h-3 !bg-slate-400 !border-2 !border-[#181a20] -mr-1 hover:!bg-white"
        />
      </div>

      {/* Legenda abaixo do nó */}
      <div className="text-center mt-1.5 max-w-[210px]">
        <div className="flex items-center justify-center gap-1 flex-wrap">
          <span className="text-[12px] font-medium text-slate-200 tracking-wide block">
            Tags{entryTags.length > 1 ? ` (${entryTags.length})` : ''} | {count} {unitLabel}
          </span>
          {entryTags.length > 1 && (
            <span className="text-[9px] font-bold px-1.5 py-0.2 rounded bg-indigo-950 text-indigo-300 border border-indigo-800">
              {matchMode === 'ALL' ? 'TODAS (E)' : 'QUALQUER (OU)'}
            </span>
          )}
        </div>

        {/* Tags de Entrada */}
        {entryTags.length > 0 && (
          <div className="flex flex-wrap items-center justify-center gap-1 mt-1">
            {entryTags.map((tn: string, idx: number) => (
              <span
                key={idx}
                className="text-[10px] font-semibold text-purple-300 bg-purple-950/70 px-2 py-0.5 rounded-md border border-purple-800/60 truncate max-w-[190px] inline-block"
                title={tn}
              >
                {tn}
              </span>
            ))}
          </div>
        )}

        {/* Tags de Exclusão (se houver) */}
        {exclusionTags.length > 0 && (
          <div className="flex flex-wrap items-center justify-center gap-1 mt-1">
            {exclusionTags.map((ex: string, idx: number) => (
              <span
                key={idx}
                className="text-[9px] font-medium text-red-300 bg-red-950/60 px-1.5 py-0.2 rounded border border-red-800/60 truncate max-w-[190px] inline-block"
                title={`Exclui: ${ex}`}
              >
                Bloqueia: {ex}
              </span>
            ))}
          </div>
        )}
      </div>
    </div>
  );
});
TagNode.displayName = 'TagNode';

// 2. Nó de Sequência Lead - Estilo Idêntico ao Print
export const SequenceLeadNode = memo(({ data, selected }: any) => {
  const count = data.config?.leadsCount ?? data.leadsCount ?? 0;
  const waiting = data.config?.waitingCount ?? 0;
  const success = data.config?.successCount ?? 0;
  const failed = data.config?.failedCount ?? 0;
  const isGroup = data.config?.targetType === 'GROUP' || data.isGroup || data.targetType === 'GROUP';
  const unitLabel = isGroup ? (count === 1 ? 'grupo' : 'grupos') : (count === 1 ? 'lead' : 'leads');
  const label = data.label || (isGroup ? 'Sequência de Grupos' : 'Sequência Lead');

  return (
    <div className="flex flex-col items-center group cursor-pointer select-none">
      {/* Bloco Vermelho Arredondado */}
      <div
        className={`relative w-48 h-14 rounded-2xl flex items-center justify-center px-4 transition-all duration-200 ${
          selected
            ? 'bg-[#c24141] ring-2 ring-red-400 shadow-xl shadow-red-900/30'
            : 'bg-[#b83b3b] hover:bg-[#c24141] shadow-lg'
        }`}
      >
        {/* Handle Entrada (Esquerda) */}
        <Handle
          type="target"
          position={Position.Left}
          className="!w-3 !h-3 !bg-slate-300 !border-2 !border-[#181a20] -ml-1 hover:!bg-white"
        />

        {/* Ícone de Trilha da Sequência: o---o-o-o---o */}
        <div className="flex items-center gap-1.5 text-white/90">
          <div className="w-5 h-5 rounded-full border-2 border-white flex items-center justify-center">
            <div className="w-1.5 h-1.5 bg-white rounded-full" />
          </div>
          <div className="w-2.5 h-0.5 bg-white/70" />
          <div className="w-1.5 h-1.5 rounded-full bg-white/90" />
          <div className="w-1.5 h-1.5 rounded-full bg-white/90" />
          <div className="w-1.5 h-1.5 rounded-full bg-white/90" />
          <div className="w-2.5 h-0.5 bg-white/70" />
          <div className="w-5 h-5 rounded-full border-2 border-white flex items-center justify-center">
            <div className="w-1.5 h-1.5 bg-white rounded-full" />
          </div>
        </div>

        {/* Handle Saída (Direita) */}
        <Handle
          type="source"
          position={Position.Right}
          className="!w-3 !h-3 !bg-slate-300 !border-2 !border-[#181a20] -mr-1 hover:!bg-white"
        />
      </div>

      {/* Legenda abaixo */}
      <div className="text-center mt-1.5">
        <span className="text-[12px] font-medium text-slate-200 tracking-wide block">
          {label} | {count} {unitLabel}
        </span>

        {/* Pílulas coloridas de status (Amarelo, Verde, Vermelho) */}
        <div className="flex items-center justify-center gap-1 mt-1">
          <span className="px-2 py-0.2 rounded-md bg-[#848c26] text-black font-bold text-[10px] min-w-[20px] text-center">
            {waiting}
          </span>
          <span className="px-2 py-0.2 rounded-md bg-[#1db954] text-black font-bold text-[10px] min-w-[20px] text-center">
            {success}
          </span>
          <span className="px-2 py-0.2 rounded-md bg-[#b83b3b] text-white font-bold text-[10px] min-w-[20px] text-center">
            {failed}
          </span>
        </div>
      </div>
    </div>
  );
});
SequenceLeadNode.displayName = 'SequenceLeadNode';

// Formatação consistente do resumo do Timer para cards e listagens
export function formatTimerSummary(config: any): string {
  if (!config) return '⏳ Esperar 1 minuto';

  const isSpecific =
    config.timerType === 'SPECIFIC_DATE' ||
    config.delayType === 'specific_date' ||
    Boolean(config.specificDate && config.timerType !== 'CONTINUOUS');

  if (isSpecific && config.specificDate) {
    try {
      const d = new Date(config.specificDate);
      if (!isNaN(d.getTime())) {
        const day = String(d.getDate()).padStart(2, '0');
        const month = String(d.getMonth() + 1).padStart(2, '0');
        const year = d.getFullYear();
        const hours = String(d.getHours()).padStart(2, '0');
        const mins = String(d.getMinutes()).padStart(2, '0');
        return `⏳ Até ${day}/${month}/${year} às ${hours}:${mins}`;
      }
    } catch {}
    return `⏳ Até ${config.specificDate}`;
  }

  const val = Number(config.value ?? config.duration ?? config.minutes ?? config.delayMinutes ?? 1);
  const unit = config.unit || 'minutes';

  if (unit === 'hours' || unit === 'hora' || unit === 'horas') {
    return val === 1 ? '⏳ Esperar 1 hora' : `⏳ Esperar ${val} horas`;
  }
  if (unit === 'days' || unit === 'dia' || unit === 'dias') {
    return val === 1 ? '⏳ Esperar 1 dia' : `⏳ Esperar ${val} dias`;
  }
  return val === 1 ? '⏳ Esperar 1 minuto' : `⏳ Esperar ${val} minutos`;
}

// 3. Nó de Timer (Temporizador Macro / Micro) - Estilo Idêntico ao Print
export const TimerNode = memo(({ data, selected }: any) => {
  const summary = formatTimerSummary(data.config);
  const waiting = data.config?.waitingCount ?? 0;
  const success = data.config?.successCount ?? 0;
  const failed = data.config?.failedCount ?? 0;

  return (
    <div className="flex flex-col items-center group cursor-pointer select-none">
      {/* Caixa Escura do Relógio */}
      <div
        className={`relative w-14 h-14 rounded-2xl flex items-center justify-center transition-all duration-200 ${
          selected
            ? 'bg-slate-800 ring-2 ring-sky-400 shadow-xl shadow-sky-950/40'
            : 'bg-[#181a20] border border-slate-700/60 hover:border-slate-500 shadow-lg'
        }`}
      >
        <Handle
          type="target"
          position={Position.Left}
          className="!w-3 !h-3 !bg-slate-400 !border-2 !border-[#181a20] -ml-1 hover:!bg-white"
        />

        <Clock className="w-6 h-6 text-white stroke-[1.8]" />

        <Handle
          type="source"
          position={Position.Right}
          className="!w-3 !h-3 !bg-slate-400 !border-2 !border-[#181a20] -mr-1 hover:!bg-white"
        />
      </div>

      {/* Legenda com tempo e dias da semana */}
      <div className="text-center mt-1.5 max-w-[210px]">
        <span
          className="text-[12px] font-medium text-slate-200 tracking-wide block truncate"
          title={summary}
        >
          {summary}
        </span>
        <span className="text-[10px] text-slate-400 block mt-0.5">
          {data.config?.weekDaysSummary || 'Dom, Seg, Ter, Qua, Qui, Sex, Sáb.'}
        </span>

        {/* Pílulas de status */}
        <div className="flex items-center justify-center gap-1 mt-1">
          <span className="px-2 py-0.2 rounded-md bg-[#848c26] text-black font-bold text-[10px] min-w-[20px] text-center">
            {waiting}
          </span>
          <span className="px-2 py-0.2 rounded-md bg-[#1db954] text-black font-bold text-[10px] min-w-[20px] text-center">
            {success}
          </span>
          <span className="px-2 py-0.2 rounded-md bg-[#b83b3b] text-white font-bold text-[10px] min-w-[20px] text-center">
            {failed}
          </span>
        </div>
      </div>
    </div>
  );
});
TimerNode.displayName = 'TimerNode';

// ============================================================
// NÍVEL 2: NÓS DENTRO DA SEQUÊNCIA (INTERNOS)
// ============================================================

// 4. Nó de Início da Sequência (Start) - Amarelo com Play
export const StartNode = memo(({ data, selected }: any) => {
  const count = data.leadsCount ?? 0;

  return (
    <div className="flex flex-col items-center group cursor-default select-none">
      <div
        className={`w-14 h-14 rounded-2xl flex items-center justify-center bg-[#facc15] shadow-lg shadow-yellow-500/20 transition-all ${
          selected ? 'ring-2 ring-white scale-105' : ''
        }`}
      >
        <Play className="w-6 h-6 text-black fill-black ml-0.5" />

        {/* Handle de Saída (Direita) */}
        <Handle
          type="source"
          position={Position.Right}
          className="!w-3 !h-3 !bg-slate-400 !border-2 !border-[#181a20] -mr-1 hover:!bg-white"
        />
      </div>

      <div className="text-center mt-1.5">
        <span className="text-[12px] font-medium text-slate-200 tracking-wide block">
          Start | {count} lead{count === 1 ? '' : 's'}
        </span>
      </div>
    </div>
  );
});
StartNode.displayName = 'StartNode';

// 5. Nó de Disparo de WhatsApp - Verde com Ícone do WhatsApp
export const WhatsAppNode = memo(({ data, selected }: any) => {
  const count = data.config?.leadsCount ?? data.leadsCount ?? 0;
  const isGroup = data.config?.targetType === 'GROUP' || data.isGroup || data.targetType === 'GROUP';
  const unitLabel = isGroup ? (count === 1 ? 'grupo' : 'grupos') : (count === 1 ? 'lead' : 'leads');
  const waiting = data.config?.waitingCount ?? 0;
  const success = data.config?.successCount ?? 0;
  const failed = data.config?.failedCount ?? 0;
  const blocks = data.config?.blocks;
  const hasBlocks = Array.isArray(blocks) && blocks.length > 0;
  const firstMediaBlock = hasBlocks ? blocks.find((b: any) => b.type !== 'text') : null;
  const messageType = firstMediaBlock ? firstMediaBlock.type : (data.config?.messageType || (data.config?.mediaUrl ? 'image' : 'text'));
  const hasContent = hasBlocks
    ? blocks.some((b: any) => Boolean((b.text && b.text.trim()) || b.mediaUrl || b.mediaBase64 || (b.caption && b.caption.trim())))
    : Boolean(data.config?.message || data.config?.text || data.config?.mediaUrl || data.config?.mediaBase64);

  return (
    <div className="flex flex-col items-center group cursor-pointer select-none">
      <div
        className={`relative w-14 h-14 rounded-2xl flex items-center justify-center transition-all duration-200 ${
          selected
            ? 'bg-[#15803d] ring-2 ring-green-400 shadow-xl shadow-green-950/40'
            : 'bg-[#1e7c3b] hover:bg-[#238b43] shadow-lg'
        }`}
      >
        <Handle
          type="target"
          position={Position.Left}
          className="!w-3 !h-3 !bg-slate-300 !border-2 !border-[#181a20] -ml-1 hover:!bg-white"
        />

        {/* Ícone de Balão/WhatsApp */}
        <MessageSquare className="w-6 h-6 text-white stroke-[2]" />

        {/* Badge indicador de tipo de mídia */}
        {messageType !== 'text' && (
          <div className="absolute -top-1.5 -left-1.5 text-[11px] bg-slate-900 border border-slate-700 rounded-full w-5 h-5 flex items-center justify-center shadow">
            {messageType === 'audio' ? '🎙️' : messageType === 'video' ? '🎥' : '📷'}
          </div>
        )}

        {/* Badge vermelho de Atenção se a mensagem estiver vazia */}
        {!hasContent && (
          <div className="absolute -top-1.5 -right-1.5 w-5 h-5 rounded-full bg-red-600 border-2 border-[#181a20] flex items-center justify-center text-white font-bold text-[10px] shadow-sm animate-pulse">
            !
          </div>
        )}

        <Handle
          type="source"
          position={Position.Right}
          className="!w-3 !h-3 !bg-slate-300 !border-2 !border-[#181a20] -mr-1 hover:!bg-white"
        />
      </div>

      <div className="text-center mt-1.5">
        <span className="text-[12px] font-medium text-slate-200 tracking-wide block">
          WhatsApp | {count} {unitLabel}
        </span>

        {Boolean(data.config?.whatsappInstanceName || data.config?.whatsappPhone) ? (
          <span className="text-[10px] text-emerald-400 font-medium block truncate max-w-[130px] mx-auto">
            📱 {data.config.whatsappInstanceName || data.config.whatsappPhone}
          </span>
        ) : (
          <span className="text-[10px] text-amber-400 font-semibold block truncate max-w-[130px] mx-auto bg-amber-950/60 px-1.5 py-0.5 rounded border border-amber-500/30 mt-0.5">
            ⚠️ WhatsApp Obrigatório
          </span>
        )}

        {/* Pílulas de status */}
        <div className="flex items-center justify-center gap-1 mt-1">
          <span className="px-2 py-0.2 rounded-md bg-[#848c26] text-black font-bold text-[10px] min-w-[20px] text-center">
            {waiting}
          </span>
          <span className="px-2 py-0.2 rounded-md bg-[#1db954] text-black font-bold text-[10px] min-w-[20px] text-center">
            {success}
          </span>
          <span className="px-2 py-0.2 rounded-md bg-[#b83b3b] text-white font-bold text-[10px] min-w-[20px] text-center">
            {failed}
          </span>
        </div>
      </div>
    </div>
  );
});
WhatsAppNode.displayName = 'WhatsAppNode';

// 6. Nó de Disparo de E-mail - Marrom/Laranja com Envelope
export const EmailNode = memo(({ data, selected }: any) => {
  const count = data.config?.leadsCount ?? data.leadsCount ?? 0;
  const waiting = data.config?.waitingCount ?? 0;
  const success = data.config?.successCount ?? 0;
  const failed = data.config?.failedCount ?? 0;
  const hasSubject = !!data.config?.subject;
  const hasVisualDesign = Boolean(data.config?.contentJson || data.config?.generatedHtml);

  return (
    <div className="flex flex-col items-center group cursor-pointer select-none">
      <div
        className={`relative w-14 h-14 rounded-2xl flex items-center justify-center transition-all duration-200 ${
          selected
            ? 'bg-[#9a5b3a] ring-2 ring-orange-400 shadow-xl shadow-orange-950/40'
            : 'bg-[#8d4f2f] hover:bg-[#9a5b3a] shadow-lg'
        }`}
      >
        <Handle
          type="target"
          position={Position.Left}
          className="!w-3 !h-3 !bg-slate-300 !border-2 !border-[#181a20] -ml-1 hover:!bg-white"
        />

        <Mail className="w-6 h-6 text-white stroke-[2]" />

        {/* Badge indicador de Construtor Visual */}
        {hasVisualDesign && (
          <div
            className="absolute -top-1.5 -left-1.5 text-[10px] bg-slate-900 border border-amber-500/60 rounded-full w-5 h-5 flex items-center justify-center shadow"
            title="Design Visual Ativo"
          >
            ✨
          </div>
        )}

        {/* Badge vermelho de Atenção se não configurado */}
        {!hasSubject && (
          <div className="absolute -top-1.5 -right-1.5 w-5 h-5 rounded-full bg-red-600 border-2 border-[#181a20] flex items-center justify-center text-white font-bold text-[10px] shadow-sm animate-pulse">
            !
          </div>
        )}

        <Handle
          type="source"
          position={Position.Right}
          className="!w-3 !h-3 !bg-slate-300 !border-2 !border-[#181a20] -mr-1 hover:!bg-white"
        />
      </div>

      <div className="text-center mt-1.5">
        <span className="text-[12px] font-medium text-slate-200 tracking-wide block truncate max-w-[150px]">
          {data.label || 'E-mail Performance'} | {count} lead{count === 1 ? '' : 's'}
        </span>

        {/* Pílulas de status */}
        <div className="flex items-center justify-center gap-1 mt-1">
          <span className="px-2 py-0.2 rounded-md bg-[#848c26] text-black font-bold text-[10px] min-w-[20px] text-center">
            {waiting}
          </span>
          <span className="px-2 py-0.2 rounded-md bg-[#1db954] text-black font-bold text-[10px] min-w-[20px] text-center">
            {success}
          </span>
          <span className="px-2 py-0.2 rounded-md bg-[#b83b3b] text-white font-bold text-[10px] min-w-[20px] text-center">
            {failed}
          </span>
        </div>
      </div>
    </div>
  );
});
EmailNode.displayName = 'EmailNode';

// 7. Nó de Aquecimento (Throttle / Warmup) - Coral/Vermelho com Ícone de Chama 🔥
export const WarmupNode = memo(({ data, selected }: any) => {
  const count = data.config?.leadsCount ?? data.leadsCount ?? 0;
  const waiting = data.config?.waitingCount ?? 0;
  const success = data.config?.successCount ?? 0;
  const failed = data.config?.failedCount ?? 0;
  const rateLimit = data.config?.rateLimitPerMinute ?? data.config?.releasesPerMinute ?? 1;

  return (
    <div className="flex flex-col items-center group cursor-pointer select-none">
      <div
        className={`relative w-14 h-14 rounded-2xl flex items-center justify-center transition-all duration-200 ${
          selected
            ? 'bg-[#e05260] ring-2 ring-rose-400 shadow-xl shadow-rose-950/40'
            : 'bg-[#d94d5c] hover:bg-[#e05260] shadow-lg'
        }`}
      >
        <Handle
          type="target"
          position={Position.Left}
          className="!w-3 !h-3 !bg-slate-300 !border-2 !border-[#181a20] -ml-1 hover:!bg-white"
        />

        <Flame className="w-6 h-6 text-white fill-white stroke-[1.5]" />

        <Handle
          type="source"
          position={Position.Right}
          className="!w-3 !h-3 !bg-slate-300 !border-2 !border-[#181a20] -mr-1 hover:!bg-white"
        />
      </div>

      <div className="text-center mt-1.5">
        <span className="text-[12px] font-medium text-slate-200 tracking-wide block">
          Aquecimento | {count} lead{count === 1 ? '' : 's'}
        </span>
        <span className="text-[10px] text-slate-400 block mt-0.5">
          {rateLimit} por minuto
        </span>

        {/* Pílulas de status */}
        <div className="flex items-center justify-center gap-1 mt-1">
          <span className="px-2 py-0.2 rounded-md bg-[#848c26] text-black font-bold text-[10px] min-w-[20px] text-center">
            {waiting}
          </span>
          <span className="px-2 py-0.2 rounded-md bg-[#1db954] text-black font-bold text-[10px] min-w-[20px] text-center">
            {success}
          </span>
          <span className="px-2 py-0.2 rounded-md bg-[#b83b3b] text-white font-bold text-[10px] min-w-[20px] text-center">
            {failed}
          </span>
        </div>
      </div>
    </div>
  );
});
WarmupNode.displayName = 'WarmupNode';
