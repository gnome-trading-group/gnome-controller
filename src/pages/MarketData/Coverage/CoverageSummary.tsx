import { useState, useEffect, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Container,
  Title,
  Card,
  Text,
  Group,
  Stack,
  Notification,
  Center,
  Loader,
  ActionIcon,
  Tooltip,
  Paper,
  SimpleGrid,
} from '@mantine/core';
import { IconRefresh, IconDatabase, IconClock, IconFiles, IconServer } from '@tabler/icons-react';
import { MantineReactTable, useMantineReactTable, type MRT_ColumnDef } from 'mantine-react-table';
import { marketDataApi } from '../../../utils/api';
import { useGlobalState } from '../../../context/GlobalStateContext';
import { CoverageSummaryResponse, SecurityExchangeCoverageSummary } from '../../../types/coverage';

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

interface TableRow extends SecurityExchangeCoverageSummary {
  key: string;
  securitySymbol: string;
  exchangeName: string;
}

function CoverageSummary() {
  const navigate = useNavigate();
  const { securities, exchanges } = useGlobalState();
  const [data, setData] = useState<CoverageSummaryResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

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

  const tableData = useMemo((): TableRow[] => {
    if (!data?.securities) return [];
    return Object.entries(data.securities).map(([key, coverage]) => {
      const security = securities.find(s => s.securityId === coverage.securityId);
      const exchange = exchanges.find(e => e.exchangeId === coverage.exchangeId);
      return {
        ...coverage,
        key,
        securitySymbol: security?.symbol || `Security ${coverage.securityId}`,
        exchangeName: exchange?.exchangeName || `Exchange ${coverage.exchangeId}`,
      };
    });
  }, [data, securities, exchanges]);

  const columns = useMemo<MRT_ColumnDef<TableRow>[]>(() => [
    { accessorKey: 'securitySymbol', header: 'Security', size: 120 },
    { accessorKey: 'exchangeName', header: 'Exchange', size: 150 },
    {
      accessorKey: 'fileCount',
      header: 'Files',
      size: 80,
      Cell: ({ cell }) => cell.getValue<number>().toLocaleString(),
    },
    {
      accessorKey: 'minuteCount',
      header: 'Coverage',
      size: 100,
      Cell: ({ cell }) => formatMinutes(cell.getValue<number>()),
    },
    {
      accessorKey: 'sizeBytes',
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
      sorting: [{ id: 'sizeBytes', desc: true }],
    },
    state: { isLoading: loading },
    mantineTableBodyRowProps: ({ row }) => ({
      onClick: () => navigate(`/market-data/coverage/${row.original.securityId}`),
      style: { cursor: 'pointer' },
    }),
  });

  if (loading && !data) {
    return (
      <Container size="xl" py="xl">
        <Center style={{ minHeight: '60vh' }}>
          <Stack align="center" gap="xl">
            <Loader size="xl" color="green" />
            <Stack align="center" gap="xs">
              <Title order={3} c="dimmed">Loading Coverage Data</Title>
              <Text size="sm" c="dimmed">Fetching coverage statistics...</Text>
            </Stack>
          </Stack>
        </Center>
      </Container>
    );
  }

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

      {data && (
        <SimpleGrid cols={{ base: 1, sm: 2, lg: 4 }} mb="lg">
          <Paper withBorder p="md" radius="md">
            <Group justify="space-between">
              <div>
                <Text size="xs" c="dimmed" tt="uppercase" fw={700}>Total Files</Text>
                <Text size="xl" fw={700}>{data.totalFiles.toLocaleString()}</Text>
              </div>
              <IconFiles size={32} stroke={1.5} color="var(--mantine-color-blue-6)" />
            </Group>
          </Paper>
          <Paper withBorder p="md" radius="md">
            <Group justify="space-between">
              <div>
                <Text size="xs" c="dimmed" tt="uppercase" fw={700}>Total Size</Text>
                <Text size="xl" fw={700}>{formatBytes(data.totalSizeBytes)}</Text>
              </div>
              <IconDatabase size={32} stroke={1.5} color="var(--mantine-color-green-6)" />
            </Group>
          </Paper>
          <Paper withBorder p="md" radius="md">
            <Group justify="space-between">
              <div>
                <Text size="xs" c="dimmed" tt="uppercase" fw={700}>Total Minutes</Text>
                <Text size="xl" fw={700}>{formatMinutes(data.totalMinutes)}</Text>
              </div>
              <IconClock size={32} stroke={1.5} color="var(--mantine-color-orange-6)" />
            </Group>
          </Paper>
          <Paper withBorder p="md" radius="md">
            <Group justify="space-between">
              <div>
                <Text size="xs" c="dimmed" tt="uppercase" fw={700}>Security/Exchange Pairs</Text>
                <Text size="xl" fw={700}>{data.securityExchangeCount}</Text>
              </div>
              <IconServer size={32} stroke={1.5} color="var(--mantine-color-violet-6)" />
            </Group>
          </Paper>
        </SimpleGrid>
      )}

      <Card withBorder>
        <Title order={4} mb="md">Coverage by Security & Exchange</Title>
        <MantineReactTable table={table} />
      </Card>
    </Container>
  );
}

export default CoverageSummary;

