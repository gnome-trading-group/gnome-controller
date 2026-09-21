import { useState, useMemo } from 'react';
import { Anchor, Badge, Group, SegmentedControl, Text } from '@mantine/core';
import { MantineReactTable, useMantineReactTable, type MRT_ColumnDef, type MRT_Row } from 'mantine-react-table';
import { Link } from 'react-router-dom';
import ReactTimeAgo from 'react-time-ago';
import { PnlSnapshot } from '../types';
import { formatUnscaled, unscaleNotional, unscalePrice, unscaleSize } from '../utils/security-master';

const MODE_COLORS: Record<string, string> = {
  paper: 'violet',
  live: 'red',
};

function displayPrice(val: number, scaled: boolean): string {
  return scaled ? String(val) : formatUnscaled(unscalePrice(val));
}

function displaySize(val: number, scaled: boolean): string {
  return scaled ? String(val) : formatUnscaled(unscaleSize(val));
}

function displayNotional(val: number, scaled: boolean): string {
  return scaled ? String(val) : formatUnscaled(unscaleNotional(val));
}

interface PnlSnapshotTableProps {
  data: PnlSnapshot[];
  isLoading: boolean;
  showModeColumn?: boolean;
}

export function PnlSnapshotTable({ data, isLoading, showModeColumn = false }: PnlSnapshotTableProps) {
  const [scaled, setScaled] = useState(false);

  const columns = useMemo<MRT_ColumnDef<PnlSnapshot>[]>(() => {
    const cols: MRT_ColumnDef<PnlSnapshot>[] = [
      {
        accessorKey: 'listingId',
        header: 'Listing ID',
        enableSorting: true,
        size: 80,
        Cell: ({ row }: { row: MRT_Row<PnlSnapshot> }) => (
          <Anchor component={Link} to={`/security-master/listings/${row.original.listingId}`} size="sm">
            {row.original.listingId}
          </Anchor>
        ),
      },
    ];
    if (showModeColumn) {
      cols.push({
        accessorKey: 'mode',
        header: 'Mode',
        size: 80,
        Cell: ({ row }: { row: MRT_Row<PnlSnapshot> }) => row.original.mode
          ? <Badge color={MODE_COLORS[row.original.mode.toLowerCase()] ?? 'gray'} variant="light" size="xs">{row.original.mode}</Badge>
          : <Text size="xs" c="dimmed">—</Text>,
      });
    }
    cols.push(
      {
        accessorKey: 'netQuantity',
        header: 'Net Qty',
        enableSorting: true,
        size: 100,
        Cell: ({ row }: { row: MRT_Row<PnlSnapshot> }) => displaySize(row.original.netQuantity, scaled),
      },
      {
        accessorKey: 'avgEntryPrice',
        header: 'Avg Entry',
        enableSorting: true,
        size: 120,
        Cell: ({ row }: { row: MRT_Row<PnlSnapshot> }) => displayPrice(row.original.avgEntryPrice, scaled),
      },
      {
        accessorKey: 'realizedPnl',
        header: 'Realized PnL',
        enableSorting: true,
        size: 120,
        Cell: ({ row }: { row: MRT_Row<PnlSnapshot> }) => displayNotional(row.original.realizedPnl, scaled),
      },
      {
        accessorKey: 'totalFees',
        header: 'Fees',
        enableSorting: true,
        size: 90,
        Cell: ({ row }: { row: MRT_Row<PnlSnapshot> }) => displayPrice(row.original.totalFees, scaled),
      },
      {
        accessorKey: 'leavesBuyQty',
        header: 'Leaves Buy',
        enableSorting: true,
        size: 100,
        Cell: ({ row }: { row: MRT_Row<PnlSnapshot> }) => displaySize(row.original.leavesBuyQty, scaled),
      },
      {
        accessorKey: 'leavesSellQty',
        header: 'Leaves Sell',
        enableSorting: true,
        size: 100,
        Cell: ({ row }: { row: MRT_Row<PnlSnapshot> }) => displaySize(row.original.leavesSellQty, scaled),
      },
      {
        accessorKey: 'snapshotTime',
        header: 'Snapshot Time',
        enableSorting: true,
        size: 130,
        Cell: ({ row }: { row: MRT_Row<PnlSnapshot> }) =>
          row.original.snapshotTime
            ? <ReactTimeAgo date={new Date(row.original.snapshotTime)} timeStyle="round" />
            : '—',
      },
    );
    return cols;
  }, [scaled, showModeColumn]);

  const table = useMantineReactTable({
    columns,
    data,
    state: { isLoading },
    enableEditing: false,
    enableRowActions: false,
    enableColumnFilters: false,
    enableSorting: true,
    enablePagination: true,
    enableBottomToolbar: true,
    enableTopToolbar: false,
    defaultColumn: { minSize: 0 },
    initialState: { density: 'xs', pagination: { pageIndex: 0, pageSize: 15 }, sorting: [{ id: 'snapshotTime', desc: true }] },
    mantineTableProps: { striped: true, highlightOnHover: true, withColumnBorders: true },
  });

  return (
    <>
      <Group justify="flex-end" mb="xs">
        <SegmentedControl
          size="xs"
          value={scaled ? 'Scaled' : 'Unscaled'}
          onChange={(v) => setScaled(v === 'Scaled')}
          data={['Unscaled', 'Scaled']}
        />
      </Group>
      <MantineReactTable table={table} />
    </>
  );
}
