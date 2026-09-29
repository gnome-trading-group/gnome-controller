import { useCallback, useEffect, useMemo, useState } from 'react';
import { ActionIcon, Box, Container, Group, SimpleGrid, Text, TextInput, Title, Tooltip } from '@mantine/core';
import { IconRefresh } from '@tabler/icons-react';
import ReactTimeAgo from 'react-time-ago';
import { MantineReactTable, useMantineReactTable, type MRT_ColumnDef } from 'mantine-react-table';
import { ResearchDataset } from '../../types/research';
import { controllerApi } from '../../utils/api';

function formatBytes(bytes: number | undefined): string {
  if (bytes == null || isNaN(bytes)) return '—';
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

interface GroupedDataset {
  datasetName: string;
  latest: ResearchDataset;
  versions: ResearchDataset[];
}

function groupDatasets(datasets: ResearchDataset[]): GroupedDataset[] {
  const map = new Map<string, ResearchDataset[]>();
  for (const d of datasets) {
    const list = map.get(d.datasetName) ?? [];
    list.push(d);
    map.set(d.datasetName, list);
  }
  return Array.from(map.entries()).map(([datasetName, versions]) => {
    const sorted = [...versions].sort((a, b) => b.version - a.version);
    return { datasetName, latest: sorted[0], versions: sorted };
  });
}

const VERSION_COLUMNS: MRT_ColumnDef<ResearchDataset>[] = [
  { accessorKey: 'version', header: 'Ver', size: 60 },
  {
    id: 'rowCount', header: 'Rows', size: 90,
    Cell: ({ row }) => row.original.rowCount != null ? row.original.rowCount.toLocaleString() : '—',
  },
  {
    id: 'sizeBytes', header: 'Size', size: 90,
    Cell: ({ row }) => formatBytes(row.original.sizeBytes),
  },
  {
    id: 'createdAt', header: 'Created', size: 120,
    Cell: ({ row }) => row.original.createdAt
      ? <ReactTimeAgo date={new Date(row.original.createdAt)} timeStyle="round" />
      : '—',
  },
];

function VersionsDetailPanel({ versions, columns, columnTypes }: {
  versions: ResearchDataset[];
  columns: string[];
  columnTypes: Record<string, string>;
}) {
  const table = useMantineReactTable({
    columns: VERSION_COLUMNS,
    data: versions,
    enableTopToolbar: false,
    enableBottomToolbar: false,
    enablePagination: false,
    enableColumnFilters: false,
    enableSorting: false,
    mantineTableProps: { withColumnBorders: true, withTableBorder: true },
    initialState: { density: 'xs' },
  });

  return (
    <Box p="sm">
      <Text size="xs" fw={600} c="dimmed" mb={6}>VERSIONS</Text>
      <MantineReactTable table={table} />
      {columns.length > 0 && (
        <>
          <Text size="xs" fw={600} c="dimmed" mt="md" mb={6}>
            COLUMNS ({columns.length})
          </Text>
          <SimpleGrid cols={4} spacing={4}>
            {columns.map((col) => (
              <Text key={col} size="xs" style={{ fontFamily: 'monospace' }}>
                {col}
                {columnTypes[col] && (
                  <Text span size="xs" c="dimmed"> : {columnTypes[col]}</Text>
                )}
              </Text>
            ))}
          </SimpleGrid>
        </>
      )}
    </Box>
  );
}

function DatasetList() {
  const [datasets, setDatasets] = useState<ResearchDataset[]>([]);
  const [loading, setLoading] = useState(false);
  const [nameFilter, setNameFilter] = useState('');

  const refresh = useCallback(async () => {
    setLoading(true);
    try {
      const result = await controllerApi.listDatasets({ name: nameFilter || undefined });
      setDatasets(result.datasets);
    } finally {
      setLoading(false);
    }
  }, [nameFilter]);

  useEffect(() => { refresh(); }, [refresh]);

  const grouped = useMemo(() => groupDatasets(datasets), [datasets]);

  const columns = useMemo<MRT_ColumnDef<GroupedDataset>[]>(() => [
    {
      accessorKey: 'datasetName',
      header: 'Name',
      size: 220,
      Cell: ({ row }) => (
        <span style={{ fontFamily: 'monospace', fontSize: '0.85rem' }}>{row.original.datasetName}</span>
      ),
    },
    {
      id: 'rowCount',
      header: 'Rows',
      size: 90,
      Cell: ({ row }) =>
        row.original.latest.rowCount != null
          ? row.original.latest.rowCount.toLocaleString()
          : <span style={{ color: 'var(--mantine-color-dimmed)' }}>—</span>,
    },
    {
      id: 'sizeBytes',
      header: 'Size',
      size: 90,
      Cell: ({ row }) => formatBytes(row.original.latest.sizeBytes),
    },
    {
      id: 'versions',
      header: 'Versions',
      size: 80,
      Cell: ({ row }) => row.original.versions.length,
    },
    {
      id: 'columns',
      header: 'Columns',
      size: 200,
      Cell: ({ row }) => {
        const cols = row.original.latest.columns;
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
      id: 'producingSession',
      header: 'Session',
      size: 160,
      Cell: ({ row }) => (
        <span style={{ fontFamily: 'monospace', fontSize: '0.85rem', color: 'var(--mantine-color-dimmed)' }}>
          {row.original.latest.producingSession || '—'}
        </span>
      ),
    },
    {
      id: 'description',
      header: 'Description',
      size: 220,
      Cell: ({ row }) => row.original.latest.description || <span style={{ color: 'var(--mantine-color-dimmed)' }}>—</span>,
    },
    {
      id: 'createdAt',
      header: 'Latest',
      size: 120,
      Cell: ({ row }) =>
        row.original.latest.createdAt
          ? <ReactTimeAgo date={new Date(row.original.latest.createdAt)} timeStyle="round" />
          : '—',
    },
  ], []);

  const table = useMantineReactTable({
    columns,
    data: grouped,
    getRowId: (row) => row.datasetName,
    state: { isLoading: loading },
    enableColumnFilters: false,
    enableSorting: true,
    enablePagination: true,
    enableBottomToolbar: true,
    enableTopToolbar: false,
    enableExpanding: true,
    mantineTableProps: { striped: true, highlightOnHover: true, withColumnBorders: true },
    initialState: { density: 'xs', pagination: { pageSize: 20, pageIndex: 0 } },
    renderDetailPanel: ({ row }) => (
      <VersionsDetailPanel
        versions={row.original.versions}
        columns={row.original.latest.columns ?? []}
        columnTypes={row.original.latest.columnTypes ?? {}}
      />
    ),
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
            <ActionIcon size="lg" variant="filled" color="green" onClick={refresh} loading={loading}>
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
