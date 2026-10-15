import { useCallback, useEffect, useMemo, useState } from 'react';
import { ActionIcon, Alert, Code, Container, Group, Text, Title, Tooltip } from '@mantine/core';
import { IconRefresh } from '@tabler/icons-react';
import ReactTimeAgo from 'react-time-ago';
import { MantineReactTable, useMantineReactTable, type MRT_ColumnDef } from 'mantine-react-table';
import { useNavigate } from 'react-router-dom';
import { Dataset } from '../../types/data';
import { controllerApi } from '../../utils/api';
import { errorMessage } from '../../utils/kill-switch';
import { RunLink } from '../Pipelines/RunBits';

// Append-only Iceberg tables written by gnome-pipelines; research reads them through gnomepy.data.
function DatasetList() {
  const navigate = useNavigate();
  const [datasets, setDatasets] = useState<Dataset[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    setLoading(true);
    try {
      const result = await controllerApi.listDatasets();
      setDatasets(result.datasets);
      setError(null);
    } catch (e) {
      setError(errorMessage(e, 'Failed to load datasets'));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { refresh(); }, [refresh]);

  const columns = useMemo<MRT_ColumnDef<Dataset>[]>(() => [
    {
      accessorKey: 'name',
      header: 'Dataset',
      size: 240,
      Cell: ({ row }) => (
        <span
          style={{ fontFamily: 'monospace', fontSize: '0.85rem', cursor: 'pointer', color: 'var(--mantine-color-blue-4)' }}
          onClick={() => navigate(`/research/datasets/${row.original.name}`)}
        >
          {row.original.name}
        </span>
      ),
    },
    { id: 'key', header: 'Key', size: 200, accessorFn: d => d.key.join(', '), Cell: ({ cell }) => <Code>{cell.getValue<string>()}</Code> },
    {
      accessorKey: 'storedRows',
      header: 'Stored rows',
      size: 110,
      Cell: ({ row }) => row.original.storedRows.toLocaleString(),
    },
    { accessorKey: 'publishes', header: 'Publishes', size: 90 },
    {
      id: 'lastPublish',
      header: 'Last publish',
      size: 120,
      accessorFn: d => d.lastPublish?.at ?? '',
      Cell: ({ row }) => row.original.lastPublish
        ? <ReactTimeAgo date={new Date(row.original.lastPublish.at)} timeStyle="round" />
        : '—',
    },
    {
      id: 'lastRun',
      header: 'Written by',
      size: 260,
      Cell: ({ row }) => <RunLink runId={row.original.lastPublish?.runId} />,
    },
  ], [navigate]);

  const table = useMantineReactTable({
    columns,
    data: datasets,
    state: { isLoading: loading },
    enablePagination: false,
    enableBottomToolbar: false,
    initialState: { density: 'xs', showGlobalFilter: true, sorting: [{ id: 'name', desc: false }] },
    mantineTableProps: { striped: true, highlightOnHover: true, withColumnBorders: true },
  });

  return (
    <Container size="xl" py="xl">
      <Group mb="md">
        <Title order={2} style={{ flex: 1 }}>Datasets</Title>
        <Tooltip label="Refresh" withArrow openDelay={500}>
          <ActionIcon size="lg" variant="filled" color="green" onClick={refresh} loading={loading}>
            <IconRefresh size={20} />
          </ActionIcon>
        </Tooltip>
      </Group>
      <Text size="sm" c="dimmed" mb="md">
        Stored rows count every row ever appended, corrections included; a load returns the newest row per key.
      </Text>
      {error && <Alert color="red" mb="md">{error}</Alert>}
      <MantineReactTable table={table} />
    </Container>
  );
}

export default DatasetList;
