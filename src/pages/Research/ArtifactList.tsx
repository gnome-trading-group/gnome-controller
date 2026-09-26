import { useState, useEffect, useCallback, useMemo } from 'react';
import { ActionIcon, Badge, Container, Group, TextInput, Title, Tooltip } from '@mantine/core';
import { IconRefresh } from '@tabler/icons-react';
import ReactTimeAgo from 'react-time-ago';
import { MantineReactTable, useMantineReactTable, type MRT_ColumnDef } from 'mantine-react-table';
import { ResearchArtifact } from '../../types/research';
import { controllerApi } from '../../utils/api';

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function ArtifactList() {
  const [artifacts, setArtifacts] = useState<ResearchArtifact[]>([]);
  const [loading, setLoading] = useState(false);
  const [typeFilter, setTypeFilter] = useState('');
  const [nameFilter, setNameFilter] = useState('');

  const refresh = useCallback(async () => {
    setLoading(true);
    try {
      const result = await controllerApi.listArtifacts({
        type: typeFilter || undefined,
        name: nameFilter || undefined,
      });
      setArtifacts(result.artifacts);
    } finally {
      setLoading(false);
    }
  }, [typeFilter, nameFilter]);

  useEffect(() => { refresh(); }, [refresh]);

  const columns = useMemo<MRT_ColumnDef<ResearchArtifact>[]>(() => [
    {
      accessorKey: 'artifactType',
      header: 'Type',
      size: 160,
      Cell: ({ row }) => (
        <Badge variant="light" color="violet">{row.original.artifactType}</Badge>
      ),
    },
    {
      accessorKey: 'artifactName',
      header: 'Name',
      size: 180,
      Cell: ({ row }) => (
        <span style={{ fontFamily: 'monospace', fontSize: '0.85rem' }}>{row.original.artifactName}</span>
      ),
    },
    {
      accessorKey: 'version',
      header: 'Ver',
      size: 60,
    },
    {
      accessorKey: 'fileFormat',
      header: 'Format',
      size: 80,
      Cell: ({ row }) => (
        <Badge variant="outline" color="gray" size="sm">{row.original.fileFormat}</Badge>
      ),
    },
    {
      accessorKey: 'sizeBytes',
      header: 'Size',
      size: 90,
      Cell: ({ row }) => formatBytes(row.original.sizeBytes),
    },
    {
      accessorKey: 'sessionName',
      header: 'Session',
      size: 160,
      Cell: ({ row }) => (
        <span style={{ fontFamily: 'monospace', fontSize: '0.85rem', color: 'var(--mantine-color-dimmed)' }}>
          {row.original.sessionName === '__global__' ? '—' : row.original.sessionName}
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
    data: artifacts,
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
        <Title order={2}>Artifacts</Title>
        <Group>
          <TextInput
            size="sm"
            placeholder="Type filter"
            value={typeFilter}
            onChange={(e) => setTypeFilter(e.currentTarget.value)}
            w={160}
          />
          <TextInput
            size="sm"
            placeholder="Name filter"
            value={nameFilter}
            onChange={(e) => setNameFilter(e.currentTarget.value)}
            w={160}
          />
          <Tooltip label="Refresh" position="bottom" withArrow openDelay={500}>
            <ActionIcon size="lg" variant="filled" color="violet" onClick={refresh} loading={loading}>
              <IconRefresh size={20} />
            </ActionIcon>
          </Tooltip>
        </Group>
      </Group>

      <MantineReactTable table={table} />
    </Container>
  );
}

export default ArtifactList;
