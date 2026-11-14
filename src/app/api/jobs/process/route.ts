import { NextResponse } from 'next/server';
import { automationScheduler } from '@/services/automation/scheduler';
import { EmailQueueService } from '@/services/email/queue.service';

export async function POST() {
  try {
    const schedulerResult = await automationScheduler.processDueJobs();
    const queueResult = await EmailQueueService.processBatch({
      batchSize: 20,
      delayMs: 300,
    });

    return NextResponse.json({
      success: true,
      scheduler: schedulerResult,
      emailQueue: queueResult,
    });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
