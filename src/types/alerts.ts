// An alert as the registry records it (see the registry's alerting): one row per occurrence of a problem, from the
// monitoring rules, a reported event, or a CloudWatch alarm. Acknowledging one here tells Slack and incident.io it's
// in hand: an ongoing problem stays open, quietly, until it clears; a reported event resolves.
export type AlertSeverity = 'CRITICAL' | 'ERROR' | 'WARNING' | 'INFO';
export type AlertStatus = 'PENDING' | 'FIRING' | 'RESOLVED';

export interface Alert {
  alertId: number;
  key: string;
  type: string;
  source: 'tick' | 'ingest' | 'cloudwatch';
  severity: AlertSeverity;
  status: AlertStatus;
  title: string;
  body: string | null;
  actor: string | null;
  labels: Record<string, string>;
  links: { title: string; url: string }[];
  runbookUrl: string | null;
  strategyId: number | null;
  sessionId: string | null;
  listingId: number | null;
  exchangeId: number | null;
  accountId: number | null;
  mode: 'live' | 'paper' | null;
  fireCount: number;
  firstSeen: string;
  lastSeen: string;
  resolvedAt: string | null;
  acknowledgedBy: string | null;
  acknowledgedAt: string | null;
  acknowledgedReason: string | null;
}

export const SEVERITIES: AlertSeverity[] = ['CRITICAL', 'ERROR', 'WARNING', 'INFO'];
export const SEVERITY_LABEL: Record<AlertSeverity, string> = { CRITICAL: 'Critical', ERROR: 'Error', WARNING: 'Warning', INFO: 'Info' };

// Worst first, then what nobody has taken yet, then newest: what still needs someone is on top.
export function triageOrder(alerts: Alert[]): Alert[] {
  return [...alerts].sort((a, b) => SEVERITIES.indexOf(a.severity) - SEVERITIES.indexOf(b.severity)
    || Number(!!a.acknowledgedBy) - Number(!!b.acknowledgedBy) || b.alertId - a.alertId);
}

const CONTEXT_LABELS = ['strategy', 'symbol', 'exchange', 'account', 'subject', 'alarmName', 'rule', 'pipeline'];

export function alertContext(alert: Alert): string[] {
  return CONTEXT_LABELS.map(k => alert.labels[k]).filter(Boolean);
}

// Open alerts of one type together, each group in the order its alerts came.
export function groupByType(alerts: Alert[]): Alert[][] {
  const groups = new Map<string, Alert[]>();
  for (const alert of alerts) groups.set(alert.type, [...(groups.get(alert.type) ?? []), alert]);
  return [...groups.values()];
}

export function canAcknowledge(alert: Alert): boolean {
  return alert.status !== 'RESOLVED' && !alert.acknowledgedBy;
}

export interface AlertFilters {
  status?: AlertStatus[];
  severity?: AlertSeverity[];
  type?: string[];
  sessionId?: string;
  strategyId?: number;
  sinceId?: number;
  limit?: number;
  offset?: number;
}

// How many alerts match at each severity and of each type; each count ignores its own filter, so it says what picking
// that value would show.
export interface AlertFacets {
  severity: Partial<Record<AlertSeverity, number>>;
  type: Record<string, number>;
}

export const SEVERITY_COLORS: Record<AlertSeverity, string> = {
  CRITICAL: 'red', ERROR: 'orange', WARNING: 'yellow', INFO: 'blue',
};
