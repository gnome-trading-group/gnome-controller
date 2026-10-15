import { useState, useEffect, useCallback, useMemo } from 'react';
import { ActionIcon, Alert, Badge, Button, Container, Group, Text, Title, Tooltip } from '@mantine/core';
import { IconRefresh, IconPlayerPlay } from '@tabler/icons-react';
import ReactTimeAgo from 'react-time-ago';
import { MantineReactTable, useMantineReactTable, type MRT_ColumnDef } from 'mantine-react-table';
import { useNavigate } from 'react-router-dom';
import { Pipeline } from '../../types/pipeline';
import { controllerApi } from '../../utils/api';
import { errorMessage } from '../../utils/kill-switch';
import RunPipelineModal from './RunPipelineModal';
import { RunStatusBadge } from './RunBits';

// Pipelines are declared in gnome-pipelines' code and published with each image; this page only runs them.
function PipelineList() {
  const navigate = useNavigate();
  const [pipelines, setPipelines] = useState<Pipeline[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [running, setRunning] = useState<Pipeline | null>(null);

  const refresh = useCallback(async () => {
    setLoading(true);
    try {
      const result = await controllerApi.listPipelines();
      setPipelines(result.pipelines);
      setError(null);
    } catch (e) {
      setError(errorMessage(e, 'Failed to load pipelines'));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { refresh(); }, [refresh]);

  const columns = useMemo<MRT_ColumnDef<Pipeline>[]>(() => [
    {
      accessorKey: 'name',
      header: 'Name',
      size: 200,
      Cell: ({ row }) => (
        <span
          style={{ fontFamily: 'monospace', fontSize: '0.85rem', cursor: 'pointer', color: 'var(--mantine-color-blue-4)' }}
          onClick={() => navigate(`/research/pipelines/${row.original.name}`)}
        >
          {row.original.name}
        </span>
      ),
    },
    { accessorKey: 'description', header: 'Description', size: 340 },
    {
      id: 'schedules',
      header: 'Schedules',
      size: 180,
      Cell: ({ row }) => row.original.schedules.length === 0
        ? <Text size="xs" c="dimmed">manual only</Text>
        : (
          <Group gap={4}>
            {row.original.schedules.map(s => (
              <Tooltip key={s.name} label={`${s.expression} (UTC)`} withArrow>
                <Badge size="xs" variant="light" color={s.enabled ? 'green' : 'gray'}>{s.name} · {s.enabled ? 'on' : 'off'}</Badge>
              </Tooltip>
            ))}
          </Group>
        ),
    },
    {
      id: 'lastRun',
      header: 'Last run',
      size: 180,
      Cell: ({ row }) => {
        const run = row.original.lastRun;
        if (!run) return <Text size="xs" c="dimmed">never</Text>;
        return (
          <Group gap={6}>
            <RunStatusBadge status={run.status} />
            <Text size="xs" c="dimmed"><ReactTimeAgo date={new Date(run.queuedAt)} timeStyle="round" /></Text>
          </Group>
        );
      },
    },
    {
      id: 'actions',
      header: '',
      size: 80,
      Cell: ({ row }) => (
        <Button size="compact-xs" variant="light" color="green" leftSection={<IconPlayerPlay size={12} />}
                onClick={() => setRunning(row.original)}>
          Run
        </Button>
      ),
    },
  ], [navigate]);

  const table = useMantineReactTable({
    columns,
    data: pipelines,
    state: { isLoading: loading },
    enableColumnFilters: false,
    enablePagination: false,
    enableBottomToolbar: false,
    enableTopToolbar: false,
    mantineTableProps: { striped: true, highlightOnHover: true, withColumnBorders: true },
    initialState: { density: 'xs' },
  });

  return (
    <Container size="xl" py="xl">
      <Group mb="md">
        <Title order={2} style={{ flex: 1 }}>Pipelines</Title>
        <Tooltip label="Refresh" withArrow openDelay={500}>
          <ActionIcon size="lg" variant="filled" color="green" onClick={refresh} loading={loading}>
            <IconRefresh size={20} />
          </ActionIcon>
        </Tooltip>
      </Group>
      <Text size="sm" c="dimmed" mb="md">
        Declared in gnome-pipelines' code; a pipeline or schedule is added there. Schedules start off and are switched on per pipeline.
      </Text>
      {error && <Alert color="red" mb="md">{error}</Alert>}
      <MantineReactTable table={table} />
      <RunPipelineModal
        pipeline={running}
        opened={running !== null}
        onClose={() => setRunning(null)}
        onStarted={runId => navigate(`/research/pipelines/${running?.name}?run=${runId}`)}
      />
    </Container>
  );
}

export default PipelineList;
