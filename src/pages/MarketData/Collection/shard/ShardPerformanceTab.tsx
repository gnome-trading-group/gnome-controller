import { useMemo, useState } from 'react';
import { Alert, Card, SimpleGrid, Stack, Table, Text, Title } from '@mantine/core';
import { useSamples } from '../../../../query/hooks';
import { CounterData, RuntimeData, Sample, ShardStreamsData } from '../../../../types/samples';
import { MINUTE_MS, Point, RUNTIME_INTERVAL_MS, everyMsFor, ofKind } from '../../../../utils/samples';
import {
  MARKET_DATA_PATH, blockSeries, shardStreamsSeries, stageBreakdown, worstStreams,
} from '../../../../utils/processSamples';
import { Chart, LatencySection, RangeControl, RuntimeSection } from '../../../../components/samples/SampleCharts';
import { RANGES, number, windowBackFromNow } from '../../../../components/samples/sampleFormat';
import { PathTable } from '../../../../components/samples/PathTable';

const MINUTE_KINDS = ['shard.streams', 'shard.agents'];
// What a shard itself measures of a record's path; the rest is measured by whoever reads it.
const SHARD_PATH = MARKET_DATA_PATH.filter(s => s.metric.startsWith('shard.'));

function WorstTable({ title, rows, unit, empty }: {
  title: string;
  rows: { streamId: number; name: string; value: number; minutes: number }[];
  unit: (value: number) => string;
  empty: string;
}) {
  return (
    <Card withBorder padding="sm">
      <Text size="sm" fw={600} mb={4}>{title}</Text>
      {rows.length === 0 ? <Text size="sm" c="dimmed">{empty}</Text> : (
        <Table verticalSpacing={4} fz="xs">
          <Table.Thead>
            <Table.Tr><Table.Th>Stream</Table.Th><Table.Th ta="right">Worst</Table.Th><Table.Th ta="right">Minutes named</Table.Th></Table.Tr>
          </Table.Thead>
          <Table.Tbody>
            {rows.map(r => (
              <Table.Tr key={r.streamId}>
                <Table.Td><Text size="xs" truncate maw={360}>{r.name}</Text></Table.Td>
                <Table.Td ta="right">{unit(r.value)}</Table.Td>
                <Table.Td ta="right">{r.minutes}</Table.Td>
              </Table.Tr>
            ))}
          </Table.Tbody>
        </Table>
      )}
    </Card>
  );
}

function StreamsSection({ samples, rangeMs, loading }: { samples: Sample[]; rangeMs: number; loading: boolean }) {
  const streams = useMemo(() => ofKind<ShardStreamsData>(samples, 'shard.streams'), [samples]);
  const agents = useMemo(() => ofKind<CounterData>(samples, 'shard.agents'), [samples]);
  const series = useMemo(() => shardStreamsSeries(streams), [streams]);
  const loops = useMemo(() => {
    const collector = blockSeries(agents, 'collector', { collector: 'passGapPeakNanos' });
    const publisher = blockSeries(agents, 'publisher', { publisher: 'passGapPeakNanos' });
    const byTime = new Map<number, Point>();
    for (const point of [...collector, ...publisher]) byTime.set(point.t, { ...byTime.get(point.t), ...point });
    return [...byTime.values()].sort((a, b) => a.t - b.t);
  }, [agents]);
  const worstWait = useMemo(
    () => worstStreams(streams.map(s => s.data.worstWait ?? []), r => r.waitPeakNanos / 1_000_000), [streams]);
  const worstHeld = useMemo(
    () => worstStreams(streams.map(s => s.data.worstHeld ?? []), r => r.heldAndLapped), [streams]);

  return (
    <Stack gap="xs">
      <Title order={5}>Streams</Title>
      <SimpleGrid cols={{ base: 1, md: 2 }}>
        <Chart title="Longest a record waited in the shard" unit="ms" points={series.wait} rangeMs={rangeMs} loading={loading}
          lines={[{ key: 'waitPeak', label: 'worst record' }]} />
        <Chart title="Sent to sessions per minute" points={series.publish} rangeMs={rangeMs} loading={loading}
          lines={[{ key: 'offered', label: 'sent' }, { key: 'held', label: 'held (publication full)' }, { key: 'lapped', label: 'lost (lapped)' }, { key: 'resent', label: 're-sent' }, { key: 'streamsHeld', label: 'streams held' }]} />
        <Chart title="Collected per minute" points={series.collect} rangeMs={rangeMs} loading={loading}
          lines={[{ key: 'records' }, { key: 'ringFullWaits', label: 'ring full (venue reader held)' }, { key: 'backlogPeak', label: 'collector backlog, worst' }]} />
        <Chart title="Longest pass of each loop" unit="ms" points={loops} rangeMs={rangeMs} loading={loading}
          lines={[{ key: 'collector' }, { key: 'publisher' }]} />
        <Chart title="Streams by state" points={series.states} rangeMs={rangeMs} loading={loading}
          lines={series.stateNames.map(key => ({ key, label: key.toLowerCase() }))} />
        <Chart title="Uploads" points={series.collect} rangeMs={rangeMs} loading={loading}
          lines={[{ key: 'uploadsQueued', label: 'queued' }, { key: 'uploadsFailed', label: 'failed' }]} />
      </SimpleGrid>
      <SimpleGrid cols={{ base: 1, lg: 2 }}>
        <WorstTable title="Streams whose records waited longest" rows={worstWait} unit={v => `${number(v)} ms`}
          empty="No stream sent records in this window." />
        <WorstTable title="Streams held back or lapped most in a minute" rows={worstHeld} unit={v => v.toLocaleString()}
          empty="No stream was held back in this window." />
      </SimpleGrid>
    </Stack>
  );
}

/**
 * A shard's samples over 1h-7d: how long records take from the venue and inside the shard, what it sent sessions and
 * what held it back, what it collected, its loops, its worst streams and its runtime.
 */
export function ShardPerformanceTab({ shardId }: { shardId: string }) {
  const [range, setRange] = useState('1h');
  const rangeMs = RANGES[range];
  const span = () => windowBackFromNow(rangeMs);
  const subject = { subjectKind: 'shard' as const, subjectId: shardId };
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
  const path = useMemo(() => stageBreakdown(latencySamples, SHARD_PATH), [latencySamples]);

  return (
    <Stack gap="md">
      <RangeControl range={range} onChange={setRange}
        switching={latency.isPlaceholderData || minutes.isPlaceholderData || runtime.isPlaceholderData} />
      {error && <Alert color="red" title="Couldn't read the shard's samples">{(error as Error).message}</Alert>}
      {truncated && (
        <Alert color="yellow" title="Only part of this range was read">
          It holds more samples than one view reads, so its newest part is missing. Pick a shorter range.
        </Alert>
      )}
      {none ? (
        <Alert color="gray" title="No samples for this window">
          The shard sent none in it. Shards send samples from the orchestrator release that added them (posted every 30 s),
          and they are kept for 7 days.
        </Alert>
      ) : (
        <>
          <PathTable title="A record's time before it leaves the shard" rows={path} loading={latency.isLoading} />
          <LatencySection samples={latencySamples} rangeMs={rangeMs} loading={latency.isLoading} />
          <StreamsSection samples={minuteSamples} rangeMs={rangeMs} loading={minutes.isLoading} />
          <RuntimeSection samples={ofKind<RuntimeData>(runtimeSamples, 'runtime')} rangeMs={rangeMs} loading={runtime.isLoading} />
        </>
      )}
    </Stack>
  );
}
