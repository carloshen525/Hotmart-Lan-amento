import { NextResponse } from 'next/server';
import { automationScheduler } from '@/services/automation/scheduler';

export async function POST() {
  try {
    const result = await automationScheduler.processDueJobs();
    return NextResponse.json({ success: true, ...result });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
