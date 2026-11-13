import { useMemo } from 'react';
import { Anchor, Badge, Group, Stack, Table, Text, Tooltip } from '@mantine/core';
import { MantineReactTable, MRT_ColumnDef, useMantineReactTable } from 'mantine-react-table';
import { Link } from 'react-router-dom';
import { AllocationState, Transfer } from '../../types/treasury';
import { formatActor } from '../../utils/kill-switch';
import { programLabel } from '../../utils/treasury';
import { useStrategies } from '../../query/hooks';
import { Money, Time } from '../../components/trading/values';

const POLLER = 'venue-poller';

const ALLOCATION: Record<AllocationState, { color: string; label: string; hint: string }> = {
  PENDING: { color: 'yellow', label: 'allocating', hint: 'Waiting for the venue’s per-market breakdown to give it to the strategies that earned it' },
  DONE: { color: 'green', label: 'allocated', hint: 'Given to the strategies that earned it' },
  PARTIAL: { color: 'blue', label: 'partly', hint: 'Some of its markets had no strategy of ours; that part stays the firm’s' },
  FAILED: { color: 'gray', label: 'firm', hint: 'Couldn’t be given to a strategy, so it stays the firm’s' },
};

const BASIS: Record<string, string> = {
  ACCRUAL: 'by their estimates', RESTING_TIME: 'by resting size × time', MAKER_FILLS: 'by maker fills',
  TAKER_FEES: 'by taker fees',
};

const splitBy = (basis: string, strategies: number) =>
  (strategies === 1 ? 'the only strategy there' : `${BASIS[basis] ?? basis}, among ${strategies}`);

// Money moving into or out of an account other than by trading: what people recorded, and what the venue poller read
// from the venue (rewards, rebates, interest, deposits, withdrawals). A reward given to strategies opens to show who
// got what.
export function TransfersTable({ rows, loading, showAccount }: { rows: Transfer[]; loading: boolean; showAccount: boolean }) {
  const strategies = useStrategies();
  const strategyName = (id: number) => strategies.data?.find((s) => s.strategyId === id)?.name ?? `strategy ${id}`;
  const columns = useMemo<MRT_ColumnDef<Transfer>[]>(() => [
    { id: 'when', header: 'When', size: 150, Cell: ({ row }) => <Time value={row.original.occurredAt} precision="minute" size="sm" /> },
    ...(showAccount ? [{ id: 'account', header: 'Account', size: 150, Cell: ({ row }) => row.original.label } as MRT_ColumnDef<Transfer>] : []),
    {
      id: 'kind', header: 'Kind', size: 170,
      Cell: ({ row }) => (
        <Group gap={4} wrap="nowrap">
          <Badge size="sm" variant="light" color="gray">{row.original.kind}</Badge>
          {row.original.program && (
            <Badge size="sm" variant="light" color={row.original.program === 'UNCLASSIFIED' ? 'orange' : 'blue'}>
              {programLabel(row.original.program)}
            </Badge>
          )}
        </Group>
      ),
    },
    {
      id: 'amount', header: 'Amount', size: 110,
      mantineTableHeadCellProps: { align: 'right' }, mantineTableBodyCellProps: { align: 'right' },
      Cell: ({ row }) => <Money value={row.original.amount} size="sm" />,
    },
    {
      id: 'allocation', header: 'Strategies', size: 110,
      Cell: ({ row }) => {
        const state = row.original.allocationState;
        if (!state) return <Text span size="sm" c="dimmed">—</Text>;
        const a = ALLOCATION[state];
        return <Tooltip label={a.hint} withArrow multiline w={260}><Badge size="sm" variant="light" color={a.color}>{a.label}</Badge></Tooltip>;
      },
    },
    {
      id: 'market', header: 'Market', size: 150,
      Cell: ({ row }) => (row.original.venueMarket ? (
        <Text span size="sm" ff="monospace" truncate maw={150} display="inline-block">{row.original.venueMarket}</Text>
      ) : <Text span size="sm" c="dimmed">—</Text>),
    },
    {
      id: 'ref', header: 'Reference', size: 160,
      Cell: ({ row }) => (row.original.externalRef ? (
        <Tooltip label={row.original.externalRef} withArrow openDelay={300}>
          <Text span size="sm" ff="monospace" truncate maw={160} display="inline-block">{row.original.externalRef}</Text>
        </Tooltip>
      ) : <Text span size="sm" c="dimmed">—</Text>),
    },
    { id: 'reason', header: 'Reason', size: 220, Cell: ({ row }) => row.original.reason ?? '—' },
    {
      id: 'by', header: 'Recorded by', size: 150,
      Cell: ({ row }) => (
        <Tooltip label={<Time value={row.original.recordedAt} />} withArrow openDelay={300}>
          {row.original.actor === POLLER
            ? <Badge size="sm" variant="outline" color="gray">venue poller</Badge>
            : <Text span size="sm">{formatActor(row.original.actor)}</Text>}
        </Tooltip>
      ),
    },
  ], [showAccount]);
  const table = useMantineReactTable({
    columns,
    data: rows,
    state: { isLoading: loading },
    enableTopToolbar: false,
    enableColumnActions: false,
    enableColumnFilters: false,
    enableSorting: false,
    enableExpanding: false,
    initialState: { density: 'xs', pagination: { pageIndex: 0, pageSize: 15 } },
    mantineTableProps: { striped: true, highlightOnHover: true, withColumnBorders: true },
    renderDetailPanel: ({ row }) => (row.original.allocations.length === 0 && !row.original.unallocated ? null : (
      <Stack gap={4} py={4}>
        {row.original.allocations.length > 0 && <Text size="xs" c="dimmed">Given to the strategies that earned it</Text>}
        <Table withRowBorders={false} verticalSpacing={2} fz="sm" w="auto">
          <Table.Tbody>
            {row.original.allocations.map((a) => (
              <Table.Tr key={a.allocationId}>
                <Table.Td><Anchor component={Link} size="sm" to={`/strategies/${a.strategyId}`}>{strategyName(a.strategyId)}</Anchor></Table.Td>
                <Table.Td><Text span size="sm" ff="monospace">{a.venueMarket ?? 'account-wide'}</Text></Table.Td>
                <Table.Td><Text span size="sm" c="dimmed">{splitBy(a.basis, a.strategies)}</Text></Table.Td>
                <Table.Td ta="right"><Money value={a.amount} size="sm" /></Table.Td>
              </Table.Tr>
            ))}
            {(row.original.unallocated ?? []).map((u, i) => (
              <Table.Tr key={`firm-${i}`}>
                <Table.Td><Text span size="sm" c="dimmed">Firm</Text></Table.Td>
                <Table.Td><Text span size="sm" ff="monospace">{u.venueMarket ?? '—'}</Text></Table.Td>
                <Table.Td><Text span size="sm" c="dimmed">{u.reason}</Text></Table.Td>
                <Table.Td ta="right"><Money value={u.amount} size="sm" /></Table.Td>
              </Table.Tr>
            ))}
          </Table.Tbody>
        </Table>
      </Stack>
    )),
    renderEmptyRowsFallback: () => <Text c="dimmed" size="sm" p="md">No transfers recorded.</Text>,
  });
  return <MantineReactTable table={table} />;
}
