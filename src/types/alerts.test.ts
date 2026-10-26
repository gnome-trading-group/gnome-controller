import { describe, expect, it } from 'vitest';
import { Alert, AlertSeverity, groupByType, triageOrder } from './alerts';

const alert = (alertId: number, type: string, severity: AlertSeverity, acknowledgedBy: string | null = null) =>
  ({ alertId, type, severity, acknowledgedBy, status: 'FIRING', labels: {} }) as Alert;

describe('triageOrder', () => {
  it('puts the worst first, then what nobody has taken, then the newest', () => {
    const sorted = triageOrder([
      alert(1, 'RECONNECTING', 'WARNING'),
      alert(2, 'SILENT', 'CRITICAL', 'ops@gnome.group'),
      alert(3, 'SILENT', 'CRITICAL'),
      alert(4, 'FATAL_ERROR', 'CRITICAL'),
      alert(5, 'AGENT_STALLED', 'ERROR'),
    ]);
    expect(sorted.map(a => a.alertId)).toEqual([4, 3, 2, 5, 1]);
  });
});

describe('groupByType', () => {
  it('keeps each group, and the alerts in it, in the order they came', () => {
    const groups = groupByType([alert(3, 'SILENT', 'CRITICAL'), alert(4, 'FATAL_ERROR', 'CRITICAL'), alert(2, 'SILENT', 'CRITICAL')]);
    expect(groups.map(g => g.map(a => a.alertId))).toEqual([[3, 2], [4]]);
  });
});
