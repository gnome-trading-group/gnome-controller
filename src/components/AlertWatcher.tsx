import { useCallback, useEffect, useRef, useState } from 'react';
import { Anchor, Notification, Stack, Text } from '@mantine/core';
import { IconAlertTriangle } from '@tabler/icons-react';
import { Link } from 'react-router-dom';
import { fetchAuthSession } from 'aws-amplify/auth';
import { Alert, SEVERITY_COLORS } from '../types';
import { registryApi } from '../utils/api';
import { formatActor } from '../utils/kill-switch';

const POLL_INTERVAL_MS = 15000;

function isHalt(alert: Alert): boolean {
  return alert.type.endsWith('HALT');
}

function headline(alert: Alert): string {
  if (alert.type === 'EXCHANGE_HALT') return 'Venue halted';
  if (isHalt(alert)) return 'Kill switch turned on';
  return alert.severity === 'CRITICAL' ? 'Critical alert' : alert.severity === 'ERROR' ? 'Error' : 'Warning';
}

// Tells whoever has the controller open about a new alert: anything WARNING or worse, and every kill switch. Only
// alerts that open while the page is open are shown; the first load just records where the list stands. Alerting
// itself (Slack, incident.io) reaches people with no tab open.
export function AlertWatcher() {
  const [shown, setShown] = useState<Alert[]>([]);
  const lastId = useRef<number | null>(null);
  const me = useRef<string | null>(null);

  useEffect(() => {
    fetchAuthSession()
      .then((s) => { me.current = s.tokens?.idToken?.payload['email']?.toString() ?? null; })
      .catch(() => {});
  }, []);

  const check = useCallback(async () => {
    try {
      if (lastId.current === null) {
        const newest = await registryApi.listAlerts({ limit: 1 });
        lastId.current = newest[0]?.alertId ?? 0;
        return;
      }
      const fresh = await registryApi.listAlerts({ status: ['FIRING'], sinceId: lastId.current, limit: 50 });
      if (fresh.length === 0) return;
      lastId.current = Math.max(lastId.current, ...fresh.map(a => a.alertId));
      // The person who did it already knows.
      const relevant = fresh.filter(a => (a.severity !== 'INFO' || isHalt(a)) && a.actor !== me.current);
      if (relevant.length > 0) setShown(prev => [...prev, ...relevant]);
    } catch {
      // The next poll tries again.
    }
  }, []);

  useEffect(() => {
    check();
    const interval = setInterval(check, POLL_INTERVAL_MS);
    return () => clearInterval(interval);
  }, [check]);

  if (shown.length === 0) return null;

  return (
    <Stack gap="xs" style={{ position: 'fixed', bottom: 16, right: 16, zIndex: 400, width: 360, maxWidth: 'calc(100vw - 32px)' }}>
      {shown.map(alert => (
        <Notification
          key={alert.alertId}
          color={isHalt(alert) ? 'red' : SEVERITY_COLORS[alert.severity]}
          icon={<IconAlertTriangle size={18} />}
          title={headline(alert)}
          onClose={() => setShown(prev => prev.filter(a => a.alertId !== alert.alertId))}
        >
          <Text size="sm">{alert.title}</Text>
          {(alert.actor || alert.body) && (
            <Text size="xs" c="dimmed" lineClamp={2}>
              {alert.actor ? `by ${formatActor(alert.actor)}` : ''}{alert.actor && alert.body ? ': ' : ''}{alert.body ?? ''}
            </Text>
          )}
          <Anchor component={Link} to={alert.sessionId ? `/sessions/${alert.sessionId}` : '/system/alerts'} size="xs">View</Anchor>
        </Notification>
      ))}
    </Stack>
  );
}
