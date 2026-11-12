import { useMemo } from 'react';
import { Badge, Text, Tooltip } from '@mantine/core';
import { MantineReactTable, MRT_ColumnDef, useMantineReactTable } from 'mantine-react-table';
import { Link } from 'react-router-dom';
import { RewardAccrual } from '../../types';
import { Money, Time } from './values';

// A paper session's estimates of what its resting orders earned from venue liquidity programs, one row per listing and
// program period: the gross so far, what the venue would pay once the period ended, and how the period's time divided.
// Estimates from the books and our quotes, not payouts.

const fraction = (part: string, a: RewardAccrual) => {
  const end = a.periodEnd && a.closed ? Date.parse(a.periodEnd) : Date.parse(a.asOf);
  const periodNanos = (end - Date.parse(a.periodStart)) * 1e6;
  return periodNanos > 0 ? Number(part) / periodNanos : null;
};

const percent = (value: number | null) => (value === null ? '—' : `${Math.round(value * 100)}%`);

export function RewardEstimates(
  { accruals, loading = false, showSession = false }: { accruals: RewardAccrual[]; loading?: boolean; showSession?: boolean },
) {
  const columns = useMemo<MRT_ColumnDef<RewardAccrual>[]>(() => [
    ...(showSession ? [{
      id: 'session', header: 'Session', size: 150,
      Cell: ({ row }: { row: { original: RewardAccrual } }) =>
        <Link to={`/sessions/${row.original.sessionId}`}>{row.original.sessionId}</Link>,
    }] : []),
    {
      id: 'market', header: 'Market', size: 190,
      Cell: ({ row }) => (
        <Link to={`/strategies/${row.original.strategyId}/listings/${row.original.listingId}`}>
          {row.original.venueMarket}
        </Link>
      ),
    },
    {
      id: 'program', header: 'Program', size: 110,
      Cell: ({ row }) => <Badge size="sm" variant="light">{row.original.exchangeCode} {row.original.program.toLowerCase()}</Badge>,
    },
    {
      id: 'period', header: 'Period', size: 230,
      Cell: ({ row }) => (
        <Text span size="sm">
          <Time value={row.original.periodStart} precision="minute" size="sm" /> –{' '}
          {row.original.periodEnd ? <Time value={row.original.periodEnd} precision="minute" size="sm" /> : 'open'}
        </Text>
      ),
    },
    {
      id: 'gross', header: 'Estimate', size: 110,
      mantineTableHeadCellProps: { align: 'right' }, mantineTableBodyCellProps: { align: 'right' },
      Cell: ({ row }) => <Money value={row.original.gross} size="sm" />,
    },
    {
      id: 'paid', header: 'Paid (est.)', size: 110,
      mantineTableHeadCellProps: { align: 'right' }, mantineTableBodyCellProps: { align: 'right' },
      Cell: ({ row }) => (row.original.closed
        ? (
          <Tooltip label="What the venue would pay the whole market for the period (Kalshi: whole cents, nothing under $1)" withArrow>
            <span><Money value={row.original.marketPaid} size="sm" /></span>
          </Tooltip>
        )
        : <Text span size="sm" c="dimmed">period running</Text>),
    },
    {
      id: 'counting', header: 'Counted', size: 90,
      Cell: ({ row }) => percent(fraction(row.original.countingNanos, row.original)),
    },
    {
      id: 'noData', header: 'No data', size: 90,
      Cell: ({ row }) => percent(fraction(row.original.noDataNanos, row.original)),
    },
    {
      id: 'gaps', header: 'Gaps', size: 70,
      Cell: ({ row }) => (row.original.gaps > 0 ? <Text span size="sm" c="orange">{row.original.gaps}</Text> : 0),
    },
    {
      id: 'asOf', header: 'As of', size: 140,
      Cell: ({ row }) => <Time value={row.original.asOf} precision="minute" size="sm" />,
    },
  ], [showSession]);
  const table = useMantineReactTable({
    columns,
    data: accruals,
    state: { isLoading: loading },
    enableTopToolbar: false,
    enableColumnActions: false,
    enableColumnFilters: false,
    enableSorting: false,
    initialState: { density: 'xs', pagination: { pageIndex: 0, pageSize: 25 } },
    mantineTableProps: { striped: true, highlightOnHover: true, withColumnBorders: true },
    renderEmptyRowsFallback: () => (
      <Text c="dimmed" size="sm" p="md">
        No estimates yet: a paper session posts them every few minutes, on markets whose venue runs a liquidity program.
      </Text>
    ),
  });
  return <MantineReactTable table={table} />;
}
