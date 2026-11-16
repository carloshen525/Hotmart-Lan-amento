import { automationScheduler } from './scheduler';
import { WhatsappQueueService } from '@/services/whatsapp/queue.service';
import { EmailQueueService } from '@/services/email/queue.service';

/**
 * Runner contínuo em segundo plano para o LaunchFlow.
 * Garante que mensagens temporizadas (Timers), filas de WhatsApp e E-mails
 * sejam disparados pontualmente no horário agendado sem depender de cliques manuais.
 */
export class BackgroundSchedulerRunner {
  private static isRunning = false;
  private static timerId: NodeJS.Timeout | null = null;

  public static ensureStarted(): void {
    if ((globalThis as any).__launchflow_background_runner_active) {
      return;
    }

    (globalThis as any).__launchflow_background_runner_active = true;
    console.log('[BackgroundRunner] 🚀 Iniciando agendador contínuo em segundo plano (intervalo: 4s)...');

    const tick = async () => {
      if (this.isRunning) return;
      this.isRunning = true;

      try {
        // 1. Processa timers e agendamentos de leads individuais
        await automationScheduler.processDueJobs();

        // 2. Processa timers de grupos de WhatsApp
        await automationScheduler.processDueGroupTimers();

        // 3. Processa lotes da fila persistente de WhatsApp (anti-bloqueio / agendados)
        await WhatsappQueueService.processBatch({ batchSize: 20 });

        // 4. Processa lotes da fila persistente de E-mails
        await EmailQueueService.processBatch({ batchSize: 20 });
      } catch (err: any) {
        // Log não bloqueante
        console.error('[BackgroundRunner] Erro durante ciclo:', err.message);
      } finally {
        this.isRunning = false;
      }
    };

    // Executa imediatamente na inicialização
    void tick();

    // Mantém ciclo a cada 4 segundos
    this.timerId = setInterval(() => {
      void tick();
    }, 4000);

    if (this.timerId.unref) {
      this.timerId.unref();
    }
  }

  public static stop(): void {
    if (this.timerId) {
      clearInterval(this.timerId);
      this.timerId = null;
    }
    (globalThis as any).__launchflow_background_runner_active = false;
  }
}

// Inicia automaticamente quando este módulo é carregado pelo Node.js / Next.js
BackgroundSchedulerRunner.ensureStarted();
