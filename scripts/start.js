const { execSync, spawn } = require('child_process');

console.log('[PROD START] Initializing LaunchFlow container...');

// 1. Executa migração de compatibilidade de instâncias do WhatsApp (remove UNIQUE em tenantId)
try {
  console.log('[PROD START] Verificando e atualizando índices do WhatsApp (multi-tenant)...');
  execSync('node scripts/migrate-whatsapp.js', {
    stdio: 'inherit',
    timeout: 10000,
  });
  console.log('[PROD START] Migração de índices concluída com sucesso.');
} catch (err) {
  console.error('[PROD START] Aviso na migração de índices (continuando com segurança):', err.message);
}

// 2. Executa o push do esquema do banco de forma segura e não-bloqueante
try {
  console.log('[PROD START] Sincronizando schema do banco com Prisma...');
  execSync('npx prisma db push --accept-data-loss --skip-generate', {
    stdio: 'inherit',
    timeout: 20000,
  });
  console.log('[PROD START] Schema do banco sincronizado.');
} catch (err) {
  console.error('[PROD START] Aviso na sincronização do schema Prisma (continuando inicialização de forma controlada):', err.message);
}

// 2. Executa seed de dados essenciais (admin e expert) se necessario
try {
  console.log('[PROD START] Verificando dados essenciais (seed)...');
  execSync('node prisma/seed.js', {
    stdio: 'inherit',
    timeout: 10000,
  });
  console.log('[PROD START] Seed verificado.');
} catch (err) {
  console.warn('[PROD START] Aviso no seed (continuando inicializacao):', err.message);
}

// 3. Inicia o servidor Next.js escutando obrigatoriamente em 0.0.0.0 (obrigatorio para Docker / Easypanel)
const port = process.env.PORT || '3000';
console.log(`[PROD START] Iniciando Next.js em 0.0.0.0:${port}...`);

const nextProc = spawn('npx', ['next', 'start', '-H', '0.0.0.0', '-p', String(port)], {
  stdio: 'inherit',
  shell: true,
});

nextProc.on('exit', (code) => {
  console.log(`[PROD START] Next.js encerrou com codigo ${code}`);
  process.exit(code || 0);
});

process.on('SIGTERM', () => {
  nextProc.kill('SIGTERM');
});
process.on('SIGINT', () => {
  nextProc.kill('SIGINT');
});
