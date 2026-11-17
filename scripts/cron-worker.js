/**
 * Cron Worker independente para o LaunchFlow.
 * Dispara o endpoint de processamento a cada 5 segundos para garantir que
 * temporizadores e filas de mensagens sejam executados pontualmente.
 */
const http = require('http');

const port = process.env.PORT || '3000';
// Em ambientes Linux/Docker, 127.0.0.1 garante conexão IPv4 imediata sem falhas de resolução IPv6 ::1
const primaryUrl = `http://127.0.0.1:${port}/api/jobs/process`;
const fallbackUrl = `http://localhost:${port}/api/jobs/process`;

console.log(`[CRON WORKER] Iniciando loop contínuo apontando para ${primaryUrl}...`);

let isRunning = false;

function doRequest(targetUrl) {
  return new Promise((resolve) => {
    const req = http.request(targetUrl, { method: 'POST', timeout: 8000 }, (res) => {
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
        resolve(true);
      });
    });

    req.on('error', (err) => {
      resolve(false);
    });

    req.on('timeout', () => {
      req.destroy();
      resolve(false);
    });

    req.end();
  });
}

async function triggerProcess() {
  if (isRunning) return;
  isRunning = true;

  try {
    const ok = await doRequest(primaryUrl);
    if (!ok) {
      await doRequest(fallbackUrl);
    }
  } catch {}
  finally {
    isRunning = false;
  }
}

// Inicia após 3 segundos (tempo de boot do Next.js) e roda a cada 4 segundos
setTimeout(() => {
  setInterval(triggerProcess, 4000);
}, 3000);
