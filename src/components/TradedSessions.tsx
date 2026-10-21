import { useMemo } from 'react';
import { Alert, Badge, Group, Paper, Text, Title, Tooltip } from '@mantine/core';
import { MantineReactTable, useMantineReactTable, type MRT_ColumnDef, type MRT_Row } from 'mantine-react-table';
import { useNavigate } from 'react-router-dom';
import { isActiveSession, StrategySession } from '../types';
import { useSessionsTotals, useStrategies } from '../query/hooks';
import { SESSION_STATUS_COLORS, stopSummary } from '../utils/session-status';
import { sessionListingIds } from '../utils/session-config';
import { navigateRowProps } from '../utils/navigation';
import { errorMessage } from '../utils/kill-switch';
import { Money, Time } from './trading/values';

const PANEL_ID = 'traded-sessions';

// Running sessions first, then the most recent.
function byActivity(a: StrategySession, b: StrategySession): number {
  const active = Number(isActiveSession(b.status)) - Number(isActiveSession(a.status));
  return active || (b.startedAt ?? b.dateCreated).localeCompare(a.startedAt ?? a.dateCreated);
}

export function RunningSessionsBadge({ sessions }: { sessions: StrategySession[] | undefined }) {
  const running = (sessions ?? []).filter(s => isActiveSession(s.status)).length;
  if (running === 0) return null;
  return (
    <Badge
      color="green"
      variant="light"
      size="lg"
      style={{ cursor: 'pointer' }}
      onClick={() => document.getElementById(PANEL_ID)?.scrollIntoView({ behavior: 'smooth' })}
    >
      Running in {running} session{running === 1 ? '' : 's'}
    </Badge>
  );
}

interface TradedSessionsPanelProps {
  sessions: StrategySession[] | undefined;
  isLoading: boolean;
  error: unknown;
  // Given for an event: names each of its listings a session traded, so it shows which outcome it was on.
  listingLabels?: Record<number, string>;
}

export function TradedSessionsPanel({ sessions, isLoading, error, listingLabels }: TradedSessionsPanelProps) {
  const navigate = useNavigate();
  const strategies = useStrategies();
  const strategyNames = useMemo(
    () => Object.fromEntries((strategies.data ?? []).map(s => [s.strategyId, s.name])) as Record<number, string>,
    [strategies.data],
  );
  const sorted = useMemo(() => [...(sessions ?? [])].sort(byActivity), [sessions]);
  const recentIds = useMemo(() => sorted.slice(0, 100).map(s => s.sessionId), [sorted]);
  const totals = useSessionsTotals(recentIds, sorted.some(s => isActiveSession(s.status)));
  const totalsById = useMemo(
    () => Object.fromEntries((totals.data ?? []).map(t => [t.sessionId, t])),
    [totals.data],
  );

  const columns = useMemo<MRT_ColumnDef<StrategySession>[]>(() => [
    {
      accessorKey: 'sessionId', header: 'Session', size: 100,
      Cell: ({ row }: { row: MRT_Row<StrategySession> }) => (
        <Tooltip label={row.original.sessionId} openDelay={300} withArrow>
          <Text span ff="monospace" size="sm">{row.original.sessionId.slice(0, 8)}</Text>
        </Tooltip>
      ),
    },
    {
      accessorKey: 'strategyId', header: 'Strategy', size: 160,
      Cell: ({ row }) => strategyNames[row.original.strategyId] ?? `Strategy ${row.original.strategyId}`,
    },
    {
      accessorKey: 'mode', header: 'Mode', size: 80,
      Cell: ({ row }) => (
        <Badge size="sm" variant="outline" color={row.original.mode === 'live' ? 'red' : 'gray'}>{row.original.mode}</Badge>
      ),
    },
    {
      accessorKey: 'status', header: 'Status', size: 100,
      Cell: ({ row }) => {
        const reason = row.original.failureReason ?? stopSummary(row.original);
        return (
          <Tooltip label={reason} disabled={!reason} multiline w={320} withArrow>
            <Badge color={SESSION_STATUS_COLORS[row.original.status] ?? 'gray'} variant="light" size="sm">
              {row.original.status}
            </Badge>
          </Tooltip>
        );
      },
    },
    ...(listingLabels ? [{
      id: 'traded', header: 'Traded', size: 200,
      Cell: ({ row }: { row: MRT_Row<StrategySession> }) => (
        <Group gap={4}>
          {sessionListingIds(row.original).filter(id => listingLabels[id]).map(id => (
            <Badge key={id} size="xs" variant="light" color="gray">{listingLabels[id]}</Badge>
          ))}
        </Group>
      ),
    }] : []),
    { id: 'started', header: 'Started', size: 170, Cell: ({ row }) => <Time value={row.original.startedAt} size="sm" /> },
    { id: 'stopped', header: 'Stopped', size: 170, Cell: ({ row }) => <Time value={row.original.stoppedAt} size="sm" /> },
    {
      id: 'fills', header: 'Fills', size: 70,
      mantineTableHeadCellProps: { align: 'right' }, mantineTableBodyCellProps: { align: 'right' },
      Cell: ({ row }) => totalsById[row.original.sessionId]?.fills ?? '—',
    },
    {
      id: 'pnl', header: 'Session PnL', size: 110,
      mantineTableHeadCellProps: { align: 'right' }, mantineTableBodyCellProps: { align: 'right' },
      Cell: ({ row }) => <Money value={totalsById[row.original.sessionId]?.totals.total} size="sm" />,
    },
  ], [strategyNames, totalsById, listingLabels]);

  const table = useMantineReactTable({
    columns,
    data: sorted,
    state: { isLoading },
    enableColumnFilters: false,
    enableColumnActions: false,
    enableSorting: false,
    enableTopToolbar: false,
    initialState: { density: 'xs', pagination: { pageIndex: 0, pageSize: 10 } },
    mantineTableProps: { striped: true, highlightOnHover: true, withColumnBorders: true },
    mantineTableBodyRowProps: ({ row }) => navigateRowProps(navigate, `/sessions/${row.original.sessionId}`),
    renderEmptyRowsFallback: () => <Text c="dimmed" size="sm" p="md">No session has traded this yet.</Text>,
  });

  return (
    <Paper id={PANEL_ID} withBorder p="md">
      <Title order={4} mb="md">Sessions ({sorted.length})</Title>
      {error != null && <Alert color="red" title="Error" mb="sm">{errorMessage(error, 'Failed to load sessions.')}</Alert>}
      <MantineReactTable table={table} />
    </Paper>
  );
}
