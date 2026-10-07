import { ActionIcon, Anchor, Badge, Card, Group, Progress, SimpleGrid, Stack, Text, Tooltip } from '@mantine/core';
import { IconPlayerStop } from '@tabler/icons-react';
import { Link } from 'react-router-dom';
import { StrategySession, StrategySessionStatus } from '../../types';
import { useRiskUsages, useSessionsTotals } from '../../query/hooks';
import { formatDuration } from '../../utils/format';
import { configuredListings } from '../../utils/policy-target';
import { closestLimit, usageColor } from '../../utils/risk-usage';
import { SESSION_STATUS_COLORS } from '../../utils/session-status';
import { Heartbeat } from '../../components/trading/Heartbeat';
import { Money } from '../../components/trading/values';

// One card per session that's up or on its way up or down: whether it's alive, how it's doing, and how close it is to
// a limit, with Stop to hand.
export function RunningSessions({ sessions, strategyName, onStop }: {
  sessions: StrategySession[];
  strategyName: (strategyId: number) => string;
  onStop: (session: StrategySession) => void;
}) {
  const ids = sessions.map(s => s.sessionId);
  const totals = useSessionsTotals(ids, true);
  const usages = useRiskUsages(ids);
  if (sessions.length === 0) {
    return <Text size="sm" c="dimmed" mb="lg">Nothing running in this mode.</Text>;
  }
  return (
    <SimpleGrid cols={{ base: 1, sm: 2, lg: 3 }} spacing="sm" mb="lg">
      {sessions.map((session, i) => {
        const own = totals.data?.find(t => t.sessionId === session.sessionId);
        const limit = closestLimit(usages[i]?.data?.policies);
        const listings = configuredListings([session]).size;
        return (
          <Card key={session.sessionId} withBorder padding="sm" radius="md">
            <Group justify="space-between" wrap="nowrap" mb={6}>
              <Group gap={6} wrap="nowrap" style={{ minWidth: 0 }}>
                <Anchor component={Link} to={`/sessions/${session.sessionId}`} fw={600} size="sm" truncate>
                  {strategyName(session.strategyId)}
                </Anchor>
                <Text size="xs" c="dimmed" ff="monospace">{session.sessionId.slice(0, 8)}</Text>
              </Group>
              <Group gap={4} wrap="nowrap">
                {session.status !== StrategySessionStatus.RUNNING && (
                  <Badge size="xs" variant="light" color={SESSION_STATUS_COLORS[session.status]}>{session.status}</Badge>
                )}
                <Heartbeat session={session} />
                <Tooltip label="Stop session" withArrow openDelay={400}>
                  <ActionIcon size="sm" variant="subtle" color="red" onClick={() => onStop(session)}
                    disabled={session.status === StrategySessionStatus.STOPPING}>
                    <IconPlayerStop size={14} />
                  </ActionIcon>
                </Tooltip>
              </Group>
            </Group>
            <Group justify="space-between" align="flex-end" wrap="nowrap">
              <Stack gap={0}>
                <Text size="xs" c="dimmed">Session PnL</Text>
                <Money value={own?.totals.total ?? null} fw={700} size="lg" />
              </Stack>
              <Stack gap={0} align="flex-end">
                <Text size="xs" c="dimmed">
                  {session.startedAt ? `up ${formatDuration(Date.now() - Date.parse(session.startedAt))}` : 'not started'}
                </Text>
                <Text size="xs" c="dimmed">
                  {listings} listing{listings === 1 ? '' : 's'} · {own ? `${own.fills} fill${own.fills === 1 ? '' : 's'}` : '—'}
                  {own?.opening === 'INHERITED' ? ' · inherited' : ''}
                </Text>
              </Stack>
            </Group>
            {limit && (
              <Tooltip label={`Closest limit: ${limit.label}`} withArrow>
                <Group gap={6} wrap="nowrap" mt={8}>
                  <Text size="xs" c="dimmed" w={70} truncate>{limit.label}</Text>
                  <Progress value={Math.min(100, limit.usage * 100)} color={usageColor(limit.usage)} size="sm" style={{ flex: 1 }} />
                  <Text size="xs" w={34} ta="right">{Math.round(limit.usage * 100)}%</Text>
                </Group>
              </Tooltip>
            )}
          </Card>
        );
      })}
    </SimpleGrid>
  );
}
