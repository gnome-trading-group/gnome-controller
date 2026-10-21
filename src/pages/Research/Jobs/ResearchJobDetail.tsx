import { useState, useCallback, useMemo } from 'react';
import {
  ActionIcon,
  Alert,
  Anchor,
  Button,
  Card,
  Container,
  Group,
  SegmentedControl,
  SimpleGrid,
  Stack,
  Text,
  Tooltip,
} from '@mantine/core';
import { IconExternalLink, IconFileText, IconRefresh, IconX } from '@tabler/icons-react';
import ReactTimeAgo from 'react-time-ago';
import { MantineReactTable, useMantineReactTable, type MRT_ColumnDef, type MRT_Row } from 'mantine-react-table';
import { useNavigate, useParams } from 'react-router-dom';
import { ResearchJob, ResearchTask } from '../../../types/research-jobs';
import { controllerApi } from '../../../utils/api';
import { formatDuration } from '../../../utils/format';
import { LastUpdated } from '../../../components/LastUpdated';
import { PageHeader } from '../../../components/PageHeader';
import RunLogsDrawer from '../../../components/RunLogsDrawer';
import { CopyIcon, CopyableCode, InfoRow, RunProgress, RunStatusBadge, TaskStatusBadge } from '../../../components/batch/BatchBits';
import { CancelRunModal } from '../../../components/batch/CancelRunModal';
import { TAIL_LINES, TaskDetailPanel } from '../../../components/batch/TaskDetailPanel';
import { TaskGrid } from '../../../components/batch/TaskGrid';
import { usePolledLoad } from '../../../components/batch/usePolledLoad';
import {
  TaskFilter, isRunActive, isTaskFinished, runElapsedMs, taskElapsedMs, taskMatches,
} from '../../../components/batch/status';

const POLL_INTERVAL_MS = 10000;

const FILTERS: { value: TaskFilter; label: string }[] = [
  { value: 'all', label: 'All' },
  { value: 'failed', label: 'Failed' },
  { value: 'running', label: 'Running' },
  { value: 'waiting', label: 'Waiting' },
  { value: 'succeeded', label: 'Succeeded' },
];

// The table's loading skeleton rows set every column id (including 'args') to null.
const argLine = (t: ResearchTask) => (t.args ?? []).join(' ');

function ResearchJobDetail() {
  const { runId } = useParams<{ runId: string }>();
  const navigate = useNavigate();
  const [filter, setFilter] = useState<TaskFilter>('all');
  const [selected, setSelected] = useState<number | null>(null);
  const [logsFor, setLogsFor] = useState<number | null>(null);
  const [cancelOpen, setCancelOpen] = useState(false);

  const load = useCallback(() => controllerApi.getResearchJob(runId ?? ''), [runId]);
  const inProgress = useCallback((run: ResearchJob) =>
    isRunActive(run.status) || (run.tasks ?? []).some(t => !isTaskFinished(t.status)), []);
  const { data: run, loading, error, failing, lastUpdated, live, refresh } =
    usePolledLoad(load, inProgress, POLL_INTERVAL_MS, 'Failed to load research job');

  const tasks = useMemo(() => run?.tasks ?? [], [run]);
  const shown = useMemo(() => tasks.filter(t => taskMatches(filter, t.status)), [tasks, filter]);
  const running = tasks.filter(t => t.status === 'RUNNING').length;
  const logsTask = logsFor === null ? null : tasks.find(t => t.arrayIndex === logsFor) ?? null;

  const loadLogs = useMemo(
    () => (runId && logsFor !== null
      ? (before?: string) => controllerApi.getResearchJobTaskLogs(runId, logsFor, { before })
      : null),
    [runId, logsFor],
  );

  const openLogs = useCallback((index: number) => {
    setSelected(index);
    setLogsFor(index);
  }, []);

  const columns = useMemo<MRT_ColumnDef<ResearchTask>[]>(() => [
    { accessorKey: 'arrayIndex', header: '#', size: 60 },
    {
      accessorKey: 'status',
      header: 'Status',
      size: 120,
      Cell: ({ row }: { row: MRT_Row<ResearchTask> }) => (
        <TaskStatusBadge status={row.original.status} reason={row.original.statusReason} />
      ),
    },
    {
      id: 'args',
      header: 'Args',
      accessorFn: t => argLine(t),
      Cell: ({ row }: { row: MRT_Row<ResearchTask> }) => (
        <Text ff="monospace" size="xs">{argLine(row.original)}</Text>
      ),
    },
    {
      id: 'duration',
      header: 'Duration',
      size: 100,
      accessorFn: t => taskElapsedMs(t) ?? -1,
      Cell: ({ row }: { row: MRT_Row<ResearchTask> }) => formatDuration(taskElapsedMs(row.original)),
    },
    {
      accessorKey: 'exitCode',
      header: 'Exit',
      size: 70,
      Cell: ({ row }: { row: MRT_Row<ResearchTask> }) => row.original.exitCode ?? '—',
    },
    {
      id: 'actions',
      header: '',
      size: 120,
      enableSorting: false,
      Cell: ({ row }: { row: MRT_Row<ResearchTask> }) => (
        <Group gap={4} wrap="nowrap">
          <Tooltip label="Logs" withArrow>
            <ActionIcon size="sm" variant="subtle" onClick={e => { e.stopPropagation(); openLogs(row.original.arrayIndex); }}>
              <IconFileText size={16} />
            </ActionIcon>
          </Tooltip>
          <Tooltip label="Outputs in S3" withArrow>
            <ActionIcon size="sm" variant="subtle" component="a" href={row.original.s3ConsoleUrl} target="_blank"
                        onClick={e => e.stopPropagation()}>
              <IconExternalLink size={16} />
            </ActionIcon>
          </Tooltip>
          <CopyIcon value={row.original.outputPrefix} label={`Copy ${row.original.outputPrefix}`} />
        </Group>
      ),
    },
  ], [openLogs]);

  const table = useMantineReactTable({
    columns,
    data: shown,
    getRowId: t => String(t.arrayIndex),
    state: { isLoading: loading && run === null },
    enableColumnFilters: false,
    enableSorting: true,
    enablePagination: shown.length > 50,
    enableBottomToolbar: shown.length > 50,
    enableTopToolbar: false,
    enableExpandAll: false,
    mantineTableProps: { striped: true, highlightOnHover: true, withColumnBorders: true },
    mantineTableBodyRowProps: ({ row }) => ({
      onClick: () => row.toggleExpanded(),
      style: {
        cursor: 'pointer',
        outline: selected !== null && row.original.arrayIndex === selected ? '1px solid var(--mantine-color-blue-6)' : undefined,
      },
    }),
    initialState: { density: 'xs', pagination: { pageIndex: 0, pageSize: 50 } },
    renderDetailPanel: ({ row }: { row: MRT_Row<ResearchTask> }) => runId && (
      <TaskDetailPanel
        task={{ ...row.original, elapsedMs: taskElapsedMs(row.original), hasLogs: !!row.original.logUrl }}
        loadTail={() => controllerApi.getResearchJobTaskLogs(runId, row.original.arrayIndex, { limit: TAIL_LINES })}
        onOpenLogs={() => openLogs(row.original.arrayIndex)}
      />
    ),
  });

  return (
    <Container size="xl" py="xl">
      <PageHeader
        onBack={() => navigate('/research/jobs')}
        title={run ? run.module.replace(/^gnomepy_research\./, '') : 'Research Job'}
        badges={run && <RunStatusBadge status={run.status} />}
        actions={(
          <>
            {live && <LastUpdated at={lastUpdated} intervalMs={POLL_INTERVAL_MS} failing={failing} />}
            {run && isRunActive(run.status) && (
              <Button size="sm" color="red" variant="light" leftSection={<IconX size={14} />} onClick={() => setCancelOpen(true)}>
                Cancel
              </Button>
            )}
            <Tooltip label="Refresh" withArrow openDelay={500}>
              <ActionIcon size="lg" variant="filled" color="green" onClick={() => refresh()} loading={loading}>
                <IconRefresh size={20} />
              </ActionIcon>
            </Tooltip>
          </>
        )}
        meta={run ? [
          <Group gap={4} key="id"><Text span ff="monospace" size="sm">{run.runId}</Text><CopyIcon value={run.runId} /></Group>,
          run.submittedBy,
          run.submittedAt && <span key="at">submitted <ReactTimeAgo date={new Date(run.submittedAt)} timeStyle="round" /></span>,
          run.startedAt && `${isRunActive(run.status) ? 'running' : 'took'} ${formatDuration(runElapsedMs(run))}`,
        ] : []}
      />

      {error && <Alert color="red" title="Error loading research job" my="md">{error}</Alert>}
      {run?.error && <Alert color="red" title="Submit failed" my="md">{run.error}</Alert>}

      {run && (
        <Card withBorder my="md" p="md">
          <Stack gap="sm">
            <Group gap="sm" wrap="nowrap">
              <div style={{ flex: 1 }}>
                <RunProgress counts={{ total: run.taskCount, succeeded: run.succeededCount, failed: run.failedCount, running }} />
              </div>
              <Text size="sm" c="dimmed" style={{ flexShrink: 0 }}>
                {run.succeededCount}/{run.taskCount} succeeded
                {run.failedCount > 0 && <Text span c="red" size="sm"> · {run.failedCount} failed</Text>}
              </Text>
            </Group>
            <SimpleGrid cols={{ base: 1, sm: 2 }} spacing="xs">
              <Stack gap={4}>
                <InfoRow label="Module"><Text span ff="monospace" size="sm">{run.module}</Text></InfoRow>
                <InfoRow label="Commit">
                  {run.researchRef && <>{run.researchRef} </>}
                  <Text span ff="monospace" size="xs">{run.researchCommit}</Text>
                </InfoRow>
                {run.description && <InfoRow label="Description">{run.description}</InfoRow>}
              </Stack>
              <Stack gap={4}>
                {run.cpu && run.memoryGib && <InfoRow label="Per task">{run.cpu} vCPU, {run.memoryGib} GiB</InfoRow>}
                {Object.entries(run.inputs ?? {}).map(([name, digest]) => (
                  <InfoRow key={name} label={`Input ${name}`}>
                    <Text span ff="monospace" size="xs" title={digest}>{digest.slice(0, 16)}…</Text>
                  </InfoRow>
                ))}
              </Stack>
            </SimpleGrid>
            <InfoRow label="Outputs">
              <Group gap="xs" wrap="nowrap">
                <CopyableCode value={run.outputPrefix} />
                {run.s3ConsoleUrl && <Anchor href={run.s3ConsoleUrl} target="_blank" size="sm">S3 console</Anchor>}
              </Group>
            </InfoRow>
            <InfoRow label="Download">
              <CopyableCode value={`poetry run research jobs download ${run.runId} ./${run.runId}`} />
            </InfoRow>
          </Stack>
        </Card>
      )}

      {run && run.failedCount > 0 && filter !== 'failed' && (
        <Alert color="red" variant="light" mb="md"
               title={`${run.failedCount} task${run.failedCount === 1 ? '' : 's'} failed`}>
          <Button size="compact-xs" variant="light" color="red" onClick={() => setFilter('failed')}>Show failed tasks</Button>
        </Alert>
      )}

      {tasks.length > 1 && (
        <Card withBorder mb="md" p="sm">
          <Text size="xs" c="dimmed" mb={6}>Tasks — click one for its logs</Text>
          <TaskGrid
            tasks={tasks.map(t => ({ index: t.arrayIndex, status: t.status, label: argLine(t) }))}
            selected={selected}
            onSelect={openLogs}
          />
        </Card>
      )}

      <SegmentedControl
        size="xs"
        mb="xs"
        value={filter}
        onChange={v => setFilter(v as TaskFilter)}
        data={FILTERS.map(f => ({ value: f.value, label: `${f.label} ${tasks.filter(t => taskMatches(f.value, t.status)).length}` }))}
      />
      <MantineReactTable table={table} />

      <RunLogsDrawer
        opened={logsTask !== null}
        title={logsTask ? `Task ${logsTask.arrayIndex} · ${argLine(logsTask)}` : ''}
        active={logsTask ? !isTaskFinished(logsTask.status) : false}
        load={loadLogs}
        consoleUrl={logsTask?.logUrl}
        onClose={() => setLogsFor(null)}
      />
      <CancelRunModal
        runId={runId ?? null}
        opened={cancelOpen}
        onClose={() => setCancelOpen(false)}
        onConfirm={async () => {
          if (!runId) return;
          await controllerApi.cancelResearchJob(runId);
          await refresh(true);
        }}
      />
    </Container>
  );
}

export default ResearchJobDetail;
