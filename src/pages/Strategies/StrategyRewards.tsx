import { useMemo } from 'react';
import { Anchor, Badge, Text } from '@mantine/core';
import { MantineReactTable, MRT_ColumnDef, useMantineReactTable } from 'mantine-react-table';
import { Link } from 'react-router-dom';
import { useRewardAccruals, useTransfers } from '../../query/hooks';
import { Mode } from '../../types';
import { programLabel } from '../../utils/treasury';
import { Money, Time } from '../../components/trading/values';
import { RewardEstimates } from '../../components/trading/RewardEstimates';

interface RewardRow {
  key: string;
  occurredAt: string;
  account: string;
  exchangeCode: string;
  program: string;
  venueMarket: string | null;
  listingId: number | null;
  basis: string;
  strategies: number;
  share: string;
  paid: string;
}

const BASIS: Record<string, string> = {
  ACCRUAL: 'estimates', RESTING_TIME: 'resting size × time', MAKER_FILLS: 'maker fills', TAKER_FEES: 'taker fees',
};

// The venue rewards this strategy was given: each payout's part it earned, and how that part was worked out. Venue
// accounts are live, so in paper it shows the sessions' own estimates instead.
export function StrategyRewards({ strategyId, mode }: { strategyId: number; mode: Mode }) {
  return mode === 'live'
    ? <LiveRewards strategyId={strategyId} mode={mode} />
    : <PaperRewardEstimates strategyId={strategyId} />;
}

function PaperRewardEstimates({ strategyId }: { strategyId: number }) {
  const accruals = useRewardAccruals({ strategyId, mode: 'paper' });
  return <RewardEstimates accruals={accruals.data ?? []} loading={accruals.isLoading} showSession />;
}

function LiveRewards({ strategyId, mode }: { strategyId: number; mode: Mode }) {
  const transfers = useTransfers({ strategyId }, mode === 'live');
  const rows = useMemo<RewardRow[]>(() => (transfers.data ?? []).flatMap((t) => t.allocations
    .filter((a) => a.strategyId === strategyId)
    .map((a) => ({
      key: `${t.transferId}/${a.allocationId}`, occurredAt: t.occurredAt, account: t.label, exchangeCode: t.exchangeCode,
      program: t.program ?? t.kind, venueMarket: a.venueMarket, listingId: a.listingId, basis: a.basis, strategies: a.strategies, share: a.amount,
      paid: t.amount,
    }))), [transfers.data, strategyId]);
  const columns = useMemo<MRT_ColumnDef<RewardRow>[]>(() => [
    { id: 'when', header: 'Paid', size: 150, Cell: ({ row }) => <Time value={row.original.occurredAt} precision="minute" size="sm" /> },
    { id: 'venue', header: 'Account', size: 170, Cell: ({ row }) => `${row.original.account} (${row.original.exchangeCode})` },
    { id: 'program', header: 'Program', size: 140, Cell: ({ row }) => <Badge size="sm" variant="light">{programLabel(row.original.program)}</Badge> },
    {
      id: 'market', header: 'Market', size: 180,
      Cell: ({ row }) => (row.original.listingId !== null
        ? <Anchor component={Link} size="sm" to={`/strategies/${strategyId}/listings/${row.original.listingId}`}>{row.original.venueMarket ?? row.original.listingId}</Anchor>
        : <Text span size="sm" c="dimmed">{row.original.venueMarket ?? 'account-wide'}</Text>),
    },
    {
      id: 'basis', header: 'Split by', size: 170,
      Cell: ({ row }) => (row.original.strategies === 1 ? 'only strategy there'
        : `${BASIS[row.original.basis] ?? row.original.basis}, among ${row.original.strategies}`),
    },
    {
      id: 'share', header: 'Earned', size: 110,
      mantineTableHeadCellProps: { align: 'right' }, mantineTableBodyCellProps: { align: 'right' },
      Cell: ({ row }) => <Money value={row.original.share} size="sm" />,
    },
    {
      id: 'paid', header: 'Of payout', size: 110,
      mantineTableHeadCellProps: { align: 'right' }, mantineTableBodyCellProps: { align: 'right' },
      Cell: ({ row }) => <Money value={row.original.paid} size="sm" pnl={false} />,
    },
  ], [strategyId]);
  const table = useMantineReactTable({
    columns,
    data: rows,
    state: { isLoading: transfers.isLoading && mode === 'live' },
    enableTopToolbar: false,
    enableColumnActions: false,
    enableColumnFilters: false,
    enableSorting: false,
    initialState: { density: 'xs', pagination: { pageIndex: 0, pageSize: 25 } },
    mantineTableProps: { striped: true, highlightOnHover: true, withColumnBorders: true },
    renderEmptyRowsFallback: () => (
      <Text c="dimmed" size="sm" p="md">
        {mode === 'live' ? 'No venue rewards given to this strategy yet.' : 'Venue rewards are paid to live accounts only.'}
      </Text>
    ),
  });
  return <MantineReactTable table={table} />;
}
