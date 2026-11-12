'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import {
  LayoutDashboard,
  Users,
  Tags,
  Workflow,
  Rocket,
  Mail,
  MessageSquare,
  Calendar,
  BarChart3,
  Plug,
  Settings,
  Flame,
  LogOut,
} from 'lucide-react';

const menuItems = [
  { name: 'Visão Geral', href: '/', icon: LayoutDashboard },
  { name: 'Contatos', href: '/contacts', icon: Users },
  { name: 'Tags e Segmentos', href: '/tags', icon: Tags },
  { name: 'Automações', href: '/automations', icon: Workflow },
  { name: 'Campanhas', href: '/campaigns', icon: Rocket },
  { name: 'E-mails', href: '/emails', icon: Mail },
  { name: 'WhatsApp', href: '/whatsapp', icon: MessageSquare },
  { name: 'Calendário', href: '/calendar', icon: Calendar },
  { name: 'Relatórios', href: '/reports', icon: BarChart3 },
  { name: 'Integrações', href: '/integrations', icon: Plug },
  { name: 'Configurações', href: '/settings', icon: Settings },
];

export function Sidebar() {
  const pathname = usePathname();

  return (
    <aside className="w-64 bg-slate-900 text-slate-300 flex flex-col shrink-0 border-r border-slate-800">
      {/* Logo & Marca */}
      <div className="h-16 flex items-center gap-3 px-6 border-b border-slate-800 bg-slate-950/50">
        <div className="w-9 h-9 rounded-lg bg-gradient-to-tr from-hotmart-orange to-amber-500 flex items-center justify-center text-white shadow-md shadow-orange-500/20">
          <Flame className="w-5 h-5 fill-white" />
        </div>
        <div>
          <span className="font-bold text-white text-base tracking-tight block">LaunchFlow</span>
          <span className="text-[10px] text-slate-400 font-medium tracking-wide uppercase">Automações Hotmart</span>
        </div>
      </div>

      {/* Navegação Principal */}
      <nav className="flex-1 px-3 py-4 space-y-1 overflow-y-auto">
        {menuItems.map((item) => {
          const isActive = pathname === item.href || (item.href !== '/' && pathname.startsWith(item.href));
          const Icon = item.icon;

          return (
            <Link
              key={item.href}
              href={item.href}
              className={`flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-all ${
                isActive
                  ? 'bg-indigo-600 text-white shadow-sm shadow-indigo-500/30 font-semibold'
                  : 'text-slate-400 hover:text-slate-100 hover:bg-slate-800/60'
              }`}
            >
              <Icon className={`w-4 h-4 ${isActive ? 'text-white' : 'text-slate-400'}`} />
              <span>{item.name}</span>
            </Link>
          );
        })}
      </nav>

      {/* Status da Fila & Logout */}
      <div className="p-4 border-t border-slate-800 bg-slate-950/40 text-xs space-y-3">
        <div>
          <div className="flex items-center justify-between text-slate-400 mb-1">
            <span className="flex items-center gap-1.5">
              <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse"></span>
              Motor de Automação
            </span>
            <span className="text-emerald-400 font-semibold">Ativo</span>
          </div>
          <p className="text-[11px] text-slate-500">Timers e idempotência monitorados</p>
        </div>

        <button
          onClick={async () => {
            try {
              await fetch('/api/auth/logout', { method: 'POST' });
              window.location.href = '/login';
            } catch {
              window.location.href = '/login';
            }
          }}
          className="w-full flex items-center justify-center gap-2 py-2 px-3 rounded-lg bg-slate-800/80 hover:bg-rose-500/10 text-slate-400 hover:text-rose-400 border border-slate-700/60 hover:border-rose-500/20 text-xs font-medium transition-all"
        >
          <LogOut className="w-3.5 h-3.5" />
          <span>Sair da conta</span>
        </button>
      </div>
    </aside>
  );
}
