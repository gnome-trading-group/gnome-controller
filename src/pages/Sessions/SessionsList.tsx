import { useState, useEffect, useCallback, useMemo } from 'react';
import {
  ActionIcon,
  Alert,
  Badge,
  Container,
  Group,
  Select,
  Text,
  Title,
  Tooltip,
} from '@mantine/core';
import { IconAB2, IconEye, IconPlayerStop, IconPlus, IconRefresh } from '@tabler/icons-react';
import ReactTimeAgo from 'react-time-ago';
import { MantineReactTable, useMantineReactTable, type MRT_ColumnDef, type MRT_Row } from 'mantine-react-table';
import { useNavigate } from 'react-router-dom';
import { useQueryClient } from '@tanstack/react-query';
import { StrategySession, StrategySessionStatus, isActiveSession } from '../../types';
import { registryApi } from '../../utils/api';
import { StopSessionModal } from './StopSessionModal';
import { navigateRowProps, handleNavigateClick } from '../../utils/navigation';
import { useServerPaginatedTable } from '../../hooks/useServerPaginatedTable';
import { useUrlTableState } from '../../hooks/useUrlTableState';
import DeploySessionModal from './DeploySessionModal';
import { SESSION_STATUS_COLORS } from '../../utils/session-status';
import { LastUpdated } from '../../components/LastUpdated';
import { ModeBand, ModeSwitch } from '../../components/trading/layout';
import { Money } from '../../components/trading/values';
import { CollapsibleSection } from '../../components/CollapsibleSection';
import { useModeParam } from '../../hooks/useModeParam';
import { keys, useActiveSessions, useRecentSessions, useSessionsTotals, useStrategies } from '../../query/hooks';
import { formatDuration } from '../../utils/format';
import { RunningSessions } from './RunningSessions';
import { SessionTimeline } from './SessionTimeline';

const POLL_INTERVAL_MS = 5000;
const TIMELINE_DAYS = 7;

const failedReason = (s: StrategySession) => (s.status === StrategySessionStatus.FAILED ? s.failureReason : null);


const STATUS_OPTIONS = [
  { value: '', label: 'All statuses' },
  { value: 'SUBMITTED', label: 'Submitted' },
  { value: 'STARTING', label: 'Starting' },
  { value: 'RUNNING', label: 'Running' },
  { value: 'STOPPING', label: 'Stopping' },
  { value: 'STOPPED', label: 'Stopped' },
  { value: 'FAILED', label: 'Failed' },
];

// What's running now, how sessions have come and gone over the last week, and the full history to search.
function SessionsList() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [mode, setMode] = useModeParam(undefined);
  const strategies = useStrategies();
  const active = useActiveSessions();
  const recent = useRecentSessions();
  const strategyMap = useMemo(
    () => Object.fromEntries((strategies.data ?? []).map(s => [s.strategyId, s.name])) as Record<number, string>,
    [strategies.data],
  );
  const strategyOptions = useMemo(
    () => [{ value: '', label: 'All strategies' }, ...(strategies.data ?? []).map(s => ({ value: String(s.strategyId), label: s.name }))],
    [strategies.data],
  );
  const strategyName = useCallback((id: number) => strategyMap[id] ?? `Strategy ${id}`, [strategyMap]);
  const running = useMemo(
    () => (active.data ?? []).filter(s => s.mode === mode)
      .sort((a, b) => (b.startedAt ?? b.dateCreated).localeCompare(a.startedAt ?? a.dateCreated)),
    [active.data, mode],
  );
  const timelineSessions = useMemo(() => (recent.data ?? []).filter(s => s.mode === mode), [recent.data, mode]);
  const [deployOpen, setDeployOpen] = useState(false);
  const [stopTarget, setStopTarget] = useState<StrategySession | null>(null);
  const [relaunchSession, setRelaunchSession] = useState<StrategySession | null>(null);

  const urlState = useUrlTableState({ defaultSort: { id: 'dateCreated', desc: true } });
  const statusFilter = urlState.getParam('status');
  const strategyFilter = urlState.getParam('strategy') || null;

  const setStatusFilter = useCallback((v: string | null) => urlState.setParam('status', v ?? ''), [urlState.setParam]);
  const setStrategyFilter = useCallback((v: string | null) => urlState.setParam('strategy', v ?? ''), [urlState.setParam]);

  const extraParams = useMemo(() => {
    const p: Record<string, string | number | boolean> = { mode };
    if (statusFilter) p.status = statusFilter;
    if (strategyFilter) p.strategyId = parseInt(strategyFilter);
    return p;
  }, [statusFilter, strategyFilter, mode]);

  const { data, total, isLoading, error, lastUpdated, pagination, sorting, globalFilter, setPagination, setSorting, setGlobalFilter, refresh, silentRefresh } =
    useServerPaginatedTable<StrategySession>({
      fetchFn: registryApi.listSessionsPaginated,
      countFn: registryApi.countSessions,
      defaultPageSize: 50,
      extraParams,
      controlledState: {
        pagination: urlState.pagination,
        sorting: urlState.sorting,
        globalFilter: urlState.globalFilter,
        setPagination: urlState.setPagination,
        setSorting: urlState.setSorting,
        setGlobalFilter: urlState.setGlobalFilter,
      },
    });

  const pageIds = useMemo(() => data.map(s => s.sessionId), [data]);
  const pageTotals = useSessionsTotals(pageIds, data.some(s => isActiveSession(s.status)));
  const totalsById = useMemo(() => new Map((pageTotals.data ?? []).map(t => [t.sessionId, t])), [pageTotals.data]);

  const columns = useMemo<MRT_ColumnDef<StrategySession>[]>(() => [
    {
      accessorKey: 'sessionId',
      header: 'Session ID',
      size: 120,
      Cell: ({ row }: { row: MRT_Row<StrategySession> }) => (
        <Tooltip label={row.original.sessionId} position="right" withArrow openDelay={300}>
          <span style={{ fontFamily: 'monospace', fontSize: '0.85rem' }}>
            {row.original.sessionId.slice(0, 8)}…
          </span>
        </Tooltip>
      ),
    },
    {
      accessorKey: 'strategyId',
      header: 'Strategy',
      size: 160,
      Cell: ({ row }: { row: MRT_Row<StrategySession> }) =>
        strategyMap[row.original.strategyId] ?? String(row.original.strategyId),
    },
    {
      accessorKey: 'status',
      header: 'Status',
      size: 110,
      Cell: ({ row }: { row: MRT_Row<StrategySession> }) => {
        const reason = failedReason(row.original);
        return (
          <Tooltip label={reason} disabled={!reason} multiline w={320} withArrow>
            <Badge color={SESSION_STATUS_COLORS[row.original.status] ?? 'gray'} variant="light" size="sm">
              {row.original.status}
            </Badge>
          </Tooltip>
        );
      },
    },
    {
      accessorKey: 'startedAt',
      header: 'Started',
      size: 130,
      Cell: ({ row }: { row: MRT_Row<StrategySession> }) =>
        row.original.startedAt
          ? <ReactTimeAgo date={new Date(row.original.startedAt)} timeStyle="round" />
          : '—',
    },
    {
      id: 'duration',
      header: 'Ran for',
      size: 100,
      enableSorting: false,
      Cell: ({ row }: { row: MRT_Row<StrategySession> }) => {
        const { startedAt, stoppedAt } = row.original;
        if (!startedAt) return '—';
        return formatDuration((stoppedAt ? Date.parse(stoppedAt) : Date.now()) - Date.parse(startedAt));
      },
    },
    {
      id: 'pnl',
      header: 'Session PnL',
      size: 110,
      enableSorting: false,
      mantineTableHeadCellProps: { align: 'right' },
      mantineTableBodyCellProps: { align: 'right' },
      Cell: ({ row }: { row: MRT_Row<StrategySession> }) => (
        <Money value={totalsById.get(row.original.sessionId)?.totals.total ?? null} size="sm" />
      ),
    },
    {
      id: 'fills',
      header: 'Fills',
      size: 70,
      enableSorting: false,
      mantineTableHeadCellProps: { align: 'right' },
      mantineTableBodyCellProps: { align: 'right' },
      Cell: ({ row }: { row: MRT_Row<StrategySession> }) => totalsById.get(row.original.sessionId)?.fills ?? '—',
    },
    {
      id: 'opening',
      header: 'Started with',
      size: 110,
      enableSorting: false,
      Cell: ({ row }: { row: MRT_Row<StrategySession> }) => {
        const opening = totalsById.get(row.original.sessionId)?.opening;
        if (opening === 'INHERITED') return <Badge size="xs" variant="outline" color="blue">Inherited</Badge>;
        if (opening === 'FLAT') return <Text span size="xs" c="dimmed">Flat</Text>;
        return <Text span size="xs" c="dimmed">—</Text>;
      },
    },
    {
      accessorKey: 'orchestratorVersion',
      header: 'Version',
      size: 90,
      enableSorting: false,
      Cell: ({ row }: { row: MRT_Row<StrategySession> }) => (
        <Text span size="xs" ff="monospace">{row.original.orchestratorVersion ?? '—'}</Text>
      ),
    },
  ], [strategyMap, totalsById]);

  useEffect(() => {
    const interval = setInterval(silentRefresh, POLL_INTERVAL_MS);
    return () => clearInterval(interval);
  }, [silentRefresh]);

  const isStoppable = (s: StrategySession) => isActiveSession(s.status);
  const refreshAll = () => {
    refresh();
    queryClient.invalidateQueries({ queryKey: keys.activeSessions });
    queryClient.invalidateQueries({ queryKey: ['recentSessions'] });
  };

  const table = useMantineReactTable({
    columns,
    data,
    rowCount: total,
    manualPagination: true,
    manualSorting: true,
    manualFiltering: true,
    state: { isLoading, pagination, sorting, globalFilter },
    onPaginationChange: setPagination,
    onSortingChange: setSorting,
    onGlobalFilterChange: setGlobalFilter,
    enableRowActions: true,
    positionActionsColumn: 'last' as const,
    enableColumnFilters: false,
    initialState: { density: 'xs' },
    mantineTableProps: { striped: true, highlightOnHover: true, withColumnBorders: true },
    mantineTableBodyRowProps: ({ row }: { row: MRT_Row<StrategySession> }) => (
      navigateRowProps(navigate, `/sessions/${row.original.sessionId}`)
    ),
    renderRowActions: ({ row }: { row: MRT_Row<StrategySession> }) => (
      <Group gap={4} justify="center" wrap="nowrap">
        <ActionIcon variant="subtle" color="teal" onClick={e => { e.stopPropagation(); handleNavigateClick(e, navigate, `/sessions/${row.original.sessionId}`); }}>
          <IconEye size={16} />
        </ActionIcon>
        <ActionIcon
          variant="subtle"
          color="green"
          disabled={isStoppable(row.original)}
          onClick={e => { e.stopPropagation(); setRelaunchSession(row.original); }}
        >
          <IconAB2 size={16} />
        </ActionIcon>
        <ActionIcon
          variant="subtle"
          color="red"
          disabled={!isStoppable(row.original)}
          onClick={e => { e.stopPropagation(); setStopTarget(row.original); }}
        >
          <IconPlayerStop size={16} />
        </ActionIcon>
      </Group>
    ),
  });

  return (
    <Container size="xl" py="xl">
      <Group justify="space-between" mb="md">
        <Group gap="sm">
          <Title order={2}>Sessions</Title>
          <LastUpdated at={lastUpdated} intervalMs={POLL_INTERVAL_MS} failing={error !== null} compact />
        </Group>
        <Group gap="xs">
          <ModeSwitch mode={mode} onChange={setMode} />
          <Tooltip label="Refresh" position="bottom" withArrow openDelay={500}>
            <ActionIcon size="lg" variant="filled" color="green" onClick={refreshAll} loading={isLoading}>
              <IconRefresh size={20} />
            </ActionIcon>
          </Tooltip>
          <Tooltip label="Deploy Session" position="bottom" withArrow openDelay={500}>
            <ActionIcon size="lg" variant="filled" color="blue" onClick={() => setDeployOpen(true)}>
              <IconPlus size={20} />
            </ActionIcon>
          </Tooltip>
        </Group>
      </Group>
      <ModeBand mode={mode} />

      <Title order={4} mb="xs">Running now{running.length > 0 ? ` (${running.length})` : ''}</Title>
      <RunningSessions sessions={running} strategyName={strategyName} onStop={setStopTarget} />

      <SessionTimeline sessions={timelineSessions} days={TIMELINE_DAYS} strategyName={strategyName} failedReason={failedReason} />

      <CollapsibleSection title="History" storageKey="sessions-history">
      <Group justify="flex-end" mb="xs">
        <Group gap="xs">
          <Select
            size="sm"
            data={STATUS_OPTIONS}
            value={statusFilter}
            onChange={setStatusFilter}
            clearable={false}
            w={160}
          />
          <Select
            size="sm"
            data={strategyOptions}
            value={strategyFilter}
            onChange={setStrategyFilter}
            clearable
            placeholder="All strategies"
            w={180}
          />
        </Group>
      </Group>

      {error && (
        <Alert color="red" title="Error" mb="md">
          {error}
        </Alert>
      )}

      <MantineReactTable table={table} />
      </CollapsibleSection>

      <DeploySessionModal
        opened={deployOpen || !!relaunchSession}
        onClose={() => { setDeployOpen(false); setRelaunchSession(null); }}
        onCreated={(newSessionId) => {
          const wasRelaunch = !!relaunchSession;
          setDeployOpen(false);
          setRelaunchSession(null);
          if (wasRelaunch) navigate(`/sessions/${newSessionId}`);
          else refreshAll();
        }}
        initialSession={relaunchSession}
      />

      <StopSessionModal session={stopTarget} onClose={() => setStopTarget(null)} onStopped={refreshAll} />
    </Container>
  );
}

export default SessionsList;
