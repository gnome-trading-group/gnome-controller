import { useMemo, useState } from 'react';
import {
  Badge, Card, Group, SegmentedControl, Select, SimpleGrid, Skeleton, Stack, Table, Text, Title,
  Tooltip as HoverTip,
} from '@mantine/core';
import { IconInfoCircle } from '@tabler/icons-react';
import { CartesianGrid, Legend, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { RuntimeData, Sample } from '../../types/samples';
import { COLORS, RANGES, number, time } from './sampleFormat';
import {
  ALL, LatencyFilter, METRIC_DESCRIPTIONS, MINUTE_MS, Point, everyMsFor, latencyOptions, latencySeries, latestLatency,
  runtimeSeries, threadCpuSeries,
} from '../../utils/samples';

/** A metric's name, explained on hover where there's an explanation; plain text otherwise. */
function MetricName({ metric }: { metric: string }) {
  const description = METRIC_DESCRIPTIONS[metric];
  if (!description) {
    return <>{metric}</>;
  }
  return (
    <HoverTip label={description} withArrow multiline w={320} openDelay={200}>
      <Text span size="xs" style={{ cursor: 'help', textDecoration: 'underline dotted' }}>{metric}</Text>
    </HoverTip>
  );
}

// What every samples page (sessions, order gateways, shards) draws: line charts over a window, the latency picker and
// table, and a process's runtime.

export function Chart({ title, points, lines, unit, rangeMs, loading, height = 200 }: {
  title: string;
  points: Point[];
  lines: { key: string; label?: string }[];
  unit?: string;
  rangeMs: number;
  loading: boolean;
  height?: number;
}) {
  return (
    <Card withBorder padding="sm">
      <Text size="sm" fw={600} mb={4}>{title}{unit && <Text span size="xs" c="dimmed"> ({unit})</Text>}</Text>
      {loading && points.length === 0 ? <Skeleton h={height} /> : points.length === 0 ? (
        <Group h={height} justify="center"><Text size="sm" c="dimmed">Nothing in this window</Text></Group>
      ) : (
        <ResponsiveContainer width="100%" height={height}>
          <LineChart data={points} margin={{ top: 4, right: 8, bottom: 0, left: 0 }}>
            <CartesianGrid strokeDasharray="3 3" strokeOpacity={0.15} />
            <XAxis
              dataKey="t" type="number" scale="time" domain={['dataMin', 'dataMax']}
              tickFormatter={t => time(t, rangeMs)} fontSize={11}
            />
            <YAxis fontSize={11} width={56} tickFormatter={v => number(v)} />
            <Tooltip
              labelFormatter={t => new Date(t as number).toLocaleString()}
              formatter={(value, name) => [`${number(Number(value), 2)}${unit ? ` ${unit}` : ''}`, String(name)]}
            />
            {lines.length > 1 && <Legend wrapperStyle={{ fontSize: 11 }} />}
            {lines.map((line, i) => (
              <Line
                key={line.key} dataKey={line.key} name={line.label ?? line.key} stroke={COLORS[i % COLORS.length]}
                dot={false} strokeWidth={1.5} isAnimationActive={false} connectNulls={false}
              />
            ))}
          </LineChart>
        </ResponsiveContainer>
      )}
    </Card>
  );
}

export function LatencySection({ samples, rangeMs, loading }: { samples: Sample[]; rangeMs: number; loading: boolean }) {
  const metrics = useMemo(() => latencyOptions(samples, '').metrics, [samples]);
  const [chosen, setChosen] = useState<LatencyFilter>({ metric: '', exchange: ALL, action: ALL, kind: ALL });
  const metric = metrics.includes(chosen.metric) ? chosen.metric : (metrics[0] ?? '');
  const options = useMemo(() => latencyOptions(samples, metric), [samples, metric]);
  const filter = useMemo<LatencyFilter>(() => ({
    metric,
    exchange: options.exchanges.includes(chosen.exchange) ? chosen.exchange : ALL,
    action: options.actions.includes(chosen.action) ? chosen.action : ALL,
    kind: options.kinds.includes(chosen.kind) ? chosen.kind : ALL,
  }), [metric, options, chosen]);
  const points = useMemo(() => latencySeries(samples, filter), [samples, filter]);
  const latest = useMemo(() => latestLatency(samples), [samples]);
  const choice = (values: string[], label: string) => [{ value: ALL, label: `Every ${label}` }, ...values.map(v => ({ value: v, label: v }))];
  const several = filter.exchange === ALL || filter.action === ALL || filter.kind === ALL;

  return (
    <Stack gap="xs">
      <Title order={5}>Latency</Title>
      <Group gap="xs">
        <Select size="xs" w={200} data={metrics} value={metric || null} placeholder="Metric"
          onChange={v => setChosen(c => ({ ...c, metric: v ?? '' }))} allowDeselect={false} />
        {METRIC_DESCRIPTIONS[metric] && (
          <HoverTip label={METRIC_DESCRIPTIONS[metric]} withArrow multiline w={320} openDelay={200}>
            <IconInfoCircle size={16} color="var(--mantine-color-dimmed)" style={{ cursor: 'help' }}
              aria-label={`What ${metric} measures`} />
          </HoverTip>
        )}
        <Select size="xs" w={180} data={choice(options.exchanges, 'exchange')} value={filter.exchange}
          onChange={v => setChosen(c => ({ ...c, exchange: v ?? ALL }))} allowDeselect={false} />
        {options.actions.length > 0 && (
          <Select size="xs" w={150} data={choice(options.actions, 'action')} value={filter.action}
            onChange={v => setChosen(c => ({ ...c, action: v ?? ALL }))} allowDeselect={false} />
        )}
        {options.kinds.length > 0 && (
          <Select size="xs" w={170} data={choice(options.kinds, 'trigger')} value={filter.kind}
            onChange={v => setChosen(c => ({ ...c, kind: v ?? ALL }))} allowDeselect={false} />
        )}
      </Group>
      {several && (
        <Text size="xs" c="dimmed">
          Across several keys, p50 is an estimate (weighted by count) and p99 and max are the worst key's.
        </Text>
      )}
      <SimpleGrid cols={{ base: 1, md: 2 }}>
        <Chart title={metric || 'Latency'} unit="µs" points={points} rangeMs={rangeMs} loading={loading}
          lines={[{ key: 'p50' }, { key: 'p99' }, { key: 'max' }]} />
        <Chart title="Measured per minute" points={points} rangeMs={rangeMs} loading={loading} lines={[{ key: 'n', label: 'count' }]} />
      </SimpleGrid>
      {latest.length > 0 && (
        <Table striped withTableBorder verticalSpacing={4} fz="xs">
          <Table.Thead>
            <Table.Tr>
              <Table.Th>Metric</Table.Th><Table.Th>Exchange</Table.Th><Table.Th>Action</Table.Th><Table.Th>Trigger</Table.Th>
              <Table.Th ta="right">Count</Table.Th><Table.Th ta="right">p50 µs</Table.Th><Table.Th ta="right">p90 µs</Table.Th>
              <Table.Th ta="right">p99 µs</Table.Th><Table.Th ta="right">p99.9 µs</Table.Th><Table.Th ta="right">Max µs</Table.Th>
            </Table.Tr>
          </Table.Thead>
          <Table.Tbody>
            {latest.map(k => (
              <Table.Tr key={`${k.m}|${k.ex}|${k.act}|${k.kind}`}>
                <Table.Td><MetricName metric={k.m} /></Table.Td><Table.Td>{k.ex || '—'}</Table.Td><Table.Td>{k.act || '—'}</Table.Td>
                <Table.Td>{k.kind || '—'}</Table.Td><Table.Td ta="right">{k.n}</Table.Td>
                {[k.p50, k.p90, k.p99, k.p999, k.max].map((v, i) => <Table.Td key={i} ta="right">{number(v / 1_000)}</Table.Td>)}
              </Table.Tr>
            ))}
          </Table.Tbody>
        </Table>
      )}
    </Stack>
  );
}

export function RuntimeSection({ samples, rangeMs, loading }: { samples: Sample<RuntimeData>[]; rangeMs: number; loading: boolean }) {
  const series = useMemo(() => runtimeSeries(samples), [samples]);
  const threads = useMemo(() => threadCpuSeries(samples), [samples]);
  const clock = samples[samples.length - 1]?.data.clock;
  return (
    <Stack gap="xs">
      <Group justify="space-between">
        <Title order={5}>Runtime</Title>
        {clock && (
          <Text size="xs" c="dimmed">
            Clock {clock.source}{clock.errorBoundNanos >= 0 && `, ±${number(clock.errorBoundNanos / 1_000)} µs`}
          </Text>
        )}
      </Group>
      <SimpleGrid cols={{ base: 1, md: 2 }}>
        <Chart title="Host CPU" unit="%" points={series.cpu} rangeMs={rangeMs} loading={loading}
          lines={[{ key: 'busy' }, { key: 'steal' }]} />
        <Chart title="Memory" unit="MiB" points={series.memory} rangeMs={rangeMs} loading={loading}
          lines={[{ key: 'rss', label: 'process RSS' }, { key: 'heap', label: 'heap used' }, { key: 'direct' }, { key: 'available', label: 'host available' }]} />
        <Chart title="Agent threads' CPU" unit="% of a core" points={threads.points} rangeMs={rangeMs} loading={loading}
          lines={threads.names.map(key => ({ key }))} />
        <Chart title="GC" unit="ms per s" points={series.gc} rangeMs={rangeMs} loading={loading} lines={[{ key: 'msPerSecond', label: 'GC' }]} />
        <Chart title="Scheduling delay" unit="µs" points={series.scheduling} rangeMs={rangeMs} loading={loading}
          lines={[{ key: 'p99' }, { key: 'max' }]} />
        <Chart title="Network" points={series.network} rangeMs={rangeMs} loading={loading}
          lines={[{ key: 'rxKbPerSecond', label: 'in KB/s' }, { key: 'txKbPerSecond', label: 'out KB/s' }, { key: 'retransmits', label: 'TCP retransmits' }]} />
        {series.udp.length > 0 && (
          <Chart title="UDP" points={series.udp} rangeMs={rangeMs} loading={loading}
            lines={[{ key: 'inPerSecond', label: 'in /s' }, { key: 'outPerSecond', label: 'out /s' }, { key: 'rcvbufErrors', label: 'receive buffer drops' }, { key: 'sndbufErrors', label: 'send buffer drops' }]} />
        )}
        {series.aeron.length > 0 && (
          <Chart title="Aeron" points={series.aeron} rangeMs={rangeMs} loading={loading}
            lines={[{ key: 'naksSent', label: 'NAKs sent' }, { key: 'naksReceived', label: 'NAKs received' }, { key: 'lossGapFills', label: 'loss gap fills' }, { key: 'senderMaxCycleUs', label: 'sender max cycle µs' }]} />
        )}
      </SimpleGrid>
    </Stack>
  );
}


/**
 * The range picker every samples page shows; while a new range loads the old one stays on screen, so it says so, and
 * when the range is thinned it says how much.
 */
export function RangeControl({ range, onChange, switching = false }: {
  range: string;
  onChange: (range: string) => void;
  switching?: boolean;
}) {
  const thinnedMs = everyMsFor(RANGES[range], MINUTE_MS);
  return (
    <Group justify="space-between">
      <SegmentedControl size="xs" value={range} onChange={onChange} data={Object.keys(RANGES)} />
      {switching && <Badge variant="light" color="gray" size="sm">Loading {range}…</Badge>}
      {thinnedMs !== undefined && (
        <Text size="xs" c="dimmed">Thinned to one sample per kind every {Math.round(thinnedMs / MINUTE_MS)} min</Text>
      )}
    </Group>
  );
}

/** A table of named counts as badges, or nothing when there are none. */
export function CountBadges({ label, counts, color }: { label: string; counts: { name: string; count: number }[]; color: string }) {
  if (counts.length === 0) return null;
  return (
    <Group gap={6}>
      <Text size="xs" c="dimmed">{label}</Text>
      {counts.map(c => <Badge key={c.name} variant="light" color={color} size="sm">{c.name}: {c.count.toLocaleString()}</Badge>)}
    </Group>
  );
}
