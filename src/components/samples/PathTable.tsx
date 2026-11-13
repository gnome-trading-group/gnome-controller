import { Card, Group, Progress, Skeleton, Table, Text, Tooltip } from '@mantine/core';
import { StageRow } from '../../utils/processSamples';
import { number } from './sampleFormat';

const LATE_US = 100_000;
const SLOW_US = 10_000;

function micros(us: number): string {
  if (us >= 1_000) return `${number(us / 1_000, 1)} ms`;
  return `${number(us, us < 10 ? 1 : 0)} µs`;
}

/**
 * A pipeline's stages in the order a record or order passes them, each at its newest minute: count, p50 and p99, and a
 * bar of p99 against the slowest stage's, so where the time goes reads at a glance. A row marked total spans the others.
 */
export function PathTable({ title, rows, loading, totalMetric }: {
  title: string;
  rows: StageRow[];
  loading: boolean;
  totalMetric?: string;
}) {
  const measured = rows.filter(r => r.n > 0);
  const slowest = Math.max(1, ...measured.filter(r => r.metric !== totalMetric).map(r => r.p99Us));
  return (
    <Card withBorder padding="sm">
      <Group justify="space-between" mb={4}>
        <Text size="sm" fw={600}>{title}</Text>
        <Text size="xs" c="dimmed">each stage&apos;s newest minute</Text>
      </Group>
      {loading && measured.length === 0 ? <Skeleton h={rows.length * 30} /> : (
        <Table verticalSpacing={4} fz="xs">
          <Table.Thead>
            <Table.Tr>
              <Table.Th>Stage</Table.Th>
              <Table.Th ta="right">Count</Table.Th>
              <Table.Th ta="right">p50</Table.Th>
              <Table.Th ta="right">p99</Table.Th>
              <Table.Th ta="right">Max</Table.Th>
              <Table.Th w="30%">p99, against the slowest stage</Table.Th>
            </Table.Tr>
          </Table.Thead>
          <Table.Tbody>
            {rows.map(r => {
              const total = r.metric === totalMetric;
              const color = r.p99Us >= LATE_US ? 'red' : r.p99Us >= SLOW_US ? 'orange' : 'teal';
              return (
                <Table.Tr key={r.metric} style={total ? { borderTop: '2px solid var(--mantine-color-default-border)' } : undefined}>
                  <Table.Td>
                    <Tooltip label={`${r.metric}: ${r.where}`} withArrow multiline w={300} openDelay={200}>
                      <Text size="xs" fw={total ? 700 : 500}>{r.label}</Text>
                    </Tooltip>
                  </Table.Td>
                  {r.n === 0 ? (
                    <Table.Td colSpan={5}><Text size="xs" c="dimmed">not measured in this window</Text></Table.Td>
                  ) : (
                    <>
                      <Table.Td ta="right">{r.n.toLocaleString()}</Table.Td>
                      <Table.Td ta="right">{micros(r.p50Us)}</Table.Td>
                      <Table.Td ta="right"><Text span size="xs" fw={600} c={color}>{micros(r.p99Us)}</Text></Table.Td>
                      <Table.Td ta="right">{micros(r.maxUs)}</Table.Td>
                      <Table.Td>
                        {!total && <Progress value={Math.min(100, (r.p99Us / slowest) * 100)} color={color} size="sm" />}
                      </Table.Td>
                    </>
                  )}
                </Table.Tr>
              );
            })}
          </Table.Tbody>
        </Table>
      )}
    </Card>
  );
}
