import { useState, useEffect, useCallback, useMemo, useRef } from 'react';
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
  ScrollArea,
  SegmentedControl,
  SimpleGrid,
  Skeleton,
  Stack,
  Text,
  Tooltip,
} from '@mantine/core';
import { IconAlertTriangle, IconFileText, IconRefresh, IconX } from '@tabler/icons-react';
import ReactTimeAgo from 'react-time-ago';
import {
  MantineReactTable, useMantineReactTable, type MRT_ColumnDef, type MRT_Row, type MRT_SortingState,
} from 'mantine-react-table';
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
import { CommitLink } from '../../../components/launch/CommitLink';
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
import { CappedBadges } from '../../../components/batch/CappedBadges';
import { PER_JOB_CHART_MAX, pollIntervalMs, runFingerprint } from '../../../components/batch/largeRuns';
import {
  MISSING_FRACTION_KEY, PNL_KEY, PNL_WITH_REWARDS_KEY, REWARDS_TOTAL_KEY, earnedRewards, formatMetric, groupings,
  metricValue, rankingPnlKey,
} from '../../../utils/backtestStats';
import { GroupBreakdown, MetricDistribution, MetricOption } from './BacktestCharts';
import { RunResultsCard } from './RunResultsCard';
import {
  TaskFilter, isRunActive, isTaskFinished, runElapsedMs, taskElapsedMs, taskMatches,
} from '../../../components/batch/status';

// Summary keys arrive as gnomepy wrote them (getBacktest preserves them). The missing fraction gets its own column, as a
// percentage. Estimated venue rewards are shown, and ranked by, only for a run whose jobs earned some.
const DEFAULT_METRICS = [PNL_KEY, 'sharpe', 'sortino', 'fill_count', 'total_fees'];
const REWARD_METRICS = [REWARDS_TOTAL_KEY, PNL_WITH_REWARDS_KEY];
const HEADERS: Record<string, string> = {
  [PNL_KEY]: 'PnL',
  fill_count: 'Fills',
  total_fees: 'Fees',
  [REWARDS_TOTAL_KEY]: 'Rewards (est.)',
  [PNL_WITH_REWARDS_KEY]: 'PnL + rewards (est.)',
};

const EXPLORABLE = new Set<BacktestStatus>(['COMPLETED', 'PARTIALLY_FAILED']);

const runPollMs = (r: BacktestRun) => pollIntervalMs(r.jobs?.length ?? 0);
const backtestFingerprint = (r: BacktestRun) =>
  runFingerprint(r.status, [r.completedCount, r.failedCount], (r.jobs ?? []).map(j => j.status));

const FILTERS: { value: TaskFilter; label: string }[] = [
  { value: 'all', label: 'All' },
  { value: 'failed', label: 'Failed' },
  { value: 'running', label: 'Running' },
  { value: 'waiting', label: 'Waiting' },
  { value: 'succeeded', label: 'Succeeded' },
];

function toWords(key: string): string {
  return key.split('_').filter(Boolean).map((w) => w[0].toUpperCase() + w.slice(1)).join(' ');
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
  const [sorting, setSorting] = useState<MRT_SortingState>([{ id: `summary_${PNL_KEY}`, desc: true }]);
  const [visibilityInitialized, setVisibilityInitialized] = useState(false);

  const load = useCallback(() => controllerApi.getBacktest(runId ?? ''), [runId]);
  const inProgress = useCallback((r: BacktestRun) =>
    isRunActive(r.status) || (r.jobs ?? []).some(j => !isTaskFinished(j.status)), []);
  const { data: run, loading, error, failing, lastUpdated, live, pollMs, refresh } =
    usePolledLoad(load, inProgress, runPollMs, 'Failed to load backtest', backtestFingerprint);

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

  const finished = useMemo(() => jobs.filter((j) => j.finalPnl !== undefined), [jobs]);
  const perJobChart = finished.length <= PER_JOB_CHART_MAX;
  const chartData = useMemo(() =>
    perJobChart
      ? finished.map((j) => ({
        label: jobLabel(j) || `job ${j.arrayIndex}`,
        pnl: j.finalPnl ?? 0,
        positive: (j.finalPnl ?? 0) >= 0,
        scenario: j.scenario ?? '',
      }))
      : [],
    [finished, perJobChart],
  );
  const runGroupings = useMemo(() => (run ? groupings(run) : []), [run]);
  const rankKey = useMemo(() => rankingPnlKey(finished), [finished]);

  const summaryKeys = useMemo(() => {
    const keys = new Set<string>();
    for (const job of jobs) {
      if (job.summary) {
        Object.keys(job.summary).forEach((k) => keys.add(k));
      }
    }
    keys.delete('backtest_id');
    keys.delete(MISSING_FRACTION_KEY);
    return Array.from(keys);
  }, [jobs]);

  const chartMetrics = useMemo<MetricOption[]>(() => {
    const candidates = earnedRewards(finished) ? [...DEFAULT_METRICS, ...REWARD_METRICS] : DEFAULT_METRICS;
    return candidates
      .filter(key => finished.some(j => metricValue(j, key) !== undefined))
      .map(key => ({ value: key, label: HEADERS[key] ?? toWords(key) }));
  }, [finished]);

  const tableRef = useRef<HTMLDivElement>(null);
  const selectJob = useCallback((index: number) => {
    setSelected(index);
    setFilter('all');
    tableRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }, []);

  const metricColumns = useMemo<MRT_ColumnDef<BacktestJob>[]>(() =>
    summaryKeys.map((key) => ({
      id: `summary_${key}`,
      header: HEADERS[key] ?? toWords(key),
      size: 110,
      accessorFn: (row) => row.summary?.[key],
      Cell: ({ cell }) => {
        const v = cell.getValue() as number | string | undefined;
        if (v === undefined) return <Text c="dimmed" size="sm">—</Text>;
        return <Text size="sm">{typeof v === 'number' ? formatMetric(v) : String(v)}</Text>;
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
      const rewards = earnedRewards(jobs);
      const shownMetrics = rewards ? [...DEFAULT_METRICS, ...REWARD_METRICS] : DEFAULT_METRICS;
      const hidden: Record<string, boolean> = {};
      for (const key of summaryKeys) {
        if (!shownMetrics.includes(key)) {
          hidden[`summary_${key}`] = false;
        }
      }
      setColumnVisibility(hidden);
      if (rewards) {
        setSorting([{ id: `summary_${PNL_WITH_REWARDS_KEY}`, desc: true }]);
      }
      setVisibilityInitialized(true);
    }
  }, [summaryKeys, visibilityInitialized, jobs]);

  const awaitingRun = !run && !error;
  const showResults = !!run && EXPLORABLE.has(run.status);

  const table = useMantineReactTable({
    columns,
    data: shown,
    getRowId: j => String(j.arrayIndex),
    state: { isLoading: awaitingRun, columnVisibility, sorting },
    onColumnVisibilityChange: setColumnVisibility,
    onSortingChange: setSorting,
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
    initialState: { density: 'xs' },
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

  // A job picked from the grid or the results may sit on another page of the table.
  useEffect(() => {
    if (selected === null) return;
    const i = table.getPrePaginationRowModel().rows.findIndex(r => r.original.arrayIndex === selected);
    if (i < 0) return;
    const { pageIndex, pageSize } = table.getState().pagination;
    const page = Math.floor(i / pageSize);
    if (page !== pageIndex) table.setPageIndex(page);
  }, [selected, filter, table]);

  return (
    <Container size="xl" py="xl">
      <PageHeader
        onBack={() => navigate('/research/backtests')}
        title={run?.strategy ?? 'Backtest'}
        badges={run && <RunStatusBadge status={run.status} />}
        actions={(
          <>
            {live && pollMs !== null && <LastUpdated at={lastUpdated} intervalMs={pollMs} failing={failing} />}
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
                {(run.researchCommit || !run.strategyCommit) && (
                  <InfoRow label="Research commit">
                    <CommitLink strategyType="python" commit={run.researchCommit ?? 'main'} />
                  </InfoRow>
                )}
                {run.strategyCommit && (
                  <InfoRow label="Strategy commit">
                    <CommitLink strategyType="java" commit={run.strategyCommit} />
                  </InfoRow>
                )}
                <InfoRow label="Engine">
                  {run.engineVersion
                    ? <Text span ff="monospace" size="xs">gnome-backtest {run.engineVersion}</Text>
                    : <Text span size="sm" c="dimmed">the image's</Text>}
                </InfoRow>
                <InfoRow label="Resources">
                  {run.cpu || run.memoryGib
                    ? <Text span size="sm">{[run.cpu && `${run.cpu} vCPU`, run.memoryGib && `${run.memoryGib} GiB`].filter(Boolean).join(' · ')}</Text>
                    : <Text span size="sm" c="dimmed">job definition default</Text>}
                </InfoRow>
              </Stack>
              <Stack gap={4}>
                {hasScenarios && (
                  <InfoRow label={`Scenarios (${run.scenarios!.length})`}>
                    <CappedBadges values={run.scenarios!} />
                  </InfoRow>
                )}
                {Object.entries(run.sweepParams ?? {}).map(([param, values]) => (
                  <InfoRow key={param} label={param}>
                    <CappedBadges values={values} variant="outline" color="gray" />
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

      {run && (showResults || run.configYaml) && (
        <SimpleGrid cols={{ base: 1, md: showResults && run.configYaml ? 2 : 1 }} spacing="md" mb="md">
          {showResults && (
            <RunResultsCard
              run={run}
              jobs={jobs}
              jobLabel={jobLabel}
              onSelectJob={selectJob}
              onShowFailed={() => setFilter('failed')}
            />
          )}
          {run.configYaml && (
            <Accordion variant="contained" style={{ alignSelf: 'start' }}>
              <Accordion.Item value="config">
                <Accordion.Control>Config</Accordion.Control>
                <Accordion.Panel>
                  <ScrollArea.Autosize mah={420}>
                    <Code block style={{ whiteSpace: 'pre', fontFamily: 'monospace', fontSize: '0.75rem' }}>
                      {run.configYaml}
                    </Code>
                  </ScrollArea.Autosize>
                </Accordion.Panel>
              </Accordion.Item>
            </Accordion>
          )}
        </SimpleGrid>
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
                formatter={(value) => [typeof value === 'number' ? formatMetric(value) : value, 'PnL']}
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

      {!perJobChart && chartMetrics.length > 0 && (
        <MetricDistribution jobs={finished} metrics={chartMetrics} defaultMetric={rankKey} />
      )}

      {runGroupings.length > 0 && finished.length > 1 && chartMetrics.length > 0 && (
        <GroupBreakdown jobs={finished} groupings={runGroupings} metrics={chartMetrics} defaultMetric={rankKey} />
      )}

      <div ref={tableRef} style={{ scrollMarginTop: 16 }} />
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
