import { NextResponse } from 'next/server';
import { automationScheduler } from '@/services/automation/scheduler';
import { EmailQueueService } from '@/services/email/queue.service';
import { WhatsappQueueService } from '@/services/whatsapp/queue.service';

export async function POST() {
  try {
    const schedulerResult = await automationScheduler.processDueJobs();
    const queueResult = await EmailQueueService.processBatch({
      batchSize: 20,
      delayMs: 300,
    });
    const whatsappQueueResult = await WhatsappQueueService.processBatch({
      batchSize: 20,
    });

    return NextResponse.json({
      success: true,
      scheduler: schedulerResult,
      emailQueue: queueResult,
      whatsappQueue: whatsappQueueResult,
    });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
