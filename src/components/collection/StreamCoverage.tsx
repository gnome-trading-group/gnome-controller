import { useMemo, useState } from 'react';
import { Alert, Badge, Code, Group, Paper, SegmentedControl, SimpleGrid, Stack, Table, Text, Title } from '@mantine/core';
import ReactTimeAgo from 'react-time-ago';
import { useStreamCoverage } from '../../query/hooks';
import { coverageSegments, nsToDate, segmentTime } from '../../utils/collection';
import { formatDuration } from '../../utils/format';
import { Kpi } from '../trading/layout';
import { CoverageTimeline } from './CoverageTimeline';

const RANGES = { '24h': 86_400_000, '7d': 7 * 86_400_000, '30d': 30 * 86_400_000 } as const;
type Range = keyof typeof RANGES;

// Over a range, what of one stream was covered, by which shard, and every gap with its reason.
export function StreamCoverage({ streamId, title = 'Coverage', action }: {
  streamId: number; title?: string; action?: React.ReactNode;
}) {
  const [range, setRange] = useState<Range>('24h');
  // A minute's resolution is plenty for the range, and keeps the query's key steady between renders.
  const nowMs = Math.floor(Date.now() / 60_000) * 60_000;
  const fromMs = nowMs - RANGES[range];
  const coverage = useStreamCoverage(streamId, fromMs, nowMs);

  const segments = useMemo(
    () => (coverage.data ? coverageSegments(coverage.data, fromMs, nowMs, Date.now()) : []),
    [coverage.data, fromMs, nowMs],
  );
  const covered = segmentTime(segments, 'covered');
  const missed = segmentTime(segments, 'gap') + segmentTime(segments, 'uncovered');
  const gaps = segments.filter(s => s.kind !== 'covered').reverse();
  const intervals = [...(coverage.data?.intervals ?? [])].sort((a, b) => b.fromNs - a.fromNs);

  return (
    <Stack gap="lg">
      <Group justify="space-between">
        <Title order={4}>{title}</Title>
        <Group gap="sm">
          {action}
          <SegmentedControl size="xs" value={range} onChange={(v) => setRange(v as Range)} data={Object.keys(RANGES)} />
        </Group>
      </Group>
      {coverage.error && <Alert color="red">{coverage.error.message}</Alert>}
      {coverage.data?.openGap && (
        <Alert color="orange">
          Uncovered since <ReactTimeAgo date={nsToDate(coverage.data.openGap.fromNs)!} timeStyle="round" />
          {coverage.data.openGap.reason && <> ({coverage.data.openGap.reason.toLowerCase()})</>}.
        </Alert>
      )}
      <SimpleGrid cols={{ base: 2, sm: 4 }}>
        <Kpi label="Covered" value={coverage.data ? `${(coverage.data.coveredFraction * 100).toFixed(1)}%` : '—'}
          hint="Of the range up to now, the share a shard collected this stream" />
        <Kpi label="Covered time" value={formatDuration(covered)} />
        <Kpi label="Missed" value={<Text span inherit c={missed > 0 ? 'orange' : undefined}>{formatDuration(missed)}</Text>}
          hint="Gaps while collection wanted the stream" />
        <Kpi label="Gaps" value={gaps.length} />
      </SimpleGrid>
      <Paper withBorder p="md">
        <CoverageTimeline segments={segments} fromMs={fromMs} toMs={nowMs} loading={coverage.isLoading} />
      </Paper>
      <SimpleGrid cols={{ base: 1, lg: 2 }}>
        <Paper withBorder p="md">
          <Title order={5} mb="sm">Gaps</Title>
          {gaps.length === 0
            ? <Text size="sm" c="dimmed">None in this range.</Text>
            : (
              <Table fz="sm" verticalSpacing={4}>
                <Table.Thead>
                  <Table.Tr><Table.Th>From</Table.Th><Table.Th>For</Table.Th><Table.Th>Why</Table.Th></Table.Tr>
                </Table.Thead>
                <Table.Tbody>
                  {gaps.map(g => (
                    <Table.Tr key={`${g.kind}-${g.startMs}`}>
                      <Table.Td>{new Date(g.startMs).toLocaleString()}</Table.Td>
                      <Table.Td>{formatDuration(g.endMs - g.startMs)}{g.kind === 'uncovered' && ' (ongoing)'}</Table.Td>
                      <Table.Td><Text size="sm" c={g.kind === 'uncovered' ? 'orange' : 'red'}>{g.label}</Text></Table.Td>
                    </Table.Tr>
                  ))}
                </Table.Tbody>
              </Table>
            )}
        </Paper>
        <Paper withBorder p="md">
          <Title order={5} mb="sm">Covered by</Title>
          {intervals.length === 0
            ? <Text size="sm" c="dimmed">Nothing collected in this range.</Text>
            : (
              <Table fz="sm" verticalSpacing={4}>
                <Table.Thead>
                  <Table.Tr><Table.Th>From</Table.Th><Table.Th>For</Table.Th><Table.Th>Shard</Table.Th><Table.Th>Ended</Table.Th></Table.Tr>
                </Table.Thead>
                <Table.Tbody>
                  {intervals.map(i => (
                    <Table.Tr key={`${i.fromNs}-${i.taskId}`}>
                      <Table.Td>{nsToDate(i.fromNs)!.toLocaleString()}</Table.Td>
                      <Table.Td>{formatDuration((i.open ? Date.now() : i.toNs / 1e6) - i.fromNs / 1e6)}</Table.Td>
                      <Table.Td>{i.shardId ? <Code>{i.shardId}</Code> : '—'}</Table.Td>
                      <Table.Td>
                        {i.open
                          ? <Badge size="xs" variant="light" color="teal">open</Badge>
                          : <Text size="sm" c="dimmed">{(i.closeReason ?? '').toLowerCase()}</Text>}
                      </Table.Td>
                    </Table.Tr>
                  ))}
                </Table.Tbody>
              </Table>
            )}
        </Paper>
      </SimpleGrid>
    </Stack>
  );
}
