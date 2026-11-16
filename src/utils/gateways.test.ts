import { describe, expect, it } from 'vitest';
import { Alert } from '../types/alerts';
import { GatewayAccountMinute, GatewayStatus } from '../types/gateways';
import { StrategySession } from '../types/strategy-sessions';
import {
  accountTotals, formatMicros, gatewayHealth, isGatewayAlert, linkedSessions, logGroupUrl, rollPlan, rollUnderWay, shares,
  WANT_WINDOW_MS,
} from './gateways';

const NOW = Date.parse('2026-11-12T19:00:00Z');

function gateway(over: Partial<GatewayStatus> = {}): GatewayStatus {
  return {
    gatewayKey: 'live:kalshi:main', mode: 'live', exchangeId: 5, exchangeCode: 'KALSHI', region: 'us-east-1',
    profile: 'standard', pinnedVersion: null, rollTargetVersion: '2.3.0', wantedAt: null, accounts: 1, endpoint: null,
    minutes: null, rollRequestedAt: null, rollRequestedBy: null, roll: null, ...over,
  };
}

const endpoint = (state: string) => ({
  state, instance: 't', privateIp: '10.0.0.1', port: 40010, version: '1.37.4', writtenAt: '', linkedSessions: 1,
  workingOrders: 2, canHandOver: true, handover: false,
});

function session(id: string, links: { key: string; linked: boolean; unlinkedMs?: number; workingOrders?: number }[]) {
  return {
    sessionId: id, strategyId: 3, status: 'RUNNING',
    health: { orderGateways: links.map((l) => ({ unlinkedMs: 0, workingOrders: 0, ...l })) },
  } as unknown as StrategySession;
}

function minute(over: Partial<GatewayAccountMinute> = {}): GatewayAccountMinute {
  return {
    endedAt: 0, cancels: 0, cancelWaitP99Us: 0, cancelWaitMaxUs: 0, orders: 0, orderWaitP99Us: 0, orderWaitMaxUs: 0,
    held: 0, refusedWaiting: 0, refusedWithoutConnection: 0, dropped: 0, orderAnswerP50Us: 0, orderAnswerP99Us: 0,
    cancelAnswerP50Us: 0, cancelAnswerP99Us: 0, unanswered: 0, connectionsBusy: 0, venueRefusals: 0, ...over,
  };
}

describe('gatewayHealth', () => {
  it("shows a running gateway's own state", () => {
    expect(gatewayHealth(gateway({ endpoint: endpoint('DEGRADED') }), NOW)).toEqual({ label: 'degraded', color: 'orange', running: true });
  });

  it('calls one not running starting while a session wanted it recently, stopped otherwise', () => {
    const recent = new Date(NOW - 60_000).toISOString();
    const old = new Date(NOW - WANT_WINDOW_MS - 1).toISOString();
    expect(gatewayHealth(gateway({ wantedAt: recent }), NOW).label).toBe('starting');
    expect(gatewayHealth(gateway({ wantedAt: old }), NOW).label).toBe('stopped');
    expect(gatewayHealth(gateway(), NOW).label).toBe('stopped');
  });
});

describe('linkedSessions', () => {
  it("finds the sessions whose heartbeat names the gateway, unlinked ones first", () => {
    const sessions = [
      session('a', [{ key: 'live:kalshi:main', linked: true, workingOrders: 5 }]),
      session('b', [{ key: 'live:polymarket_us:main', linked: true }]),
      session('c', [{ key: 'live:kalshi:main', linked: false, unlinkedMs: 90_000, workingOrders: 2 }]),
      { sessionId: 'd', strategyId: 1, status: 'STARTING', health: null } as unknown as StrategySession,
    ];

    expect(linkedSessions('live:kalshi:main', sessions).map((s) => [s.sessionId, s.linked])).toEqual([['c', false], ['a', true]]);
  });
});

describe('shares', () => {
  it("gives each session its part of the account's sends, busiest first", () => {
    expect(shares([{ slot: 1, sessionId: 'a', sent: 1 }, { slot: 2, sessionId: 'b', sent: 3 }]).map((s) => [s.slot, s.share]))
      .toEqual([[2, 0.75], [1, 0.25]]);
    expect(shares([{ slot: 1, sessionId: null, sent: 0 }])[0].share).toBe(0);
  });
});

describe('accountTotals', () => {
  it('sums the counts and keeps the worst p99s', () => {
    const t = accountTotals([
      minute({ orders: 3, cancels: 1, refusedWaiting: 1, venueRefusals: 2, cancelWaitP99Us: 50, orderAnswerP99Us: 9_000 }),
      minute({ orders: 4, refusedWithoutConnection: 2, cancelWaitP99Us: 120, orderAnswerP99Us: 4_000 }),
    ]);
    expect(t).toMatchObject({ minutes: 2, orders: 7, cancels: 1, refused: 3, venueRefusals: 2, worstCancelWaitP99Us: 120, worstOrderAnswerP99Us: 9_000 });
  });
});

describe('isGatewayAlert', () => {
  const alert = (key: string) => ({ key } as Alert);

  it("matches the gateway's own and reconciler alerts, and not another gateway's", () => {
    expect(isGatewayAlert(alert('GATEWAY_DOWN:live:kalshi:main'), 'live:kalshi:main')).toBe(true);
    expect(isGatewayAlert(alert('GATEWAY_VENUE_RATE_LIMITED:live:kalshi:main:7'), 'live:kalshi:main')).toBe(true);
    expect(isGatewayAlert(alert('GATEWAY_DOWN:paper:kalshi:main'), 'live:kalshi:main')).toBe(false);
    expect(isGatewayAlert(alert('GATEWAY_DOWN:live:kalshi:main2'), 'live:kalshi:main')).toBe(false);
  });
});

describe('formatting', () => {
  it('shows waits at a useful precision', () => {
    expect([formatMicros(640), formatMicros(2_450), formatMicros(36_900)]).toEqual(['640 µs', '2.5 ms', '37 ms']);
  });

  it("links the gateway's log group in its region", () => {
    expect(logGroupUrl('eu-west-1')).toContain('$252Fgnome$252Forder-gateway$252Feu-west-1');
  });
});

describe('rolling a gateway', () => {
  const up = endpoint('READY');
  const roll = (phase: NonNullable<GatewayStatus['roll']>['phase'], requestedAt = '2026-11-12T18:50:00Z') => ({
    requestedAt, phase, fromVersion: '1.37.4', toVersion: '2.3.0', startedAt: requestedAt, endedAt: null, reason: null,
  });

  it('is under way through its phases, and while a request waits for the reconciler', () => {
    for (const phase of ['stopping', 'starting', 'rolling_back'] as const) {
      expect(rollUnderWay(gateway({ endpoint: up, roll: roll(phase) }), NOW)).toBe(true);
    }
    expect(rollUnderWay(gateway({ endpoint: up, roll: roll('done') }), NOW)).toBe(false);
    expect(rollUnderWay(gateway({ endpoint: up, rollRequestedAt: '2026-11-12T18:59:30Z', roll: roll('done') }), NOW)).toBe(true);
    // Asked long ago and never taken up: lost, so it may be asked again.
    expect(rollUnderWay(gateway({ endpoint: up, rollRequestedAt: '2026-11-12T18:40:00Z' }), NOW)).toBe(false);
  });

  it('shows a gateway being rolled as rolling, even while it has no endpoint', () => {
    expect(gatewayHealth(gateway({ roll: roll('starting') }), NOW)).toEqual({ label: 'rolling', color: 'violet', running: true });
  });

  it('may roll a running live gateway onto its target, refusing what the reconciler would refuse', () => {
    expect(rollPlan(gateway({ endpoint: up }), NOW)).toEqual({ disabled: null, target: '2.3.0', warnings: [] });
    expect(rollPlan(gateway(), NOW).disabled).toContain("isn't running");
    expect(rollPlan(gateway({ endpoint: endpoint('STARTING') }), NOW).disabled).toContain("isn't up (starting)");
    expect(rollPlan(gateway({ endpoint: { ...up, canHandOver: false } }), NOW).disabled).toContain("can't hand over");
    expect(rollPlan(gateway({ endpoint: up, roll: roll('starting') }), NOW).disabled).toBe('A roll is under way');
    expect(rollPlan(gateway({ endpoint: up, rollTargetVersion: null }), NOW).disabled).toContain("couldn't be read");
  });

  it('warns that a paper gateway, or one whose venue cancels without it, loses its orders, and of a restart in place', () => {
    const paper = rollPlan(gateway({ mode: 'paper', gatewayKey: 'paper:kalshi:main', endpoint: { ...up, canHandOver: false } }), NOW);
    expect(paper.disabled).toBeNull();
    expect(paper.warnings[0]).toContain('every paper order is cancelled');
    const intl = rollPlan(gateway({ exchangeCode: 'POLYMARKET_INTL', endpoint: up }), NOW);
    expect(intl.warnings[0]).toContain('cancelling every order first');
    expect(rollPlan(gateway({ endpoint: up, rollTargetVersion: '1.37.4' }), NOW).warnings).toEqual([
      'It already runs 1.37.4: the roll restarts it in place.',
    ]);
  });
});
