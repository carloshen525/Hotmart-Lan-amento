import Link from 'next/link';

export default function NotFound() {
  return (
    <div className="flex flex-col items-center justify-center min-h-[60vh] text-center p-6">
      <h2 className="text-3xl font-bold text-slate-800 mb-2">Página não encontrada</h2>
      <p className="text-slate-500 text-sm mb-6 max-w-md">
        A página que você está procurando não existe ou foi movida.
      </p>
      <Link
        href="/"
        className="px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg font-semibold text-xs shadow-sm transition-colors"
      >
        Voltar para a Visão Geral
      </Link>
    </div>
  );
}
