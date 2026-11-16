import { describe, expect, it } from 'vitest';
import { histogram, pollIntervalMs, runFingerprint } from './largeRuns';

describe('poll interval', () => {
  it('slows down past a hundred tasks', () => {
    expect(pollIntervalMs(100)).toBe(10_000);
    expect(pollIntervalMs(101)).toBe(30_000);
  });
});

describe('run fingerprint', () => {
  it('changes when a task changes status, not otherwise', () => {
    const a = runFingerprint('RUNNING', [1, 0], ['SUCCEEDED', 'PENDING']);
    expect(runFingerprint('RUNNING', [1, 0], ['SUCCEEDED', 'PENDING'])).toBe(a);
    expect(runFingerprint('RUNNING', [1, 0], ['SUCCEEDED', 'RUNNING'])).not.toBe(a);
  });
});

describe('histogram', () => {
  it('counts every value once, the maximum included', () => {
    const values = Array.from({ length: 500 }, (_, i) => i / 10);
    const bins = histogram(values);
    expect(bins.reduce((n, b) => n + b.count, 0)).toBe(500);
    expect(bins[bins.length - 1].to).toBeGreaterThanOrEqual(49.9);
  });

  it('never mixes losses and wins in one bin', () => {
    const bins = histogram([-7, -3, -0.5, 0.2, 4, 10]);
    expect(bins.some(b => b.from === 0 || b.to === 0)).toBe(true);
    expect(bins.every(b => b.from >= 0 || b.to <= 1e-9)).toBe(true);
    expect(bins.reduce((n, b) => n + b.count, 0)).toBe(6);
  });

  it('puts identical values in one bin', () => {
    expect(histogram([2, 2, 2])).toEqual([{ from: 2, to: 2, count: 3 }]);
    expect(histogram([])).toEqual([]);
  });
});
