import { useMemo, useState } from 'react';
import { ActionIcon, Anchor, Badge, Button, Group, SegmentedControl, Text, Tooltip } from '@mantine/core';
import { IconAdjustments, IconAlertTriangle, IconRefresh } from '@tabler/icons-react';
import { MantineReactTable, MRT_ColumnDef, useMantineReactTable } from 'mantine-react-table';
import { Link, useNavigate } from 'react-router-dom';
import { navigateRowProps } from '../../utils/navigation';
import { AfterSession, Mode, SessionListingPnl, StrategyListingPnl } from '../../types';
import { formatDuration, formatMoney, isPredictionMarket } from '../../utils/format';
import { ListingLabel, Money, Price, Qty } from './values';
import { useCents } from '../../hooks/useCents';
import { useGlobalState } from '../../context/GlobalStateContext';
import { capital, exposure } from '../../utils/exposure';
import { useFlatPositions } from '../../query/hooks';

type Row = SessionListingPnl | StrategyListingPnl;

// Past this many rows only the ones on screen are rendered.
const VIRTUALIZE_ROWS = 100;

const DOLLAR = 1_000_000_000n;
const UNIT = 1_000_000n;

// A binary contract pays $1 or nothing, so a position's outcome is bounded: a long can lose what it paid and win
// the rest of $1 a contract; a short (which received its cost) the reverse.
function outcomes(row: Row): { worst: bigint; best: bigint } | null {
  const net = BigInt(row.netQuantity);
  if (net === 0n) return null;
  const quantity = net < 0n ? -net : net;
  const cost = (BigInt(row.avgEntryPrice) * quantity) / UNIT;
  const payout = (quantity * DOLLAR) / UNIT;
  return net > 0n ? { worst: -cost, best: payout - cost } : { worst: cost - payout, best: cost };
}

function isSessionRow(row: Row): row is SessionListingPnl {
  return 'carry' in row;
}

function MarkCell({ row }: { row: Row }) {
  const age = row.markTime ? Date.now() - Date.parse(row.markTime) : null;
  return (
    <Tooltip
      withArrow
      openDelay={300}
      label={row.markTime ? `Bid ${row.bid ?? '—'} · ask ${row.ask ?? '—'} · updated ${formatDuration(age)} ago` : 'No price recorded yet'}
    >
      <span><Price value={row.markPrice} exchangeId={row.exchangeId} tickSize={row.tickSize} derived /></span>
    </Tooltip>
  );
}

function Outcomes({ row }: { row: Row }) {
  const cents = useCents(row.exchangeId);
  const range = cents ? outcomes(row) : null;
  if (!range) return <Text span c="dimmed">—</Text>;
  return (
    <Text span size="sm" style={{ whiteSpace: 'nowrap' }}>
      <Money value={range.worst} size="sm" /> <Text span c="dimmed">to</Text> <Money value={range.best} size="sm" />
    </Text>
  );
}

function CostCell({ row, part }: { row: Row; part: 'cost' | 'notional' }) {
  const held = exposure(row.netQuantity, row.avgEntryPrice, row.markPrice);
  const value = held ? held[part] : null;
  if (value === null) return <Text span c="dimmed">—</Text>;
  return <Money value={value} pnl={false} size="sm" />;
}

function CapitalCell({ row }: { row: Row }) {
  const binary = useCents(row.exchangeId);
  const value = capital(row.netQuantity, row.avgEntryPrice, row.fees, binary);
  if (value === null) return <Text span c="dimmed">—</Text>;
  return <Money value={value} pnl={false} size="sm" />;
}

// Over the open positions, whatever the filter shows: what's in the market right now.
function ExposureTotals({ rows }: { rows: Row[] }) {
  const { exchanges } = useGlobalState();
  const totals = useMemo(() => {
    let cost = 0n, notional = 0n, tied = 0n, unrealized = 0n, unpriced = 0;
    for (const row of rows) {
      const held = exposure(row.netQuantity, row.avgEntryPrice, row.markPrice);
      if (!held) continue;
      const binary = isPredictionMarket(exchanges.find(e => e.exchangeId === row.exchangeId)?.exchangeCode);
      cost += held.cost;
      if (held.notional === null) unpriced += 1;
      else notional += held.notional;
      tied += capital(row.netQuantity, row.avgEntryPrice, row.fees, binary) ?? 0n;
      unrealized += BigInt(row.unrealized);
    }
    return { cost, notional, tied, unrealized, unpriced };
  }, [rows, exchanges]);
  return (
    <Group gap="md" wrap="nowrap">
      <Text size="sm" component="div">Cost <Money value={totals.cost} pnl={false} size="sm" fw={600} /></Text>
      <Tooltip label={`${totals.unpriced} position(s) have no price yet and aren't in it`} disabled={totals.unpriced === 0} withArrow>
        <Text size="sm" component="div" c={totals.unpriced ? 'orange' : undefined}>
          Notional <Money value={totals.notional} pnl={false} size="sm" fw={600} />
        </Text>
      </Tooltip>
      <Text size="sm" component="div">Capital <Money value={totals.tied} pnl={false} size="sm" fw={600} /></Text>
      <Text size="sm" component="div">Unrealized <Money value={totals.unrealized} size="sm" fw={600} /></Text>
    </Group>
  );
}

const AFTER_SESSION_LABELS: Record<AfterSession['kind'], string> = {
  SETTLED: 'settled at',
  CLOSED_MANUALLY: 'closed by hand at',
  ADJUSTED: 'adjusted',
  RESET: 'written off by',
  INHERITED: 'held by',
  AWAITING_SETTLEMENT: 'awaiting settlement',
  OPEN: 'still open',
};

// What became of a position after the session stopped holding it. The session's PnL stays as it was when it stopped;
// what happened later counts in the strategy's PnL outside sessions.
function AfterSessionCell({ row }: { row: SessionListingPnl }) {
  const after = row.afterSession;
  if (!after) return <Text span c="dimmed">—</Text>;
  const label = AFTER_SESSION_LABELS[after.kind];
  const sessionLink = after.sessionId && (
    <Anchor component={Link} to={`/sessions/${after.sessionId}`} size="sm" onClick={e => e.stopPropagation()}>
      {after.kind === 'RESET' ? 'a flat start' : 'the next session'}
    </Anchor>
  );
  const price = after.settlementPrice ?? after.price;
  return (
    <Tooltip
      withArrow multiline w={280} openDelay={300}
      label="Not part of this session's PnL: anything booked after it stopped counts in the strategy's PnL outside sessions."
    >
      <Text span size="sm" c="dimmed" style={{ whiteSpace: 'nowrap' }}>
        {after.kind === 'AWAITING_SETTLEMENT' && price !== null ? 'settled at' : label}{' '}
        {sessionLink}
        {price !== null && (after.kind === 'SETTLED' || after.kind === 'CLOSED_MANUALLY' || after.kind === 'AWAITING_SETTLEMENT') && (
          <Price value={price} exchangeId={row.exchangeId} tickSize={row.tickSize} size="sm" />
        )}
        {after.kind === 'AWAITING_SETTLEMENT' && price !== null && ', not booked yet'}
        {after.impact !== null && <> · <Money value={after.impact} size="sm" /></>}
      </Text>
    </Tooltip>
  );
}

interface PositionsTableProps {
  rows: Row[];
  loading: boolean;
  onAdjust?: (row: StrategyListingPnl) => void;
  // Where clicking a row goes: the listing's position page.
  rowHref?: (row: Row) => string;
  // A strategy's rows are the ones active today; its flat history, which may run to thousands, loads page by page.
  history?: { strategyId: number; mode: Mode; tz: string; count: number };
}

export function PositionsTable({ rows, loading, onAdjust, rowHref, history }: PositionsTableProps) {
  const navigate = useNavigate();
  const [filter, setFilter] = useState<'all' | 'open' | 'flat'>(history ? 'open' : 'all');
  const flatHistory = useFlatPositions(history ?? null, filter === 'flat');
  const paged = !!history && filter === 'flat';
  const session = rows.length > 0 && isSessionRow(rows[0]);
  const ended = session && rows.some(r => isSessionRow(r) && r.afterSession !== null);
  // A strategy's live rows are one per listing and venue account; paper ones belong to no account.
  const byAccount = [...rows, ...(flatHistory.data ?? [])].some(r => !isSessionRow(r) && r.accountLabel !== null);
  const isOpen = (r: Row) => BigInt(r.netQuantity) !== 0n || r.needsReview;
  // Open positions first, so showing flat ones too doesn't bury them.
  const shown = useMemo(() => {
    if (paged) return flatHistory.data ?? [];
    const open = rows.filter(isOpen);
    const flat = rows.filter(r => !isOpen(r));
    if (history) return [...open, ...flat];
    return filter === 'open' ? open : filter === 'flat' ? flat : [...open, ...flat];
  }, [rows, filter, history, paged, flatHistory.data]);
  const openCount = rows.filter(isOpen).length;
  const filters = history
    ? [
      { value: 'open', label: `Held or traded today (${rows.length})` },
      { value: 'flat', label: `Flat (${history.count})` },
    ]
    : [
      { value: 'all', label: `All (${rows.length})` },
      { value: 'open', label: `Open (${openCount})` },
      { value: 'flat', label: `Flat (${rows.length - openCount})` },
    ];

  const columns = useMemo<MRT_ColumnDef<Row>[]>(() => {
    const money = (key: keyof Row, header: string, pnl = true): MRT_ColumnDef<Row> => ({
      id: String(key), header, size: 90,
      mantineTableHeadCellProps: { align: 'right' }, mantineTableBodyCellProps: { align: 'right' },
      Cell: ({ row }) => <Money value={row.original[key] as string} pnl={pnl} size="sm" />,
    });
    const cols: MRT_ColumnDef<Row>[] = [
      {
        id: 'listing', header: 'Listing', size: 150,
        accessorFn: row => row.symbol ?? String(row.listingId),
        Cell: ({ row }) => (
          <Group gap={6} wrap="nowrap">
            <ListingLabel listingId={row.original.listingId} symbol={row.original.symbol} />
            {row.original.needsReview && (
              <Tooltip label="Events were lost: this position can't be trusted until it's reviewed and adjusted" multiline w={260} withArrow>
                <Badge color="red" size="xs" leftSection={<IconAlertTriangle size={10} />}>review</Badge>
              </Tooltip>
            )}
          </Group>
        ),
      },
      ...(byAccount ? [{
        id: 'account', header: 'Account', size: 130,
        accessorFn: row => (row as StrategyListingPnl).accountLabel ?? '',
        Cell: ({ row }) => {
          const label = (row.original as StrategyListingPnl).accountLabel;
          return label ? <Text span size="sm" ff="monospace">{label}</Text> : <Text span size="sm" c="dimmed">—</Text>;
        },
      } as MRT_ColumnDef<Row>] : []),
      {
        id: 'position', header: 'Position', size: 90,
        mantineTableHeadCellProps: { align: 'right' }, mantineTableBodyCellProps: { align: 'right' },
        Cell: ({ row }) => <Qty value={row.original.netQuantity} lotSize={row.original.lotSize} signed size="sm" />,
      },
      {
        id: 'avg', header: 'Avg entry', size: 90,
        mantineTableHeadCellProps: { align: 'right' }, mantineTableBodyCellProps: { align: 'right' },
        Cell: ({ row }) => <Price value={row.original.avgEntryPrice} exchangeId={row.original.exchangeId} tickSize={row.original.tickSize} derived size="sm" />,
      },
      {
        id: 'mark', header: 'Mark', size: 90,
        mantineTableHeadCellProps: { align: 'right' }, mantineTableBodyCellProps: { align: 'right' },
        Cell: ({ row }) => <MarkCell row={row.original} />,
      },
      {
        id: 'cost', header: 'Cost', size: 90,
        mantineTableHeadCellProps: { align: 'right' }, mantineTableBodyCellProps: { align: 'right' },
        Cell: ({ row }) => <CostCell row={row.original} part="cost" />,
      },
      {
        id: 'notional', header: 'Notional', size: 90,
        mantineTableHeadCellProps: { align: 'right' }, mantineTableBodyCellProps: { align: 'right' },
        Cell: ({ row }) => <CostCell row={row.original} part="notional" />,
      },
      {
        id: 'capital', header: 'Capital', size: 90,
        mantineTableHeadCellProps: { align: 'right' }, mantineTableBodyCellProps: { align: 'right' },
        Header: () => (
          <Tooltip label="Money tied up: a long's cost, a binary short's collateral ($1 a contract less what it sold for), plus fees" multiline w={260} withArrow>
            <span>Capital</span>
          </Tooltip>
        ),
        Cell: ({ row }) => <CapitalCell row={row.original} />,
      },
      money('unrealized', 'Unrealized'),
      money('realized', 'Realized'),
      money('fees', 'Fees', false),
      money('total', session ? 'Session PnL' : 'Lifetime PnL'),
    ];
    if (session) {
      cols.push(money('carry' as keyof Row, 'Carry'), money('trading' as keyof Row, 'Trading'), {
        id: 'opening', header: 'Started with', size: 120,
        Cell: ({ row }) => {
          const r = row.original as SessionListingPnl;
          if (r.opening.source === 'FLAT') return <Badge size="xs" variant="outline" color="gray">started flat</Badge>;
          if (r.opening.source === 'NONE') return <Text span size="sm" c="dimmed">nothing</Text>;
          return (
            <Tooltip
              withArrow multiline w={280}
              label={`Valued ${formatMoney(r.opening.unrealized).text} at the session's start${r.opening.markMissing ? ' (no price then, so at its entry: earlier gains or losses are counted in this session)' : ''}`}
            >
              <Text span size="sm" c={r.opening.markMissing ? 'orange' : undefined}>
                <Qty value={r.opening.netQuantity} lotSize={r.lotSize} signed size="sm" /> @{' '}
                <Price value={r.opening.avgEntryPrice} exchangeId={r.exchangeId} tickSize={r.tickSize} derived size="sm" />
              </Text>
            </Tooltip>
          );
        },
      });
      if (ended) {
        cols.push({
          id: 'afterSession', header: 'After session', size: 170,
          Cell: ({ row }) => <AfterSessionCell row={row.original as SessionListingPnl} />,
        });
      }
    } else {
      cols.push(money('today' as keyof Row, 'Today'));
    }
    cols.push({ id: 'outcomes', header: 'Settles between', size: 150, Cell: ({ row }) => <Outcomes row={row.original} /> });
    return cols;
  }, [session, ended, byAccount]);

  const table = useMantineReactTable({
    columns,
    data: shown,
    state: { isLoading: paged ? flatHistory.isLoading : loading && rows.length === 0 },
    enableTopToolbar: true,
    enableColumnActions: false,
    enableColumnFilters: false,
    enablePagination: false,
    enableRowVirtualization: shown.length > VIRTUALIZE_ROWS,
    mantineTableContainerProps: shown.length > VIRTUALIZE_ROWS ? { style: { maxHeight: 560 } } : undefined,
    enableStickyHeader: shown.length > VIRTUALIZE_ROWS,
    enableBottomToolbar: paged && !!flatHistory.hasNextPage,
    renderBottomToolbar: () => (
      <Group justify="center" p="xs">
        <Button size="xs" variant="subtle" loading={flatHistory.isFetchingNextPage} onClick={() => flatHistory.fetchNextPage()}>
          Load older
        </Button>
      </Group>
    ),
    enableRowActions: !!onAdjust,
    positionActionsColumn: 'last',
    renderTopToolbarCustomActions: () => (
      <Group gap="lg" wrap="wrap">
        <SegmentedControl
          size="xs"
          value={filter}
          onChange={v => setFilter(v as typeof filter)}
          data={filters}
        />
        {paged && (
          <Tooltip label="Flat positions don't change, so they aren't refreshed on their own" withArrow>
            <ActionIcon variant="subtle" color="gray" loading={flatHistory.isFetching} onClick={() => flatHistory.refetch()}>
              <IconRefresh size={16} />
            </ActionIcon>
          </Tooltip>
        )}
        {!paged && openCount > 0 && <ExposureTotals rows={rows} />}
      </Group>
    ),
    renderRowActions: ({ row }) => (
      <Tooltip label="Adjust position" withArrow openDelay={400}>
        <ActionIcon variant="subtle" color="gray" onClick={e => { e.stopPropagation(); onAdjust?.(row.original as StrategyListingPnl); }}>
          <IconAdjustments size={16} />
        </ActionIcon>
      </Tooltip>
    ),
    initialState: { density: 'xs' },
    mantineTableProps: { striped: true, highlightOnHover: true, withColumnBorders: true },
    mantineTableBodyRowProps: ({ row }) => (rowHref ? navigateRowProps(navigate, rowHref(row.original)) : {}),
    renderEmptyRowsFallback: () => (
      <Text c="dimmed" size="sm" p="md">
        {paged ? 'No flat positions.' : rows.length === 0 && !history?.count ? 'No positions in this mode.'
          : filter === 'open' ? 'Everything is flat.' : 'No listings match.'}
      </Text>
    ),
  });

  return <MantineReactTable table={table} />;
}
