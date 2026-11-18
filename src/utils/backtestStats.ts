import type { BacktestJob, BacktestRun } from '../types/backtests';
import { taskElapsedMs } from '../components/batch/status';

export const PNL_KEY = 'final_pnl';
export const REWARDS_TOTAL_KEY = 'rewards_estimated_total';
export const PNL_WITH_REWARDS_KEY = 'final_pnl_with_rewards_estimated';
export const MISSING_FRACTION_KEY = 'market_data_missing_fraction';

export const DEFAULT_HISTOGRAM_BINS = 30;

export function formatMetric(v: number): string {
  return v.toLocaleString(undefined, Number.isInteger(v) ? {} : { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

// The job's own finalPnl predates the summary, so it stands in for a summary without final_pnl.
export function metricValue(job: BacktestJob, key: string): number | undefined {
  const v = job.summary?.[key] ?? (key === PNL_KEY ? job.finalPnl : undefined);
  const n = typeof v === 'string' ? Number(v) : v;
  return typeof n === 'number' && Number.isFinite(n) ? n : undefined;
}

export function earnedRewards(jobs: BacktestJob[]): boolean {
  return jobs.some(j => (metricValue(j, REWARDS_TOTAL_KEY) ?? 0) !== 0);
}

// The PnL the table ranks by: with rewards whenever any job earned some.
export function rankingPnlKey(jobs: BacktestJob[]): string {
  return earnedRewards(jobs) ? PNL_WITH_REWARDS_KEY : PNL_KEY;
}

// Linear interpolation between closest ranks; `sorted` must be ascending and non-empty.
export function quantile(sorted: number[], q: number): number {
  const pos = (sorted.length - 1) * q;
  const lo = Math.floor(pos);
  const hi = Math.ceil(pos);
  return sorted[lo] + (sorted[hi] - sorted[lo]) * (pos - lo);
}

export interface Distribution {
  count: number;
  mean: number;
  min: number;
  p5: number;
  p25: number;
  median: number;
  p75: number;
  p95: number;
  max: number;
  positiveFraction: number;
}

export function describe(values: number[]): Distribution | null {
  if (values.length === 0) return null;
  const sorted = [...values].sort((a, b) => a - b);
  return {
    count: sorted.length,
    mean: sorted.reduce((s, v) => s + v, 0) / sorted.length,
    min: sorted[0],
    p5: quantile(sorted, 0.05),
    p25: quantile(sorted, 0.25),
    median: quantile(sorted, 0.5),
    p75: quantile(sorted, 0.75),
    p95: quantile(sorted, 0.95),
    max: sorted[sorted.length - 1],
    positiveFraction: sorted.filter(v => v > 0).length / sorted.length,
  };
}

// Tukey's far-out fences: wide enough that an ordinary spread is never cut, so only real outliers get folded into the
// edge bins. Null when nothing lies outside them.
export function outlierRange(values: number[]): [number, number] | null {
  if (values.length < 4) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const q1 = quantile(sorted, 0.25);
  const q3 = quantile(sorted, 0.75);
  const iqr = q3 - q1;
  if (iqr === 0) return null;
  const lo = q1 - 3 * iqr;
  const hi = q3 + 3 * iqr;
  if (sorted[0] >= lo && sorted[sorted.length - 1] <= hi) return null;
  return [Math.max(lo, sorted[0]), Math.min(hi, sorted[sorted.length - 1])];
}

export interface HistogramBin {
  from: number;
  to: number;
  count: number;
  // Edge bins holding every value outside the chosen range.
  overflow?: 'below' | 'above';
}

// Equal-width bins over [min, max]; the last bin includes max. Zero is a bin edge whenever the values straddle it, so
// no bin mixes losing and winning jobs.
export function histogram(values: number[], bins = DEFAULT_HISTOGRAM_BINS): HistogramBin[] {
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

// Bins only [lo, hi]; everything outside lands in one edge bin per side, so a few far-off jobs don't stretch every bin.
export function rangedHistogram(values: number[], range: [number, number] | null, bins = DEFAULT_HISTOGRAM_BINS): HistogramBin[] {
  if (!range) return histogram(values, bins);
  const [lo, hi] = range;
  const below = values.filter(v => v < lo);
  const above = values.filter(v => v > hi);
  const inside = values.filter(v => v >= lo && v <= hi);
  return [
    ...(below.length ? [{ from: Math.min(...below), to: lo, count: below.length, overflow: 'below' as const }] : []),
    ...histogram(inside, bins),
    ...(above.length ? [{ from: hi, to: Math.max(...above), count: above.length, overflow: 'above' as const }] : []),
  ];
}

export interface GroupStats {
  key: string;
  count: number;
  median: number;
  p25: number;
  p75: number;
  mean: number;
  positiveFraction: number;
}

export interface Grouping {
  id: string;
  label: string;
  keyOf: (job: BacktestJob) => string | undefined;
}

// Scenario plus each swept parameter, wherever there are at least two distinct groups to compare.
export function groupings(run: Pick<BacktestRun, 'scenarios' | 'sweepParams'>): Grouping[] {
  const out: Grouping[] = [];
  if ((run.scenarios?.length ?? 0) > 1) {
    out.push({ id: 'scenario', label: 'Scenario', keyOf: j => j.scenario });
  }
  for (const [param, values] of Object.entries(run.sweepParams ?? {})) {
    if (values.length > 1) {
      out.push({ id: `param:${param}`, label: param, keyOf: j => j.configParams?.[param] });
    }
  }
  return out;
}

// Parameter values read best in their own order; anything non-numeric (scenarios) ranks by median, best first.
export function groupStats(jobs: BacktestJob[], keyOf: Grouping['keyOf'], metric: string): GroupStats[] {
  const byKey = new Map<string, number[]>();
  for (const job of jobs) {
    const key = keyOf(job);
    const v = metricValue(job, metric);
    if (key === undefined || v === undefined) continue;
    const list = byKey.get(key);
    if (list) list.push(v);
    else byKey.set(key, [v]);
  }
  const stats = Array.from(byKey, ([key, values]) => {
    const d = describe(values)!;
    return { key, count: d.count, median: d.median, p25: d.p25, p75: d.p75, mean: d.mean, positiveFraction: d.positiveFraction };
  });
  const numeric = stats.every(s => s.key.trim() !== '' && Number.isFinite(Number(s.key)));
  return numeric
    ? stats.sort((a, b) => Number(a.key) - Number(b.key))
    : stats.sort((a, b) => b.median - a.median);
}

export interface JobRef {
  arrayIndex: number;
  value: number;
}

export interface RunResults {
  jobTimeMs: number;
  vcpuHours: number | null;
  pnlKey: string;
  pnl: Distribution | null;
  best: JobRef | null;
  worst: JobRef | null;
  totalFills: number | null;
  totalFees: number | null;
  meanMissingFraction: number | null;
}

function sumOf(jobs: BacktestJob[], key: string): number | null {
  const values = jobs.map(j => metricValue(j, key)).filter((v): v is number => v !== undefined);
  return values.length ? values.reduce((s, v) => s + v, 0) : null;
}

export function runResults(jobs: BacktestJob[], cpu: number | undefined): RunResults {
  const jobTimeMs = jobs.reduce((s, j) => s + Math.max(0, taskElapsedMs(j) ?? 0), 0);
  const pnlKey = rankingPnlKey(jobs);
  const ranked = jobs
    .map(j => ({ arrayIndex: j.arrayIndex, value: metricValue(j, pnlKey) }))
    .filter((r): r is JobRef => r.value !== undefined)
    .sort((a, b) => b.value - a.value);
  const missing = jobs.map(j => metricValue(j, MISSING_FRACTION_KEY)).filter((v): v is number => v !== undefined);
  return {
    jobTimeMs,
    vcpuHours: cpu ? (jobTimeMs / 3_600_000) * cpu : null,
    pnlKey,
    pnl: describe(ranked.map(r => r.value)),
    best: ranked[0] ?? null,
    worst: ranked[ranked.length - 1] ?? null,
    totalFills: sumOf(jobs, 'fill_count'),
    totalFees: sumOf(jobs, 'total_fees'),
    meanMissingFraction: missing.length ? missing.reduce((s, v) => s + v, 0) / missing.length : null,
  };
}
