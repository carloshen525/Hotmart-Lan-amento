'use client';

import { useState, useEffect } from 'react';
import { ChevronDown, RefreshCw, UserCheck, Plus, Check, LogOut } from 'lucide-react';
import { ThemeToggle } from '@/components/ThemeToggle';

interface Tenant {
  id: string;
  name: string;
  slug: string;
}

interface User {
  id: string;
  name: string;
  email: string;
  role: string;
}

export function Header() {
  const [tenants, setTenants] = useState<Tenant[]>([]);
  const [activeTenant, setActiveTenant] = useState<Tenant | null>(null);
  const [user, setUser] = useState<User | null>(null);
  const [isOpen, setIsOpen] = useState(false);
  const [isProcessingJobs, setIsProcessingJobs] = useState(false);
  const [jobNotice, setJobNotice] = useState<string | null>(null);

  useEffect(() => {
    fetch('/api/auth/me')
      .then((res) => res.json())
      .then((data) => {
        if (data.authenticated) {
          setTenants(data.allTenants || []);
          setActiveTenant(data.activeTenant || null);
          setUser(data.user || null);
        }
      })
      .catch(() => {});
  }, []);

  const handleLogout = async () => {
    try {
      await fetch('/api/auth/logout', { method: 'POST' });
      window.location.href = '/login';
    } catch {
      window.location.href = '/login';
    }
  };

  const switchTenant = async (tenantId: string) => {
    try {
      const res = await fetch('/api/auth/switch-tenant', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ tenantId }),
      });
      if (res.ok) {
        setIsOpen(false);
        window.location.reload();
      }
    } catch {}
  };

  const handleProcessJobs = async () => {
    setIsProcessingJobs(true);
    setJobNotice(null);
    try {
      const res = await fetch('/api/jobs/process', { method: 'POST' });
      const data = await res.json();
      setJobNotice(`Fila: ${data.processed || 0} processados, ${data.cancelled || 0} cancelados`);
      setTimeout(() => setJobNotice(null), 4000);
    } catch {
      setJobNotice('Erro ao processar');
    } finally {
      setIsProcessingJobs(false);
    }
  };

  return (
    <header className="h-16 bg-white border-b border-slate-200 px-8 flex items-center justify-between shrink-0">
      {/* Seletor Multi-Tenant de Expert */}
      <div className="relative">
        <button
          onClick={() => setIsOpen(!isOpen)}
          className="flex items-center gap-3 px-3.5 py-2 rounded-lg border border-slate-200 bg-slate-50 hover:bg-slate-100 transition-colors text-left"
        >
          <div className="w-7 h-7 rounded-full bg-indigo-100 text-indigo-700 flex items-center justify-center font-bold text-xs">
            {activeTenant?.name ? activeTenant.name[0].toUpperCase() : 'E'}
          </div>
          <div>
            <div className="text-[11px] text-slate-500 font-medium">Ambiente do Expert</div>
            <div className="text-sm font-semibold text-slate-800 leading-tight">
              {activeTenant?.name || 'Selecione um Expert'}
            </div>
          </div>
          <ChevronDown className="w-4 h-4 text-slate-400 ml-1" />
        </button>

        {isOpen && (
          <div className="absolute left-0 mt-2 w-72 bg-white rounded-xl shadow-xl border border-slate-200 py-2 z-50 animate-in fade-in slide-in-from-top-1">
            <div className="px-3 py-1.5 text-xs font-semibold text-slate-400 uppercase tracking-wider">
              Alternar de Expert
            </div>
            {tenants.map((t) => (
              <button
                key={t.id}
                onClick={() => switchTenant(t.id)}
                className={`w-full flex items-center justify-between px-3 py-2 text-sm text-left hover:bg-slate-50 transition-colors ${
                  activeTenant?.id === t.id ? 'bg-indigo-50/70 text-indigo-700 font-medium' : 'text-slate-700'
                }`}
              >
                <span>{t.name}</span>
                {activeTenant?.id === t.id && <Check className="w-4 h-4 text-indigo-600" />}
              </button>
            ))}
            <div className="border-t border-slate-100 mt-2 pt-2 px-3">
              <a
                href="/settings"
                className="flex items-center gap-2 text-xs font-medium text-indigo-600 hover:text-indigo-700 py-1"
              >
                <Plus className="w-3.5 h-3.5" />
                Cadastrar Novo Expert
              </a>
            </div>
          </div>
        )}
      </div>

      {/* Ações Rápidas do Cabeçalho */}
      <div className="flex items-center gap-4">
        {jobNotice && (
          <span className="text-xs font-medium bg-emerald-50 text-emerald-700 border border-emerald-200 px-3 py-1 rounded-full animate-pulse">
            {jobNotice}
          </span>
        )}

        <button
          onClick={handleProcessJobs}
          disabled={isProcessingJobs}
          className="flex items-center gap-2 text-xs font-medium bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-200 px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-700 transition-colors"
          title="Executar verificação imediata de temporizadores e cancelamentos"
        >
          <RefreshCw className={`w-3.5 h-3.5 ${isProcessingJobs ? 'animate-spin text-indigo-600' : ''}`} />
          <span>Processar Fila de Jobs</span>
        </button>

        {/* Botão para alternar entre tema claro e escuro */}
        <ThemeToggle />

        <div className="h-6 w-px bg-slate-200 dark:bg-slate-800"></div>

        <div className="flex items-center gap-3">
          <div className="flex items-center gap-2 text-slate-700 text-sm">
            <div className="w-8 h-8 rounded-full bg-indigo-50 border border-indigo-200 flex items-center justify-center text-indigo-700 font-semibold text-xs">
              {user?.name ? user.name.slice(0, 2).toUpperCase() : <UserCheck className="w-4 h-4" />}
            </div>
            <div className="hidden md:block text-left">
              <div className="font-semibold text-xs text-slate-800 leading-tight">
                {user?.name || 'Gestor'}
              </div>
              <div className="text-[10px] text-slate-400 leading-tight">
                {user?.email || 'carloshenrq1245@gmail.com'}
              </div>
            </div>
          </div>

          <button
            onClick={handleLogout}
            title="Sair da plataforma"
            className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-medium text-slate-500 hover:text-rose-600 hover:bg-rose-50 border border-transparent hover:border-rose-200 transition-colors"
          >
            <LogOut className="w-3.5 h-3.5" />
            <span className="hidden sm:inline">Sair</span>
          </button>
        </div>
      </div>
    </header>
  );
}
