import { useCallback, useEffect, useMemo, useState } from 'react';
import { ActionIcon, Alert, Anchor, Badge, Code, Container, Group, Stack, Table, Text, Title, Tooltip } from '@mantine/core';
import { IconArrowLeft, IconDownload } from '@tabler/icons-react';
import ReactTimeAgo from 'react-time-ago';
import { MantineReactTable, useMantineReactTable, type MRT_ColumnDef, type MRT_Row } from 'mantine-react-table';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { ArtifactDetail as Detail, ArtifactVersion } from '../../../types/data';
import { controllerApi } from '../../../utils/api';
import { errorMessage } from '../../../utils/kill-switch';
import { RunLink } from '../Pipelines/RunBits';

function size(bytes: number | null): string {
  if (bytes === null) return '—';
  return bytes < 1_048_576 ? `${(bytes / 1024).toFixed(0)} KB` : `${(bytes / 1_048_576).toFixed(1)} MB`;
}

function ArtifactDetail() {
  const navigate = useNavigate();
  const { artifactType, name } = useParams<{ artifactType: string; name: string }>();
  const [artifact, setArtifact] = useState<Detail | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!artifactType || !name) return;
    setLoading(true);
    try {
      setArtifact(await controllerApi.getArtifact(artifactType, name));
      setError(null);
    } catch (e) {
      setError(errorMessage(e, 'Failed to load the artifact'));
    } finally {
      setLoading(false);
    }
  }, [artifactType, name]);

  useEffect(() => { load(); }, [load]);

  const download = useCallback(async (version: string) => {
    if (!artifactType || !name) return;
    try {
      const { url } = await controllerApi.getArtifactDownload(artifactType, name, version);
      window.open(url, '_blank', 'noopener');
    } catch (e) {
      setError(errorMessage(e, 'Failed to get a download link'));
    }
  }, [artifactType, name]);

  const aliasesOf = useMemo(() => {
    const byVersion: Record<string, string[]> = {};
    Object.entries(artifact?.aliases ?? {}).forEach(([alias, version]) => { (byVersion[version] ??= []).push(alias); });
    return byVersion;
  }, [artifact]);

  const columns = useMemo<MRT_ColumnDef<ArtifactVersion>[]>(() => [
    {
      accessorKey: 'version',
      header: 'Version',
      size: 220,
      Cell: ({ row }) => (
        <Group gap={6}>
          <Text size="xs" ff="monospace">{row.original.version}</Text>
          {(aliasesOf[row.original.version] ?? []).map(a => <Badge key={a} size="xs" variant="light">{a}</Badge>)}
        </Group>
      ),
    },
    {
      accessorKey: 'createdAt',
      header: 'Created',
      size: 110,
      Cell: ({ row }) => <ReactTimeAgo date={new Date(row.original.createdAt)} timeStyle="round" />,
    },
    { accessorKey: 'description', header: 'Description', size: 280 },
    { accessorKey: 'sizeBytes', header: 'Size', size: 80, Cell: ({ row }) => size(row.original.sizeBytes) },
    { accessorKey: 'runId', header: 'Run', size: 240, Cell: ({ row }) => <RunLink runId={row.original.runId} /> },
    {
      id: 'download',
      header: '',
      size: 50,
      Cell: ({ row }) => (
        <Tooltip label="Download" withArrow>
          <ActionIcon size="sm" variant="subtle" onClick={() => download(row.original.version)}><IconDownload size={16} /></ActionIcon>
        </Tooltip>
      ),
    },
  ], [aliasesOf, download]);

  const table = useMantineReactTable({
    columns,
    data: artifact?.versions ?? [],
    getRowId: v => v.version,
    state: { isLoading: loading },
    enableColumnFilters: false,
    enablePagination: false,
    enableBottomToolbar: false,
    enableTopToolbar: false,
    initialState: { density: 'xs' },
    mantineTableProps: { striped: true, highlightOnHover: true, withColumnBorders: true },
    renderDetailPanel: ({ row }: { row: MRT_Row<ArtifactVersion> }) => {
      // The table also renders panels for its loading placeholder rows, which carry none of these fields.
      const inputs = row.original.inputs ?? [];
      return (
      <Stack p="md" gap="xs" style={{ maxWidth: 900 }}>
        <Text size="xs" c="dimmed">
          Reference: <Code>{`artifact://${artifactType}/${name}:${row.original.version}`}</Code>
        </Text>
        {row.original.params && (
          <><Text size="xs" fw={600} c="dimmed" tt="uppercase">Params</Text>
            <Code block style={{ fontSize: '0.72rem' }}>{JSON.stringify(row.original.params, null, 2)}</Code></>
        )}
        {row.original.metrics && (
          <><Text size="xs" fw={600} c="dimmed" tt="uppercase">Metrics</Text>
            <Code block style={{ fontSize: '0.72rem' }}>{JSON.stringify(row.original.metrics, null, 2)}</Code></>
        )}
        <Text size="xs" fw={600} c="dimmed" tt="uppercase">Trained on</Text>
        {inputs.length === 0 ? (
          <Text size="xs" c="dimmed">No inputs recorded.</Text>
        ) : (
          <Table withTableBorder verticalSpacing={2} style={{ fontSize: '0.75rem' }}>
            <Table.Thead>
              <Table.Tr><Table.Th>Dataset</Table.Th><Table.Th>As of</Table.Th><Table.Th>Rows</Table.Th><Table.Th>Rows hash</Table.Th></Table.Tr>
            </Table.Thead>
            <Table.Tbody>
              {inputs.map(i => (
                <Table.Tr key={i.dataset}>
                  <Table.Td><Anchor component={Link} to={`/data/datasets/${i.dataset}`} size="xs">{i.dataset}</Anchor></Table.Td>
                  <Table.Td>{new Date(i.asOf).toLocaleString()}</Table.Td>
                  <Table.Td>{i.rowCount.toLocaleString()}</Table.Td>
                  <Table.Td ff="monospace">{i.rowsHash.slice(0, 12)}</Table.Td>
                </Table.Tr>
              ))}
            </Table.Tbody>
          </Table>
        )}
      </Stack>
      );
    },
  });

  return (
    <Container size="xl" py="xl">
      <Group mb="md">
        <ActionIcon variant="subtle" onClick={() => navigate('/data/artifacts')}><IconArrowLeft size={18} /></ActionIcon>
        <Title order={2} style={{ flex: 1 }}>
          <Text span c="dimmed" inherit>{artifactType}/</Text><Text span ff="monospace" inherit>{name}</Text>
        </Title>
      </Group>
      {error && <Alert color="red" mb="md">{error}</Alert>}
      <MantineReactTable table={table} />
    </Container>
  );
}

export default ArtifactDetail;
