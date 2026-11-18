'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import {
  ShieldAlert,
  LayoutDashboard,
  Users,
  CreditCard,
  Smartphone,
  UserCog,
  Headphones,
  FileText,
  LogOut,
  ArrowLeft,
  ShieldCheck,
  Flame,
} from 'lucide-react';
import { ThemeToggle } from '@/components/ThemeToggle';

const adminNav = [
  { name: 'Dashboard Geral', href: '/admin', icon: LayoutDashboard },
  { name: 'Clientes & Planos', href: '/admin/clients', icon: Users },
  { name: 'Recorrência & MRR', href: '/admin/subscriptions', icon: CreditCard },
  { name: 'Instâncias WhatsApp', href: '/admin/instances', icon: Smartphone },
  { name: 'Usuários do SaaS', href: '/admin/users', icon: UserCog },
  { name: 'Central de Tickets', href: '/admin/tickets', icon: Headphones },
  { name: 'Auditoria & Logs', href: '/admin/audit', icon: FileText },
];

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const [checkingAuth, setCheckingAuth] = useState(true);
  const [isAuthorized, setIsAuthorized] = useState(false);
  const [adminUser, setAdminUser] = useState<any>(null);

  useEffect(() => {
    fetch('/api/auth/me')
      .then((res) => res.json())
      .then((data) => {
        if (!data.authenticated || !data.isSuperAdmin) {
          setIsAuthorized(false);
          setCheckingAuth(false);
        } else {
          setIsAuthorized(true);
          setAdminUser(data.user);
          setCheckingAuth(false);
        }
      })
      .catch(() => {
        setIsAuthorized(false);
        setCheckingAuth(false);
      });
  }, []);

  if (checkingAuth) {
    return (
      <div className="h-screen w-full bg-slate-950 flex flex-col items-center justify-center text-slate-400 text-sm">
        <div className="w-8 h-8 border-2 border-indigo-500 border-t-transparent rounded-full animate-spin mb-3"></div>
        <span>Verificando privilégios de Super Administrador...</span>
      </div>
    );
  }

  if (!isAuthorized) {
    return (
      <div className="h-screen w-full bg-slate-950 flex flex-col items-center justify-center p-6 text-center text-slate-300">
        <div className="w-16 h-16 rounded-2xl bg-rose-500/10 border border-rose-500/30 flex items-center justify-center text-rose-500 mb-4 shadow-xl shadow-rose-950/40">
          <ShieldAlert className="w-8 h-8" />
        </div>
        <h1 className="text-2xl font-bold text-white mb-2">Acesso Restrito - Super Administrador</h1>
        <p className="text-sm text-slate-400 max-w-md mb-6">
          Esta área é restrita exclusivamente ao proprietário da plataforma. Seu usuário não possui permissão de Super Admin para visualizar ou modificar configurações operacionais do SaaS.
        </p>
        <button
          onClick={() => router.push('/')}
          className="px-5 py-2.5 bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-semibold rounded-xl shadow-lg shadow-indigo-600/30 flex items-center gap-2 cursor-pointer transition-all"
        >
          <ArrowLeft className="w-4 h-4" />
          <span>Voltar para o Painel do Usuário</span>
        </button>
      </div>
    );
  }

  return (
    <div className="flex h-screen w-full overflow-hidden bg-slate-950 text-slate-100 font-sans">
      {/* Sidebar Super Admin */}
      <aside className="w-64 bg-slate-900 border-r border-slate-800 flex flex-col shrink-0">
        {/* Logo & Badge */}
        <div className="h-16 flex items-center gap-3 px-5 border-b border-slate-800 bg-slate-950/60">
          <div className="w-9 h-9 rounded-xl bg-gradient-to-tr from-amber-500 to-orange-600 flex items-center justify-center text-white shadow-md shadow-orange-500/20">
            <Flame className="w-5 h-5 fill-white" />
          </div>
          <div>
            <div className="flex items-center gap-1.5">
              <span className="font-extrabold text-white text-sm tracking-tight">LaunchFlow</span>
              <span className="px-1.5 py-0.2 rounded bg-amber-500/20 text-amber-400 border border-amber-500/40 font-bold text-[9px] tracking-wider uppercase">
                SaaS
              </span>
            </div>
            <span className="text-[10px] text-amber-400 font-semibold tracking-wide uppercase flex items-center gap-1">
              <ShieldCheck className="w-3 h-3 text-amber-400" />
              Super Administrador
            </span>
          </div>
        </div>

        {/* Navegação */}
        <nav className="flex-1 px-3 py-4 space-y-1 overflow-y-auto">
          {adminNav.map((item) => {
            const isActive = pathname === item.href || (item.href !== '/admin' && pathname.startsWith(item.href));
            const Icon = item.icon;

            return (
              <Link
                key={item.href}
                href={item.href}
                className={`flex items-center gap-3 px-3 py-2.5 rounded-xl text-xs font-semibold transition-all ${
                  isActive
                    ? 'bg-gradient-to-r from-indigo-600 to-indigo-700 text-white shadow-md shadow-indigo-600/30'
                    : 'text-slate-400 hover:text-white hover:bg-slate-800/60'
                }`}
              >
                <Icon className={`w-4 h-4 ${isActive ? 'text-white' : 'text-slate-400'}`} />
                <span>{item.name}</span>
              </Link>
            );
          })}
        </nav>

        {/* Rodapé da Sidebar */}
        <div className="p-3.5 border-t border-slate-800 bg-slate-950/50 space-y-2 text-xs">
          <Link
            href="/"
            className="w-full flex items-center justify-center gap-2 py-2 px-3 rounded-lg bg-slate-800/80 hover:bg-slate-800 text-slate-300 hover:text-white border border-slate-700/60 text-xs font-semibold transition-all"
          >
            <ArrowLeft className="w-3.5 h-3.5" />
            <span>Voltar ao App Principal</span>
          </Link>

          <button
            onClick={async () => {
              await fetch('/api/auth/logout', { method: 'POST' });
              window.location.href = '/login';
            }}
            className="w-full flex items-center justify-center gap-2 py-2 px-3 rounded-lg hover:bg-rose-500/10 text-slate-400 hover:text-rose-400 border border-transparent hover:border-rose-500/20 text-xs font-medium transition-all"
          >
            <LogOut className="w-3.5 h-3.5" />
            <span>Encerrar Sessão</span>
          </button>
        </div>
      </aside>

      {/* Conteúdo Principal */}
      <div className="flex-1 flex flex-col min-w-0 overflow-hidden bg-slate-950">
        {/* Header do Super Admin */}
        <header className="h-16 bg-slate-900/80 border-b border-slate-800 px-8 flex items-center justify-between shrink-0 backdrop-blur-md">
          <div className="flex items-center gap-2">
            <span className="w-2.5 h-2.5 rounded-full bg-emerald-500 animate-pulse"></span>
            <span className="text-xs font-bold text-slate-300 uppercase tracking-wider">
              Painel de Controle Central SaaS
            </span>
          </div>

          <div className="flex items-center gap-4">
            <ThemeToggle />
            <div className="h-5 w-px bg-slate-800"></div>

            <div className="flex items-center gap-2.5 text-xs">
              <div className="w-8 h-8 rounded-full bg-amber-500/20 border border-amber-500/40 flex items-center justify-center text-amber-400 font-bold">
                {adminUser?.name ? adminUser.name.slice(0, 2).toUpperCase() : 'SA'}
              </div>
              <div className="text-left hidden sm:block">
                <div className="font-bold text-white leading-tight">{adminUser?.name || 'Super Admin'}</div>
                <div className="text-[10px] text-amber-400 font-medium leading-tight">Proprietário da Plataforma</div>
              </div>
            </div>
          </div>
        </header>

        {/* Main Content Area */}
        <main className="flex-1 overflow-y-auto p-8">{children}</main>
      </div>
    </div>
  );
}
