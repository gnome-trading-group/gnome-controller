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
  Text,
  TextInput,
  Title,
  Tooltip,
} from '@mantine/core';
import { IconArrowLeft, IconRefresh, IconPlayerPlay } from '@tabler/icons-react';
import ReactTimeAgo from 'react-time-ago';
import { MantineReactTable, useMantineReactTable, type MRT_ColumnDef, type MRT_Row } from 'mantine-react-table';
import { useNavigate, useParams } from 'react-router-dom';
import { PipelineDefinition, PipelineRun } from '../../types/pipeline';
import { controllerApi } from '../../utils/api';

const STATUS_COLORS: Record<string, string> = {
  SUCCEEDED: 'green',
  FAILED: 'red',
  RUNNING: 'blue',
  PENDING: 'yellow',
};

function PipelineDetail() {
  const navigate = useNavigate();
  const { pipelineName } = useParams<{ pipelineName: string }>();
  const [pipeline, setPipeline] = useState<PipelineDefinition | null>(null);
  const [runs, setRuns] = useState<PipelineRun[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [triggering, setTriggering] = useState(false);
  const [editSchedule, setEditSchedule] = useState('');
  const [savingSchedule, setSavingSchedule] = useState(false);

  const refresh = useCallback(async () => {
    if (!pipelineName) return;
    setLoading(true);
    setError(null);
    try {
      const result = await controllerApi.getPipeline(pipelineName);
      setPipeline(result.pipeline);
      setRuns(result.runs);
      setEditSchedule(result.pipeline.schedule ?? '');
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load pipeline');
    } finally {
      setLoading(false);
    }
  }, [pipelineName]);

  useEffect(() => { refresh(); }, [refresh]);

  const handleTrigger = async () => {
    if (!pipelineName) return;
    setTriggering(true);
    try {
      await controllerApi.triggerPipeline(pipelineName);
      await refresh();
    } catch (e) {
      console.error('Failed to trigger pipeline:', e);
    } finally {
      setTriggering(false);
    }
  };

  const handleToggleSchedule = async () => {
    if (!pipelineName || !pipeline) return;
    setSavingSchedule(true);
    try {
      await controllerApi.updatePipeline(pipelineName, {
        schedule_enabled: !pipeline.scheduleEnabled,
        schedule: editSchedule || pipeline.schedule,
      });
      await refresh();
    } finally {
      setSavingSchedule(false);
    }
  };

  const handleSaveSchedule = async () => {
    if (!pipelineName) return;
    setSavingSchedule(true);
    try {
      await controllerApi.updatePipeline(pipelineName, { schedule: editSchedule });
      await refresh();
    } finally {
      setSavingSchedule(false);
    }
  };

  const columns = useMemo<MRT_ColumnDef<PipelineRun>[]>(() => [
    {
      accessorKey: 'runId',
      header: 'Run ID',
      size: 180,
      Cell: ({ row }) => (
        <span style={{ fontFamily: 'monospace', fontSize: '0.78rem' }}>{row.original.runId}</span>
      ),
    },
    {
      accessorKey: 'status',
      header: 'Status',
      size: 100,
      Cell: ({ row }) => (
        <Badge size="sm" variant="light" color={STATUS_COLORS[row.original.status] ?? 'gray'}>
          {row.original.status}
        </Badge>
      ),
    },
    {
      accessorKey: 'trigger',
      header: 'Trigger',
      size: 90,
      Cell: ({ row }) => (
        <Badge size="xs" variant="outline" color="gray">{row.original.trigger}</Badge>
      ),
    },
    {
      accessorKey: 'startedAt',
      header: 'Started',
      size: 120,
      Cell: ({ row }) =>
        row.original.startedAt
          ? <ReactTimeAgo date={new Date(row.original.startedAt)} timeStyle="round" />
          : '—',
    },
    {
      id: 'duration',
      header: 'Duration',
      size: 90,
      Cell: ({ row }) => {
        if (!row.original.startedAt || !row.original.completedAt) return '—';
        const secs = Math.round((new Date(row.original.completedAt).getTime() - new Date(row.original.startedAt).getTime()) / 1000);
        if (secs < 60) return `${secs}s`;
        return `${Math.floor(secs / 60)}m ${secs % 60}s`;
      },
    },
    {
      accessorKey: 'outputs',
      header: 'Outputs',
      size: 240,
      Cell: ({ row }) => {
        const outputs = row.original.outputs;
        if (!outputs || Object.keys(outputs).length === 0) return <span style={{ color: 'var(--mantine-color-dimmed)' }}>—</span>;
        return (
          <span style={{ fontFamily: 'monospace', fontSize: '0.75rem', color: 'var(--mantine-color-dimmed)' }}>
            {JSON.stringify(outputs).slice(0, 80)}
          </span>
        );
      },
    },
  ], []);

  const table = useMantineReactTable({
    columns,
    data: runs,
    state: { isLoading: loading },
    enableColumnFilters: false,
    enableSorting: false,
    enablePagination: false,
    enableBottomToolbar: false,
    enableTopToolbar: false,
    mantineTableProps: { striped: true, highlightOnHover: true, withColumnBorders: true },
    initialState: { density: 'xs' },
    renderDetailPanel: ({ row }: { row: MRT_Row<PipelineRun> }) => (
      <Stack p="md" gap="xs" style={{ maxWidth: 800 }}>
        {row.original.errorMessage && (
          <>
            <Text size="xs" fw={600} c="red" tt="uppercase">Error</Text>
            <Code block style={{ fontSize: '0.72rem', color: 'var(--mantine-color-red-4)' }}>
              {row.original.errorMessage}
            </Code>
            <Divider my={4} />
          </>
        )}
        {row.original.outputs && Object.keys(row.original.outputs).length > 0 && (
          <>
            <Text size="xs" fw={600} c="dimmed" tt="uppercase">Outputs</Text>
            <Code block style={{ fontSize: '0.72rem' }}>
              {JSON.stringify(row.original.outputs, null, 2)}
            </Code>
            <Divider my={4} />
          </>
        )}
        {row.original.ecsTaskArn && (
          <>
            <Text size="xs" fw={600} c="dimmed" tt="uppercase">ECS Task ARN</Text>
            <Text size="xs" c="dimmed" style={{ fontFamily: 'monospace' }}>{row.original.ecsTaskArn}</Text>
          </>
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

  return (
    <Container size="xl" py="xl">
      <Group mb="md">
        <ActionIcon variant="subtle" onClick={() => navigate('/research/pipelines')}>
          <IconArrowLeft size={18} />
        </ActionIcon>
        <Title order={2} style={{ flex: 1 }}>{pipelineName}</Title>
        <Button
          size="sm"
          variant="light"
          color="green"
          leftSection={<IconPlayerPlay size={14} />}
          onClick={handleTrigger}
          loading={triggering}
        >
          Trigger Now
        </Button>
        <Tooltip label="Refresh" withArrow openDelay={500}>
          <ActionIcon size="lg" variant="filled" color="green" onClick={refresh} loading={loading}>
            <IconRefresh size={20} />
          </ActionIcon>
        </Tooltip>
      </Group>

      {pipeline && (
        <Card withBorder mb="md" p="md">
          <Group justify="space-between" mb="sm">
            <Text size="sm" c="dimmed">{pipeline.description || 'No description'}</Text>
            <Text size="xs" c="dimmed">
              {pipeline.cpu / 1024} vCPU · {pipeline.memory / 1024} GB
            </Text>
          </Group>
          <Divider mb="sm" />
          <Group align="flex-end" gap="sm">
            <TextInput
              label="Schedule expression"
              placeholder="rate(7 days) or cron(0 8 ? * MON *)"
              value={editSchedule}
              onChange={(e) => setEditSchedule(e.currentTarget.value)}
              style={{ flex: 1 }}
              size="sm"
            />
            <Button size="sm" variant="default" onClick={handleSaveSchedule} loading={savingSchedule}>
              Save
            </Button>
            <Switch
              label="Enabled"
              checked={pipeline.scheduleEnabled}
              onChange={handleToggleSchedule}
            />
          </Group>
        </Card>
      )}

      <Title order={4} mb="xs">Run History</Title>
      {runs.length === 0 && !loading ? (
        <Text size="sm" c="dimmed">No runs yet. Use "Trigger Now" to start one.</Text>
      ) : (
        <MantineReactTable table={table} />
      )}
    </Container>
  );
}

export default PipelineDetail;
