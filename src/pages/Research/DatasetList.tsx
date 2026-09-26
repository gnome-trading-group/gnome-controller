import { useState, useEffect, useCallback, useMemo } from 'react';
import { ActionIcon, Container, Group, TextInput, Title, Tooltip } from '@mantine/core';
import { IconRefresh } from '@tabler/icons-react';
import ReactTimeAgo from 'react-time-ago';
import { MantineReactTable, useMantineReactTable, type MRT_ColumnDef } from 'mantine-react-table';
import { ResearchDataset } from '../../types/research';
import { controllerApi } from '../../utils/api';

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function DatasetList() {
  const [datasets, setDatasets] = useState<ResearchDataset[]>([]);
  const [loading, setLoading] = useState(false);
  const [nameFilter, setNameFilter] = useState('');

  const refresh = useCallback(async () => {
    setLoading(true);
    try {
      const result = await controllerApi.listDatasets({
        name: nameFilter || undefined,
      });
      setDatasets(result.datasets);
    } finally {
      setLoading(false);
    }
  }, [nameFilter]);

  useEffect(() => { refresh(); }, [refresh]);

  const columns = useMemo<MRT_ColumnDef<ResearchDataset>[]>(() => [
    {
      accessorKey: 'datasetName',
      header: 'Name',
      size: 220,
      Cell: ({ row }) => (
        <span style={{ fontFamily: 'monospace', fontSize: '0.85rem' }}>{row.original.datasetName}</span>
      ),
    },
    {
      accessorKey: 'version',
      header: 'Ver',
      size: 60,
    },
    {
      accessorKey: 'rowCount',
      header: 'Rows',
      size: 90,
      Cell: ({ row }) =>
        row.original.rowCount != null
          ? row.original.rowCount.toLocaleString()
          : <span style={{ color: 'var(--mantine-color-dimmed)' }}>—</span>,
    },
    {
      accessorKey: 'sizeBytes',
      header: 'Size',
      size: 90,
      Cell: ({ row }) => formatBytes(row.original.sizeBytes),
    },
    {
      accessorKey: 'columns',
      header: 'Columns',
      size: 200,
      Cell: ({ row }) => {
        const cols = row.original.columns;
        if (!cols?.length) return <span style={{ color: 'var(--mantine-color-dimmed)' }}>—</span>;
        const display = cols.slice(0, 4).join(', ');
        const extra = cols.length > 4 ? ` +${cols.length - 4}` : '';
        return (
          <span style={{ fontFamily: 'monospace', fontSize: '0.8rem' }}>
            {display}{extra && <span style={{ color: 'var(--mantine-color-dimmed)' }}>{extra}</span>}
          </span>
        );
      },
    },
    {
      accessorKey: 'producingSession',
      header: 'Session',
      size: 160,
      Cell: ({ row }) => (
        <span style={{ fontFamily: 'monospace', fontSize: '0.85rem', color: 'var(--mantine-color-dimmed)' }}>
          {row.original.producingSession || '—'}
        </span>
      ),
    },
    {
      accessorKey: 'description',
      header: 'Description',
      size: 220,
      Cell: ({ row }) => row.original.description || <span style={{ color: 'var(--mantine-color-dimmed)' }}>—</span>,
    },
    {
      accessorKey: 'createdAt',
      header: 'Created',
      size: 120,
      Cell: ({ row }) =>
        row.original.createdAt
          ? <ReactTimeAgo date={new Date(row.original.createdAt)} timeStyle="round" />
          : '—',
    },
  ], []);

  const table = useMantineReactTable({
    columns,
    data: datasets,
    state: { isLoading: loading },
    enableColumnFilters: true,
    enableSorting: true,
    enablePagination: true,
    enableBottomToolbar: true,
    enableTopToolbar: false,
    mantineTableProps: { striped: true, highlightOnHover: true, withColumnBorders: true },
    initialState: { sorting: [{ id: 'createdAt', desc: true }], density: 'xs' },
  });

  return (
    <Container size="xl" py="xl">
      <Group justify="space-between" mb="md">
        <Title order={2}>Datasets</Title>
        <Group>
          <TextInput
            size="sm"
            placeholder="Name filter"
            value={nameFilter}
            onChange={(e) => setNameFilter(e.currentTarget.value)}
            w={200}
          />
          <Tooltip label="Refresh" position="bottom" withArrow openDelay={500}>
            <ActionIcon size="lg" variant="filled" color="teal" onClick={refresh} loading={loading}>
              <IconRefresh size={20} />
            </ActionIcon>
          </Tooltip>
        </Group>
      </Group>

      <MantineReactTable table={table} />
    </Container>
  );
}

export default DatasetList;
