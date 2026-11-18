import { describe, expect, it } from 'vitest';
import { pollIntervalMs, runFingerprint } from './largeRuns';

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
