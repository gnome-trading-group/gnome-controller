import { useState, useMemo } from 'react';
import { Anchor, Badge, Group, SegmentedControl, Text, Title, Tooltip } from '@mantine/core';
import { MantineReactTable, useMantineReactTable, type MRT_ColumnDef, type MRT_Row } from 'mantine-react-table';
import { Link } from 'react-router-dom';
import ReactTimeAgo from 'react-time-ago';
import { PnlSnapshot } from '../types';
import { formatUnscaled, unscalePrice, unscaleSize } from '../utils/security-master';
import { useListingDetails } from '../hooks/useAsyncSearch';

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

interface PnlSnapshotTableProps {
  data: PnlSnapshot[];
  isLoading: boolean;
  showModeColumn?: boolean;
  title?: string;
  extraControls?: React.ReactNode;
}

export function PnlSnapshotTable({ data, isLoading, showModeColumn = false, title, extraControls }: PnlSnapshotTableProps) {
  const [scaled, setScaled] = useState(false);
  const [showSymbols, setShowSymbols] = useState(false);
  const listingIds = useMemo(() => [...new Set(data.map((row) => row.listingId))], [data]);
  // Fetched only once symbols are asked for, so the default ID view costs no extra requests.
  const listings = useListingDetails(showSymbols ? listingIds : []);

  const columns = useMemo<MRT_ColumnDef<PnlSnapshot>[]>(() => {
    const cols: MRT_ColumnDef<PnlSnapshot>[] = [
      {
        accessorKey: 'listingId',
        header: showSymbols ? 'Listing' : 'Listing ID',
        enableSorting: true,
        size: showSymbols ? 160 : 80,
        Cell: ({ row }: { row: MRT_Row<PnlSnapshot> }) => {
          const { listingId } = row.original;
          const listing = showSymbols ? listings[listingId] : undefined;
          const link = (
            <Anchor component={Link} to={`/security-master/listings/${listingId}`} size="sm">
              {listing?.exchangeSecuritySymbol ?? listingId}
            </Anchor>
          );
          return listing
            ? <Tooltip label={`Listing ${listingId} · ${listing.exchangeName}`} withArrow openDelay={300}>{link}</Tooltip>
            : link;
        },
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
      // Position
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
        accessorKey: 'markPrice',
        header: 'Mark Price',
        enableSorting: true,
        size: 120,
        Cell: ({ row }: { row: MRT_Row<PnlSnapshot> }) => displayPrice(row.original.markPrice, scaled),
      },
      // Pending orders
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
      // P&L
      {
        accessorKey: 'unrealizedPnl',
        header: 'Unrealized PnL',
        enableSorting: true,
        size: 130,
        Cell: ({ row }: { row: MRT_Row<PnlSnapshot> }) => displayPrice(row.original.unrealizedPnl, scaled),
      },
      {
        accessorKey: 'realizedPnl',
        header: 'Realized PnL',
        enableSorting: true,
        size: 120,
        Cell: ({ row }: { row: MRT_Row<PnlSnapshot> }) => displayPrice(row.original.realizedPnl, scaled),
      },
      {
        accessorKey: 'totalFees',
        header: 'Fees',
        enableSorting: true,
        size: 90,
        Cell: ({ row }: { row: MRT_Row<PnlSnapshot> }) => displayPrice(row.original.totalFees, scaled),
      },
      {
        accessorKey: 'totalPnl',
        header: 'Total PnL',
        enableSorting: true,
        size: 120,
        Cell: ({ row }: { row: MRT_Row<PnlSnapshot> }) => displayPrice(row.original.totalPnl, scaled),
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
  }, [scaled, showModeColumn, showSymbols, listings]);

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
    initialState: { density: 'xs', pagination: { pageIndex: 0, pageSize: 15 }, sorting: [{ id: 'snapshotTime', desc: true }], columnVisibility: { leavesBuyQty: false, leavesSellQty: false } },
    mantineTableProps: { striped: true, highlightOnHover: true, withColumnBorders: true },
  });

  return (
    <>
      <Group justify="space-between" mb="xs">
        {title && <Title order={4}>{title}</Title>}
        <Group gap="sm">
          {extraControls}
          <SegmentedControl
            size="xs"
            value={showSymbols ? 'Symbol' : 'ID'}
            onChange={(v) => setShowSymbols(v === 'Symbol')}
            data={['ID', 'Symbol']}
          />
          <SegmentedControl
            size="xs"
            value={scaled ? 'Scaled' : 'Unscaled'}
            onChange={(v) => setScaled(v === 'Scaled')}
            data={['Unscaled', 'Scaled']}
          />
        </Group>
      </Group>
      <MantineReactTable table={table} />
    </>
  );
}
