import { useState, useEffect, useCallback, useMemo } from 'react';
import {
  ActionIcon,
  Badge,
  Button,
  Container,
  Group,
  Modal,
  Select,
  Stack,
  Text,
  Title,
  Tooltip,
} from '@mantine/core';
import { IconEye, IconPlayerStop, IconPlus, IconRefresh } from '@tabler/icons-react';
import ReactTimeAgo from 'react-time-ago';
import { MantineReactTable, useMantineReactTable, type MRT_ColumnDef, type MRT_Row } from 'mantine-react-table';
import { useNavigate } from 'react-router-dom';
import { Strategy, StrategySession, StrategySessionStatus } from '../../types';
import { registryApi } from '../../utils/api';
import { navigateRowProps, handleNavigateClick } from '../../utils/navigation';
import { useServerPaginatedTable } from '../../hooks/useServerPaginatedTable';
import { useUrlTableState } from '../../hooks/useUrlTableState';
import DeploySessionModal from './DeploySessionModal';

const STATUS_COLORS: Record<string, string> = {
  [StrategySessionStatus.SUBMITTED]: 'blue',
  [StrategySessionStatus.RUNNING]: 'green',
  [StrategySessionStatus.STOPPED]: 'gray',
  [StrategySessionStatus.FAILED]: 'red',
};

const MODE_COLORS: Record<string, string> = {
  paper: 'violet',
  live: 'red',
};

const STATUS_OPTIONS = [
  { value: '', label: 'All statuses' },
  { value: 'SUBMITTED', label: 'Submitted' },
  { value: 'RUNNING', label: 'Running' },
  { value: 'STOPPED', label: 'Stopped' },
  { value: 'FAILED', label: 'Failed' },
];

function SessionsList() {
  const navigate = useNavigate();
  const [strategyMap, setStrategyMap] = useState<Record<number, string>>({});
  const [strategyOptions, setStrategyOptions] = useState<{ value: string; label: string }[]>([]);
  const [deployOpen, setDeployOpen] = useState(false);
  const [stopTarget, setStopTarget] = useState<StrategySession | null>(null);
  const [stopping, setStopping] = useState(false);

  const urlState = useUrlTableState({ defaultSort: { id: 'dateCreated', desc: true } });
  const statusFilter = urlState.getParam('status');
  const strategyFilter = urlState.getParam('strategy') || null;

  const setStatusFilter = useCallback((v: string | null) => urlState.setParam('status', v ?? ''), [urlState.setParam]);
  const setStrategyFilter = useCallback((v: string | null) => urlState.setParam('strategy', v ?? ''), [urlState.setParam]);

  useEffect(() => {
    registryApi.listStrategies().then((list: Strategy[]) => {
      const map: Record<number, string> = {};
      list.forEach(s => { map[s.strategyId] = s.name; });
      setStrategyMap(map);
      setStrategyOptions([
        { value: '', label: 'All strategies' },
        ...list.map(s => ({ value: String(s.strategyId), label: s.name })),
      ]);
    }).catch(() => {});
  }, []);

  const extraParams = useMemo(() => {
    const p: Record<string, string | number | boolean> = {};
    if (statusFilter) p.status = statusFilter;
    if (strategyFilter) p.strategyId = parseInt(strategyFilter);
    return p;
  }, [statusFilter, strategyFilter]);

  const { data, total, isLoading, pagination, sorting, globalFilter, setPagination, setSorting, setGlobalFilter, refresh } =
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

  const handleStop = async () => {
    if (!stopTarget) return;
    setStopping(true);
    try {
      await registryApi.stopSession(stopTarget.sessionId);
      setStopTarget(null);
      refresh();
    } catch (e) {
      console.error('Failed to stop session:', e);
    } finally {
      setStopping(false);
    }
  };

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
      Cell: ({ row }: { row: MRT_Row<StrategySession> }) => (
        <Badge color={STATUS_COLORS[row.original.status] ?? 'gray'} variant="light" size="sm">
          {row.original.status}
        </Badge>
      ),
    },
    {
      accessorKey: 'mode',
      header: 'Mode',
      size: 90,
      Cell: ({ row }: { row: MRT_Row<StrategySession> }) => (
        <Badge color={MODE_COLORS[row.original.mode] ?? 'gray'} variant="light" size="sm">
          {row.original.mode}
        </Badge>
      ),
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
      accessorKey: 'dateCreated',
      header: 'Created',
      size: 130,
      Cell: ({ row }: { row: MRT_Row<StrategySession> }) =>
        row.original.dateCreated
          ? <ReactTimeAgo date={new Date(row.original.dateCreated)} timeStyle="round" />
          : '—',
    },
  ], [strategyMap]);

  const isStoppable = (s: StrategySession) =>
    s.status === StrategySessionStatus.SUBMITTED || s.status === StrategySessionStatus.RUNNING;

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
        <Title order={2}>Strategy Sessions</Title>
        <Group>
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
          <Tooltip label="Refresh" position="bottom" withArrow openDelay={500}>
            <ActionIcon size="lg" variant="filled" color="green" onClick={refresh} loading={isLoading}>
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

      <MantineReactTable table={table} />

      <DeploySessionModal
        opened={deployOpen}
        onClose={() => setDeployOpen(false)}
        onCreated={() => { setDeployOpen(false); refresh(); }}
      />

      <Modal opened={!!stopTarget} onClose={() => setStopTarget(null)} title="Stop Session" size="sm">
        <Stack>
          <Text>Stop session <Text span fw={500} style={{ fontFamily: 'monospace' }}>{stopTarget?.sessionId.slice(0, 8)}…</Text>?</Text>
          <Group justify="flex-end">
            <Button variant="outline" onClick={() => setStopTarget(null)}>Cancel</Button>
            <Button color="red" loading={stopping} onClick={handleStop}>Stop</Button>
          </Group>
        </Stack>
      </Modal>
    </Container>
  );
}

export default SessionsList;
