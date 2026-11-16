/**
 * Cron Worker independente para o LaunchFlow.
 * Dispara o endpoint de processamento a cada 5 segundos para garantir que
 * temporizadores e filas de mensagens sejam executados pontualmente.
 */
const http = require('http');

const port = process.env.PORT || '3000';
const url = `http://localhost:${port}/api/jobs/process`;

console.log(`[CRON WORKER] Iniciando loop contínuo apontando para ${url}...`);

let isRunning = false;

async function triggerProcess() {
  if (isRunning) return;
  isRunning = true;

  try {
    const req = http.request(url, { method: 'POST', timeout: 8000 }, (res) => {
      let data = '';
      res.on('data', (chunk) => { data += chunk; });
      res.on('end', () => {
        if (res.statusCode >= 200 && res.statusCode < 300) {
          try {
            const parsed = JSON.parse(data);
            const totalProcessed = (parsed.scheduler?.processed || 0) + (parsed.whatsappQueue?.sent || 0) + (parsed.emailQueue?.sent || 0);
            if (totalProcessed > 0) {
              console.log(`[CRON WORKER] ✔ Ciclo executado com envios: ${totalProcessed} mensagens disparadas.`);
            }
          } catch {}
        }
      });
    });

    req.on('error', () => {
      // Falhas silenciosas durante inicialização do Next.js
    });

    req.on('timeout', () => {
      req.destroy();
    });

    req.end();
  } catch {}
  finally {
    isRunning = false;
  }
}

// Inicia após 3 segundos (tempo de boot do Next.js) e roda a cada 4 segundos
setTimeout(() => {
  setInterval(triggerProcess, 4000);
}, 3000);
