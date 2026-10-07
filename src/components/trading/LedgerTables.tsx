import { useMemo, useState } from 'react';
import { Anchor, Badge, Button, Group, Text, Tooltip } from '@mantine/core';
import { MantineReactTable, MRT_ColumnDef, MRT_RowData, useMantineReactTable } from 'mantine-react-table';
import { Link } from 'react-router-dom';
import { LedgerFill, LedgerOrder } from '../../types';
import { formatDuration } from '../../utils/format';
import { ListingLabel, Money, Price, Qty, SideLabel, Time } from './values';
import { OrderDrawer } from './OrderDrawer';

const SOURCE_COLORS: Record<string, string> = {
  VENUE: 'gray', RECOVERY: 'blue', RESET: 'red', ADJUSTMENT: 'orange', MANUAL: 'yellow', GAP: 'red',
};

const CLOSE_COLORS: Record<string, string> = {
  FILLED: 'teal', CANCELED: 'gray', REJECTED: 'red', EXPIRED: 'gray',
};

const right = { mantineTableHeadCellProps: { align: 'right' as const }, mantineTableBodyCellProps: { align: 'right' as const } };

function SessionLink({ sessionId }: { sessionId: string | null }) {
  if (!sessionId) return <Text span c="dimmed">—</Text>;
  return (
    <Tooltip label={sessionId} openDelay={400} withArrow>
      <Anchor component={Link} to={`/sessions/${sessionId}`} size="sm" ff="monospace" onClick={e => e.stopPropagation()}>
        {sessionId.slice(0, 8)}
      </Anchor>
    </Tooltip>
  );
}

interface PagedTableProps<T> {
  rows: T[];
  loading: boolean;
  hasMore: boolean;
  loadingMore: boolean;
  onLoadMore: () => void;
  // A strategy's lists name each row's session; a session's don't need to.
  showSession: boolean;
}

function useLedgerTable<T extends MRT_RowData>(
  columns: MRT_ColumnDef<T>[], props: PagedTableProps<T>, empty: string, rowKey: (row: T) => string,
  onRowClick?: (row: T) => void,
) {
  return useMantineReactTable({
    mantineTableBodyRowProps: ({ row }) => (onRowClick
      ? { onClick: () => onRowClick(row.original), style: { cursor: 'pointer' } }
      : {}),
    columns,
    data: props.rows,
    getRowId: rowKey,
    state: { isLoading: props.loading && props.rows.length === 0 },
    enableTopToolbar: false,
    enableColumnActions: false,
    enableColumnFilters: false,
    enableSorting: false,
    enablePagination: false,
    enableBottomToolbar: props.hasMore,
    renderBottomToolbar: () => (
      <Group justify="center" p="xs">
        <Button size="xs" variant="subtle" loading={props.loadingMore} onClick={props.onLoadMore}>Load older</Button>
      </Group>
    ),
    initialState: { density: 'xs' },
    mantineTableContainerProps: { style: { maxHeight: 560 } },
    enableStickyHeader: true,
    mantineTableProps: { striped: true, highlightOnHover: true, withColumnBorders: true },
    renderEmptyRowsFallback: () => <Text c="dimmed" size="sm" p="md">{empty}</Text>,
  });
}

export function FillsTable(props: PagedTableProps<LedgerFill>) {
  const columns = useMemo<MRT_ColumnDef<LedgerFill>[]>(() => {
    const cols: MRT_ColumnDef<LedgerFill>[] = [
      { id: 'time', header: 'Time', size: 190, Cell: ({ row }) => <Time value={row.original.recordedAt} precision="ms" size="sm" /> },
    ];
    if (props.showSession) {
      cols.push({ id: 'session', header: 'Session', size: 90, Cell: ({ row }) => <SessionLink sessionId={row.original.sessionId} /> });
    }
    cols.push(
      { id: 'listing', header: 'Listing', size: 130, Cell: ({ row }) => <ListingLabel listingId={row.original.listingId} symbol={row.original.symbol} /> },
      { id: 'side', header: 'Side', size: 60, Cell: ({ row }) => <SideLabel side={row.original.side} /> },
      { id: 'qty', header: 'Qty', size: 80, ...right, Cell: ({ row }) => <Qty value={row.original.fillQty} lotSize={row.original.lotSize} size="sm" /> },
      {
        id: 'price', header: 'Price', size: 80, ...right,
        Cell: ({ row }) => <Price value={row.original.fillPrice} exchangeId={row.original.exchangeId} tickSize={row.original.tickSize} size="sm" />,
      },
      { id: 'fee', header: 'Fee', size: 80, ...right, Cell: ({ row }) => <Money value={row.original.fee} pnl={false} size="sm" /> },
      {
        id: 'liquidity', header: 'M/T', size: 60,
        Cell: ({ row }) => row.original.liquidity
          ? <Badge size="xs" variant="light" color={row.original.liquidity === 'MAKER' ? 'teal' : 'orange'}>{row.original.liquidity === 'MAKER' ? 'maker' : 'taker'}</Badge>
          : <Text span c="dimmed">—</Text>,
      },
      {
        id: 'mark', header: 'Mark then', size: 85, ...right,
        Cell: ({ row }) => <Price value={row.original.markPrice} exchangeId={row.original.exchangeId} tickSize={row.original.tickSize} derived size="sm" />,
      },
      {
        id: 'slippage', header: 'vs mark', size: 85, ...right,
        Cell: ({ row }) => (
          <Tooltip label="Positive when the fill beat the mark: bought below it or sold above it" openDelay={400} withArrow multiline w={220}>
            <span><Money value={row.original.slippage} size="sm" /></span>
          </Tooltip>
        ),
      },
      {
        id: 'source', header: 'Source', size: 100,
        Cell: ({ row }) => {
          const f = row.original;
          const badge = <Badge size="xs" variant={f.source === 'VENUE' ? 'outline' : 'filled'} color={SOURCE_COLORS[f.source]}>{f.source.toLowerCase()}</Badge>;
          return f.reason || f.actor
            ? <Tooltip label={[f.actor, f.reason].filter(Boolean).join(': ')} withArrow multiline w={260}><span>{badge}</span></Tooltip>
            : badge;
        },
      },
      { id: 'order', header: 'Order', size: 70, ...right, Cell: ({ row }) => <Text span size="sm" c="dimmed" ff="monospace">{row.original.clientOidCounter ?? '—'}</Text> },
    );
    return cols;
  }, [props.showSession]);
  const table = useLedgerTable(columns, props, 'No fills yet.', row => row.fillId);
  return <MantineReactTable table={table} />;
}

function OrderStatus({ order }: { order: LedgerOrder }) {
  if (order.status === 'OPEN') return <Badge size="xs" color="blue" variant="light">open</Badge>;
  if (order.status === 'RECOVERED') {
    return (
      <Tooltip label="Left resting by an ended session and settled by a later one at startup" withArrow multiline w={240}>
        <Badge size="xs" color="blue" variant="outline">recovered</Badge>
      </Tooltip>
    );
  }
  const state = order.closeState ?? 'CLOSED';
  const badge = <Badge size="xs" color={CLOSE_COLORS[state] ?? 'gray'} variant="light">{state.toLowerCase()}</Badge>;
  return order.rejectReason
    ? <Tooltip label={order.rejectReason} withArrow><span>{badge}</span></Tooltip>
    : badge;
}

export function OrdersTable(props: PagedTableProps<LedgerOrder>) {
  const columns = useMemo<MRT_ColumnDef<LedgerOrder>[]>(() => {
    const cols: MRT_ColumnDef<LedgerOrder>[] = [
      { id: 'opened', header: 'Opened', size: 190, Cell: ({ row }) => <Time value={row.original.openedAt} precision="ms" size="sm" /> },
    ];
    if (props.showSession) {
      cols.push({ id: 'session', header: 'Session', size: 90, Cell: ({ row }) => <SessionLink sessionId={row.original.sessionId} /> });
    }
    cols.push(
      { id: 'listing', header: 'Listing', size: 130, Cell: ({ row }) => <ListingLabel listingId={row.original.listingId} symbol={row.original.symbol} /> },
      { id: 'side', header: 'Side', size: 60, Cell: ({ row }) => <SideLabel side={row.original.side} /> },
      {
        id: 'price', header: 'Price', size: 80, ...right,
        Cell: ({ row }) => row.original.price === null
          ? <Text span size="sm" c="dimmed">market</Text>
          : <Price value={row.original.price} exchangeId={row.original.exchangeId} tickSize={row.original.tickSize} size="sm" />,
      },
      {
        id: 'filled', header: 'Filled / size', size: 110, ...right,
        Cell: ({ row }) => (
          <Text span size="sm" style={{ whiteSpace: 'nowrap' }}>
            <Qty value={row.original.fillQty} lotSize={row.original.lotSize} size="sm" /> / <Qty value={row.original.size} lotSize={row.original.lotSize} size="sm" />
          </Text>
        ),
      },
      {
        id: 'avg', header: 'Avg fill', size: 85, ...right,
        Cell: ({ row }) => <Price value={row.original.avgFillPrice} exchangeId={row.original.exchangeId} tickSize={row.original.tickSize} derived size="sm" />,
      },
      { id: 'fees', header: 'Fees', size: 80, ...right, Cell: ({ row }) => <Money value={row.original.fees} pnl={false} size="sm" /> },
      { id: 'status', header: 'Status', size: 95, Cell: ({ row }) => <OrderStatus order={row.original} /> },
      {
        id: 'ack', header: 'Ack', size: 70, ...right,
        Cell: ({ row }) => {
          const { openedAt, ackedAt } = row.original;
          if (!openedAt || !ackedAt) return <Text span c="dimmed">—</Text>;
          const ms = Date.parse(ackedAt) - Date.parse(openedAt);
          return <Text span size="sm">{ms < 1000 ? `${ms}ms` : formatDuration(ms)}</Text>;
        },
      },
      {
        id: 'venueId', header: 'Venue id', size: 110,
        Cell: ({ row }) => row.original.exchangeOrderId
          ? <Tooltip label={row.original.exchangeOrderId} withArrow><Text span size="xs" ff="monospace">{row.original.exchangeOrderId.slice(0, 12)}…</Text></Tooltip>
          : <Text span c="dimmed">—</Text>,
      },
    );
    return cols;
  }, [props.showSession]);
  const [selected, setSelected] = useState<LedgerOrder | null>(null);
  const table = useLedgerTable(columns, props, 'No orders yet.', row => row.orderSeq, setSelected);
  // Follows the row as the list refreshes, so an open order's drawer shows its fills as they arrive.
  const current = selected ? props.rows.find(r => r.orderSeq === selected.orderSeq) ?? selected : null;
  return (
    <>
      <MantineReactTable table={table} />
      <OrderDrawer order={current} onClose={() => setSelected(null)} />
    </>
  );
}
