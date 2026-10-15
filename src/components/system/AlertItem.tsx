import { ReactNode, useState } from 'react';
import { ActionIcon, Anchor, Card, Group, Popover, Stack, Text, TextInput, ThemeIcon, Tooltip } from '@mantine/core';
import { useQueryClient } from '@tanstack/react-query';
import {
  IconAlertOctagon, IconAlertTriangle, IconBook, IconCheck, IconCircleCheck, IconInfoCircle, IconUserCheck, IconX,
} from '@tabler/icons-react';
import { Link } from 'react-router-dom';
import ReactTimeAgo from 'react-time-ago';
import { Alert, AlertSeverity } from '../../types';
import { errorMessage, formatActor } from '../../utils/kill-switch';
import { registryApi } from '../../utils/api';
import { DetailField, DetailTooltip } from './DetailTooltip';

// Styled like the dashboard's Needs attention list, so an alert reads the same wherever it shows up.
const STYLE: Record<AlertSeverity, { color: string; icon: ReactNode }> = {
  CRITICAL: { color: 'red', icon: <IconAlertOctagon size={13} /> },
  ERROR: { color: 'orange', icon: <IconAlertTriangle size={13} /> },
  WARNING: { color: 'yellow', icon: <IconAlertTriangle size={13} /> },
  INFO: { color: 'blue', icon: <IconInfoCircle size={13} /> },
};
const SEVERITY_LABEL: Record<AlertSeverity, string> = { CRITICAL: 'Critical', ERROR: 'Error', WARNING: 'Warning', INFO: 'Info' };

const CONTEXT_LABELS = ['strategy', 'symbol', 'exchange', 'account', 'subject', 'alarmName', 'rule', 'pipeline'];

// Two steps, so a stray tap can't stop a page: the icon opens a confirm, with room to say why.
function AcknowledgeAction({ alert }: { alert: Alert }) {
  const client = useQueryClient();
  const [opened, setOpened] = useState(false);
  const [reason, setReason] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // A reported event has nothing left to wait for, so taking it in hand closes it.
  const action = alert.source === 'ingest' ? 'Close' : 'Acknowledge';

  const cancel = () => {
    setOpened(false);
    setReason('');
  };
  const confirm = async () => {
    setSaving(true);
    setError(null);
    try {
      await registryApi.acknowledgeAlert(alert.alertId, reason);
      await client.invalidateQueries({ queryKey: ['alerts'] });
      await client.invalidateQueries({ queryKey: ['attention'] });
      cancel();
    } catch (e) {
      setError(errorMessage(e, `${action} failed`));
    } finally {
      setSaving(false);
    }
  };

  return (
    <Popover opened={opened} onChange={setOpened} position="bottom-end" withArrow shadow="md" trapFocus>
      <Popover.Target>
        <Tooltip label={action} withArrow disabled={opened}>
          <ActionIcon variant={opened ? 'light' : 'subtle'} color="gray" size="xs" aria-label={action}
            onClick={() => { setError(null); setOpened(o => !o); }}>
            <IconUserCheck size={13} />
          </ActionIcon>
        </Tooltip>
      </Popover.Target>
      <Popover.Dropdown p="xs" w={280}>
        <Stack gap={6}>
          <Text size="xs" fw={600}>{action} this alert?</Text>
          <TextInput size="xs" placeholder="Reason (optional)" value={reason} maxLength={500} data-autofocus
            onChange={e => setReason(e.currentTarget.value)}
            onKeyDown={e => {
              if (e.key === 'Enter') void confirm();
              if (e.key === 'Escape') cancel();
            }} />
          {error && <Text size="xs" c="red">{error}</Text>}
          <Group gap={4} justify="flex-end">
            <Tooltip label="Cancel" withArrow>
              <ActionIcon variant="subtle" color="gray" size="sm" onClick={cancel} disabled={saving} aria-label="Cancel">
                <IconX size={14} />
              </ActionIcon>
            </Tooltip>
            <Tooltip label={`Confirm ${action.toLowerCase()}`} withArrow>
              <ActionIcon variant="light" color="green" size="sm" onClick={confirm} loading={saving} aria-label={`Confirm ${action}`}>
                <IconCheck size={14} />
              </ActionIcon>
            </Tooltip>
          </Group>
        </Stack>
      </Popover.Dropdown>
    </Popover>
  );
}

export function AlertItem({ alert, acknowledgeable, fit }: { alert: Alert; acknowledgeable?: boolean; fit?: boolean }) {
  const resolved = alert.status === 'RESOLVED';
  const acknowledged = !resolved && !!alert.acknowledgedBy;
  const canAcknowledge = !!acknowledgeable && !resolved && !alert.acknowledgedBy;
  const actions = (alert.runbookUrl ? 1 : 0) + (canAcknowledge || (!resolved && alert.acknowledgedBy) ? 1 : 0);
  const style = resolved ? { color: 'gray', icon: <IconCircleCheck size={13} /> } : STYLE[alert.severity];
  const fields: DetailField[] = [
    ['Strategy', alert.labels.strategy], ['Listing', alert.labels.symbol], ['Exchange', alert.labels.exchange],
    ['Account', alert.labels.account], ['Part', alert.labels.subject], ['Rule', alert.labels.rule],
    ['Pipeline', alert.labels.pipeline], ['Alarm', alert.labels.alarmName], ['Mode', alert.mode],
    ['Session', alert.sessionId], ['By', alert.actor && formatActor(alert.actor)],
    ['First seen', new Date(alert.firstSeen).toLocaleString()],
    ['Seen', alert.fireCount > 1 && `${alert.fireCount} times`],
    ['Acknowledged by', alert.acknowledgedBy && formatActor(alert.acknowledgedBy)],
    ['Because', alert.acknowledgedReason],
    ['Resolved', alert.resolvedAt && new Date(alert.resolvedAt).toLocaleString()],
  ];
  const context = [
    ...CONTEXT_LABELS.map(k => alert.labels[k]).filter(Boolean),
    alert.mode,
    alert.actor && `by ${formatActor(alert.actor)}`,
    alert.fireCount > 1 && `seen ${alert.fireCount}x`,
  ].filter(Boolean).join(' · ');
  return (
    // Carded like the Services tiles; someone has it: faded, so the ones nobody has taken stand out.
    <Card withBorder p="sm" opacity={acknowledged ? 0.55 : undefined} w={fit ? 340 : undefined} pos="relative">
      <Group gap="xs" wrap="nowrap" align="flex-start">
        <DetailTooltip color={style.color} badge={resolved ? 'Resolved' : SEVERITY_LABEL[alert.severity]} type={alert.type}
          title={alert.title} body={alert.body} fields={fields}>
          <ThemeIcon color={style.color} variant="light" size="sm" radius="xl" style={{ cursor: 'help' }}>{style.icon}</ThemeIcon>
        </DetailTooltip>
        <Stack gap={0} style={{ minWidth: 0, flex: 1 }}>
          <Anchor component={Link} to={alert.sessionId ? `/sessions/${alert.sessionId}` : '/system/alerts'}
            size="sm" fw={600} c={style.color} td={resolved ? 'line-through' : undefined} truncate pr={actions * 22}
            // Cut to the card rather than widening it; the tooltip has it whole.
            style={{ width: 0, minWidth: '100%' }}>
            {alert.title}
          </Anchor>
          <Text size="xs" c="dimmed" truncate>
            {context}{context && ' · '}<ReactTimeAgo date={new Date(alert.firstSeen)} timeStyle="round" />
            {resolved && alert.resolvedAt && <> · resolved <ReactTimeAgo date={new Date(alert.resolvedAt)} timeStyle="round" /></>}
          </Text>
          {/* Cut to the card rather than widening it; the icon's tooltip has it whole. */}
          {alert.body && (
            <Text size="xs" c="dimmed" truncate style={{ width: 0, minWidth: '100%' }}>{alert.body}</Text>
          )}
        </Stack>
        {/* In the corner, over the card rather than in a column beside it: only the title makes room for it, so the
            lines below run the card's full width. */}
        <Group gap={2} wrap="nowrap" pos="absolute" top={8} right={8}>
          {alert.runbookUrl && (
            <Tooltip label="Runbook" withArrow openDelay={300}>
              <Anchor href={alert.runbookUrl} target="_blank" aria-label="Runbook" style={{ display: 'flex' }} p={3}>
                <IconBook size={14} />
              </Anchor>
            </Tooltip>
          )}
          {canAcknowledge && <AcknowledgeAction alert={alert} />}
          {/* Who has it lives here and in the tooltip, not the context line, where a long name would widen the card. */}
          {!resolved && alert.acknowledgedBy && (
            <Tooltip label={<>Acknowledged by {formatActor(alert.acknowledgedBy)}
              {alert.acknowledgedAt && <> · <ReactTimeAgo date={new Date(alert.acknowledgedAt)} timeStyle="round" /></>}
              {alert.acknowledgedReason && <>: {alert.acknowledgedReason}</>}</>}
              multiline maw={300}
              withArrow>
              <ThemeIcon variant="transparent" color="green" size="xs" aria-label="Acknowledged">
                <IconUserCheck size={13} />
              </ThemeIcon>
            </Tooltip>
          )}
        </Group>
      </Group>
    </Card>
  );
}
