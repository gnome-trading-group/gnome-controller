import { useCallback, useEffect, useMemo, useState } from 'react';
import { ActionIcon, Alert, Anchor, Badge, Container, Group, Text, Title, Tooltip } from '@mantine/core';
import { IconRefresh } from '@tabler/icons-react';
import ReactTimeAgo from 'react-time-ago';
import { MantineReactTable, useMantineReactTable, type MRT_ColumnDef } from 'mantine-react-table';
import { Link } from 'react-router-dom';
import { ArtifactSummary } from '../../types/data';
import { controllerApi } from '../../utils/api';
import { errorMessage } from '../../utils/kill-switch';

// Versioned files (models and the like) indexed in Iceberg; strategies reference them as artifact://type/name.
function ArtifactList() {
  const [artifacts, setArtifacts] = useState<ArtifactSummary[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    setLoading(true);
    try {
      const result = await controllerApi.listArtifacts();
      setArtifacts(result.artifacts);
      setError(null);
    } catch (e) {
      setError(errorMessage(e, 'Failed to load artifacts'));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { refresh(); }, [refresh]);

  const columns = useMemo<MRT_ColumnDef<ArtifactSummary>[]>(() => [
    { accessorKey: 'artifactType', header: 'Type', size: 140 },
    {
      accessorKey: 'name',
      header: 'Name',
      size: 240,
      Cell: ({ row }) => (
        <Anchor component={Link} to={`/research/artifacts/${row.original.artifactType}/${row.original.name}`} size="sm" ff="monospace">
          {row.original.name}
        </Anchor>
      ),
    },
    { accessorKey: 'versions', header: 'Versions', size: 90 },
    {
      accessorKey: 'latestVersion',
      header: 'Latest',
      size: 200,
      Cell: ({ row }) => (
        <Group gap={6}>
          <Text size="xs" ff="monospace">{row.original.latestVersion}</Text>
          <Text size="xs" c="dimmed"><ReactTimeAgo date={new Date(row.original.latestCreatedAt)} timeStyle="round" /></Text>
        </Group>
      ),
    },
    {
      id: 'aliases',
      header: 'Aliases',
      size: 160,
      Cell: ({ row }) => (
        <Group gap={4}>
          {Object.keys(row.original.aliases).map(a => <Badge key={a} size="xs" variant="light">{a}</Badge>)}
        </Group>
      ),
    },
    { accessorKey: 'description', header: 'Description', size: 300 },
  ], []);

  const table = useMantineReactTable({
    columns,
    data: artifacts,
    state: { isLoading: loading },
    enablePagination: false,
    enableBottomToolbar: false,
    initialState: { density: 'xs', showGlobalFilter: true },
    mantineTableProps: { striped: true, highlightOnHover: true, withColumnBorders: true },
  });

  return (
    <Container size="xl" py="xl">
      <Group mb="md">
        <Title order={2} style={{ flex: 1 }}>Artifacts</Title>
        <Tooltip label="Refresh" withArrow openDelay={500}>
          <ActionIcon size="lg" variant="filled" color="green" onClick={refresh} loading={loading}>
            <IconRefresh size={20} />
          </ActionIcon>
        </Tooltip>
      </Group>
      {error && <Alert color="red" mb="md">{error}</Alert>}
      <MantineReactTable table={table} />
    </Container>
  );
}

export default ArtifactList;
