import { Anchor, Badge, Group, Paper, Stack, Text, Title } from '@mantine/core';
import { Link } from 'react-router-dom';
import { RiskPolicy } from '../types';
import { useLatestPolicyHistory } from '../hooks/useLatestPolicyHistory';
import { useListingLabels } from '../hooks/useAsyncSearch';
import { KILL_SWITCH_TYPE, OMS_ACTOR } from '../utils/kill-switch';
import { describeTarget, targetPageLink, policyLevel } from '../utils/policy-target';
import { KillSwitchLatestEntry } from './KillSwitchLatestEntry';

function KillRow({ policy, label }: { policy: RiskPolicy; label: string }) {
  const entry = useLatestPolicyHistory(policy);
  const level = policyLevel(policy);
  return (
    <Group justify="space-between" wrap="nowrap" align="flex-start">
      <Stack gap={2} style={{ minWidth: 0 }}>
        <Group gap="xs">
          <Badge color={level.color} variant="outline" size="sm">{level.label}</Badge>
          <Anchor component={Link} to={targetPageLink(policy)} size="sm" fw={500}>{label}</Anchor>
          {entry?.actor === OMS_ACTOR && <Badge color="orange" size="sm">OMS risk breach</Badge>}
        </Group>
        <KillSwitchLatestEntry entry={entry} enabled />
      </Stack>
    </Group>
  );
}

interface ActiveKillSwitchesProps {
  policies: RiskPolicy[] | null;
  strategyName: (strategyId: number) => string | undefined;
}

export function ActiveKillSwitches({ policies, strategyName }: ActiveKillSwitchesProps) {
  const kills = (policies ?? []).filter((p) => p.policyType === KILL_SWITCH_TYPE && p.enabled);
  const listingLabels = useListingLabels(kills.flatMap((p) => (p.listingId != null ? [p.listingId] : [])));

  return (
    <Paper withBorder p="md" radius="md" mb="lg">
      <Group justify="space-between" mb="sm">
        <Title order={5}>Active kill switches</Title>
        {policies !== null && (
          <Badge color={kills.length > 0 ? 'red' : 'green'} variant="light">{kills.length}</Badge>
        )}
      </Group>
      {policies === null ? (
        <Text size="sm" c="dimmed">Unknown — risk policies haven't loaded.</Text>
      ) : kills.length === 0 ? (
        <Text size="sm" c="dimmed">None. Nothing is halted.</Text>
      ) : (
        <Stack gap="sm">
          {kills.map((p) => (
            <KillRow key={p.policyId} policy={p} label={describeTarget(p, strategyName, (id) => listingLabels[id])} />
          ))}
        </Stack>
      )}
    </Paper>
  );
}
