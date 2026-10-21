import { useState, useCallback, useMemo } from 'react';
import { ActionIcon, Alert, Badge, Container, Group, Text, Title, Tooltip } from '@mantine/core';
import { IconRefresh } from '@tabler/icons-react';
import ReactTimeAgo from 'react-time-ago';
import { MantineReactTable, useMantineReactTable, type MRT_ColumnDef, type MRT_Row } from 'mantine-react-table';
import { useNavigate } from 'react-router-dom';
import { navigateRowProps } from '../../../utils/navigation';
import { ResearchJob } from '../../../types/research-jobs';
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

const shortModule = (module: string) => module.replace(/^gnomepy_research\./, '');

function ResearchJobList() {
  const navigate = useNavigate();
  const [filter, setFilter] = useState<RunFilter>('all');
  const [search, setSearch] = useState('');
  const [cancelling, setCancelling] = useState<string | null>(null);

  const load = useCallback(() => controllerApi.listResearchJobs({ limit: RUN_LIMIT }).then(r => r.runs), []);
  const anyActive = useCallback((runs: ResearchJob[]) => runs.some(r => isRunActive(r.status)), []);
  const { data, loading, error, failing, lastUpdated, live, refresh } =
    usePolledLoad(load, anyActive, POLL_INTERVAL_MS, 'Failed to load research jobs');
  const runs = useMemo(() => data ?? [], [data]);

  const shown = useMemo(() => {
    const needle = search.trim().toLowerCase();
    return runs.filter(r => runMatches(filter, r.status)
      && (!needle || [r.runId, r.module, r.submittedBy, r.description ?? '', r.researchRef ?? '']
        .some(field => field.toLowerCase().includes(needle))));
  }, [runs, filter, search]);

  const active = useMemo(() => runs.filter(r => isRunActive(r.status)).map(r => ({
    runId: r.runId,
    href: `/research/jobs/${r.runId}`,
    title: shortModule(r.module),
    subtitle: r.description ?? r.runId,
    status: r.status,
    submittedAt: r.submittedAt,
    startedAt: r.startedAt,
    counts: { total: r.taskCount, succeeded: r.succeededCount, failed: r.failedCount },
  })), [runs]);

  const columns = useMemo<MRT_ColumnDef<ResearchJob>[]>(() => [
    {
      accessorKey: 'runId',
      header: 'Run ID',
      size: 220,
      Cell: ({ row }: { row: MRT_Row<ResearchJob> }) => (
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
      Cell: ({ row }: { row: MRT_Row<ResearchJob> }) => <RunStatusBadge status={row.original.status} />,
    },
    {
      accessorKey: 'module',
      header: 'Module',
      size: 260,
      Cell: ({ row }: { row: MRT_Row<ResearchJob> }) => (
        <Text size="sm" title={row.original.module}>{shortModule(row.original.module)}</Text>
      ),
    },
    {
      accessorKey: 'description',
      header: 'Description',
      size: 240,
      Cell: ({ row }: { row: MRT_Row<ResearchJob> }) => (
        <Text size="sm" c={row.original.description ? undefined : 'dimmed'} lineClamp={1} title={row.original.description}>
          {row.original.description ?? '—'}
        </Text>
      ),
    },
    {
      id: 'tasks',
      header: 'Tasks',
      size: 110,
      accessorFn: r => r.taskCount,
      Cell: ({ row }: { row: MRT_Row<ResearchJob> }) => (
        <Group gap={6} wrap="nowrap">
          <Text size="sm">{row.original.succeededCount}/{row.original.taskCount}</Text>
          {row.original.failedCount > 0 && <Badge color="red" variant="light" size="sm">{row.original.failedCount} failed</Badge>}
        </Group>
      ),
    },
    {
      accessorKey: 'researchCommit',
      header: 'Commit',
      size: 140,
      Cell: ({ row }: { row: MRT_Row<ResearchJob> }) => (
        <Text size="sm" title={row.original.researchCommit}>
          {row.original.researchRef ? `${row.original.researchRef} ` : ''}
          <Text span ff="monospace" size="xs">{row.original.researchCommit.slice(0, 7)}</Text>
        </Text>
      ),
    },
    { accessorKey: 'submittedBy', header: 'Submitted by', size: 150 },
    {
      accessorKey: 'submittedAt',
      header: 'Submitted',
      size: 120,
      Cell: ({ row }: { row: MRT_Row<ResearchJob> }) =>
        row.original.submittedAt ? <ReactTimeAgo date={new Date(row.original.submittedAt)} timeStyle="round" /> : '—',
    },
    {
      id: 'duration',
      header: 'Duration',
      size: 100,
      accessorFn: r => runElapsedMs(r) ?? -1,
      Cell: ({ row }: { row: MRT_Row<ResearchJob> }) => formatDuration(runElapsedMs(row.original)),
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
    mantineTableBodyRowProps: ({ row }: { row: MRT_Row<ResearchJob> }) => (
      navigateRowProps(navigate, `/research/jobs/${row.original.runId}`)
    ),
  });

  return (
    <Container size="xl" py="xl">
      <Group mb="md">
        <Title order={2} style={{ flex: 1 }}>Research Jobs</Title>
        {live && <LastUpdated at={lastUpdated} intervalMs={POLL_INTERVAL_MS} failing={failing} />}
        <Tooltip label="Refresh" withArrow openDelay={500}>
          <ActionIcon size="lg" variant="filled" color="green" onClick={() => refresh()} loading={loading}>
            <IconRefresh size={20} />
          </ActionIcon>
        </Tooltip>
      </Group>
      <Text size="sm" c="dimmed" mb="md">
        Submitted with <Text span ff="monospace" size="sm">poetry run research jobs submit</Text> from gnomepy-research;
        the latest {RUN_LIMIT} runs of the last 90 days.
      </Text>

      {error && <Alert color="red" mb="md" title="Error loading research jobs">{error}</Alert>}

      <ActiveRunCards runs={active} onCancel={setCancelling} />
      <RunFilterBar
        statuses={runs.map(r => r.status)}
        filter={filter}
        onFilter={setFilter}
        search={search}
        onSearch={setSearch}
        searchPlaceholder="Search run, module, description, submitter"
      />
      <MantineReactTable table={table} />

      <CancelRunModal
        runId={cancelling}
        opened={cancelling !== null}
        onClose={() => setCancelling(null)}
        onConfirm={async () => {
          if (!cancelling) return;
          await controllerApi.cancelResearchJob(cancelling);
          await refresh(true);
        }}
      />
    </Container>
  );
}

export default ResearchJobList;
