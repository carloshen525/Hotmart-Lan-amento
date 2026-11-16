import { NextResponse } from 'next/server';
import { automationScheduler } from '@/services/automation/scheduler';
import { EmailQueueService } from '@/services/email/queue.service';
import { WhatsappQueueService } from '@/services/whatsapp/queue.service';
import { BackgroundSchedulerRunner } from '@/services/automation/background-runner';

async function executeCycle() {
  BackgroundSchedulerRunner.ensureStarted();
  const schedulerResult = await automationScheduler.processDueJobs();
  const groupTimersResult = await automationScheduler.processDueGroupTimers();
  const queueResult = await EmailQueueService.processBatch({
    batchSize: 20,
    delayMs: 300,
  });
  const whatsappQueueResult = await WhatsappQueueService.processBatch({
    batchSize: 20,
  });

  return {
    success: true,
    scheduler: schedulerResult,
    groupTimers: groupTimersResult,
    emailQueue: queueResult,
    whatsappQueue: whatsappQueueResult,
  };
}

export async function POST() {
  try {
    const res = await executeCycle();
    return NextResponse.json(res);
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

export async function GET() {
  try {
    const res = await executeCycle();
    return NextResponse.json(res);
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
