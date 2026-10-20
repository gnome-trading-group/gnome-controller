import { describe, expect, it } from 'vitest';
import { healthProblems } from './health';
import { SessionHealth } from '../types';

const healthy: SessionHealth = {
  uptimeMs: 60_000,
  agents: [{ name: 'OmsAgent', hotPath: true, stalledMs: 0, exited: false }],
  listings: [],
  ledger: { lastAcceptedAgoMs: 100, consecutiveFailures: 0, fenced: false },
  gateways: [{ name: 'KalshiReader', reconnecting: false, resyncsLast5m: 0 }],
  risk: { stale: false, unguarded: false, unbuildablePolicies: 0, droppedLatches: 0 },
  rateLimit: [{ account: 'Kalshi/key-1', throttling: false }],
};

describe('what a heartbeat says is wrong', () => {
  it('nothing, for a healthy session or one too old to report risk and rate limits', () => {
    expect(healthProblems(healthy)).toEqual([]);
    expect(healthProblems({ ...healthy, risk: undefined, rateLimit: undefined })).toEqual([]);
  });

  it('risk it can\'t trust, policies it can\'t apply, halts it couldn\'t record, throttling and resyncs', () => {
    const problems = healthProblems({
      ...healthy,
      gateways: [{ name: 'KalshiReader', reconnecting: false, resyncsLast5m: 4 }],
      risk: { stale: true, unguarded: false, unbuildablePolicies: 1, droppedLatches: 2 },
      rateLimit: [{ account: 'Kalshi/key-1', throttling: true }],
    });
    expect(problems.map(p => `${p.part}: ${p.detail}`)).toEqual([
      'KalshiReader: book resynced 4x in 5m',
      'Risk: stale: new orders refused',
      "Risk: 1 policies can't be applied",
      'Risk: 2 halts never recorded',
      'Kalshi/key-1: rate limited',
    ]);
  });

  it('unguarded says why nothing trades, rather than stale', () => {
    const problems = healthProblems({ ...healthy, risk: { stale: true, unguarded: true, unbuildablePolicies: 0, droppedLatches: 0 } });
    expect(problems).toEqual([{ part: 'Risk', detail: 'missing required policies: every order refused' }]);
  });

  const GB = 1024 ** 3;
  const host = (f: Partial<NonNullable<SessionHealth['host']>> = {}): NonNullable<SessionHealth['host']> => ({
    cpuBusyPermille: 400, cpuStealPermille: 0, memAvailableBytes: GB, memTotalBytes: 2 * GB, processRssBytes: GB / 2,
    heapUsedBytes: 64 * 1024 ** 2, heapMaxBytes: GB / 2, diskFreeBytes: 20 * GB, ...f,
  });
  const journal = (f: Partial<NonNullable<SessionHealth['journal']>> = {}): NonNullable<SessionHealth['journal']> => ({
    pendingSegments: 0, oldestPendingMs: 0, segmentBytes: 256 * 1024 ** 2, ...f,
  });
  const parts = (h: SessionHealth['host'], j: SessionHealth['journal']) =>
    healthProblems({ ...healthy, host: h, journal: j }).map(p => p.part);

  it('the host and journal at the registry\'s limits, and nothing below them', () => {
    expect(parts(host(), journal())).toEqual([]);
    expect(parts(host({ cpuBusyPermille: 899, cpuStealPermille: 199, memAvailableBytes: 0.1 * 2 * GB, diskFreeBytes: GB }),
      journal({ pendingSegments: 2, oldestPendingMs: 299_999 }))).toEqual([]);
    expect(parts(host({ cpuStealPermille: 200 }), journal())).toEqual(['CPU']);
    expect(parts(host({ cpuBusyPermille: 900, memAvailableBytes: 0.09 * 2 * GB, diskFreeBytes: GB - 1 }),
      journal({ pendingSegments: 3 }))).toEqual(['CPU', 'Memory', 'Disk', 'Journal']);
    // Two segments' room once they're bigger than the 1 GB floor.
    expect(parts(host({ diskFreeBytes: 3 * GB }), journal({ segmentBytes: 2 * GB }))).toEqual(['Disk']);
  });

  it('says what it found', () => {
    const problems = healthProblems({
      ...healthy,
      host: host({ cpuBusyPermille: 963, cpuStealPermille: 312, memAvailableBytes: 120 * 1024 ** 2, diskFreeBytes: 800 * 1024 ** 2 }),
      journal: journal({ pendingSegments: 5, oldestPendingMs: 361_000 }),
    });
    expect(problems.map(p => `${p.part}: ${p.detail}`)).toEqual([
      'CPU: 96% busy, 31% stolen',
      'Memory: 120 MB available',
      'Disk: 800 MB free',
      'Journal: 5 segments not shipped, oldest 6m 1s',
    ]);
  });

  it('skips what a host can\'t read, and sessions too old to report it', () => {
    const unread = host({ cpuBusyPermille: -1, cpuStealPermille: -1, memAvailableBytes: -1, memTotalBytes: -1,
      processRssBytes: -1 });
    expect(parts(unread, null)).toEqual([]);
    expect(parts(undefined, undefined)).toEqual([]);
    expect(parts(null, null)).toEqual([]);
  });
});
