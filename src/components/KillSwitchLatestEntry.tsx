import { Text } from '@mantine/core';
import ReactTimeAgo from 'react-time-ago';
import { RiskPolicyHistory } from '../types';
import { formatActor } from '../utils/kill-switch';

export function KillSwitchLatestEntry({ entry, enabled }: { entry: RiskPolicyHistory | null; enabled: boolean }) {
  if (!entry) return null;
  return (
    <Text size="sm">
      {enabled ? 'Halted' : 'Resumed'} by <Text span fw={500}>{formatActor(entry.actor)}</Text>{' '}
      <ReactTimeAgo date={new Date(entry.changedAt)} timeStyle="round" />
      {entry.reason ? `: ${entry.reason}` : ''}
    </Text>
  );
}
