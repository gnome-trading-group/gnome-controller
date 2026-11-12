import { Alert } from '../types/alerts';
import { GatewayAccountMinute, GatewaySessionSends, GatewayStatus } from '../types/gateways';
import { StrategySession } from '../types/strategy-sessions';

// Every alert type about an order gateway: its own, its reconciler's, and a session's link to it.
export const GATEWAY_ALERT_TYPES = [
  'GATEWAY_DEGRADED', 'GATEWAY_DOWN', 'GATEWAY_FATAL', 'GATEWAY_KILLS_STALE', 'GATEWAY_ORDERS_UNANSWERED',
  'GATEWAY_RECONCILE_FAILED', 'GATEWAY_RESTARTED', 'GATEWAY_START_STUCK', 'GATEWAY_SWEEP_FAILED',
  'GATEWAY_UNATTRIBUTED_ORDERS', 'GATEWAY_VENUE_RATE_LIMITED', 'ORDER_GATEWAY_UNLINKED',
];

// The reconciler keeps a gateway running while a session asked for it within this long.
export const WANT_WINDOW_MS = 30 * 60_000;

export interface GatewayHealth {
  label: string;
  color: string;
  running: boolean;
}

/** What to show for a gateway: its own state while it runs; otherwise whether anything still wants it. */
export function gatewayHealth(g: GatewayStatus, nowMs: number): GatewayHealth {
  if (g.endpoint) {
    const color = { READY: 'teal', DEGRADED: 'orange', STARTING: 'blue', STOPPING: 'gray' }[g.endpoint.state] ?? 'gray';
    return { label: g.endpoint.state.toLowerCase(), color, running: true };
  }
  const wanted = g.wantedAt != null && nowMs - Date.parse(g.wantedAt) < WANT_WINDOW_MS;
  return wanted
    ? { label: 'starting', color: 'blue', running: false }
    : { label: 'stopped', color: 'gray', running: false };
}

export interface LinkedSession {
  sessionId: string;
  strategyId: number;
  status: string;
  linked: boolean;
  unlinkedMs: number;
  workingOrders: number;
}

/** The sessions whose latest heartbeat names a link to this gateway, unlinked ones first. */
export function linkedSessions(gatewayKey: string, sessions: StrategySession[]): LinkedSession[] {
  const linked: LinkedSession[] = [];
  for (const s of sessions) {
    const link = s.health?.orderGateways?.find((l) => l.key === gatewayKey);
    if (!link) continue;
    linked.push({
      sessionId: s.sessionId, strategyId: s.strategyId, status: s.status,
      linked: link.linked, unlinkedMs: link.unlinkedMs, workingOrders: link.workingOrders,
    });
  }
  return linked.sort((a, b) => Number(a.linked) - Number(b.linked) || b.workingOrders - a.workingOrders);
}

export interface SessionShare extends GatewaySessionSends {
  share: number;
}

/** Each session's part of what the account sent in its last minute, busiest first. */
export function shares(sends: GatewaySessionSends[]): SessionShare[] {
  const total = sends.reduce((sum, s) => sum + s.sent, 0);
  return [...sends]
    .sort((a, b) => b.sent - a.sent)
    .map((s) => ({ ...s, share: total === 0 ? 0 : s.sent / total }));
}

export interface AccountTotals {
  minutes: number;
  orders: number;
  cancels: number;
  held: number;
  refused: number;
  venueRefusals: number;
  unanswered: number;
  worstCancelWaitP99Us: number;
  worstOrderWaitP99Us: number;
  worstOrderAnswerP99Us: number;
}

/** An account's minutes summed, and the worst of each minute's p99s. */
export function accountTotals(minutes: GatewayAccountMinute[]): AccountTotals {
  const totals: AccountTotals = {
    minutes: minutes.length, orders: 0, cancels: 0, held: 0, refused: 0, venueRefusals: 0, unanswered: 0,
    worstCancelWaitP99Us: 0, worstOrderWaitP99Us: 0, worstOrderAnswerP99Us: 0,
  };
  for (const m of minutes) {
    totals.orders += m.orders;
    totals.cancels += m.cancels;
    totals.held += m.held;
    totals.refused += m.refusedWaiting + m.refusedWithoutConnection;
    totals.venueRefusals += m.venueRefusals;
    totals.unanswered += m.unanswered;
    totals.worstCancelWaitP99Us = Math.max(totals.worstCancelWaitP99Us, m.cancelWaitP99Us);
    totals.worstOrderWaitP99Us = Math.max(totals.worstOrderWaitP99Us, m.orderWaitP99Us);
    totals.worstOrderAnswerP99Us = Math.max(totals.worstOrderAnswerP99Us, m.orderAnswerP99Us);
  }
  return totals;
}

/**
 * Whether an alert is about this gateway: the gateway's own and its reconciler's are keyed
 * `<TYPE>:<gateway key>[:<account or order>]`; a session's unlinked alert names the gateway as its subject.
 */
export function isGatewayAlert(alert: Alert, gatewayKey: string): boolean {
  const parts = alert.key.split(':');
  const wanted = gatewayKey.split(':');
  for (let i = 1; i + wanted.length <= parts.length; i++) {
    if (wanted.every((part, j) => parts[i + j] === part)) return true;
  }
  return false;
}

/** Microseconds as the page shows them: µs under a millisecond, ms with a decimal under ten, whole ms above. */
export function formatMicros(us: number): string {
  if (us < 1_000) return `${us} µs`;
  if (us < 10_000) return `${(us / 1_000).toFixed(1)} ms`;
  return `${Math.round(us / 1_000)} ms`;
}

export function logGroupUrl(region: string): string {
  const group = encodeURIComponent(encodeURIComponent(`/gnome/order-gateway/${region}`)).replace(/%/g, '$');
  return `https://${region}.console.aws.amazon.com/cloudwatch/home?region=${region}#logsV2:log-groups/log-group/${group}`;
}

export function ecsServiceUrl(region: string, gatewayKey: string): string {
  const service = `order-gateway-${gatewayKey.replace(/:/g, '-')}`;
  return `https://${region}.console.aws.amazon.com/ecs/v2/clusters/order-gateways/services/${service}/health?region=${region}`;
}

export function lastOf<T>(items: T[]): T | undefined {
  return items[items.length - 1];
}
