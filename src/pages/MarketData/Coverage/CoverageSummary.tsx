import { useState, useEffect, useMemo, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { navigateRowProps } from '../../../utils/navigation';
import {
  Container,
  Title,
  Card,
  Text,
  Group,
  Notification,
  ActionIcon,
  Tooltip,
  Paper,
  SimpleGrid,
} from '@mantine/core';
import { IconRefresh, IconDatabase, IconClock, IconFiles, IconServer } from '@tabler/icons-react';
import { MantineReactTable, useMantineReactTable, type MRT_ColumnDef } from 'mantine-react-table';
import { marketDataApi, registryApi } from '../../../utils/api';
import { StatValue } from '../../../components/StatValue';
import { CoverageSummaryResponse, StreamCoverageSummary } from '../../../types/coverage';
import { DenormalizedListing, Stream } from '../../../types';

// Helper function to format bytes to human-readable string
function formatBytes(bytes: number): string {
  if (bytes === 0) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return `${parseFloat((bytes / Math.pow(k, i)).toFixed(2))} ${sizes[i]}`;
}

// Helper function to format minutes to hours/days
function formatMinutes(minutes: number): string {
  if (minutes < 60) return `${minutes} min`;
  if (minutes < 1440) return `${(minutes / 60).toFixed(1)} hrs`;
  return `${(minutes / 1440).toFixed(1)} days`;
}

interface TableRow extends StreamCoverageSummary {
  listingId: number | null;
  securitySymbol: string;
  sourceName: string;
}

// The registry's /streams and /listings filters take id lists; batched to keep URLs short.
const ID_BATCH = 200;

function batches(ids: number[]): number[][] {
  const out: number[][] = [];
  for (let i = 0; i < ids.length; i += ID_BATCH) out.push(ids.slice(i, i + ID_BATCH));
  return out;
}

function CoverageSummary() {
  const navigate = useNavigate();
  const [data, setData] = useState<CoverageSummaryResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [streams, setStreams] = useState<Record<number, Stream>>({});
  const [listings, setListings] = useState<Record<number, DenormalizedListing>>({});
  const fetchedStreamIds = useRef<string>('');

  const loadData = async () => {
    try {
      setLoading(true);
      setError(null);
      const response = await marketDataApi.getCoverageSummary();
      setData(response);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load coverage data');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, []);

  // Each stream's registry row, then the listings the book streams carry, for names.
  useEffect(() => {
    if (!data?.streams) return;
    const streamIds = Object.values(data.streams).map(c => c.streamId);
    const key = [...streamIds].sort((a, b) => a - b).join(',');
    if (key === fetchedStreamIds.current) return;
    fetchedStreamIds.current = key;
    Promise.allSettled(batches(streamIds).map(ids => registryApi.listStreamsByIds(ids))).then(async results => {
      const byStream: Record<number, Stream> = {};
      results.forEach(r => { if (r.status === 'fulfilled') r.value.forEach(s => { byStream[s.streamId] = s; }); });
      setStreams(byStream);
      const listingIds = Object.values(byStream).flatMap(s => (s.listingId === null ? [] : [s.listingId]));
      const listingResults = await Promise.allSettled(batches(listingIds).map(ids => registryApi.listListingsByIds(ids)));
      const byListing: Record<number, DenormalizedListing> = {};
      listingResults.forEach(r => { if (r.status === 'fulfilled') r.value.forEach(l => { byListing[l.listingId] = l; }); });
      setListings(byListing);
    });
  }, [data]);

  const tableData = useMemo((): TableRow[] => {
    if (!data?.streams) return [];
    return Object.values(data.streams).map(coverage => {
      const stream = streams[coverage.streamId];
      const listing = stream?.listingId != null ? listings[stream.listingId] : undefined;
      return {
        ...coverage,
        listingId: stream?.listingId ?? null,
        securitySymbol: listing?.securitySymbol ?? stream?.nativeSubjectId ?? `Stream ${coverage.streamId}`,
        sourceName: listing?.exchangeName ?? stream?.sourceCode ?? '',
      };
    });
  }, [data, streams, listings]);

  const columns = useMemo<MRT_ColumnDef<TableRow>[]>(() => [
    { accessorKey: 'streamId', header: 'Stream', size: 90 },
    { accessorKey: 'securitySymbol', header: 'Subject', size: 160 },
    { accessorKey: 'sourceName', header: 'Source', size: 150 },
    {
      accessorKey: 'recordTypes',
      header: 'Record Types',
      size: 160,
      Cell: ({ cell }) => cell.getValue<string[]>().join(', '),
    },
    {
      accessorKey: 'fileCount',
      header: 'Files',
      size: 80,
      Cell: ({ cell }) => cell.getValue<number>().toLocaleString(),
    },
    {
      accessorKey: 'totalMinutes',
      header: 'Coverage',
      size: 100,
      Cell: ({ cell }) => formatMinutes(cell.getValue<number>()),
    },
    {
      accessorKey: 'totalSizeBytes',
      header: 'Size',
      size: 100,
      Cell: ({ cell }) => formatBytes(cell.getValue<number>()),
    },
    { accessorKey: 'earliestDate', header: 'Earliest', size: 110 },
    { accessorKey: 'latestDate', header: 'Latest', size: 110 },
  ], []);

  const table = useMantineReactTable({
    columns,
    data: tableData,
    enablePagination: true,
    enableBottomToolbar: true,
    enableTopToolbar: true,
    initialState: {
      density: 'xs',
      sorting: [{ id: 'totalSizeBytes', desc: true }],
    },
    state: { isLoading: loading },
    mantineTableBodyRowProps: ({ row }) => (
      navigateRowProps(navigate, `/market-data/coverage/${row.original.streamId}`)
    ),
  });

  return (
    <Container size="xl" py="xl">
      <Group justify="space-between" mb="md">
        <Title order={2}>Market Data Coverage</Title>
        <Tooltip label="Refresh" position="bottom" withArrow openDelay={500}>
          <ActionIcon size="lg" variant="filled" color="green" onClick={loadData} loading={loading}>
            <IconRefresh size={20} />
          </ActionIcon>
        </Tooltip>
      </Group>

      {error && (
        <Notification color="red" title="Error" onClose={() => setError(null)} mb="md">
          {error}
        </Notification>
      )}

      {data?.error && (
        <Notification color="orange" title="API Warning" mb="md" withCloseButton={false}>
          {data.error}
        </Notification>
      )}

      {(data || loading) && (
        <SimpleGrid cols={{ base: 1, sm: 2, lg: 4 }} mb="lg">
          <Paper withBorder p="md" radius="md">
            <Group justify="space-between">
              <div>
                <Text size="xs" c="dimmed" tt="uppercase" fw={700}>Total Files</Text>
                <StatValue value={data && data.totalFiles.toLocaleString()} />
              </div>
              <IconFiles size={32} stroke={1.5} color="var(--mantine-color-blue-6)" />
            </Group>
          </Paper>
          <Paper withBorder p="md" radius="md">
            <Group justify="space-between">
              <div>
                <Text size="xs" c="dimmed" tt="uppercase" fw={700}>Total Size</Text>
                <StatValue value={data && formatBytes(data.totalSizeBytes)} />
              </div>
              <IconDatabase size={32} stroke={1.5} color="var(--mantine-color-green-6)" />
            </Group>
          </Paper>
          <Paper withBorder p="md" radius="md">
            <Group justify="space-between">
              <div>
                <Text size="xs" c="dimmed" tt="uppercase" fw={700}>Total Minutes</Text>
                <StatValue value={data && formatMinutes(data.totalMinutes)} />
              </div>
              <IconClock size={32} stroke={1.5} color="var(--mantine-color-orange-6)" />
            </Group>
          </Paper>
          <Paper withBorder p="md" radius="md">
            <Group justify="space-between">
              <div>
                <Text size="xs" c="dimmed" tt="uppercase" fw={700}>Streams</Text>
                <StatValue value={data && data.streamCount} />
              </div>
              <IconServer size={32} stroke={1.5} color="var(--mantine-color-violet-6)" />
            </Group>
          </Paper>
        </SimpleGrid>
      )}

      <Card withBorder>
        <Title order={4} mb="md">Coverage by Stream</Title>
        <MantineReactTable table={table} />
      </Card>
    </Container>
  );
}

export default CoverageSummary;

