import { useMemo, useState } from 'react';
import { Anchor, Badge, Card, Group, SegmentedControl, SimpleGrid, Stack, Table, Text, Tooltip } from '@mantine/core';
import { Link } from 'react-router-dom';
import { useStrategies, useTransfers } from '../../query/hooks';
import { programLabel, rewardsBreakdown } from '../../utils/treasury';
import { Money } from '../../components/trading/values';

type Period = 'month' | '30d' | 'recent';

function since(period: Period, now: Date): string | undefined {
  if (period === 'month') return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1)).toISOString();
  if (period === '30d') return new Date(now.getTime() - 30 * 86_400_000).toISOString();
  return undefined;
}

function Breakdown({ title, rows }: { title: string; rows: { key: string; label: React.ReactNode; amount: bigint }[] }) {
  return (
    <Stack gap={2}>
      <Text size="xs" c="dimmed" fw={500}>{title}</Text>
      {rows.length === 0 ? <Text size="sm" c="dimmed">—</Text> : (
        <Table withRowBorders={false} verticalSpacing={1} fz="sm">
          <Table.Tbody>
            {rows.map((r) => (
              <Table.Tr key={r.key}>
                <Table.Td>{r.label}</Table.Td>
                <Table.Td ta="right"><Money value={r.amount} size="sm" /></Table.Td>
              </Table.Tr>
            ))}
          </Table.Tbody>
        </Table>
      )}
    </Stack>
  );
}

// What the venues paid outside trading (rewards, rebates, yield, interest, fee adjustments), as the venue poller booked
// it: by program, by venue, and by the strategy each part was given to, the rest the firm's.
export function RewardsPanel() {
  const [period, setPeriod] = useState<Period>('month');
  const filters = useMemo(() => ({ since: since(period, new Date()) }), [period]);
  const transfers = useTransfers(filters);
  const strategies = useStrategies();
  const b = useMemo(() => rewardsBreakdown(transfers.data ?? []), [transfers.data]);
  const sorted = <K,>(map: Map<K, bigint>) => [...map].sort(([, x], [, y]) => (y > x ? 1 : y < x ? -1 : 0));
  const name = (id: number) => strategies.data?.find((s) => s.strategyId === id)?.name ?? `strategy ${id}`;
  return (
    <Card withBorder mb="md" p="sm">
      <Group justify="space-between" mb="xs">
        <Group gap="sm">
          <Text fw={600}>Rewards &amp; non-trading income</Text>
          <Money value={b.total} />
          {b.pending > 0 && (
            <Tooltip label="Rewards waiting for the venue’s per-market breakdown before they go to strategies" withArrow>
              <Badge size="sm" color="yellow" variant="light">{b.pending} allocating</Badge>
            </Tooltip>
          )}
          {b.failed > 0 && (
            <Tooltip label="Rewards some or all of which no strategy of ours earned; that part stays the firm’s" withArrow>
              <Badge size="sm" color="gray" variant="light">{b.failed} left to the firm</Badge>
            </Tooltip>
          )}
        </Group>
        <SegmentedControl size="xs" value={period} onChange={(v) => setPeriod(v as Period)} data={[
          { value: 'month', label: 'This month' }, { value: '30d', label: '30 days' }, { value: 'recent', label: 'Last 500' },
        ]} />
      </Group>
      <SimpleGrid cols={{ base: 1, sm: 3 }}>
        <Breakdown title="By program" rows={sorted(b.byProgram).map(([k, v]) => ({ key: k, label: programLabel(k), amount: v }))} />
        <Breakdown title="By venue" rows={sorted(b.byExchange).map(([k, v]) => ({ key: k, label: k, amount: v }))} />
        <Breakdown title="By strategy" rows={sorted(b.byStrategy).map(([k, v]) => ({
          key: String(k),
          label: k === null ? <Text span size="sm" c="dimmed">Firm (no strategy)</Text> : <Anchor component={Link} size="sm" to={`/strategies/${k}`}>{name(k)}</Anchor>,
          amount: v,
        }))} />
      </SimpleGrid>
    </Card>
  );
}
