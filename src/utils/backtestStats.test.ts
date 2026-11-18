import { describe as suite, expect, it } from 'vitest';
import type { BacktestJob } from '../types/backtests';
import {
  PNL_KEY, PNL_WITH_REWARDS_KEY, describe, groupStats, groupings, histogram, metricValue, outlierRange, quantile,
  rangedHistogram, runResults,
} from './backtestStats';

function job(arrayIndex: number, summary: Record<string, number | string>, extra: Partial<BacktestJob> = {}): BacktestJob {
  return { runId: 'r', sk: `JOB#${arrayIndex}`, arrayIndex, status: 'SUCCEEDED', configParams: {}, summary, ...extra };
}

const T0 = 1_700_000_000_000;
const total = (bins: { count: number }[]) => bins.reduce((n, b) => n + b.count, 0);

suite('histogram', () => {
  it('counts every value once, the maximum included', () => {
    const values = Array.from({ length: 500 }, (_, i) => i / 10);
    const bins = histogram(values);
    expect(total(bins)).toBe(500);
    expect(bins[bins.length - 1].to).toBeGreaterThanOrEqual(49.9);
  });

  it('never mixes losses and wins in one bin', () => {
    const bins = histogram([-7, -3, -0.5, 0.2, 4, 10]);
    expect(bins.some(b => b.from === 0 || b.to === 0)).toBe(true);
    expect(bins.every(b => b.from >= 0 || b.to <= 1e-9)).toBe(true);
    expect(total(bins)).toBe(6);
  });

  it('puts identical values in one bin', () => {
    expect(histogram([2, 2, 2])).toEqual([{ from: 2, to: 2, count: 3 }]);
    expect(histogram([])).toEqual([]);
  });

  it('honours the bin count', () => {
    expect(histogram(Array.from({ length: 100 }, (_, i) => i), 10)).toHaveLength(10);
  });
});

suite('ranged histogram', () => {
  it('folds values outside the range into one edge bin per side', () => {
    const bins = rangedHistogram([-1000, 1, 2, 3, 4, 5, 9000, 9500], [1, 5], 4);
    expect(bins[0]).toMatchObject({ overflow: 'below', count: 1, from: -1000, to: 1 });
    expect(bins[bins.length - 1]).toMatchObject({ overflow: 'above', count: 2, from: 5, to: 9500 });
    expect(bins.slice(1, -1).every(b => b.to - b.from <= 1 + 1e-9)).toBe(true);
    expect(total(bins)).toBe(8);
  });

  it('is the plain histogram without a range', () => {
    expect(rangedHistogram([1, 2, 3], null, 3)).toEqual(histogram([1, 2, 3], 3));
  });
});

suite('outlier range', () => {
  it('cuts only far-out values', () => {
    const body = Array.from({ length: 100 }, (_, i) => i);
    expect(outlierRange(body)).toBeNull();
    const range = outlierRange([...body, 10_000]);
    expect(range).not.toBeNull();
    expect(range![0]).toBe(0);
    expect(range![1]).toBeLessThan(10_000);
    expect(range![1]).toBeGreaterThanOrEqual(99);
  });

  it('leaves tiny or flat sets alone', () => {
    expect(outlierRange([1, 2, 1000])).toBeNull();
    expect(outlierRange([5, 5, 5, 5, 5, 100])).toBeNull();
  });
});

suite('describe', () => {
  it('summarises a distribution', () => {
    const d = describe([4, -2, 0, 10, 3])!;
    expect(d).toMatchObject({ count: 5, min: -2, max: 10, median: 3, mean: 3 });
    expect(d.positiveFraction).toBeCloseTo(0.6);
    expect(describe([])).toBeNull();
  });

  it('interpolates quantiles', () => {
    expect(quantile([0, 10], 0.25)).toBe(2.5);
  });
});

suite('metric value', () => {
  it('falls back to finalPnl and parses numeric strings', () => {
    expect(metricValue(job(0, {}, { finalPnl: 7 }), PNL_KEY)).toBe(7);
    expect(metricValue(job(0, { sharpe: '1.5' }), 'sharpe')).toBe(1.5);
    expect(metricValue(job(0, { sharpe: 'n/a' }), 'sharpe')).toBeUndefined();
  });
});

suite('groupings and group stats', () => {
  it('offers only dimensions with two or more groups', () => {
    const gs = groupings({ scenarios: ['a'], sweepParams: { spread: ['1', '2'], size: ['5'] } });
    expect(gs.map(g => g.id)).toEqual(['param:spread']);
  });

  it('orders numeric parameter values by value', () => {
    const jobs = [
      job(0, { [PNL_KEY]: 5 }, { configParams: { spread: '10' } }),
      job(1, { [PNL_KEY]: 1 }, { configParams: { spread: '2' } }),
      job(2, { [PNL_KEY]: 3 }, { configParams: { spread: '2' } }),
    ];
    const stats = groupStats(jobs, j => j.configParams.spread, PNL_KEY);
    expect(stats.map(s => s.key)).toEqual(['2', '10']);
    expect(stats[0]).toMatchObject({ count: 2, median: 2 });
  });

  it('ranks named groups by median, best first', () => {
    const jobs = [
      job(0, { [PNL_KEY]: -5 }, { scenario: 'calm' }),
      job(1, { [PNL_KEY]: 8 }, { scenario: 'volatile' }),
      job(2, { [PNL_KEY]: 1 }, { scenario: 'news' }),
    ];
    expect(groupStats(jobs, j => j.scenario, PNL_KEY).map(s => s.key)).toEqual(['volatile', 'news', 'calm']);
  });
});

suite('run results', () => {
  it('aggregates time, PnL and totals', () => {
    const jobs = [
      job(0, { [PNL_KEY]: 10, fill_count: 3, total_fees: 1.5, market_data_missing_fraction: 0 }, { startedAt: T0, stoppedAt: T0 + 3_600_000 }),
      job(1, { [PNL_KEY]: -4, fill_count: 7, total_fees: 0.5, market_data_missing_fraction: 0.2 }, { startedAt: T0, stoppedAt: T0 + 1_800_000 }),
    ];
    const r = runResults(jobs, 4);
    expect(r.jobTimeMs).toBe(5_400_000);
    expect(r.vcpuHours).toBeCloseTo(6);
    expect(r.best).toEqual({ arrayIndex: 0, value: 10 });
    expect(r.worst).toEqual({ arrayIndex: 1, value: -4 });
    expect(r.totalFills).toBe(10);
    expect(r.totalFees).toBe(2);
    expect(r.meanMissingFraction).toBeCloseTo(0.1);
    expect(runResults(jobs, undefined).vcpuHours).toBeNull();
  });

  it('ranks by PnL with rewards once any job earned rewards', () => {
    const jobs = [
      job(0, { [PNL_KEY]: 10, rewards_estimated_total: 0, [PNL_WITH_REWARDS_KEY]: 10 }),
      job(1, { [PNL_KEY]: 8, rewards_estimated_total: 5, [PNL_WITH_REWARDS_KEY]: 13 }),
    ];
    const r = runResults(jobs, 2);
    expect(r.pnlKey).toBe(PNL_WITH_REWARDS_KEY);
    expect(r.best?.arrayIndex).toBe(1);
  });
});
