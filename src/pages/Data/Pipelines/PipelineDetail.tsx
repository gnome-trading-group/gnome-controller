import { useState, useEffect, useCallback, useMemo } from 'react';
import {
  ActionIcon,
  Alert,
  Badge,
  Button,
  Card,
  Code,
  Container,
  Divider,
  Group,
  Stack,
  Switch,
  Table,
  Text,
  Title,
  Tooltip,
} from '@mantine/core';
import { IconArrowLeft, IconFileText, IconPlayerPlay, IconPlayerStop, IconRefresh } from '@tabler/icons-react';
import ReactTimeAgo from 'react-time-ago';
import { MantineReactTable, useMantineReactTable, type MRT_ColumnDef, type MRT_Row } from 'mantine-react-table';
import { useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { Pipeline, PipelineRun, PipelineSchedule } from '../../../types/pipeline';
import { JsonSchemaProperty } from '../../../types/jsonSchema';
import { controllerApi } from '../../../utils/api';
import { errorMessage } from '../../../utils/kill-switch';
import { useLatestRequest } from '../../../hooks/useLatestRequest';
import { LastUpdated } from '../../../components/LastUpdated';
import RunPipelineModal from './RunPipelineModal';
import RunLogsDrawer from './RunLogsDrawer';
import ScheduleConfirmModal from './ScheduleConfirmModal';
import { CodeVersion, RunStatusBadge } from './RunBits';
import { duration, isActive, nextScheduled, utcTime } from './runs';

const POLL_INTERVAL_MS = 10000;

function typeOf(prop: JsonSchemaProperty): string {
  if (prop.anyOf) return prop.anyOf.map(typeOf).filter(t => t !== 'null').join(' | ') + ' (optional)';
  if (prop.enum) return prop.enum.join(' | ');
  if (prop.type === 'array') return `${prop.items?.type ?? 'any'}[]`;
  return prop.format ?? prop.type ?? 'any';
}

function PipelineDetail() {
  const navigate = useNavigate();
  const { pipelineName } = useParams<{ pipelineName: string }>();
  const [searchParams] = useSearchParams();
  const focusRun = searchParams.get('run');
  const [pipeline, setPipeline] = useState<Pipeline | null>(null);
  const [runs, setRuns] = useState<PipelineRun[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);
  const [failing, setFailing] = useState(false);
  const [runModal, setRunModal] = useState(false);
  const [logsFor, setLogsFor] = useState<PipelineRun | null>(null);
  const [confirmingSchedule, setConfirmingSchedule] = useState<PipelineSchedule | null>(null);
  const [cancelling, setCancelling] = useState<string | null>(null);
  const beginRefresh = useLatestRequest();

  const refresh = useCallback(async (silent = false) => {
    if (!pipelineName) return;
    const isCurrent = beginRefresh();
    if (!silent) {
      setLoading(true);
      setError(null);
    }
    try {
      const result = await controllerApi.getPipeline(pipelineName);
      if (!isCurrent()) return;
      setPipeline(result.pipeline);
      setRuns(result.runs);
      setLastUpdated(new Date());
      setFailing(false);
    } catch (e) {
      if (!isCurrent()) return;
      setFailing(true);
      // A failed background poll keeps the last good page; the full-page error is for loads the user asked for.
      if (!silent) setError(errorMessage(e, 'Failed to load pipeline'));
    } finally {
      if (isCurrent()) setLoading(false);
    }
  }, [pipelineName, beginRefresh]);

  useEffect(() => { refresh(); }, [refresh]);

  const inProgress = runs.some(isActive);
  useEffect(() => {
    if (!inProgress) return;
    const interval = setInterval(() => refresh(true), POLL_INTERVAL_MS);
    return () => clearInterval(interval);
  }, [inProgress, refresh]);

  // The drawer follows the latest copy of its run, so its status (and whether to keep polling) stays current.
  const logsRun = logsFor ? runs.find(r => r.runId === logsFor.runId) ?? logsFor : null;

  const switchSchedule = async (schedule: PipelineSchedule) => {
    if (!pipelineName) return;
    await controllerApi.setPipelineSchedule(pipelineName, schedule.name, !schedule.enabled);
    await refresh(true);
  };

  const cancel = useCallback(async (run: PipelineRun) => {
    setCancelling(run.runId);
    setActionError(null);
    try {
      await controllerApi.cancelRun(run.pipelineName, run.runId);
      await refresh(true);
    } catch (e) {
      setActionError(errorMessage(e, 'Failed to cancel the run'));
    } finally {
      setCancelling(null);
    }
  }, [refresh]);

  const columns = useMemo<MRT_ColumnDef<PipelineRun>[]>(() => [
    {
      accessorKey: 'runId',
      header: 'Run',
      size: 190,
      Cell: ({ row }) => <span style={{ fontFamily: 'monospace', fontSize: '0.78rem' }}>{row.original.runId}</span>,
    },
    { accessorKey: 'status', header: 'Status', size: 100, Cell: ({ row }) => <RunStatusBadge status={row.original.status} /> },
    {
      accessorKey: 'trigger',
      header: 'Trigger',
      size: 110,
      Cell: ({ row }) => (
        <Badge size="xs" variant="outline" color="gray">
          {row.original.schedule ? `schedule · ${row.original.schedule}` : row.original.trigger}
        </Badge>
      ),
    },
    {
      accessorKey: 'queuedAt',
      header: 'Started',
      size: 110,
      Cell: ({ row }) => <ReactTimeAgo date={new Date(row.original.startedAt ?? row.original.queuedAt)} timeStyle="round" />,
    },
    { id: 'duration', header: 'Duration', size: 90, Cell: ({ row }) => duration(row.original) },
    { accessorKey: 'codeVersion', header: 'Code', size: 110, Cell: ({ row }) => <CodeVersion version={row.original.codeVersion} /> },
    {
      id: 'actions',
      header: '',
      size: 90,
      Cell: ({ row }) => (
        <Group gap={4} wrap="nowrap">
          <Tooltip label="Logs" withArrow>
            <ActionIcon size="sm" variant="subtle" onClick={() => setLogsFor(row.original)}><IconFileText size={16} /></ActionIcon>
          </Tooltip>
          {isActive(row.original) && (
            <Tooltip label="Cancel" withArrow>
              <ActionIcon size="sm" variant="subtle" color="red" loading={cancelling === row.original.runId}
                          onClick={() => cancel(row.original)}>
                <IconPlayerStop size={16} />
              </ActionIcon>
            </Tooltip>
          )}
        </Group>
      ),
    },
  ], [cancelling, cancel]);

  const table = useMantineReactTable({
    columns,
    data: runs,
    getRowId: run => run.runId,
    state: { isLoading: loading },
    initialState: { density: 'xs', expanded: focusRun ? { [focusRun]: true } : {} },
    enableColumnFilters: false,
    enableSorting: false,
    enablePagination: false,
    enableBottomToolbar: false,
    enableTopToolbar: false,
    mantineTableProps: { striped: true, highlightOnHover: true, withColumnBorders: true },
    mantineTableBodyRowProps: ({ row }) => ({
      style: row.id === focusRun ? { outline: '1px solid var(--mantine-color-blue-6)' } : undefined,
    }),
    renderDetailPanel: ({ row }: { row: MRT_Row<PipelineRun> }) => (
      <Stack p="md" gap="xs" style={{ maxWidth: 900 }}>
        {row.original.errorMessage && (
          <>
            <Text size="xs" fw={600} c="red" tt="uppercase">Error</Text>
            <Code block style={{ fontSize: '0.72rem', color: 'var(--mantine-color-red-4)' }}>{row.original.errorMessage}</Code>
            <Divider my={4} />
          </>
        )}
        <Text size="xs" fw={600} c="dimmed" tt="uppercase">Parameters</Text>
        <Code block style={{ fontSize: '0.72rem' }}>{JSON.stringify(row.original.parameters ?? {}, null, 2)}</Code>
        {row.original.outputs && Object.keys(row.original.outputs).length > 0 && (
          <>
            <Text size="xs" fw={600} c="dimmed" tt="uppercase">Outputs</Text>
            <Code block style={{ fontSize: '0.72rem' }}>{JSON.stringify(row.original.outputs, null, 2)}</Code>
          </>
        )}
        {row.original.ecsTaskArn && (
          <Text size="xs" c="dimmed" ff="monospace">{row.original.ecsTaskArn}</Text>
        )}
      </Stack>
    ),
  });

  if (error && !loading) {
    return (
      <Container size="xl" py="xl">
        <Alert color="red" title="Error loading pipeline">{error}</Alert>
      </Container>
    );
  }

  const properties = Object.entries(pipeline?.paramsSchema.properties ?? {});
  const upcoming = pipeline ? nextScheduled(pipeline.schedules) : null;
  return (
    <Container size="xl" py="xl">
      <Group mb="md">
        <ActionIcon variant="subtle" onClick={() => navigate('/data/pipelines')}>
          <IconArrowLeft size={18} />
        </ActionIcon>
        <Title order={2} style={{ flex: 1 }}>{pipelineName}</Title>
        {inProgress && <LastUpdated at={lastUpdated} intervalMs={POLL_INTERVAL_MS} failing={failing} />}
        <Button size="sm" variant="light" color="green" leftSection={<IconPlayerPlay size={14} />}
                onClick={() => setRunModal(true)} disabled={!pipeline}>
          Run
        </Button>
        <Tooltip label="Refresh" withArrow openDelay={500}>
          <ActionIcon size="lg" variant="filled" color="green" onClick={() => refresh()} loading={loading}>
            <IconRefresh size={20} />
          </ActionIcon>
        </Tooltip>
      </Group>

      {actionError && (
        <Alert color="red" title="Error" mb="md" withCloseButton onClose={() => setActionError(null)}>{actionError}</Alert>
      )}

      {pipeline && (
        <Card withBorder mb="md" p="md">
          <Group justify="space-between" mb="sm">
            <Text size="sm">{pipeline.description}</Text>
            <Text size="xs" c="dimmed">
              {pipeline.resources.cpu / 1024} vCPU · {pipeline.resources.memory / 1024} GB · <CodeVersion version={pipeline.codeVersion} />
            </Text>
          </Group>

          <Divider my="sm" label="Schedules (UTC)" labelPosition="left" />
          {pipeline.schedules.length === 0 ? (
            <Text size="sm" c="dimmed">None declared; this pipeline only runs when started here.</Text>
          ) : (
            <Table withRowBorders={false} verticalSpacing={4}>
              <Table.Tbody>
                {pipeline.schedules.map(s => (
                  <Table.Tr key={s.name}>
                    <Table.Td w={140}><Text size="sm" fw={500}>{s.name}</Text></Table.Td>
                    <Table.Td w={200}><Code>{s.expression}</Code></Table.Td>
                    <Table.Td><Text size="xs" c="dimmed">{s.description}</Text></Table.Td>
                    <Table.Td w={220}><Code>{JSON.stringify(s.params)}</Code></Table.Td>
                    <Table.Td w={200}>
                      {s.nextRun
                        ? <Text size="xs">Next {utcTime(s.nextRun)} (<ReactTimeAgo date={new Date(s.nextRun)} timeStyle="round" />)</Text>
                        : <Text size="xs" c="dimmed">{s.enabled ? 'rate schedule' : '—'}</Text>}
                    </Table.Td>
                    <Table.Td w={90}>
                      <Tooltip label="Not yet created; it appears once the next image publish syncs the schedules"
                               disabled={s.synced} withArrow>
                        <Switch label={s.enabled ? 'On' : 'Off'} checked={s.enabled} disabled={!s.synced}
                                onChange={() => setConfirmingSchedule(s)} />
                      </Tooltip>
                    </Table.Td>
                  </Table.Tr>
                ))}
              </Table.Tbody>
            </Table>
          )}

          <Divider my="sm" label="Parameters" labelPosition="left" />
          {properties.length === 0 ? (
            <Text size="sm" c="dimmed">None.</Text>
          ) : (
            <Table withRowBorders={false} verticalSpacing={2}>
              <Table.Tbody>
                {properties.map(([name, prop]) => (
                  <Table.Tr key={name}>
                    <Table.Td w={160}><Code>{name}</Code></Table.Td>
                    <Table.Td w={220}><Text size="xs" ff="monospace">{typeOf(prop)}</Text></Table.Td>
                    <Table.Td w={120}>
                      <Text size="xs" c="dimmed">
                        {pipeline.paramsSchema.required?.includes(name) ? 'required' : `default ${JSON.stringify(prop.default ?? null)}`}
                      </Text>
                    </Table.Td>
                    <Table.Td><Text size="xs">{prop.description}</Text></Table.Td>
                  </Table.Tr>
                ))}
              </Table.Tbody>
            </Table>
          )}
        </Card>
      )}

      <Title order={4} mb="xs">Runs</Title>
      {upcoming && (
        <Card withBorder p="xs" mb="xs" style={{ borderStyle: 'dashed' }}>
          <Group gap="sm">
            <Badge size="sm" variant="outline" color="gray">SCHEDULED</Badge>
            <Text size="sm">
              Next run {utcTime(upcoming.nextRun!)} (<ReactTimeAgo date={new Date(upcoming.nextRun!)} timeStyle="round" />)
            </Text>
            <Badge size="xs" variant="outline" color="gray">schedule · {upcoming.name}</Badge>
            <Code>{JSON.stringify(upcoming.params)}</Code>
          </Group>
        </Card>
      )}
      {runs.length === 0 && !loading ? (
        <Text size="sm" c="dimmed">No runs yet{upcoming ? '' : ' — start one with Run, or switch on a schedule'}.</Text>
      ) : (
        <MantineReactTable table={table} />
      )}

      <RunPipelineModal pipeline={pipeline} opened={runModal} onClose={() => setRunModal(false)}
                        onStarted={runId => { navigate(`/data/pipelines/${pipelineName}?run=${runId}`); refresh(); }} />
      <RunLogsDrawer run={logsRun} onClose={() => setLogsFor(null)} />
      <ScheduleConfirmModal pipelineName={pipelineName ?? ''} schedule={confirmingSchedule}
                            onClose={() => setConfirmingSchedule(null)} onConfirm={switchSchedule} />
    </Container>
  );
}

export default PipelineDetail;
