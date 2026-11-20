import {
  Alert as MantineAlert, Anchor, Badge, Button, Card, Container, Group, List, SimpleGrid, Skeleton, Stack, Table, Tabs,
  Text, Tooltip,
} from '@mantine/core';
import { useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { IconExternalLink, IconRefresh } from '@tabler/icons-react';
import ReactTimeAgo from 'react-time-ago';
import { Link, useNavigate, useParams } from 'react-router-dom';
import {
  CartesianGrid, Legend, Line, LineChart, ReferenceLine, ResponsiveContainer, Tooltip as RechartsTooltip, XAxis, YAxis,
} from 'recharts';
import { keys, POLL, useActiveSessions, useAlerts, useGatewayStatus } from '../../../query/hooks';
import { ReasonConfirmModal } from '../../../components/ReasonConfirmModal';
import { PageHeader } from '../../../components/PageHeader';
import { LastUpdated } from '../../../components/LastUpdated';
import { Kpi, ModeBadge } from '../../../components/trading/layout';
import { GatewayAccountMinutes, GatewayPaperLoad, GatewayPaperMinute, GatewayStatus } from '../../../types/gateways';
import { PaperGatewayCapacity } from '../../../components/gateways/PaperGatewayCapacity';
import { formatDuration } from '../../../utils/format';
import { registryApi, samplesConfigured } from '../../../utils/api';
import { GatewayPerformance } from './GatewayPerformance';
import {
  accountTotals, ecsServiceUrl, formatMicros, GATEWAY_ALERT_TYPES, gatewayHealth, isGatewayAlert, lastOf, linkedSessions,
  logGroupUrl, rollPhaseLabel, rollPlan, rollUnderWay, shares,
} from '../../../utils/gateways';
import { ExchangeLink } from '../../../components/ExchangeLink';

const RECENT_ALERTS = { type: GATEWAY_ALERT_TYPES, limit: 500 };
const TOOLTIP_STYLE = { background: '#1a1b1e', border: '1px solid #373a40' };

const clock = (ms: number) => new Date(ms).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });

function MinuteChart({ data, lines, unit, references = [] }: {
  data: Record<string, number | undefined>[];
  lines: { key: string; name: string; color: string }[];
  unit?: string;
  // Horizontal lines for a limit, e.g. a cap or the overload threshold.
  references?: { y: number; label: string; color: string }[];
}) {
  return (
    <ResponsiveContainer width="100%" height={200}>
      <LineChart data={data} margin={{ top: 4, right: 8, bottom: 0, left: 0 }}>
        <CartesianGrid strokeDasharray="3 3" opacity={0.2} />
        <XAxis dataKey="endedAt" tickFormatter={clock} tick={{ fontSize: 10 }} minTickGap={30} />
        <YAxis tick={{ fontSize: 11 }} unit={unit} width={56} />
        <RechartsTooltip labelFormatter={(v) => clock(Number(v))} contentStyle={TOOLTIP_STYLE} />
        <Legend wrapperStyle={{ fontSize: 12 }} />
        {references.map((r) => (
          <ReferenceLine key={r.label} y={r.y} stroke={r.color} strokeDasharray="4 4"
            label={{ value: r.label, position: 'insideTopRight', fontSize: 10, fill: r.color }} />
        ))}
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

// Over this share of new records later than 5 ms, the books' lag p99 is past 5 ms (PAPER_GATEWAY_OVERLOADED after five
// minutes of it).
const LATE_SHARE_LIMIT_PCT = 1;

// A paper gateway's simulated venue: its load against its caps, how far its books trailed the market, how many
// sessions it carried and turned away.
function PaperCard({ minutes, load }: { minutes: GatewayPaperMinute[]; load: GatewayPaperLoad | null | undefined }) {
  const worst = Math.max(0, ...minutes.map((m) => m.lagMaxMs));
  const last = lastOf(minutes);
  // Minutes from a release before the gateway reported its load have none of these.
  const reported = minutes.filter((m) => m.lateShare != null);
  const lastReported = lastOf(reported);
  const latePct = lastReported?.lateShare != null ? lastReported.lateShare * 100 : null;
  return (
    <Card withBorder>
      <Text fw={600} mb="sm">Simulated venue</Text>
      <Text size="sm" c="dimmed" mb={4}>Capacity</Text>
      <Stack mb="md"><PaperGatewayCapacity load={load} /></Stack>
      <SimpleGrid cols={{ base: 2, sm: 3, lg: 6 }} mb="md">
        <Kpi label="Books' lag" value={last ? `${last.lagMaxMs} ms` : '—'}
          hint="The oldest new market-data record any book took in the last minute, from the venue's receipt. Hundreds of ms every minute means the gateway can't keep up; a single spike is usually a shard moving." />
        <Kpi label="Worst this hour" value={`${worst} ms`} />
        <Kpi label="Sessions" value={last?.sessions ?? '—'}
          hint="Sessions it simulates for; what fits is set by its books and streams caps above" />
        <Kpi label="Refused, no book data" value={last?.refusedNotReady ?? '—'}
          hint="New orders refused GATEWAY_NOT_READY because their book had no record yet, since the gateway started" />
        <Kpi label="Late records" value={latePct == null ? '—'
          : <Text span inherit c={latePct > LATE_SHARE_LIMIT_PCT ? 'red' : undefined}>{latePct.toFixed(2)}%</Text>}
          hint="Of the last minute's new records, the share that reached the books more than 5 ms after the venue sent them. Over 1%, the books' lag p99 is past 5 ms; five minutes of that raises PAPER_GATEWAY_OVERLOADED." />
        <Kpi label="Sessions refused for room" value={lastReported?.refusedForRoom ?? '—'}
          hint="New sessions refused SESSION_CAP because they would take the gateway past its books or streams cap, since it started. Each is sent to another of the venue's paper gateways when it asks again." />
      </SimpleGrid>
      <SimpleGrid cols={{ base: 1, lg: 2 }}>
        <div>
          <Text size="sm" c="dimmed" mb={4}>Books&apos; lag per minute</Text>
          <MinuteChart data={minutes.map((m) => ({ endedAt: m.endedAt, lag: m.lagMaxMs }))} unit=" ms"
            lines={[{ key: 'lag', name: 'worst lag', color: '#fab005' }]} />
        </div>
        {reported.length > 0 && (
          <div>
            <Text size="sm" c="dimmed" mb={4}>Records later than 5 ms</Text>
            <MinuteChart data={reported.map((m) => ({ endedAt: m.endedAt, late: (m.lateShare ?? 0) * 100 }))} unit="%"
              lines={[{ key: 'late', name: 'late share', color: '#fa5252' }]}
              references={[{ y: LATE_SHARE_LIMIT_PCT, label: 'p99 past 5 ms', color: '#fa5252' }]} />
          </div>
        )}
        {reported.length > 0 && (
          <div>
            <Text size="sm" c="dimmed" mb={4}>Books and streams</Text>
            <MinuteChart data={reported.map((m) => ({ endedAt: m.endedAt, books: m.books, streams: m.streams }))}
              lines={[
                { key: 'books', name: 'books', color: '#7950f2' },
                { key: 'streams', name: 'streams', color: '#15aabf' },
              ]}
              references={load ? [
                { y: load.maxBooks, label: 'books cap', color: '#7950f2' },
                { y: load.maxStreams, label: 'streams cap', color: '#15aabf' },
              ] : []} />
          </div>
        )}
        {reported.length > 0 && (
          <div>
            <Text size="sm" c="dimmed" mb={4}>Records per second</Text>
            <MinuteChart data={reported.map((m) => ({ endedAt: m.endedAt, rate: m.recordsPerSecond }))}
              lines={[{ key: 'rate', name: 'records/s', color: '#12b886' }]} />
          </div>
        )}
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
/** The last roll the reconciler took up, or the one asked for that it is about to. */
function RollCard({ g, nowMs }: { g: GatewayStatus; nowMs: number }) {
  const roll = g.roll;
  const waiting = rollUnderWay(g, nowMs) && (!roll || Date.parse(roll.requestedAt) < Date.parse(g.rollRequestedAt ?? ''));
  if (!roll && !waiting) return null;
  const phase = waiting ? { label: 'asked for', color: 'violet' } : rollPhaseLabel(roll!.phase);
  return (
    <Card withBorder>
      <Group justify="space-between" mb="xs">
        <Group gap="xs">
          <Text fw={600}>Roll</Text>
          <Badge color={phase.color} variant="light">{phase.label}</Badge>
        </Group>
        {g.rollRequestedBy && g.rollRequestedAt && (
          <Text size="xs" c="dimmed">
            asked by {g.rollRequestedBy} <ReactTimeAgo date={new Date(g.rollRequestedAt)} timeStyle="round" />
          </Text>
        )}
      </Group>
      {waiting ? (
        <Text size="sm" c="dimmed">Waiting for the gateway reconciler to take it up (within a minute).</Text>
      ) : (
        <Stack gap={4}>
          {roll!.fromVersion && roll!.toVersion && (
            <Text size="sm" ff="monospace">{roll!.fromVersion} → {roll!.toVersion}</Text>
          )}
          {roll!.startedAt && (
            <Text size="sm" c="dimmed">
              started <ReactTimeAgo date={new Date(roll!.startedAt)} timeStyle="round" />
              {roll!.endedAt && <> · ended <ReactTimeAgo date={new Date(roll!.endedAt)} timeStyle="round" /></>}
              {roll!.startedAt && roll!.endedAt && ` (${formatDuration(Date.parse(roll!.endedAt) - Date.parse(roll!.startedAt))})`}
            </Text>
          )}
          {roll!.reason && <Text size="sm">{roll!.reason}</Text>}
        </Stack>
      )}
    </Card>
  );
}

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
  const unlinked = links.filter((l) => !l.linked).length;
  const firing = own.filter((a) => a.status !== 'RESOLVED').length;
  const queryClient = useQueryClient();
  const [rollOpen, setRollOpen] = useState(false);
  const plan = g ? rollPlan(g, now) : null;
  const confirmRoll = async () => {
    await registryApi.rollGateway(gatewayKey);
    await queryClient.invalidateQueries({ queryKey: keys.gatewayStatus });
  };

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
        actions={g && plan && (
          <Tooltip label={plan.disabled ?? `Restart it on ${plan.target} without cancelling its orders`} withArrow>
            <Button variant="light" leftSection={<IconRefresh size={16} />} disabled={plan.disabled !== null}
              onClick={() => setRollOpen(true)}>
              Roll
            </Button>
          </Tooltip>
        )}
        menu={g ? [
          { label: 'Open service in ECS', icon: <IconExternalLink size={14} />, onClick: () => window.open(ecsServiceUrl(g.region, g.gatewayKey), '_blank') },
          { label: 'Open logs in CloudWatch', icon: <IconExternalLink size={14} />, onClick: () => window.open(logGroupUrl(g.region), '_blank') },
        ] : []}
        meta={g ? [
          <><ExchangeLink exchangeId={g.exchangeId}>{g.exchangeCode ?? `exchange ${g.exchangeId}`}</ExchangeLink> · {g.region}</>,
          `${g.profile} profile`,
          g.endpoint ? `orchestrator ${g.endpoint.version}` : null,
          g.pinnedVersion ? `pinned ${g.pinnedVersion}` : null,
          g.endpoint ? `task ${g.endpoint.instance}` : null,
          g.mode === 'live' ? `${g.accounts} account${g.accounts === 1 ? '' : 's'}` : null,
        ] : []}
      />
      {status.error && <MantineAlert color="red" mb="md">{status.error.message}</MantineAlert>}
      {status.data && !g && <MantineAlert color="gray" mt="md">No gateway {gatewayKey}.</MantineAlert>}
      {status.isLoading && (
        <Stack gap="lg" mt="md">
          <SimpleGrid cols={{ base: 2, sm: 4 }}>
            {[0, 1, 2, 3].map((i) => <Skeleton key={i} h={84} radius="md" />)}
          </SimpleGrid>
          <Skeleton h={36} w={360} />
          <Skeleton h={320} radius="md" />
        </Stack>
      )}
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

          <RollCard g={g} nowMs={now} />

          {!g.endpoint && !rollUnderWay(g, now) && (
            <MantineAlert color="gray" variant="light">
              Not running: nothing has written its endpoint in the last minute. It starts when a session asks for it.
            </MantineAlert>
          )}

          <Tabs defaultValue="overview" keepMounted={false}>
            <Tabs.List mb="md">
              <Tabs.Tab value="overview">Last hour</Tabs.Tab>
              {samplesConfigured && <Tabs.Tab value="performance">Performance</Tabs.Tab>}
              <Tabs.Tab value="sessions">
                Sessions ({links.length}){unlinked > 0 && <Badge ml={6} size="xs" color="red" variant="light">{unlinked} unlinked</Badge>}
              </Tabs.Tab>
              <Tabs.Tab value="alerts">
                Alerts{firing > 0 && <Badge ml={6} size="xs" color="red">{firing}</Badge>}
              </Tabs.Tab>
            </Tabs.List>
            <Tabs.Panel value="overview">
              <Stack gap="lg">
                {g.mode === 'paper'
                  ? g.minutes?.paper && <PaperCard minutes={g.minutes.paper.minutes} load={g.endpoint?.paper} />
                  : g.minutes?.accounts.map((a) => <AccountCard key={a.accountId} account={a} />)}
                {!g.minutes && (
                  <Text size="sm" c="dimmed">
                    No minutes in the last 10 minutes: a gateway writes its last hour once a minute while it runs.
                    {samplesConfigured && ' Its Performance tab reaches back 7 days.'}
                  </Text>
                )}
              </Stack>
            </Tabs.Panel>
            {samplesConfigured && <Tabs.Panel value="performance"><GatewayPerformance gateway={g} /></Tabs.Panel>}
            <Tabs.Panel value="sessions">
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

            </Tabs.Panel>
            <Tabs.Panel value="alerts">
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
            </Tabs.Panel>
          </Tabs>
        </Stack>
      )}
      {g && plan && (
        <ReasonConfirmModal
          opened={rollOpen}
          onClose={() => setRollOpen(false)}
          title={`Roll ${gatewayKey}`}
          message={(
            <Stack gap="sm">
              <Text size="sm">
                Moves it from <Text span ff="monospace">{g.endpoint?.version ?? '?'}</Text> to{' '}
                <Text span ff="monospace">{plan.target}</Text>
                {g.pinnedVersion ? ' (its pin)' : ' (the latest release)'}: it stops without cancelling and starts again on
                its host, taking its {g.endpoint?.workingOrders ?? 0} working order(s) back. Its{' '}
                {g.endpoint?.linkedSessions ?? 0} linked session(s) link again by themselves.
              </Text>
              <Text size="sm" c="dimmed">
                About a minute without it: new orders are refused, cancels wait, and fills at the venue are caught up once
                it is back. If it isn&apos;t up in 5 minutes it is rolled back once. To roll to another release, pin it first.
              </Text>
              {plan.warnings.length > 0 && (
                <MantineAlert color="orange" variant="light">
                  <List size="sm">{plan.warnings.map((w) => <List.Item key={w}>{w}</List.Item>)}</List>
                </MantineAlert>
              )}
            </Stack>
          )}
          confirmLabel="Roll"
          confirmColor="violet"
          askReason={false}
          onConfirm={confirmRoll}
        />
      )}
    </Container>
  );
}

export default GatewayDetail;
