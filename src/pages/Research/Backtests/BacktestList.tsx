import { useState, useCallback, useMemo } from 'react';
import {
  ActionIcon, Alert, Badge, Container, Group, HoverCard, ScrollArea, Stack, Text, Title, Tooltip,
} from '@mantine/core';
import { IconRefresh } from '@tabler/icons-react';
import ReactTimeAgo from 'react-time-ago';
import { MantineReactTable, useMantineReactTable, type MRT_ColumnDef, type MRT_Row } from 'mantine-react-table';
import { useNavigate } from 'react-router-dom';
import { navigateRowProps } from '../../../utils/navigation';
import { BacktestRun } from '../../../types/backtests';
import { controllerApi } from '../../../utils/api';
import { formatDuration } from '../../../utils/format';
import { LastUpdated } from '../../../components/LastUpdated';
import { CopyIcon, RunStatusBadge } from '../../../components/batch/BatchBits';
import { CancelRunModal } from '../../../components/batch/CancelRunModal';
import { ActiveRunCards, RunFilterBar } from '../../../components/batch/RunListParts';
import { usePolledLoad } from '../../../components/batch/usePolledLoad';
import { RunFilter, isRunActive, runElapsedMs, runMatches } from '../../../components/batch/status';

const POLL_INTERVAL_MS = 15000;
const RUN_LIMIT = 200;

// Strategies are named by import path (pkg.module:Class or pkg.module.Class); the last part is the readable one.
const shortStrategy = (name: string) => (name.includes(':') ? name.split(':').pop() : name.split('.').pop()) ?? name;

const SCENARIOS_NAMED = 2;

// MRT doesn't hold a column to its size, so a long list would widen the whole table; name a couple and hover for all.
function ScenarioCell({ scenarios }: { scenarios: string[] }) {
  if (scenarios.length === 0) return <Text size="sm" c="dimmed">—</Text>;
  const rest = scenarios.length - SCENARIOS_NAMED;
  const cell = (
    <Group gap={4} wrap="nowrap" maw={200}>
      <Text size="sm" truncate="end" style={{ minWidth: 0 }}>{scenarios.slice(0, SCENARIOS_NAMED).join(', ')}</Text>
      {rest > 0 && <Badge size="sm" variant="light" color="gray" style={{ flexShrink: 0 }}>+{rest}</Badge>}
    </Group>
  );
  if (rest <= 0 && scenarios.join(', ').length < 28) return cell;
  return (
    <HoverCard width={280} shadow="md" openDelay={200}>
      <HoverCard.Target>{cell}</HoverCard.Target>
      <HoverCard.Dropdown>
        <Text size="xs" c="dimmed" mb={4}>{scenarios.length} scenarios</Text>
        <ScrollArea.Autosize mah={300}>
          <Stack gap={2}>
            {scenarios.map(s => <Text key={s} size="xs" ff="monospace">{s}</Text>)}
          </Stack>
        </ScrollArea.Autosize>
      </HoverCard.Dropdown>
    </HoverCard>
  );
}

function BacktestList() {
  const navigate = useNavigate();
  const [filter, setFilter] = useState<RunFilter>('all');
  const [search, setSearch] = useState('');
  const [cancelling, setCancelling] = useState<string | null>(null);

  const load = useCallback(() => controllerApi.listBacktests({ limit: RUN_LIMIT }).then(r => r.runs), []);
  const anyActive = useCallback((runs: BacktestRun[]) => runs.some(r => isRunActive(r.status)), []);
  const { data, loading, error, failing, lastUpdated, live, refresh } =
    usePolledLoad(load, anyActive, POLL_INTERVAL_MS, 'Failed to load backtests');
  const runs = useMemo(() => data ?? [], [data]);

  const shown = useMemo(() => {
    const needle = search.trim().toLowerCase();
    return runs.filter(r => runMatches(filter, r.status)
      && (!needle || [r.runId, r.strategy ?? '', r.submittedBy, ...(r.scenarios ?? [])]
        .some(field => field.toLowerCase().includes(needle))));
  }, [runs, filter, search]);

  const active = useMemo(() => runs.filter(r => isRunActive(r.status)).map(r => ({
    runId: r.runId,
    href: `/research/backtests/${r.runId}`,
    title: shortStrategy(r.strategy ?? ''),
    subtitle: r.runId,
    status: r.status,
    submittedAt: r.submittedAt,
    startedAt: r.startedAt,
    counts: { total: r.jobCount, succeeded: r.completedCount, failed: r.failedCount },
  })), [runs]);

  const columns = useMemo<MRT_ColumnDef<BacktestRun>[]>(() => [
    {
      accessorKey: 'runId',
      header: 'Run ID',
      size: 240,
      Cell: ({ row }: { row: MRT_Row<BacktestRun> }) => (
        <Group gap={4} wrap="nowrap">
          <Text ff="monospace" size="xs">{row.original.runId}</Text>
          <CopyIcon value={row.original.runId} label="Copy run ID" />
        </Group>
      ),
    },
    {
      accessorKey: 'status',
      header: 'Status',
      size: 140,
      Cell: ({ row }: { row: MRT_Row<BacktestRun> }) => <RunStatusBadge status={row.original.status} />,
    },
    {
      accessorKey: 'strategy',
      header: 'Strategy',
      size: 220,
      Cell: ({ row }: { row: MRT_Row<BacktestRun> }) => (
        <Text size="sm" title={row.original.strategy}>{shortStrategy(row.original.strategy ?? '')}</Text>
      ),
    },
    {
      id: 'jobs',
      header: 'Jobs',
      size: 120,
      accessorFn: r => r.jobCount,
      Cell: ({ row }: { row: MRT_Row<BacktestRun> }) => (
        <Group gap={6} wrap="nowrap">
          <Text size="sm">{row.original.completedCount}/{row.original.jobCount}</Text>
          {row.original.failedCount > 0 && <Badge color="red" variant="light" size="sm">{row.original.failedCount} failed</Badge>}
        </Group>
      ),
    },
    {
      id: 'scenarios',
      header: 'Scenarios',
      size: 200,
      accessorFn: r => (r.scenarios ?? []).join(', '),
      Cell: ({ row }: { row: MRT_Row<BacktestRun> }) => <ScenarioCell scenarios={row.original.scenarios ?? []} />,
    },
    { accessorKey: 'submittedBy', header: 'Submitted by', size: 150 },
    {
      accessorKey: 'submittedAt',
      header: 'Submitted',
      size: 120,
      Cell: ({ row }: { row: MRT_Row<BacktestRun> }) =>
        row.original.submittedAt ? <ReactTimeAgo date={new Date(row.original.submittedAt)} timeStyle="round" /> : '—',
    },
    {
      id: 'duration',
      header: 'Duration',
      size: 100,
      accessorFn: r => runElapsedMs(r) ?? -1,
      Cell: ({ row }: { row: MRT_Row<BacktestRun> }) => formatDuration(runElapsedMs(row.original)),
    },
  ], []);

  const table = useMantineReactTable({
    columns,
    data: shown,
    getRowId: r => r.runId,
    state: { isLoading: loading && data === null },
    enableColumnFilters: false,
    enableSorting: true,
    enablePagination: true,
    enableBottomToolbar: true,
    enableTopToolbar: false,
    mantineTableProps: { striped: true, highlightOnHover: true, withColumnBorders: true },
    initialState: { sorting: [{ id: 'submittedAt', desc: true }], density: 'xs', pagination: { pageIndex: 0, pageSize: 50 } },
    mantineTableBodyRowProps: ({ row }: { row: MRT_Row<BacktestRun> }) => (
      navigateRowProps(navigate, `/research/backtests/${row.original.runId}`)
    ),
  });

  return (
    <Container size="xl" py="xl">
      <Group mb="md">
        <Title order={2} style={{ flex: 1 }}>Backtests</Title>
        {live && <LastUpdated at={lastUpdated} intervalMs={POLL_INTERVAL_MS} failing={failing} />}
        <Tooltip label="Refresh" withArrow openDelay={500}>
          <ActionIcon size="lg" variant="filled" color="green" onClick={() => refresh()} loading={loading}>
            <IconRefresh size={20} />
          </ActionIcon>
        </Tooltip>
      </Group>
      <Text size="sm" c="dimmed" mb="md">The latest {RUN_LIMIT} runs of the last 90 days.</Text>

      {error && <Alert color="red" mb="md" title="Error loading backtests">{error}</Alert>}

      <ActiveRunCards runs={active} onCancel={setCancelling} />
      <RunFilterBar
        statuses={runs.map(r => r.status)}
        filter={filter}
        onFilter={setFilter}
        search={search}
        onSearch={setSearch}
        searchPlaceholder="Search run, strategy, scenario, submitter"
      />
      <MantineReactTable table={table} />

      <CancelRunModal
        runId={cancelling}
        opened={cancelling !== null}
        onClose={() => setCancelling(null)}
        onConfirm={async () => {
          if (!cancelling) return;
          await controllerApi.cancelBacktest(cancelling);
          await refresh(true);
        }}
      />
    </Container>
  );
}

export default BacktestList;
