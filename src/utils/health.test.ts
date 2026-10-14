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
});
