import { useState, useEffect, useCallback, useMemo } from 'react';
import { ActionIcon, Badge, Button, Container, Group, Title, Tooltip, Text } from '@mantine/core';
import { IconRefresh, IconPlayerPlay } from '@tabler/icons-react';
import ReactTimeAgo from 'react-time-ago';
import { MantineReactTable, useMantineReactTable, type MRT_ColumnDef } from 'mantine-react-table';
import { useNavigate } from 'react-router-dom';
import { PipelineDefinition } from '../../types/pipeline';
import { controllerApi } from '../../utils/api';

function PipelineList() {
  const navigate = useNavigate();
  const [pipelines, setPipelines] = useState<PipelineDefinition[]>([]);
  const [loading, setLoading] = useState(false);
  const [triggering, setTriggering] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    setLoading(true);
    try {
      const result = await controllerApi.listPipelines();
      setPipelines(result.pipelines);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { refresh(); }, [refresh]);

  const handleTrigger = async (pipelineName: string) => {
    setTriggering(pipelineName);
    try {
      await controllerApi.triggerPipeline(pipelineName);
      await refresh();
    } catch (e) {
      console.error('Failed to trigger pipeline:', e);
    } finally {
      setTriggering(null);
    }
  };

  const columns = useMemo<MRT_ColumnDef<PipelineDefinition>[]>(() => [
    {
      accessorKey: 'pipelineName',
      header: 'Name',
      size: 200,
      Cell: ({ row }) => (
        <span
          style={{ fontFamily: 'monospace', fontSize: '0.85rem', cursor: 'pointer', color: 'var(--mantine-color-blue-4)' }}
          onClick={() => navigate(`/research/pipelines/${row.original.pipelineName}`)}
        >
          {row.original.pipelineName}
        </span>
      ),
    },
    {
      accessorKey: 'description',
      header: 'Description',
      size: 280,
      Cell: ({ row }) => row.original.description || <span style={{ color: 'var(--mantine-color-dimmed)' }}>—</span>,
    },
    {
      accessorKey: 'schedule',
      header: 'Schedule',
      size: 160,
      Cell: ({ row }) => {
        if (!row.original.schedule) return <span style={{ color: 'var(--mantine-color-dimmed)' }}>—</span>;
        return (
          <Group gap={6}>
            <Badge
              size="xs"
              variant="light"
              color={row.original.scheduleEnabled ? 'green' : 'gray'}
            >
              {row.original.scheduleEnabled ? 'on' : 'off'}
            </Badge>
            <span style={{ fontFamily: 'monospace', fontSize: '0.78rem' }}>{row.original.schedule}</span>
          </Group>
        );
      },
    },
    {
      accessorKey: 'cpu',
      header: 'CPU / Mem',
      size: 110,
      Cell: ({ row }) => (
        <span style={{ color: 'var(--mantine-color-dimmed)', fontSize: '0.8rem' }}>
          {row.original.cpu / 1024} vCPU / {row.original.memory / 1024} GB
        </span>
      ),
    },
    {
      accessorKey: 'updatedAt',
      header: 'Updated',
      size: 120,
      Cell: ({ row }) =>
        row.original.updatedAt
          ? <ReactTimeAgo date={new Date(row.original.updatedAt)} timeStyle="round" />
          : '—',
    },
    {
      id: 'actions',
      header: '',
      size: 80,
      Cell: ({ row }) => (
        <Tooltip label="Trigger now" withArrow openDelay={300}>
          <ActionIcon
            size="sm"
            variant="subtle"
            color="green"
            loading={triggering === row.original.pipelineName}
            onClick={(e) => { e.stopPropagation(); handleTrigger(row.original.pipelineName); }}
          >
            <IconPlayerPlay size={14} />
          </ActionIcon>
        </Tooltip>
      ),
    },
  ], [navigate, triggering]);

  const table = useMantineReactTable({
    columns,
    data: pipelines,
    state: { isLoading: loading },
    enableColumnFilters: false,
    enableSorting: true,
    enablePagination: false,
    enableBottomToolbar: false,
    enableTopToolbar: false,
    mantineTableProps: { striped: true, highlightOnHover: true, withColumnBorders: true },
    initialState: { density: 'xs' },
    mantineTableBodyRowProps: ({ row }) => ({
      onClick: () => navigate(`/research/pipelines/${row.original.pipelineName}`),
      style: { cursor: 'pointer' },
    }),
  });

  return (
    <Container size="xl" py="xl">
      <Group justify="space-between" mb="md">
        <Title order={2}>Pipelines</Title>
        <Group>
          <Button
            size="sm"
            variant="light"
            onClick={() => navigate('/research/pipelines/new')}
          >
            New Pipeline
          </Button>
          <Tooltip label="Refresh" position="bottom" withArrow openDelay={500}>
            <ActionIcon size="lg" variant="filled" color="green" onClick={refresh} loading={loading}>
              <IconRefresh size={20} />
            </ActionIcon>
          </Tooltip>
        </Group>
      </Group>

      {pipelines.length === 0 && !loading && (
        <Text c="dimmed" size="sm">No pipelines defined yet.</Text>
      )}

      <MantineReactTable table={table} />
    </Container>
  );
}

export default PipelineList;
