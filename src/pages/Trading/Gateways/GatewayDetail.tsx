import { Alert as MantineAlert, Anchor, Badge, Card, Container, Group, SimpleGrid, Stack, Table, Text } from '@mantine/core';
import { IconExternalLink } from '@tabler/icons-react';
import ReactTimeAgo from 'react-time-ago';
import { Link, useNavigate, useParams } from 'react-router-dom';
import {
  CartesianGrid, Legend, Line, LineChart, ResponsiveContainer, Tooltip as RechartsTooltip, XAxis, YAxis,
} from 'recharts';
import { POLL, useActiveSessions, useAlerts, useGatewayStatus } from '../../../query/hooks';
import { PageHeader } from '../../../components/PageHeader';
import { LastUpdated } from '../../../components/LastUpdated';
import { Kpi, ModeBadge } from '../../../components/trading/layout';
import { GatewayAccountMinutes, GatewayPaperMinute } from '../../../types/gateways';
import { formatDuration } from '../../../utils/format';
import {
  accountTotals, ecsServiceUrl, formatMicros, GATEWAY_ALERT_TYPES, gatewayHealth, isGatewayAlert, lastOf, linkedSessions,
  logGroupUrl, shares,
} from '../../../utils/gateways';

const RECENT_ALERTS = { type: GATEWAY_ALERT_TYPES, limit: 500 };
const TOOLTIP_STYLE = { background: '#1a1b1e', border: '1px solid #373a40' };

const clock = (ms: number) => new Date(ms).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });

function MinuteChart({ data, lines, unit }: {
  data: Record<string, number>[];
  lines: { key: string; name: string; color: string }[];
  unit?: string;
}) {
  return (
    <ResponsiveContainer width="100%" height={200}>
      <LineChart data={data} margin={{ top: 4, right: 8, bottom: 0, left: 0 }}>
        <CartesianGrid strokeDasharray="3 3" opacity={0.2} />
        <XAxis dataKey="endedAt" tickFormatter={clock} tick={{ fontSize: 10 }} minTickGap={30} />
        <YAxis tick={{ fontSize: 11 }} unit={unit} width={56} />
        <RechartsTooltip labelFormatter={(v) => clock(Number(v))} contentStyle={TOOLTIP_STYLE} />
        <Legend wrapperStyle={{ fontSize: 12 }} />
        {lines.map((l) => (
          <Line key={l.key} type="monotone" dataKey={l.key} name={l.name} stroke={l.color} dot={false} isAnimationActive={false} />
        ))}
      </LineChart>
    </ResponsiveContainer>
  );
}

// One venue account on a live gateway: its last hour of sends and waits, and how its last minute was shared.
function AccountCard({ account }: { account: GatewayAccountMinutes }) {
  const totals = accountTotals(account.minutes);
  const last = lastOf(account.minutes);
  const waits = account.minutes.map((m) => ({
    endedAt: m.endedAt,
    cancelWait: m.cancelWaitP99Us / 1_000,
    orderWait: m.orderWaitP99Us / 1_000,
    orderAnswer: m.orderAnswerP99Us / 1_000,
  }));
  const sent = account.minutes.map((m) => ({
    endedAt: m.endedAt, orders: m.orders, cancels: m.cancels, refused: m.refusedWaiting + m.refusedWithoutConnection,
  }));
  return (
    <Card withBorder>
      <Group justify="space-between" mb="sm">
        <Group gap="xs">
          <Text fw={600}>{account.name}</Text>
          <Text size="sm" c="dimmed">account {account.accountId}</Text>
        </Group>
        <Anchor component={Link} to="/treasury" size="sm">Halt or emergency cancel on Treasury</Anchor>
      </Group>
      <SimpleGrid cols={{ base: 2, sm: 4, lg: 7 }} mb="md">
        <Kpi label="Sent (last hour)" value={(totals.orders + totals.cancels).toLocaleString()}
          footer={`${totals.orders} orders · ${totals.cancels} cancels`} />
        <Kpi label="Cancel wait p99" value={last ? formatMicros(last.cancelWaitP99Us) : '—'}
          hint="How long cancels waited for the account's request budget, last minute"
          footer={`worst ${formatMicros(totals.worstCancelWaitP99Us)} this hour`} />
        <Kpi label="Order wait p99" value={last ? formatMicros(last.orderWaitP99Us) : '—'}
          hint="How long orders and amends waited for the budget, last minute"
          footer={`worst ${formatMicros(totals.worstOrderWaitP99Us)} this hour`} />
        <Kpi label="Venue answers p99" value={last ? formatMicros(last.orderAnswerP99Us) : '—'}
          hint="The venue's round trip for orders, last minute"
          footer={last ? `cancels ${formatMicros(last.cancelAnswerP99Us)}` : undefined} />
        <Kpi label="Held / refused" value={`${totals.held} / ${totals.refused}`}
          hint="Requests held for the budget, and new orders refused RATE_LIMITED for waiting past their session's limit, this hour" />
        <Kpi label="429s" value={<Text span inherit c={totals.venueRefusals ? 'red' : undefined}>{totals.venueRefusals}</Text>}
          hint="Times the venue refused a request for its rate limit this hour; the budget exists to prevent these" />
        <Kpi label="Never answered" value={<Text span inherit c={totals.unanswered ? 'orange' : undefined}>{totals.unanswered}</Text>}
          hint="Requests the venue never answered this hour (connection failed or timed out after sending)" />
      </SimpleGrid>
      <SimpleGrid cols={{ base: 1, lg: 2 }} mb="md">
        <div>
          <Text size="sm" c="dimmed" mb={4}>Sent per minute</Text>
          <MinuteChart data={sent} lines={[
            { key: 'orders', name: 'orders & amends', color: '#228be6' },
            { key: 'cancels', name: 'cancels', color: '#40c057' },
            { key: 'refused', name: 'refused', color: '#fa5252' },
          ]} />
        </div>
        <div>
          <Text size="sm" c="dimmed" mb={4}>p99 per minute</Text>
          <MinuteChart data={waits} unit=" ms" lines={[
            { key: 'cancelWait', name: 'cancel wait', color: '#40c057' },
            { key: 'orderWait', name: 'order wait', color: '#228be6' },
            { key: 'orderAnswer', name: 'venue answer', color: '#fab005' },
          ]} />
        </div>
      </SimpleGrid>
      <Text size="sm" c="dimmed" mb={4}>Each session&apos;s share of the last minute&apos;s sends</Text>
      {account.sessions.length === 0 ? <Text size="sm" c="dimmed">Nothing sent.</Text> : (
        <Table verticalSpacing={4}>
          <Table.Thead>
            <Table.Tr><Table.Th>Session</Table.Th><Table.Th>Slot</Table.Th><Table.Th>Sent</Table.Th><Table.Th>Share</Table.Th></Table.Tr>
          </Table.Thead>
          <Table.Tbody>
            {shares(account.sessions).map((s) => (
              <Table.Tr key={s.slot}>
                <Table.Td>
                  {s.sessionId
                    ? <Anchor component={Link} to={`/sessions/${s.sessionId}`} size="sm" ff="monospace">{s.sessionId.slice(0, 8)}</Anchor>
                    : <Text size="sm" c="dimmed">gone</Text>}
                </Table.Td>
                <Table.Td><Text size="sm">{s.slot}</Text></Table.Td>
                <Table.Td><Text size="sm">{s.sent}</Text></Table.Td>
                <Table.Td><Text size="sm">{(s.share * 100).toFixed(1)}%</Text></Table.Td>
              </Table.Tr>
            ))}
          </Table.Tbody>
        </Table>
      )}
    </Card>
  );
}

// A paper gateway's simulated venue: how far its books trailed the market, and how many sessions it carried.
function PaperCard({ minutes }: { minutes: GatewayPaperMinute[] }) {
  const worst = Math.max(0, ...minutes.map((m) => m.lagMaxMs));
  const last = lastOf(minutes);
  return (
    <Card withBorder>
      <Text fw={600} mb="sm">Simulated venue</Text>
      <SimpleGrid cols={{ base: 2, sm: 4 }} mb="md">
        <Kpi label="Books' lag" value={last ? `${last.lagMaxMs} ms` : '—'}
          hint="The oldest new market-data record any book took in the last minute, from the venue's receipt. Hundreds of ms every minute means the gateway can't keep up; a single spike is usually a shard moving." />
        <Kpi label="Worst this hour" value={`${worst} ms`} />
        <Kpi label="Sessions" value={last?.sessions ?? '—'} hint="About 30 fit on one c7a.medium" />
        <Kpi label="Refused, no book data" value={last?.refusedNotReady ?? '—'}
          hint="New orders refused GATEWAY_NOT_READY because their book had no record yet, since the gateway started" />
      </SimpleGrid>
      <SimpleGrid cols={{ base: 1, lg: 2 }}>
        <div>
          <Text size="sm" c="dimmed" mb={4}>Books&apos; lag per minute</Text>
          <MinuteChart data={minutes.map((m) => ({ endedAt: m.endedAt, lag: m.lagMaxMs }))} unit=" ms"
            lines={[{ key: 'lag', name: 'worst lag', color: '#fab005' }]} />
        </div>
        <div>
          <Text size="sm" c="dimmed" mb={4}>Sessions and working orders</Text>
          <MinuteChart data={minutes.map((m) => ({ endedAt: m.endedAt, sessions: m.sessions, working: m.workingOrders }))}
            lines={[
              { key: 'sessions', name: 'sessions', color: '#228be6' },
              { key: 'working', name: 'working orders', color: '#40c057' },
            ]} />
        </div>
      </SimpleGrid>
    </Card>
  );
}

// One order gateway: whether it runs, who is linked to it, its last hour per account (or, for paper, its books' lag)
// and its alerts.
function GatewayDetail() {
  const { gatewayKey = '' } = useParams();
  const navigate = useNavigate();
  const status = useGatewayStatus();
  const sessions = useActiveSessions();
  const alerts = useAlerts(RECENT_ALERTS);
  const g = status.data?.find((s) => s.gatewayKey === gatewayKey);
  const now = Date.now();
  const health = g ? gatewayHealth(g, now) : null;
  const links = linkedSessions(gatewayKey, sessions.data ?? []);
  const own = (alerts.data ?? []).filter((a) => isGatewayAlert(a, gatewayKey)).slice(0, 50);
  const lastMinutes = g?.minutes?.writtenAt;

  return (
    <Container size="xl" py="xl">
      <PageHeader
        onBack={() => navigate('/trading/gateways')}
        title={<Text span ff="monospace" fw={700} size="xl">{gatewayKey}</Text>}
        badges={g && health && (
          <Group gap="xs" wrap="nowrap">
            <ModeBadge mode={g.mode} />
            <Badge color={health.color} variant="light">{health.label}</Badge>
            <LastUpdated at={status.dataUpdatedAt ? new Date(status.dataUpdatedAt) : null} intervalMs={POLL.gateways}
              failing={status.isError} compact />
          </Group>
        )}
        menu={g ? [
          { label: 'Open service in ECS', icon: <IconExternalLink size={14} />, onClick: () => window.open(ecsServiceUrl(g.region, g.gatewayKey), '_blank') },
          { label: 'Open logs in CloudWatch', icon: <IconExternalLink size={14} />, onClick: () => window.open(logGroupUrl(g.region), '_blank') },
        ] : []}
        meta={g ? [
          `${g.exchangeCode ?? `exchange ${g.exchangeId}`} · ${g.region}`,
          `${g.profile} profile`,
          g.endpoint ? `orchestrator ${g.endpoint.version}` : null,
          g.pinnedVersion ? `pinned ${g.pinnedVersion}` : null,
          g.endpoint ? `task ${g.endpoint.instance}` : null,
          g.mode === 'live' ? `${g.accounts} account${g.accounts === 1 ? '' : 's'}` : null,
        ] : []}
      />
      {status.error && <MantineAlert color="red" mb="md">{status.error.message}</MantineAlert>}
      {status.data && !g && <MantineAlert color="gray" mt="md">No gateway {gatewayKey}.</MantineAlert>}
      {g && (
        <Stack gap="lg" mt="md">
          <SimpleGrid cols={{ base: 2, sm: 4 }}>
            <Kpi label="Sessions linked" value={g.endpoint?.linkedSessions ?? '—'}
              footer={links.some((l) => !l.linked) ? <Text span size="xs" c="red">{links.filter((l) => !l.linked).length} unlinked</Text> : undefined} />
            <Kpi label="Working orders" value={g.endpoint?.workingOrders ?? '—'} />
            <Kpi label="Last wanted" value={g.wantedAt ? <ReactTimeAgo date={new Date(g.wantedAt)} timeStyle="round" /> : '—'}
              hint="A session asks every minute while linked; the gateway stops 30 minutes after the last ask once it holds nothing" />
            <Kpi label="Endpoint written" value={g.endpoint ? <ReactTimeAgo date={new Date(g.endpoint.writtenAt)} timeStyle="round" /> : 'not running'}
              footer={lastMinutes ? <>minutes written <ReactTimeAgo date={new Date(lastMinutes)} timeStyle="round" /></> : 'no minutes yet'} />
          </SimpleGrid>

          {!g.endpoint && (
            <MantineAlert color="gray" variant="light">
              Not running: nothing has written its endpoint in the last minute. It starts when a session asks for it.
            </MantineAlert>
          )}

          {g.mode === 'paper'
            ? g.minutes?.paper && <PaperCard minutes={g.minutes.paper.minutes} />
            : g.minutes?.accounts.map((a) => <AccountCard key={a.accountId} account={a} />)}

          <Card withBorder>
            <Text fw={600} mb="sm">Sessions linked</Text>
            {links.length === 0 ? <Text size="sm" c="dimmed">No running session names it in its heartbeat.</Text> : (
              <Table verticalSpacing={4}>
                <Table.Thead>
                  <Table.Tr><Table.Th>Session</Table.Th><Table.Th>Strategy</Table.Th><Table.Th>Link</Table.Th><Table.Th>Working orders</Table.Th></Table.Tr>
                </Table.Thead>
                <Table.Tbody>
                  {links.map((l) => (
                    <Table.Tr key={l.sessionId}>
                      <Table.Td><Anchor component={Link} to={`/sessions/${l.sessionId}`} size="sm" ff="monospace">{l.sessionId.slice(0, 8)}</Anchor></Table.Td>
                      <Table.Td><Anchor component={Link} to={`/strategies/${l.strategyId}`} size="sm">{l.strategyId}</Anchor></Table.Td>
                      <Table.Td>
                        {l.linked
                          ? <Badge size="sm" color="teal" variant="light">linked</Badge>
                          : <Badge size="sm" color="red" variant="light">unlinked {formatDuration(l.unlinkedMs)}</Badge>}
                      </Table.Td>
                      <Table.Td><Text size="sm">{l.workingOrders}</Text></Table.Td>
                    </Table.Tr>
                  ))}
                </Table.Tbody>
              </Table>
            )}
          </Card>

          <Card withBorder>
            <Group justify="space-between" mb="sm">
              <Text fw={600}>Alerts</Text>
              <Anchor component={Link} to="/system/alerts" size="sm">All alerts</Anchor>
            </Group>
            {own.length === 0 ? <Text size="sm" c="dimmed">None recorded.</Text> : (
              <Table verticalSpacing={4}>
                <Table.Thead>
                  <Table.Tr><Table.Th>Status</Table.Th><Table.Th>Severity</Table.Th><Table.Th>Type</Table.Th><Table.Th>Title</Table.Th><Table.Th>Last seen</Table.Th></Table.Tr>
                </Table.Thead>
                <Table.Tbody>
                  {own.map((a) => (
                    <Table.Tr key={a.alertId}>
                      <Table.Td><Badge size="sm" variant="light" color={a.status === 'RESOLVED' ? 'gray' : 'red'}>{a.status.toLowerCase()}</Badge></Table.Td>
                      <Table.Td><Text size="sm">{a.severity.toLowerCase()}</Text></Table.Td>
                      <Table.Td><Text size="sm" ff="monospace">{a.type}</Text></Table.Td>
                      <Table.Td>
                        {a.runbookUrl ? <Anchor href={a.runbookUrl} target="_blank" size="sm">{a.title}</Anchor> : <Text size="sm">{a.title}</Text>}
                      </Table.Td>
                      <Table.Td><Text size="sm"><ReactTimeAgo date={new Date(a.lastSeen)} timeStyle="round" /></Text></Table.Td>
                    </Table.Tr>
                  ))}
                </Table.Tbody>
              </Table>
            )}
          </Card>
        </Stack>
      )}
    </Container>
  );
}

export default GatewayDetail;
