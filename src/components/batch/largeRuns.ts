// A run with more tasks than this re-polls less often: every poll returns every task and redraws the page.
export const LARGE_RUN_TASKS = 100;
const POLL_MS = 10_000;
const LARGE_RUN_POLL_MS = 30_000;

export function pollIntervalMs(taskCount: number): number {
  return taskCount > LARGE_RUN_TASKS ? LARGE_RUN_POLL_MS : POLL_MS;
}

// What a poll can change that the page shows: the run's status and counts and each task's status. Results arrive with
// a task's SUCCEEDED, so equal fingerprints mean nothing new to draw.
export function runFingerprint(status: string, counts: number[], taskStatuses: string[]): string {
  return [status, ...counts, taskStatuses.join(',')].join('|');
}

// One bar per job is readable up to about this many; past it the chart shows the distribution instead.
export const PER_JOB_CHART_MAX = 50;
