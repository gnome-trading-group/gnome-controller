import { useMemo, useState } from 'react';
import { Alert, Anchor, Badge, Card, Group, SimpleGrid, Stack, Table, Text, Title } from '@mantine/core';
import { Link } from 'react-router-dom';
import { useSamples } from '../../../query/hooks';
import { GatewayStatus } from '../../../types/gateways';
import { CounterData, DropsData, FeedShardsData, LaneMinuteData, RuntimeData, Sample } from '../../../types/samples';
import { MINUTE_MS, RUNTIME_INTERVAL_MS, everyMsFor, ofKind, ringSeries } from '../../../utils/samples';
import {
  MARKET_DATA_PATH, ORDER_PATH, blockSeries, blockTotals, dropTotals, feedShardSeries, feedShardTotals, laneSeries,
  stageBreakdown, worstStreams,
} from '../../../utils/processSamples';
import { Chart, CountBadges, LatencySection, RangeControl, RuntimeSection } from '../../../components/samples/SampleCharts';
import { RANGES, number, windowBackFromNow } from '../../../components/samples/sampleFormat';
import { PathTable } from '../../../components/samples/PathTable';

const MINUTE_KINDS = ['gateway.agents', 'gateway.rings', 'gateway.transport', 'gateway.drops', 'gateway.lanes', 'feed.shards'];
// What a gateway itself measures of a record's path: the shard's own stages are on the shard's page.
const GATEWAY_MARKET_DATA_PATH = MARKET_DATA_PATH.filter(s => !s.metric.startsWith('shard.'));

function MarketDataSection({ samples, rangeMs, loading }: { samples: Sample[]; rangeMs: number; loading: boolean }) {
  const feed = useMemo(() => ofKind<FeedShardsData>(samples, 'feed.shards'), [samples]);
  const agents = useMemo(() => ofKind<CounterData>(samples, 'gateway.agents'), [samples]);
  const peaks = useMemo(() => feedShardSeries(feed), [feed]);
  const shards = useMemo(() => feedShardTotals(feed), [feed]);
  const behind = useMemo(() => worstStreams(feed.map(s => s.data.worstBehind ?? []), r => r.behindPeakBytes), [feed]);
  const rings = useMemo(() => ringSeries(ofKind(samples, 'gateway.rings')), [samples]);
  const lane = useMemo(() => blockSeries(agents, 'lane', {
    passGap: 'passGapPeakNanos', busyBooks: 'busyBooksPeak', recordsPerPass: 'recordsPerPassPeak',
  }), [agents]);
  const reader = useMemo(() => blockSeries(agents, 'feed', {
    passGap: 'passGapPeakNanos', ringRefusals: 'ringRefusals', resubscribes: 'resubscribes', unstamped: 'unstamped',
  }), [agents]);
  const badSpells = useMemo(() => blockTotals(agents, 'feed').filter(c => c.name.startsWith('bad.'))
    .map(c => ({ name: c.name.slice(4).toLowerCase().replace(/_/g, ' '), count: c.count })), [agents]);

  return (
    <Stack gap="xs">
      <Title order={5}>Market data</Title>
      <SimpleGrid cols={{ base: 1, md: 2 }}>
        <Chart title="Worst shard per minute" unit="ms" points={peaks} rangeMs={rangeMs} loading={loading}
          lines={[{ key: 'network', label: 'network + Aeron' }, { key: 'shardWait', label: 'inside the shard' }, { key: 'statusGap', label: 'gap between shard statuses' }]} />
        <Chart title="Records read and streams bad" points={peaks} rangeMs={rangeMs} loading={loading}
          lines={[{ key: 'records', label: 'records per minute' }, { key: 'streams', label: 'streams read' }, { key: 'bad', label: 'streams bad' }]} />
        <Chart title="Simulated lane's loop" points={lane} rangeMs={rangeMs} loading={loading}
          lines={[{ key: 'passGap', label: 'longest pass (ms)' }, { key: 'busyBooks', label: 'busy books, most' }, { key: 'recordsPerPass', label: 'records in a pass, most' }]} />
        <Chart title="Reader → lane ring" unit="records" points={rings.points} rangeMs={rangeMs} loading={loading}
          lines={rings.names.map(key => ({ key, label: `${key} backlog, worst` }))} />
        <Chart title="Shard reader" points={reader} rangeMs={rangeMs} loading={loading}
          lines={[{ key: 'passGap', label: 'longest pass (ms)' }, { key: 'ringRefusals', label: 'ring full' }, { key: 'resubscribes', label: 'resubscribed' }, { key: 'unstamped', label: 'unstamped records' }]} />
      </SimpleGrid>
      <CountBadges label="Bad spells in this window:" counts={badSpells} color="orange" />
      <SimpleGrid cols={{ base: 1, lg: 2 }}>
        <Card withBorder padding="sm">
          <Text size="sm" fw={600} mb={4}>Shards read, worst minute in the window</Text>
          {shards.length === 0 ? <Text size="sm" c="dimmed">None in this window.</Text> : (
            <Table verticalSpacing={4} fz="xs">
              <Table.Thead>
                <Table.Tr>
                  <Table.Th>Shard</Table.Th><Table.Th ta="right">Records</Table.Th><Table.Th ta="right">Network</Table.Th>
                  <Table.Th ta="right">In shard</Table.Th><Table.Th ta="right">Status gap</Table.Th>
                </Table.Tr>
              </Table.Thead>
              <Table.Tbody>
                {shards.map(s => (
                  <Table.Tr key={s.shardId}>
                    <Table.Td>
                      <Anchor component={Link} to={`/market-data/collection/shards/${encodeURIComponent(s.shardId)}`} size="xs" ff="monospace">
                        {s.shardId}
                      </Anchor>
                    </Table.Td>
                    <Table.Td ta="right">{s.records.toLocaleString()}</Table.Td>
                    <Table.Td ta="right">{number(s.networkPeakMs)} ms</Table.Td>
                    <Table.Td ta="right"><Text span size="xs" c={s.shardWaitPeakMs > 100 ? 'red' : undefined}>{number(s.shardWaitPeakMs)} ms</Text></Table.Td>
                    <Table.Td ta="right"><Text span size="xs" c={s.statusGapPeakMs > 2_000 ? 'orange' : undefined}>{number(s.statusGapPeakMs)} ms</Text></Table.Td>
                  </Table.Tr>
                ))}
              </Table.Tbody>
            </Table>
          )}
        </Card>
        <Card withBorder padding="sm">
          <Text size="sm" fw={600} mb={4}>Streams furthest behind their shard</Text>
          {behind.length === 0 ? <Text size="sm" c="dimmed">None fell behind in this window.</Text> : (
            <Table verticalSpacing={4} fz="xs">
              <Table.Thead>
                <Table.Tr><Table.Th>Stream</Table.Th><Table.Th ta="right">Most behind</Table.Th><Table.Th ta="right">Minutes</Table.Th></Table.Tr>
              </Table.Thead>
              <Table.Tbody>
                {behind.map(s => (
                  <Table.Tr key={s.streamId}>
                    <Table.Td><Text size="xs" truncate maw={320}>{s.name}</Text></Table.Td>
                    <Table.Td ta="right">{number(s.value / 1_024)} KB</Table.Td>
                    <Table.Td ta="right">{s.minutes}</Table.Td>
                  </Table.Tr>
                ))}
              </Table.Tbody>
            </Table>
          )}
        </Card>
      </SimpleGrid>
    </Stack>
  );
}

function OrdersSection({ samples, rangeMs, loading }: { samples: Sample[]; rangeMs: number; loading: boolean }) {
  const transport = useMemo(() => ofKind<CounterData>(samples, 'gateway.transport'), [samples]);
  const ingress = useMemo(() => blockSeries(transport, 'ingress', {
    orders: 'orders', cancels: 'cancels', amends: 'amends', unreadable: 'unreadable',
  }), [transport]);
  const egress = useMemo(() => blockSeries(transport, 'egress', {
    reports: 'reports', sent: 'reportsSent', backPressured: 'backPressured',
  }), [transport]);
  const refused = useMemo(() => blockTotals(transport, 'refused'), [transport]);
  const drops = useMemo(() => dropTotals(ofKind<DropsData>(samples, 'gateway.drops')), [samples]);
  return (
    <Stack gap="xs">
      <Title order={5}>Orders in and reports out</Title>
      <SimpleGrid cols={{ base: 1, md: 2 }}>
        <Chart title="From sessions per minute" points={ingress} rangeMs={rangeMs} loading={loading}
          lines={[{ key: 'orders' }, { key: 'cancels' }, { key: 'amends' }, { key: 'unreadable' }]} />
        <Chart title="To sessions per minute" points={egress} rangeMs={rangeMs} loading={loading}
          lines={[{ key: 'reports', label: 'reports taken' }, { key: 'sent', label: 'reports sent' }, { key: 'backPressured', label: 'session publication full' }]} />
      </SimpleGrid>
      <CountBadges label="Refused at ingress in this window:" counts={refused} color="orange" />
      <CountBadges label="Dropped in this window:" counts={drops} color="red" />
    </Stack>
  );
}

function LanesSection({ samples, rangeMs, loading }: { samples: Sample[]; rangeMs: number; loading: boolean }) {
  const lanes = useMemo(() => laneSeries(ofKind<LaneMinuteData>(samples, 'gateway.lanes')), [samples]);
  if (lanes.length === 0) return null;
  return (
    <Stack gap="xs">
      <Title order={5}>Venue accounts</Title>
      {lanes.map(lane => (
        <Stack key={lane.accountId} gap={4}>
          <Group gap="xs">
            <Text size="sm" fw={600}>{lane.name}</Text>
            <Text size="xs" c="dimmed">account {lane.accountId}</Text>
            {lane.latest.venueRefusals > 0 && <Badge size="xs" color="red" variant="light">429s last minute</Badge>}
          </Group>
          <SimpleGrid cols={{ base: 1, md: 3 }}>
            <Chart title="Sent per minute" points={lane.sends} rangeMs={rangeMs} loading={loading} height={160}
              lines={[{ key: 'orders', label: 'orders & amends' }, { key: 'cancels' }]} />
            <Chart title="p99 per minute" unit="ms" points={lane.waits} rangeMs={rangeMs} loading={loading} height={160}
              lines={[{ key: 'orderWait', label: 'order budget wait' }, { key: 'cancelWait', label: 'cancel budget wait' }, { key: 'orderAnswer', label: 'venue, orders' }, { key: 'cancelAnswer', label: 'venue, cancels' }]} />
            <Chart title="Held, refused, 429s, unanswered" points={lane.problems} rangeMs={rangeMs} loading={loading} height={160}
              lines={[{ key: 'held' }, { key: 'refused' }, { key: 'venueRefusals', label: '429s' }, { key: 'unanswered' }]} />
          </SimpleGrid>
        </Stack>
      ))}
    </Stack>
  );
}

/**
 * An order gateway's samples over 1h-7d: where a record's and an order's time goes, stage by stage; a paper gateway's
 * market data (its shards, its reader, its simulated lane); what came in from sessions and went back; each live
 * account's lane; and the process's runtime.
 */
export function GatewayPerformance({ gateway }: { gateway: GatewayStatus }) {
  const [range, setRange] = useState('1h');
  const rangeMs = RANGES[range];
  const span = () => windowBackFromNow(rangeMs);
  const subject = { subjectKind: 'gateway' as const, subjectId: gateway.gatewayKey };
  const everyMinute = everyMsFor(rangeMs, MINUTE_MS);
  const latency = useSamples({ ...subject, kindPrefix: 'latency.', everyMs: everyMinute }, range, span, true);
  const minutes = useSamples({ ...subject, kinds: MINUTE_KINDS, everyMs: everyMinute }, range, span, true);
  const runtime = useSamples({ ...subject, kind: 'runtime', everyMs: everyMsFor(rangeMs, RUNTIME_INTERVAL_MS) }, range, span, true);

  const latencySamples = useMemo(() => latency.data?.samples ?? [], [latency.data]);
  const minuteSamples = minutes.data?.samples ?? [];
  const runtimeSamples = runtime.data?.samples ?? [];
  const loading = latency.isLoading || minutes.isLoading || runtime.isLoading;
  const error = latency.error ?? minutes.error ?? runtime.error;
  const truncated = !!(latency.data?.truncated || minutes.data?.truncated || runtime.data?.truncated);
  const none = !loading && !error && latencySamples.length + minuteSamples.length + runtimeSamples.length === 0;
  const paper = gateway.mode === 'paper';
  const recordPath = useMemo(() => stageBreakdown(latencySamples, GATEWAY_MARKET_DATA_PATH), [latencySamples]);
  const orderPath = useMemo(() => stageBreakdown(latencySamples, ORDER_PATH), [latencySamples]);

  return (
    <Stack gap="md">
      <RangeControl range={range} onChange={setRange}
        switching={latency.isPlaceholderData || minutes.isPlaceholderData || runtime.isPlaceholderData} />
      {error && <Alert color="red" title="Couldn't read the gateway's samples">{(error as Error).message}</Alert>}
      {truncated && (
        <Alert color="yellow" title="Only part of this range was read">
          It holds more samples than one view reads, so its newest part is missing. Pick a shorter range.
        </Alert>
      )}
      {none ? (
        <Alert color="gray" title="No samples for this window">
          The gateway sent none in it. Gateways send samples from the orchestrator release that added them (posted every
          30 s), and they are kept for 7 days{gateway.endpoint ? ` (it runs orchestrator ${gateway.endpoint.version})` : ''}.
        </Alert>
      ) : (
        <>
          <SimpleGrid cols={{ base: 1, xl: paper ? 2 : 1 }}>
            {paper && (
              <PathTable title="A market-data record's path to the books" rows={recordPath} loading={latency.isLoading}
                totalMetric="paper.lag" />
            )}
            <PathTable title="An order's path through the gateway" rows={orderPath} loading={latency.isLoading} />
          </SimpleGrid>
          <LatencySection samples={latencySamples} rangeMs={rangeMs} loading={latency.isLoading} />
          {paper && <MarketDataSection samples={minuteSamples} rangeMs={rangeMs} loading={minutes.isLoading} />}
          <OrdersSection samples={minuteSamples} rangeMs={rangeMs} loading={minutes.isLoading} />
          <LanesSection samples={minuteSamples} rangeMs={rangeMs} loading={minutes.isLoading} />
          <RuntimeSection samples={ofKind<RuntimeData>(runtimeSamples, 'runtime')} rangeMs={rangeMs} loading={runtime.isLoading} />
        </>
      )}
    </Stack>
  );
}
