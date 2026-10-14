import { ReactNode } from 'react';
import { Anchor, Button, Group, Stack, Text, ThemeIcon, Tooltip } from '@mantine/core';
import { IconAlertOctagon, IconAlertTriangle, IconBook, IconCircleCheck, IconInfoCircle } from '@tabler/icons-react';
import { Link } from 'react-router-dom';
import ReactTimeAgo from 'react-time-ago';
import { Alert, AlertSeverity } from '../../types';
import { formatActor } from '../../utils/kill-switch';

// Styled like the dashboard's Needs attention list, so an alert reads the same wherever it shows up.
const STYLE: Record<AlertSeverity, { color: string; icon: ReactNode }> = {
  CRITICAL: { color: 'red', icon: <IconAlertOctagon size={16} /> },
  ERROR: { color: 'orange', icon: <IconAlertTriangle size={16} /> },
  WARNING: { color: 'yellow', icon: <IconAlertTriangle size={16} /> },
  INFO: { color: 'blue', icon: <IconInfoCircle size={16} /> },
};
const CONTEXT_LABELS = ['strategy', 'symbol', 'exchange', 'account', 'subject', 'alarmName', 'rule', 'pipeline'];

export function AlertItem({ alert, onClose, closing }: { alert: Alert; onClose?: () => void; closing?: boolean }) {
  const resolved = alert.status === 'RESOLVED';
  const style = resolved ? { color: 'gray', icon: <IconCircleCheck size={16} /> } : STYLE[alert.severity];
  const context = [
    ...CONTEXT_LABELS.map(k => alert.labels[k]).filter(Boolean),
    alert.mode,
    alert.actor && `by ${formatActor(alert.actor)}`,
    alert.fireCount > 1 && `seen ${alert.fireCount}x`,
  ].filter(Boolean).join(' · ');
  return (
    <Group gap="sm" wrap="nowrap" align="flex-start">
      <ThemeIcon color={style.color} variant="light" size="md" radius="xl">{style.icon}</ThemeIcon>
      <Stack gap={0} style={{ minWidth: 0, flex: 1 }}>
        <Group gap={4} wrap="nowrap">
          <Anchor component={Link} to={alert.sessionId ? `/sessions/${alert.sessionId}` : '/system/alerts'}
            size="sm" fw={600} c={style.color} td={resolved ? 'line-through' : undefined} truncate>
            {alert.title}
          </Anchor>
          {alert.runbookUrl && (
            <Tooltip label="Runbook" withArrow openDelay={300}>
              <Anchor href={alert.runbookUrl} target="_blank" aria-label="Runbook" style={{ display: 'flex' }}>
                <IconBook size={14} />
              </Anchor>
            </Tooltip>
          )}
        </Group>
        <Text size="xs" c="dimmed" truncate>
          {context}{context && ' · '}<ReactTimeAgo date={new Date(alert.firstSeen)} timeStyle="round" />
          {resolved && alert.resolvedAt && <> · resolved <ReactTimeAgo date={new Date(alert.resolvedAt)} timeStyle="round" /></>}
        </Text>
        {alert.body && <Text size="xs" c="dimmed" lineClamp={2}>{alert.body}</Text>}
      </Stack>
      {onClose && !resolved && (
        <Button size="compact-xs" variant="subtle" color="gray" onClick={onClose} loading={closing}>Close</Button>
      )}
    </Group>
  );
}
