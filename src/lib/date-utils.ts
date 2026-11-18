/**
 * Utilitários de data e fuso horário para o LaunchFlow.
 * 
 * Regra do Sistema:
 * Todas as operações de agendamento por data/hora seguem estritamente o fuso
 * horário oficial de Brasília (UTC-3 / America/Sao_Paulo).
 * 
 * Independente do fuso horário da máquina ou container onde o servidor roda (ex: UTC no Linux/Docker),
 * um horário como "06:00" informado pelo usuário deve ser interpretado exatamente como
 * 06:00 em Brasília (que equivale a 09:00 UTC).
 */

export function parseTargetDate(dateStr?: string | null): number {
  if (!dateStr || typeof dateStr !== 'string') return NaN;
  const clean = dateStr.trim();
  if (!clean) return NaN;

  // 1. Formato Brasileiro: 'DD/MM/YYYY [às ]HH:mm(:ss)?' (ex: '18/11/2026 às 06:00' ou '18/11/2026 06:00')
  const brMatch = clean.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})(?:(?:\s+às\s+|\s+T?|\s+)(\d{1,2}):(\d{2})(?::(\d{2}))?)?$/i);
  if (brMatch) {
    const day = brMatch[1].padStart(2, '0');
    const month = brMatch[2].padStart(2, '0');
    const year = brMatch[3];
    const hour = (brMatch[4] || '00').padStart(2, '0');
    const min = (brMatch[5] || '00').padStart(2, '0');
    const sec = (brMatch[6] || '00').padStart(2, '0');
    const isoString = `${year}-${month}-${day}T${hour}:${min}:${sec}-03:00`;
    return new Date(isoString).getTime();
  }

  // 2. Formato HTML Datetime-Local ou ISO sem offset: 'YYYY-MM-DD[T ]HH:mm(:ss)?'
  const isoMatch = clean.match(/^(\d{4})-(\d{2})-(\d{2})[T ](\d{2}):(\d{2})(?::(\d{2}))?(?:\.\d+)?$/);
  if (isoMatch) {
    const y = isoMatch[1];
    const m = isoMatch[2];
    const d = isoMatch[3];
    const hr = isoMatch[4];
    const mn = isoMatch[5];
    const sec = isoMatch[6] || '00';
    // Sempre ancora para o fuso horário oficial de Brasília (-03:00)
    const isoWithOffset = `${y}-${m}-${d}T${hr}:${mn}:${sec}-03:00`;
    return new Date(isoWithOffset).getTime();
  }

  // 3. Formato com fuso horário explícito (ex: '...-03:00' ou '...+02:00')
  if (/[+-]\d{2}(:?\d{2})?$/.test(clean)) {
    return new Date(clean).getTime();
  }

  // 4. Formato ISO UTC terminando com 'Z'
  if (clean.endsWith('Z')) {
    return new Date(clean).getTime();
  }

  // 5. Fallback padrão do Date.parse
  const fallback = new Date(clean).getTime();
  return fallback;
}

/**
 * Formata um timestamp para exibição amigável no fuso de Brasília
 */
export function formatBrasiliaDateTime(timestampOrDate: number | Date): string {
  const d = typeof timestampOrDate === 'number' ? new Date(timestampOrDate) : timestampOrDate;
  if (isNaN(d.getTime())) return 'Data inválida';

  return d.toLocaleString('pt-BR', {
    timeZone: 'America/Sao_Paulo',
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  });
}

/**
 * Formata tempo restante de forma legível (ex: "2h 35min" ou "45s")
 */
export function formatRemainingTime(ms: number): string {
  if (ms <= 0) return '0s (pronto)';
  const totalSeconds = Math.floor(ms / 1000);
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;

  if (hours > 0) {
    return `${hours}h ${minutes}min`;
  }
  if (minutes > 0) {
    return `${minutes}min ${seconds}s`;
  }
  return `${seconds}s`;
}
