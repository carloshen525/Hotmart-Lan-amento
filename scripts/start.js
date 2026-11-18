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

// 1.1. Executa migração de colunas e integridade do SaaS
try {
  console.log('[PROD START] Verificando colunas e tabelas do SaaS...');
  execSync('node scripts/migrate-saas.js', {
    stdio: 'inherit',
    timeout: 10000,
  });
  console.log('[PROD START] Migração do SaaS concluída com sucesso.');
} catch (err) {
  console.error('[PROD START] Aviso na migração do SaaS (continuando com segurança):', err.message);
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

// 3. Executa seed de dados essenciais (admin e expert) se necessario
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

// 4. Sincroniza instâncias conectadas da Evolution API para o banco
try {
  console.log('[PROD START] Sincronizando instâncias da Evolution API para o banco...');
  execSync('node scripts/sync-whatsapp.js', {
    stdio: 'inherit',
    timeout: 15000,
  });
  console.log('[PROD START] Sincronização inicial concluída.');
} catch (err) {
  console.warn('[PROD START] Aviso na sincronização do WhatsApp (continuando inicialização):', err.message);
}

// 5. Inicia o Cron Worker em background para disparo automático de timers e filas
console.log('[PROD START] Iniciando Cron Worker em segundo plano para agendamentos...');
const cronProc = spawn('node', ['scripts/cron-worker.js'], {
  stdio: 'inherit',
  shell: true,
});

cronProc.on('exit', (code) => {
  console.warn(`[PROD START] Cron Worker encerrou com codigo ${code}`);
});

// 6. Inicia o servidor Next.js escutando obrigatoriamente em 0.0.0.0 (obrigatorio para Docker / Easypanel)
const port = process.env.PORT || '3000';
console.log(`[PROD START] Iniciando Next.js em 0.0.0.0:${port}...`);

const nextProc = spawn('npx', ['next', 'start', '-H', '0.0.0.0', '-p', String(port)], {
  stdio: 'inherit',
  shell: true,
});

nextProc.on('exit', (code) => {
  console.log(`[PROD START] Next.js encerrou com codigo ${code}`);
  cronProc.kill('SIGTERM');
  process.exit(code || 0);
});

process.on('SIGTERM', () => {
  cronProc.kill('SIGTERM');
  nextProc.kill('SIGTERM');
});
process.on('SIGINT', () => {
  cronProc.kill('SIGINT');
  nextProc.kill('SIGINT');
});
