import type { Metadata } from 'next';
import './globals.css';
import '@xyflow/react/dist/style.css';
import { AppShell } from '@/components/AppShell';

export const metadata: Metadata = {
  title: 'LaunchFlow | Automação de Lançamentos & Hotmart',
  description: 'Plataforma multi-tenant de automação de marketing para lançamentos digitais brasileiros com WhatsApp, E-mail, CRM e Hotmart.',
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="pt-BR">
      <body className="h-screen w-screen overflow-hidden bg-slate-950 font-sans antialiased text-slate-800">
        <AppShell>{children}</AppShell>
      </body>
    </html>
  );
}
