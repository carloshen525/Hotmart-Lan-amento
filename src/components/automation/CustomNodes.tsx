'use client';

import { memo } from 'react';
import { Handle, Position } from '@xyflow/react';
import {
  Zap,
  Mail,
  MessageSquare,
  Clock,
  GitFork,
  Tag,
  LogOut,
  XCircle,
  HelpCircle,
} from 'lucide-react';

// Nó de Gatilho (Trigger)
export const TriggerNode = memo(({ data }: any) => {
  return (
    <div className="bg-white border-2 border-indigo-500 rounded-xl shadow-lg p-3 w-56 text-xs">
      <div className="flex items-center gap-2 text-indigo-600 font-bold mb-1">
        <div className="w-5 h-5 rounded bg-indigo-100 flex items-center justify-center">
          <Zap className="w-3.5 h-3.5" />
        </div>
        <span className="uppercase text-[10px] tracking-wider">Gatilho</span>
      </div>
      <div className="font-semibold text-slate-800">{data.label}</div>
      <div className="text-[10px] text-slate-400 mt-1">{data.subtype || 'Início da Automação'}</div>

      {/* Saída */}
      <Handle
        type="source"
        position={Position.Bottom}
        className="!bg-indigo-600 !w-3 !h-3"
      />
    </div>
  );
});
TriggerNode.displayName = 'TriggerNode';

// Nó de Ação (Action)
export const ActionNode = memo(({ data }: any) => {
  const getIcon = () => {
    switch (data.subtype) {
      case 'SEND_EMAIL':
        return <Mail className="w-3.5 h-3.5 text-blue-600" />;
      case 'SEND_WHATSAPP':
        return <MessageSquare className="w-3.5 h-3.5 text-emerald-600" />;
      case 'ADD_TAG':
      case 'REMOVE_TAG':
        return <Tag className="w-3.5 h-3.5 text-purple-600" />;
      case 'CANCEL_OTHER_FLOWS':
        return <XCircle className="w-3.5 h-3.5 text-red-600" />;
      case 'EXIT_FLOW':
        return <LogOut className="w-3.5 h-3.5 text-slate-600" />;
      default:
        return <Zap className="w-3.5 h-3.5 text-indigo-600" />;
    }
  };

  return (
    <div className="bg-white border border-slate-200 rounded-xl shadow-md p-3 w-56 text-xs hover:border-indigo-400 transition-colors">
      <Handle
        type="target"
        position={Position.Top}
        className="!bg-slate-400 !w-3 !h-3"
      />

      <div className="flex items-center gap-2 font-bold mb-1">
        <div className="w-5 h-5 rounded bg-slate-100 flex items-center justify-center">
          {getIcon()}
        </div>
        <span className="uppercase text-[10px] tracking-wider text-slate-500">Ação</span>
      </div>
      <div className="font-semibold text-slate-800">{data.label}</div>
      {data.config?.subject && (
        <div className="text-[10px] text-slate-400 truncate mt-0.5 font-sans">
          Assunto: {data.config.subject}
        </div>
      )}

      <Handle
        type="source"
        position={Position.Bottom}
        className="!bg-indigo-600 !w-3 !h-3"
      />
    </div>
  );
});
ActionNode.displayName = 'ActionNode';

// Nó Condicional (Condition - SE / SENÃO)
export const ConditionNode = memo(({ data }: any) => {
  return (
    <div className="bg-white border-2 border-amber-400 rounded-xl shadow-lg p-3 w-64 text-xs">
      <Handle
        type="target"
        position={Position.Top}
        className="!bg-slate-400 !w-3 !h-3"
      />

      <div className="flex items-center gap-2 text-amber-600 font-bold mb-1">
        <div className="w-5 h-5 rounded bg-amber-100 flex items-center justify-center">
          <GitFork className="w-3.5 h-3.5" />
        </div>
        <span className="uppercase text-[10px] tracking-wider">Condição SE / SENÃO</span>
      </div>
      <div className="font-semibold text-slate-800">{data.label}</div>
      <div className="text-[10px] text-slate-400 mt-0.5">
        Verifica: {data.config?.tagName || 'Condição de Compra'}
      </div>

      <div className="flex justify-between items-center mt-3 pt-2 border-t border-slate-100 text-[10px] font-bold">
        <span className="text-emerald-600 flex items-center gap-1">✔ SIM</span>
        <span className="text-red-500 flex items-center gap-1">✖ NÃO</span>
      </div>

      {/* Alça SIM (Verde) */}
      <Handle
        type="source"
        position={Position.Bottom}
        id="yes"
        style={{ left: '25%' }}
        className="!bg-emerald-500 !w-3 !h-3"
      />
      {/* Alça NÃO (Vermelha) */}
      <Handle
        type="source"
        position={Position.Bottom}
        id="no"
        style={{ left: '75%' }}
        className="!bg-red-500 !w-3 !h-3"
      />
    </div>
  );
});
ConditionNode.displayName = 'ConditionNode';

// Nó de Temporizador (Delay)
export const DelayNode = memo(({ data }: any) => {
  return (
    <div className="bg-white border-2 border-sky-400 rounded-xl shadow-md p-3 w-56 text-xs">
      <Handle
        type="target"
        position={Position.Top}
        className="!bg-slate-400 !w-3 !h-3"
      />

      <div className="flex items-center gap-2 text-sky-600 font-bold mb-1">
        <div className="w-5 h-5 rounded bg-sky-100 flex items-center justify-center">
          <Clock className="w-3.5 h-3.5" />
        </div>
        <span className="uppercase text-[10px] tracking-wider">Temporizador</span>
      </div>
      <div className="font-semibold text-slate-800">{data.label}</div>
      <div className="text-[10px] text-slate-400 mt-0.5">
        Cancela se: {data.config?.cancelCondition || 'PURCHASE_APPROVED'}
      </div>

      <Handle
        type="source"
        position={Position.Bottom}
        className="!bg-sky-600 !w-3 !h-3"
      />
    </div>
  );
});
DelayNode.displayName = 'DelayNode';
