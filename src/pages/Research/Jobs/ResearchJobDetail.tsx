import { useState, useEffect, useCallback, useMemo } from 'react';
import {
  ActionIcon,
  Alert,
  Anchor,
  Badge,
  Button,
  Card,
  Code,
  Container,
  CopyButton,
  Group,
  Modal,
  SimpleGrid,
  Stack,
  Text,
  Title,
  Tooltip,
} from '@mantine/core';
import { IconArrowLeft, IconCheck, IconCopy, IconRefresh, IconX } from '@tabler/icons-react';
import ReactTimeAgo from 'react-time-ago';
import { MantineReactTable, useMantineReactTable, type MRT_ColumnDef, type MRT_Row } from 'mantine-react-table';
import { useNavigate, useParams } from 'react-router-dom';
import { ResearchJob, ResearchJobStatus, ResearchTask, ResearchTaskStatus } from '../../../types/research-jobs';
import { controllerApi } from '../../../utils/api';
import { errorMessage } from '../../../utils/kill-switch';
import { useLatestRequest } from '../../../hooks/useLatestRequest';
import { LastUpdated } from '../../../components/LastUpdated';
import { RUN_STATUS_COLORS, TASK_STATUS_COLORS } from './status';

const CANCELLABLE = new Set<ResearchJobStatus>(['SUBMITTED', 'RUNNING']);
const TERMINAL_TASK_STATUSES = new Set<ResearchTaskStatus>(['SUCCEEDED', 'FAILED']);
const POLL_INTERVAL_MS = 10000;

function Copyable({ value }: { value: string }) {
  return (
    <Group gap={6} wrap="nowrap" align="center">
      <Code style={{ fontFamily: 'monospace', fontSize: '0.72rem', padding: '3px 6px', wordBreak: 'break-all' }}>
        {value}
      </Code>
      <CopyButton value={value} timeout={2000}>
        {({ copied, copy }) => (
          <Tooltip label={copied ? 'Copied!' : 'Copy'} withArrow position="right">
            <ActionIcon size="sm" variant="subtle" color={copied ? 'teal' : 'gray'} onClick={copy} style={{ flexShrink: 0 }}>
              {copied ? <IconCheck size={13} /> : <IconCopy size={13} />}
            </ActionIcon>
          </Tooltip>
        )}
      </CopyButton>
    </Group>
  );
}

function InfoRow({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <Group gap="xs" wrap="nowrap" align="flex-start">
      <Text size="sm" c="dimmed" w={110} style={{ flexShrink: 0 }}>{label}</Text>
      <Text size="sm" component="div">{children}</Text>
    </Group>
  );
}

function duration(task: ResearchTask): string {
  if (!task.startedAt) return '—';
  const seconds = Math.round(((task.stoppedAt ?? Date.now()) - task.startedAt) / 1000);
  return seconds >= 60 ? `${Math.floor(seconds / 60)}m ${seconds % 60}s` : `${seconds}s`;
}

function ResearchJobDetail() {
  const { runId } = useParams<{ runId: string }>();
  const navigate = useNavigate();
  const [run, setRun] = useState<ResearchJob | null>(null);
  const [loading, setLoading] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);
  const [cancelModalOpen, setCancelModalOpen] = useState(false);
  const [cancelling, setCancelling] = useState(false);
  const [cancelError, setCancelError] = useState<string | null>(null);

  const beginRefresh = useLatestRequest();

  const refresh = useCallback(async (showLoading = true) => {
    if (!runId) return;
    const isCurrent = beginRefresh();
    if (showLoading) setLoading(true);
    try {
      const data = await controllerApi.getResearchJob(runId);
      if (!isCurrent()) return;
      setRun(data);
      setLoadError(null);
      setLastUpdated(new Date());
    } catch (e) {
      if (!isCurrent()) return;
      setLoadError(errorMessage(e, 'Failed to load research job'));
    } finally {
      if (isCurrent()) setLoading(false);
    }
  }, [runId, beginRefresh]);

  useEffect(() => { refresh(); }, [refresh]);

  const inProgress = run !== null
    && (CANCELLABLE.has(run.status) || (run.tasks ?? []).some((t) => !TERMINAL_TASK_STATUSES.has(t.status)));
  useEffect(() => {
    if (!inProgress) return;
    const interval = setInterval(() => refresh(false), POLL_INTERVAL_MS);
    return () => clearInterval(interval);
  }, [inProgress, refresh]);

  const handleCancel = async () => {
    if (!runId) return;
    setCancelling(true);
    setCancelError(null);
    try {
      await controllerApi.cancelResearchJob(runId);
      setCancelModalOpen(false);
      refresh();
    } catch (e) {
      setCancelError(errorMessage(e, 'Failed to cancel research job'));
    } finally {
      setCancelling(false);
    }
  };

  const columns = useMemo<MRT_ColumnDef<ResearchTask>[]>(() => [
    { accessorKey: 'arrayIndex', header: '#', size: 60 },
    {
      accessorKey: 'status',
      header: 'Status',
      size: 120,
      Cell: ({ row }: { row: MRT_Row<ResearchTask> }) => (
        <Tooltip label={row.original.statusReason} disabled={!row.original.statusReason} withArrow multiline w={320}>
          <Badge color={TASK_STATUS_COLORS[row.original.status]} variant="light">{row.original.status}</Badge>
        </Tooltip>
      ),
    },
    {
      accessorKey: 'args',
      header: 'Args',
      Cell: ({ row }: { row: MRT_Row<ResearchTask> }) => (
        <span style={{ fontFamily: 'monospace', fontSize: '0.72rem' }}>{row.original.args.join(' ')}</span>
      ),
    },
    {
      id: 'duration',
      header: 'Duration',
      size: 100,
      accessorFn: (task) => duration(task),
    },
    {
      accessorKey: 'attemptCount',
      header: 'Attempts',
      size: 90,
      Cell: ({ row }: { row: MRT_Row<ResearchTask> }) => row.original.attemptCount ?? '—',
    },
    {
      accessorKey: 'exitCode',
      header: 'Exit',
      size: 70,
      Cell: ({ row }: { row: MRT_Row<ResearchTask> }) => row.original.exitCode ?? '—',
    },
    {
      id: 'links',
      header: 'Links',
      size: 170,
      Cell: ({ row }: { row: MRT_Row<ResearchTask> }) => (
        <Group gap="xs" wrap="nowrap">
          {row.original.logUrl && <Anchor href={row.original.logUrl} target="_blank" size="sm">Logs</Anchor>}
          <Anchor href={row.original.s3ConsoleUrl} target="_blank" size="sm">Outputs</Anchor>
          <CopyButton value={row.original.outputPrefix} timeout={2000}>
            {({ copied, copy }) => (
              <Tooltip label={copied ? 'Copied!' : row.original.outputPrefix} withArrow>
                <ActionIcon size="sm" variant="subtle" color={copied ? 'teal' : 'gray'} onClick={copy}>
                  {copied ? <IconCheck size={13} /> : <IconCopy size={13} />}
                </ActionIcon>
              </Tooltip>
            )}
          </CopyButton>
        </Group>
      ),
    },
  ], []);

  const table = useMantineReactTable({
    columns,
    data: run?.tasks ?? [],
    state: { isLoading: loading && run === null },
    enableColumnFilters: true,
    enableSorting: true,
    enablePagination: true,
    enableBottomToolbar: true,
    enableTopToolbar: false,
    mantineTableProps: { striped: true, highlightOnHover: true, withColumnBorders: true },
    initialState: { density: 'xs', pagination: { pageIndex: 0, pageSize: 50 } },
  });

  return (
    <Container size="xl" py="xl">
      <Group mb="md">
        <Tooltip label="Back to list" position="right" withArrow openDelay={500}>
          <ActionIcon variant="subtle" onClick={() => navigate('/research/jobs')}>
            <IconArrowLeft size={18} />
          </ActionIcon>
        </Tooltip>
        <Title order={2}>Research Job</Title>
        <Group ml="auto">
          {inProgress && <LastUpdated at={lastUpdated} intervalMs={POLL_INTERVAL_MS} failing={loadError !== null} />}
          {run && CANCELLABLE.has(run.status) && (
            <Button
              size="sm"
              color="red"
              variant="light"
              leftSection={<IconX size={14} />}
              onClick={() => { setCancelError(null); setCancelModalOpen(true); }}
            >
              Cancel
            </Button>
          )}
          <Tooltip label="Refresh" position="bottom" withArrow openDelay={500}>
            <ActionIcon size="lg" variant="filled" color="green" onClick={() => refresh()} loading={loading}>
              <IconRefresh size={20} />
            </ActionIcon>
          </Tooltip>
        </Group>
      </Group>

      {loadError && <Alert color="red" title="Error" mb="md">{loadError}</Alert>}
      {run?.error && <Alert color="red" title="Submit failed" mb="md">{run.error}</Alert>}

      {run && (
        <Card withBorder mb="md" p="md">
          <SimpleGrid cols={{ base: 1, sm: 2 }} spacing="xs">
            <Stack gap={4}>
              <InfoRow label="Run ID">
                <span style={{ fontFamily: 'monospace', fontSize: '0.75rem' }}>{run.runId}</span>
              </InfoRow>
              <InfoRow label="Status">
                <Badge color={RUN_STATUS_COLORS[run.status]} variant="light">{run.status}</Badge>
              </InfoRow>
              <InfoRow label="Module"><span style={{ fontFamily: 'monospace' }}>{run.module}</span></InfoRow>
              <InfoRow label="Commit">
                {run.researchRef && <>{run.researchRef} </>}
                <span style={{ fontFamily: 'monospace', fontSize: '0.75rem' }}>{run.researchCommit}</span>
              </InfoRow>
              {run.description && <InfoRow label="Description">{run.description}</InfoRow>}
            </Stack>
            <Stack gap={4}>
              <InfoRow label="Tasks">
                {run.succeededCount}/{run.taskCount} succeeded, {run.failedCount} failed
              </InfoRow>
              {run.cpu && run.memoryGib && (
                <InfoRow label="Per task">{run.cpu} vCPU, {run.memoryGib} GiB</InfoRow>
              )}
              <InfoRow label="Submitted by">{run.submittedBy}</InfoRow>
              <InfoRow label="Submitted">
                {run.submittedAt ? <ReactTimeAgo date={new Date(run.submittedAt)} timeStyle="round" /> : '—'}
              </InfoRow>
            </Stack>
          </SimpleGrid>
          <Stack gap={4} mt="xs">
            <InfoRow label="Outputs">
              <Group gap="xs" wrap="nowrap">
                <Copyable value={run.outputPrefix} />
                {run.s3ConsoleUrl && <Anchor href={run.s3ConsoleUrl} target="_blank" size="sm">S3 console</Anchor>}
              </Group>
            </InfoRow>
            <InfoRow label="Download">
              <Copyable value={`poetry run research jobs download ${run.runId} ./${run.runId}`} />
            </InfoRow>
            {Object.entries(run.inputs ?? {}).map(([name, digest]) => (
              <InfoRow key={name} label={`Input ${name}`}>
                <span style={{ fontFamily: 'monospace', fontSize: '0.72rem' }} title={digest}>{digest.slice(0, 16)}…</span>
              </InfoRow>
            ))}
          </Stack>
        </Card>
      )}

      <MantineReactTable table={table} />

      <Modal opened={cancelModalOpen} onClose={() => setCancelModalOpen(false)} title="Cancel research job" centered>
        <Text size="sm" mb="md">Terminate every unfinished task of this run? Outputs already written stay in S3.</Text>
        {cancelError && <Alert color="red" mb="md">{cancelError}</Alert>}
        <Group justify="flex-end">
          <Button variant="outline" onClick={() => setCancelModalOpen(false)}>Back</Button>
          <Button color="red" onClick={handleCancel} loading={cancelling}>Cancel run</Button>
        </Group>
      </Modal>
    </Container>
  );
}

export default ResearchJobDetail;
