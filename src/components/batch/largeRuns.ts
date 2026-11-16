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
const HISTOGRAM_BINS = 30;

export interface HistogramBin {
  from: number;
  to: number;
  count: number;
}

// Equal-width bins over [min, max]; the last bin includes max. Zero is a bin edge whenever the values straddle it, so
// no bin mixes losing and winning jobs.
export function histogram(values: number[], bins = HISTOGRAM_BINS): HistogramBin[] {
  if (values.length === 0) return [];
  const min = Math.min(...values);
  const max = Math.max(...values);
  if (min === max) return [{ from: min, to: max, count: values.length }];
  let width = (max - min) / bins;
  let start = min;
  if (min < 0 && max > 0) {
    width = Math.max(-min, max) / Math.ceil(bins / 2);
    start = -Math.ceil(-min / width) * width;
  }
  const count = Math.max(1, Math.ceil((max - start) / width - 1e-9));
  const out: HistogramBin[] = Array.from({ length: count }, (_, i) => ({
    from: start + i * width,
    to: start + (i + 1) * width,
    count: 0,
  }));
  for (const v of values) {
    const i = Math.min(count - 1, Math.floor((v - start) / width));
    out[i].count += 1;
  }
  return out;
}
