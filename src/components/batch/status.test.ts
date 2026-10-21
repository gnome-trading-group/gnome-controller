import { describe, expect, it } from 'vitest';
import { runElapsedMs, runMatches, taskElapsedMs, taskMatches } from './status';

describe('run filters', () => {
  it('counts every unfinished status as active', () => {
    expect(['SUBMITTED', 'PENDING', 'RUNNING'].every(s => runMatches('active', s as never))).toBe(true);
    expect(runMatches('active', 'PARTIALLY_FAILED')).toBe(false);
    expect(runMatches('FAILED', 'PARTIALLY_FAILED')).toBe(false);
  });
});

describe('task filters', () => {
  it('groups submitted and pending tasks as waiting', () => {
    expect(taskMatches('waiting', 'SUBMITTED')).toBe(true);
    expect(taskMatches('waiting', 'PENDING')).toBe(true);
    expect(taskMatches('waiting', 'RUNNING')).toBe(false);
  });
});

describe('elapsed time', () => {
  it('counts a run in progress up to now and has none for a run without times', () => {
    const now = Date.parse('2026-10-21T12:10:00Z');
    expect(runElapsedMs({ startedAt: '2026-10-21T12:00:00Z' }, now)).toBe(600_000);
    expect(runElapsedMs({ startedAt: '2026-10-21T12:00:00Z', finishedAt: '2026-10-21T12:01:00Z' }, now)).toBe(60_000);
    expect(runElapsedMs({}, now)).toBeNull();
    expect(taskElapsedMs({ startedAt: 1000 }, 4000)).toBe(3000);
    expect(taskElapsedMs({ startedAt: 1000, stoppedAt: 2000 }, 4000)).toBe(1000);
  });
});
