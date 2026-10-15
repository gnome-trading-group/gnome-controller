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
}

// Open alerts nobody has taken first, newest first within each, so what still needs someone is on top.
export function unacknowledgedFirst(alerts: Alert[]): Alert[] {
  return [...alerts].sort((a, b) => Number(!!a.acknowledgedBy) - Number(!!b.acknowledgedBy) || b.alertId - a.alertId);
}

export interface AlertFilters {
  status?: AlertStatus[];
  severity?: AlertSeverity[];
  type?: string;
  sessionId?: string;
  sinceId?: number;
  limit?: number;
  offset?: number;
}

export const SEVERITY_COLORS: Record<AlertSeverity, string> = {
  CRITICAL: 'red', ERROR: 'orange', WARNING: 'yellow', INFO: 'blue',
};
