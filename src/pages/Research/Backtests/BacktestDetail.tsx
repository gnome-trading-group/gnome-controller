import { useState, useEffect, useCallback, useMemo } from 'react';
import {
  Accordion,
  ActionIcon,
  Alert,
  Anchor,
  Badge,
  Button,
  Card,
  Code,
  Container,
  Divider,
  Group,
  HoverCard,
  SegmentedControl,
  SimpleGrid,
  Skeleton,
  Stack,
  Text,
  Tooltip,
} from '@mantine/core';
import { IconAlertTriangle, IconFileText, IconRefresh, IconX } from '@tabler/icons-react';
import ReactTimeAgo from 'react-time-ago';
import { MantineReactTable, useMantineReactTable, type MRT_ColumnDef, type MRT_Row } from 'mantine-react-table';
import { useNavigate, useParams } from 'react-router-dom';
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  ResponsiveContainer,
  Tooltip as RechartsTooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { BacktestJob, BacktestRun, BacktestStatus } from '../../../types/backtests';
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

// summary.json's market_data_missing_fraction (gnomepy): its own column, as a percentage.
const MISSING_FRACTION_KEY = 'marketDataMissingFraction';

const EXPLORABLE = new Set<BacktestStatus>(['COMPLETED', 'PARTIALLY_FAILED']);
const POLL_INTERVAL_MS = 10000;

const FILTERS: { value: TaskFilter; label: string }[] = [
  { value: 'all', label: 'All' },
  { value: 'failed', label: 'Failed' },
  { value: 'running', label: 'Running' },
  { value: 'waiting', label: 'Waiting' },
  { value: 'succeeded', label: 'Succeeded' },
];

function toCamelWords(key: string): string {
  return key.replace(/([A-Z])/g, ' $1').replace(/^./, (c) => c.toUpperCase()).trim();
}

function jobLabel(job: BacktestJob): string {
  const params = Object.entries(job.configParams ?? {}).map(([k, v]) => `${k}=${v}`).join(', ');
  return [job.scenario, params].filter(Boolean).join(' / ');
}

function RunInfoSkeleton() {
  return (
    <Card withBorder my="md" p="md">
      <Stack gap={6}>
        <Skeleton h={12} />
        {['Strategy', 'Commit'].map(label => (
          <Group key={label} gap="xs" wrap="nowrap">
            <Text size="sm" c="dimmed" w={110} style={{ flexShrink: 0 }}>{label}</Text>
            <Skeleton h={14} w="45%" />
          </Group>
        ))}
      </Stack>
    </Card>
  );
}

function BacktestDetail() {
  const { runId } = useParams<{ runId: string }>();
  const navigate = useNavigate();
  const [filter, setFilter] = useState<TaskFilter>('all');
  const [selected, setSelected] = useState<number | null>(null);
  const [logsFor, setLogsFor] = useState<number | null>(null);
  const [cancelOpen, setCancelOpen] = useState(false);
  const [columnVisibility, setColumnVisibility] = useState<Record<string, boolean>>({});
  const [visibilityInitialized, setVisibilityInitialized] = useState(false);

  const load = useCallback(() => controllerApi.getBacktest(runId ?? ''), [runId]);
  const inProgress = useCallback((r: BacktestRun) =>
    isRunActive(r.status) || (r.jobs ?? []).some(j => !isTaskFinished(j.status)), []);
  const { data: run, loading, error, failing, lastUpdated, live, refresh } =
    usePolledLoad(load, inProgress, POLL_INTERVAL_MS, 'Failed to load backtest');

  const jobs = useMemo(() => run?.jobs ?? [], [run]);
  const shown = useMemo(() => jobs.filter(j => taskMatches(filter, j.status)), [jobs, filter]);
  const running = jobs.filter(j => j.status === 'RUNNING').length;
  const logsJob = logsFor === null ? null : jobs.find(j => j.arrayIndex === logsFor) ?? null;

  const loadLogs = useMemo(
    () => (runId && logsFor !== null
      ? (before?: string) => controllerApi.getBacktestJobLogs(runId, logsFor, { before })
      : null),
    [runId, logsFor],
  );

  const openLogs = useCallback((index: number) => {
    setSelected(index);
    setLogsFor(index);
  }, []);

  const hasScenarios = (run?.scenarios?.length ?? 0) > 0;

  const scenarioColors = useMemo(() => {
    const palette = ['#1971c2', '#0ca678', '#e8590c', '#9c36b5', '#c92a2a', '#2f9e44', '#f08c00', '#1098ad'];
    const colors: Record<string, string> = {};
    (run?.scenarios ?? []).forEach((name, i) => {
      colors[name] = palette[i % palette.length];
    });
    return colors;
  }, [run?.scenarios]);

  const chartData = useMemo(() =>
    jobs
      .filter((j) => j.finalPnl !== undefined)
      .map((j) => ({
        label: jobLabel(j) || `job ${j.arrayIndex}`,
        pnl: j.finalPnl ?? 0,
        positive: (j.finalPnl ?? 0) >= 0,
        scenario: j.scenario ?? '',
      })),
    [jobs],
  );

  const summaryKeys = useMemo(() => {
    const keys = new Set<string>();
    for (const job of jobs) {
      if (job.summary) {
        Object.keys(job.summary).forEach((k) => keys.add(k));
      }
    }
    keys.delete('backtestId');
    keys.delete(MISSING_FRACTION_KEY);
    return Array.from(keys);
  }, [jobs]);

  const metricColumns = useMemo<MRT_ColumnDef<BacktestJob>[]>(() =>
    summaryKeys.map((key) => ({
      id: `summary_${key}`,
      header: toCamelWords(key),
      size: 110,
      accessorFn: (row) => row.summary?.[key],
      Cell: ({ cell }) => {
        const v = cell.getValue() as number | string | undefined;
        if (v === undefined) return <Text c="dimmed" size="sm">—</Text>;
        return <Text size="sm">{typeof v === 'number' ? v : String(v)}</Text>;
      },
    })),
    [summaryKeys],
  );

  const columns = useMemo<MRT_ColumnDef<BacktestJob>[]>(() => [
    {
      accessorKey: 'arrayIndex',
      header: '#',
      size: 60,
      Cell: ({ row }: { row: MRT_Row<BacktestJob> }) => (
        <span style={{ fontFamily: 'monospace' }}>{String(row.original.arrayIndex).padStart(4, '0')}</span>
      ),
    },
    {
      accessorKey: 'status',
      header: 'Status',
      size: 110,
      Cell: ({ row }: { row: MRT_Row<BacktestJob> }) => (
        <TaskStatusBadge status={row.original.status} reason={row.original.statusReason} />
      ),
    },
    ...(hasScenarios ? [{
      accessorKey: 'scenario' as const,
      header: 'Scenario',
      size: 120,
      Cell: ({ row }: { row: MRT_Row<BacktestJob> }) => {
        const name = row.original.scenario ?? '';
        return name
          ? <Badge variant="light" size="sm" color="blue">{name}</Badge>
          : <Text c="dimmed" size="sm">—</Text>;
      },
    }] : []),
    {
      id: 'warnings',
      header: '',
      size: 40,
      enableSorting: false,
      Cell: ({ row }: { row: MRT_Row<BacktestJob> }) => {
        const warnings = row.original.warnings;
        if (!warnings?.length) return null;
        return (
          <HoverCard width={320} shadow="md">
            <HoverCard.Target>
              <IconAlertTriangle size={16} color="var(--mantine-color-yellow-6)" style={{ cursor: 'pointer' }} />
            </HoverCard.Target>
            <HoverCard.Dropdown>
              <Stack gap={4}>
                {warnings.slice(0, 10).map((w, i) => (
                  <Text key={i} size="xs">{w}</Text>
                ))}
                {warnings.length > 10 && (
                  <Text size="xs" c="dimmed">+{warnings.length - 10} more</Text>
                )}
              </Stack>
            </HoverCard.Dropdown>
          </HoverCard>
        );
      },
    },
    {
      id: 'configParams',
      header: 'Parameters',
      accessorFn: (row) => Object.entries(row.configParams ?? {}).map(([k, v]) => `${k}=${v}`).join(', '),
    },
    {
      id: 'missingData',
      header: 'Missing data',
      size: 110,
      accessorFn: (row) => row.summary?.[MISSING_FRACTION_KEY],
      Cell: ({ cell }) => {
        const v = cell.getValue() as number | undefined;
        if (v === undefined) return <Text c="dimmed" size="sm">—</Text>;
        return (
          <Tooltip label="Of the run's stream-time, the share collection had no market data for" withArrow>
            <Text size="sm" c={v > 0 ? 'orange' : undefined}>{(v * 100).toFixed(1)}%</Text>
          </Tooltip>
        );
      },
    },
    ...metricColumns,
    {
      id: 'duration',
      header: 'Duration',
      size: 100,
      accessorFn: j => taskElapsedMs(j) ?? -1,
      Cell: ({ row }: { row: MRT_Row<BacktestJob> }) => formatDuration(taskElapsedMs(row.original)),
    },
    {
      id: 'actions',
      header: '',
      size: 150,
      enableSorting: false,
      enableHiding: false,
      Cell: ({ row }: { row: MRT_Row<BacktestJob> }) => (
        <Group gap={4} wrap="nowrap">
          <Tooltip label="Logs" withArrow>
            <ActionIcon size="sm" variant="subtle" onClick={e => { e.stopPropagation(); openLogs(row.original.arrayIndex); }}>
              <IconFileText size={16} />
            </ActionIcon>
          </Tooltip>
          {row.original.reportUrl && (
            <Anchor href={row.original.reportUrl} target="_blank" size="sm" onClick={e => e.stopPropagation()}>Report</Anchor>
          )}
          {row.original.status === 'SUCCEEDED' && (
            <CopyIcon value={`gnomepy explore --run-id ${runId} --job ${row.original.arrayIndex}`} label="Copy explore command" />
          )}
        </Group>
      ),
    },
  ], [metricColumns, hasScenarios, openLogs, runId]);

  useEffect(() => {
    if (!visibilityInitialized && summaryKeys.length > 0) {
      const hidden: Record<string, boolean> = {};
      for (const key of summaryKeys) {
        if (!['finalPnl', 'sharpe', 'sortino', 'fillCount', 'totalFees'].includes(key)) {
          hidden[`summary_${key}`] = false;
        }
      }
      setColumnVisibility(hidden);
      setVisibilityInitialized(true);
    }
  }, [summaryKeys, visibilityInitialized]);

  const awaitingRun = !run && !error;

  const table = useMantineReactTable({
    columns,
    data: shown,
    getRowId: j => String(j.arrayIndex),
    state: { isLoading: awaitingRun, columnVisibility },
    onColumnVisibilityChange: setColumnVisibility,
    enableColumnFilters: false,
    enableSorting: true,
    enablePagination: shown.length > 25,
    enableBottomToolbar: shown.length > 25,
    enableTopToolbar: true,
    enableHiding: true,
    enableExpandAll: false,
    mantineTableProps: { striped: true, highlightOnHover: true, withColumnBorders: true },
    mantineTableBodyRowProps: ({ row }) => ({
      onClick: () => row.toggleExpanded(),
      style: {
        cursor: 'pointer',
        outline: selected !== null && row.original.arrayIndex === selected ? '1px solid var(--mantine-color-blue-6)' : undefined,
      },
    }),
    initialState: { sorting: [{ id: 'summary_finalPnl', desc: true }], density: 'xs' },
    renderDetailPanel: ({ row }: { row: MRT_Row<BacktestJob> }) => runId && (
      <TaskDetailPanel
        task={{ ...row.original, elapsedMs: taskElapsedMs(row.original), hasLogs: !!row.original.logUrl }}
        loadTail={() => controllerApi.getBacktestJobLogs(runId, row.original.arrayIndex, { limit: TAIL_LINES })}
        onOpenLogs={() => openLogs(row.original.arrayIndex)}
      >
        {row.original.warnings && row.original.warnings.length > 0 && (
          <Stack gap={2}>
            <Text size="xs" c="dimmed" tt="uppercase" fw={600}>Warnings</Text>
            {row.original.warnings.map((w, i) => <Text key={i} size="xs">{w}</Text>)}
          </Stack>
        )}
      </TaskDetailPanel>
    ),
  });

  return (
    <Container size="xl" py="xl">
      <PageHeader
        onBack={() => navigate('/research/backtests')}
        title={run?.strategy ?? 'Backtest'}
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

      {error && <Alert color="red" title="Error loading backtest" my="md">{error}</Alert>}

      {awaitingRun && <RunInfoSkeleton />}

      {run && (
        <Card withBorder my="md" p="md">
          <Stack gap="sm">
            <Group gap="sm" wrap="nowrap">
              <div style={{ flex: 1 }}>
                <RunProgress counts={{ total: run.jobCount, succeeded: run.completedCount, failed: run.failedCount, running }} />
              </div>
              <Text size="sm" c="dimmed" style={{ flexShrink: 0 }}>
                {run.completedCount}/{run.jobCount} succeeded
                {run.failedCount > 0 && <Text span c="red" size="sm"> · {run.failedCount} failed</Text>}
              </Text>
            </Group>
            <SimpleGrid cols={{ base: 1, sm: 2 }} spacing="xs">
              <Stack gap={4}>
                <InfoRow label="Strategy"><Text span ff="monospace" size="sm">{run.strategy}</Text></InfoRow>
                <InfoRow label="Commit">
                  <Text span ff="monospace" size="xs">{run.researchCommit ?? 'main'}</Text>
                </InfoRow>
              </Stack>
              <Stack gap={4}>
                {hasScenarios && (
                  <InfoRow label="Scenarios">
                    <Group gap={4}>
                      {run.scenarios!.map((name) => (
                        <Badge key={name} variant="light" size="sm" color="blue">{name}</Badge>
                      ))}
                    </Group>
                  </InfoRow>
                )}
                {Object.entries(run.sweepParams ?? {}).map(([param, values]) => (
                  <InfoRow key={param} label={param}>
                    <Group gap={4}>
                      {values.map((v) => (
                        <Badge key={v} variant="outline" size="sm" color="gray">{v}</Badge>
                      ))}
                    </Group>
                  </InfoRow>
                ))}
              </Stack>
            </SimpleGrid>
            {EXPLORABLE.has(run.status) && (
              <>
                <Divider />
                <InfoRow label="Explore">
                  <Stack gap={4}>
                    <CopyableCode
                      value={run.jobCount === 1
                        ? `gnomepy explore --run-id ${run.runId}`
                        : `gnomepy explore --run-id ${run.runId} --job 0`}
                    />
                    {run.jobCount > 1 && (
                      <Text size="xs" c="dimmed">
                        Use <Code style={{ fontSize: '0.7rem' }}>--job N</Code> for a specific sweep job — copy per-job
                        commands from the table below.
                      </Text>
                    )}
                  </Stack>
                </InfoRow>
              </>
            )}
          </Stack>
        </Card>
      )}

      {run?.configYaml && (
        <Accordion variant="contained" mb="md">
          <Accordion.Item value="config">
            <Accordion.Control>Config</Accordion.Control>
            <Accordion.Panel>
              <Code block style={{ whiteSpace: 'pre', fontFamily: 'monospace', fontSize: '0.75rem' }}>
                {run.configYaml}
              </Code>
            </Accordion.Panel>
          </Accordion.Item>
        </Accordion>
      )}

      {run && run.failedCount > 0 && filter !== 'failed' && (
        <Alert color="red" variant="light" mb="md"
               title={`${run.failedCount} job${run.failedCount === 1 ? '' : 's'} failed`}>
          <Button size="compact-xs" variant="light" color="red" onClick={() => setFilter('failed')}>Show failed jobs</Button>
        </Alert>
      )}

      {jobs.length > 1 && (
        <Card withBorder mb="md" p="sm">
          <Text size="xs" c="dimmed" mb={6}>Jobs — click one for its logs</Text>
          <TaskGrid
            tasks={jobs.map(j => ({ index: j.arrayIndex, status: j.status, label: jobLabel(j) }))}
            selected={selected}
            onSelect={openLogs}
          />
        </Card>
      )}

      {chartData.length > 0 && (
        <Card withBorder mb="md" p="md">
          <Text fw={500} mb="sm">PnL by Job</Text>
          <ResponsiveContainer width="100%" height={220}>
            <BarChart data={chartData} margin={{ top: 4, right: 8, bottom: 40, left: 0 }}>
              <CartesianGrid strokeDasharray="3 3" opacity={0.2} />
              <XAxis
                dataKey="label"
                tick={{ fontSize: 10 }}
                angle={-35}
                textAnchor="end"
                interval={0}
              />
              <YAxis tick={{ fontSize: 11 }} />
              <RechartsTooltip
                formatter={(value) => [typeof value === 'number' ? value.toFixed(4) : value, 'PnL']}
                contentStyle={{ background: '#1a1b1e', border: '1px solid #373a40' }}
              />
              <Bar dataKey="pnl" radius={[3, 3, 0, 0]}>
                {chartData.map((entry, i) => (
                  <Cell
                    key={i}
                    fill={
                      hasScenarios && entry.scenario
                        ? scenarioColors[entry.scenario] ?? '#1971c2'
                        : entry.positive ? '#2f9e44' : '#c92a2a'
                    }
                    opacity={entry.positive ? 1 : 0.65}
                  />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </Card>
      )}

      <SegmentedControl
        size="xs"
        mb="xs"
        value={filter}
        onChange={v => setFilter(v as TaskFilter)}
        data={FILTERS.map(f => ({ value: f.value, label: `${f.label} ${jobs.filter(j => taskMatches(f.value, j.status)).length}` }))}
      />
      <MantineReactTable table={table} />

      <RunLogsDrawer
        opened={logsJob !== null}
        title={logsJob ? `Job ${logsJob.arrayIndex}${jobLabel(logsJob) ? ` · ${jobLabel(logsJob)}` : ''}` : ''}
        active={logsJob ? !isTaskFinished(logsJob.status) : false}
        load={loadLogs}
        consoleUrl={logsJob?.logUrl}
        onClose={() => setLogsFor(null)}
      />
      <CancelRunModal
        runId={runId ?? null}
        opened={cancelOpen}
        onClose={() => setCancelOpen(false)}
        onConfirm={async () => {
          if (!runId) return;
          await controllerApi.cancelBacktest(runId);
          await refresh(true);
        }}
      />
    </Container>
  );
}

export default BacktestDetail;
