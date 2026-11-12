import { Alert as MantineAlert, Badge, Card, Container, Group, Stack, Table, Text, Title, Tooltip } from '@mantine/core';
import ReactTimeAgo from 'react-time-ago';
import { useNavigate } from 'react-router-dom';
import { POLL, useActiveSessions, useAlerts, useGatewayStatus } from '../../../query/hooks';
import { LastUpdated } from '../../../components/LastUpdated';
import { ModeBadge } from '../../../components/trading/layout';
import { GatewayStatus } from '../../../types/gateways';
import { StrategySession } from '../../../types/strategy-sessions';
import { Alert } from '../../../types/alerts';
import { formatMicros, GATEWAY_ALERT_TYPES, gatewayHealth, isGatewayAlert, lastOf, linkedSessions } from '../../../utils/gateways';

const OPEN_ALERTS = { status: ['FIRING' as const, 'PENDING' as const], type: GATEWAY_ALERT_TYPES, limit: 500 };

/** What a gateway did in its last minute, in a few words: a live one's sends and refusals, a paper one's books' lag. */
function lastMinute(g: GatewayStatus) {
  const doc = g.minutes;
  if (!doc) return <Text size="sm" c="dimmed">—</Text>;
  if (g.mode === 'paper') {
    const last = lastOf(doc.paper?.minutes ?? []);
    if (!last) return <Text size="sm" c="dimmed">—</Text>;
    return (
      <Text size="sm" c={last.lagMaxMs > 100 ? 'orange' : undefined}>
        books&apos; lag {last.lagMaxMs} ms
      </Text>
    );
  }
  const lasts = doc.accounts.map((a) => lastOf(a.minutes)).filter((m) => m != null);
  if (lasts.length === 0) return <Text size="sm" c="dimmed">—</Text>;
  const sent = lasts.reduce((sum, m) => sum + m.orders + m.cancels, 0);
  const refused = lasts.reduce((sum, m) => sum + m.refusedWaiting + m.refusedWithoutConnection, 0);
  const venue429 = lasts.reduce((sum, m) => sum + m.venueRefusals, 0);
  const cancelWait = Math.max(...lasts.map((m) => m.cancelWaitP99Us));
  return (
    <Group gap={6} wrap="nowrap">
      <Text size="sm">{sent} sent</Text>
      <Text size="xs" c="dimmed">cancel wait p99 {formatMicros(cancelWait)}</Text>
      {refused > 0 && <Badge size="xs" color="orange" variant="light">{refused} refused</Badge>}
      {venue429 > 0 && <Badge size="xs" color="red" variant="light">{venue429} × 429</Badge>}
    </Group>
  );
}

function GatewayTable({ gateways, sessions, alerts }: {
  gateways: GatewayStatus[];
  sessions: StrategySession[];
  alerts: Alert[];
}) {
  const navigate = useNavigate();
  const now = Date.now();
  if (gateways.length === 0) {
    return <Text size="sm" c="dimmed">None yet.</Text>;
  }
  return (
    <Table highlightOnHover verticalSpacing="xs">
      <Table.Thead>
        <Table.Tr>
          <Table.Th>Gateway</Table.Th>
          <Table.Th>Region</Table.Th>
          <Table.Th>State</Table.Th>
          <Table.Th>Sessions</Table.Th>
          <Table.Th>Working orders</Table.Th>
          <Table.Th>Last minute</Table.Th>
          <Table.Th>Release</Table.Th>
          <Table.Th>Last wanted</Table.Th>
          <Table.Th>Alerts</Table.Th>
        </Table.Tr>
      </Table.Thead>
      <Table.Tbody>
        {gateways.map((g) => {
          const health = gatewayHealth(g, now);
          const links = linkedSessions(g.gatewayKey, sessions);
          const unlinked = links.filter((l) => !l.linked).length;
          const open = alerts.filter((a) => isGatewayAlert(a, g.gatewayKey)).length;
          return (
            <Table.Tr key={g.gatewayKey} style={{ cursor: 'pointer' }}
              onClick={() => navigate(`/trading/gateways/${encodeURIComponent(g.gatewayKey)}`)}>
              <Table.Td><Text ff="monospace" size="sm">{g.gatewayKey}</Text></Table.Td>
              <Table.Td><Text size="sm">{g.region}</Text></Table.Td>
              <Table.Td><Badge color={health.color} variant="light">{health.label}</Badge></Table.Td>
              <Table.Td>
                <Group gap={6} wrap="nowrap">
                  <Text size="sm">{g.endpoint?.linkedSessions ?? links.length}</Text>
                  {unlinked > 0 && (
                    <Tooltip label="Sessions whose heartbeat says their link to it is down" withArrow>
                      <Badge size="xs" color="red" variant="light">{unlinked} unlinked</Badge>
                    </Tooltip>
                  )}
                </Group>
              </Table.Td>
              <Table.Td><Text size="sm">{g.endpoint?.workingOrders ?? '—'}</Text></Table.Td>
              <Table.Td>{lastMinute(g)}</Table.Td>
              <Table.Td>
                <Text size="sm" ff="monospace">{g.endpoint?.version ?? '—'}</Text>
                {g.pinnedVersion && <Text size="xs" c="dimmed">pinned {g.pinnedVersion}</Text>}
              </Table.Td>
              <Table.Td>
                {g.wantedAt ? <Text size="sm"><ReactTimeAgo date={new Date(g.wantedAt)} timeStyle="round" /></Text> : '—'}
              </Table.Td>
              <Table.Td>{open > 0 ? <Badge color="red">{open}</Badge> : <Text size="sm" c="dimmed">0</Text>}</Table.Td>
            </Table.Tr>
          );
        })}
      </Table.Tbody>
    </Table>
  );
}

// Every order gateway: live ones trade a venue's accounts for every live session on it; paper ones simulate a venue
// for the paper sessions on it. Each runs only while sessions want it (the gateway reconciler starts and stops it).
function Gateways() {
  const status = useGatewayStatus();
  const sessions = useActiveSessions();
  const alerts = useAlerts(OPEN_ALERTS);
  const all = status.data ?? [];
  const live = all.filter((g) => g.mode === 'live');
  const paper = all.filter((g) => g.mode === 'paper');

  return (
    <Container size="xl" py="xl">
      <Group justify="space-between" mb="md">
        <Title order={2}>Order gateways</Title>
        <LastUpdated at={status.dataUpdatedAt ? new Date(status.dataUpdatedAt) : null} intervalMs={POLL.gateways}
          failing={status.isError} />
      </Group>
      {status.error && <MantineAlert color="red" mb="md">{status.error.message}</MantineAlert>}
      <Stack gap="lg">
        {[{ mode: 'live', list: live }, { mode: 'paper', list: paper }].map(({ mode, list }) => (
          <Card withBorder key={mode}>
            <Group gap="xs" mb="sm">
              <ModeBadge mode={mode} />
              <Text fw={600}>{mode === 'live' ? 'Live gateways' : 'Paper gateways'}</Text>
            </Group>
            <GatewayTable gateways={list} sessions={sessions.data ?? []} alerts={alerts.data ?? []} />
          </Card>
        ))}
      </Stack>
    </Container>
  );
}

export default Gateways;
