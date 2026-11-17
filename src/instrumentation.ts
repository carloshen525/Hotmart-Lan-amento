export async function register() {
  if (process.env.NEXT_RUNTIME === 'nodejs') {
    try {
      const { BackgroundSchedulerRunner } = await import('@/services/automation/background-runner');
      BackgroundSchedulerRunner.ensureStarted();
    } catch (err: any) {
      console.warn('[Instrumentation] BackgroundSchedulerRunner error:', err.message);
    }
  }
}
