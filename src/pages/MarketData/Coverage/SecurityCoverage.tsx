import { useState, useEffect, useMemo } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
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
  Breadcrumbs,
  Anchor,
  Paper,
  SimpleGrid,
} from '@mantine/core';
import { IconRefresh, IconDatabase, IconClock, IconCalendar, IconArrowLeft } from '@tabler/icons-react';
import { MantineReactTable, useMantineReactTable, type MRT_ColumnDef } from 'mantine-react-table';
import { marketDataApi } from '../../../utils/api';
import { useGlobalState } from '../../../context/GlobalStateContext';
import { SecurityCoverageResponse, ExchangeCoverage } from '../../../types/coverage';

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

interface TableRow extends ExchangeCoverage {
  exchangeName: string;
}

function SecurityCoverage() {
  const { securityId } = useParams<{ securityId: string }>();
  const navigate = useNavigate();
  const { securities, exchanges } = useGlobalState();
  const [data, setData] = useState<SecurityCoverageResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const security = securities.find(s => s.securityId === Number(securityId));

  const loadData = async () => {
    if (!securityId) return;
    try {
      setLoading(true);
      setError(null);
      const response = await marketDataApi.getSecurityCoverage(Number(securityId));
      setData(response);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load coverage data');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, [securityId]);

  const tableData = useMemo((): TableRow[] => {
    if (!data?.exchanges) return [];
    return Object.entries(data.exchanges).map(([, coverage]) => {
      const exchange = exchanges.find(e => e.exchangeId === coverage.exchangeId);
      return {
        ...coverage,
        exchangeName: exchange?.exchangeName || `Exchange ${coverage.exchangeId}`,
      };
    });
  }, [data, exchanges]);

  const columns = useMemo<MRT_ColumnDef<TableRow>[]>(() => [
    { accessorKey: 'exchangeName', header: 'Exchange', size: 180 },
    { 
      accessorKey: 'totalDays', 
      header: 'Days', 
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
    { accessorKey: 'earliestDate', header: 'Earliest Date', size: 120 },
    { accessorKey: 'latestDate', header: 'Latest Date', size: 120 },
  ], []);

  const table = useMantineReactTable({
    columns,
    data: tableData,
    enablePagination: false,
    enableBottomToolbar: false,
    enableTopToolbar: true,
    initialState: { density: 'xs', sorting: [{ id: 'totalSizeBytes', desc: true }] },
    state: { isLoading: loading },
    mantineTableBodyRowProps: ({ row }) => ({
      onClick: () => navigate(`/market-data/coverage/${securityId}/${row.original.exchangeId}`),
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
              <Title order={3} c="dimmed">Loading Security Coverage</Title>
              <Text size="sm" c="dimmed">Fetching coverage for {security?.symbol || securityId}...</Text>
            </Stack>
          </Stack>
        </Center>
      </Container>
    );
  }

  const breadcrumbItems = [
    { title: 'Coverage', href: '/market-data/coverage' },
    { title: security?.symbol || `Security ${securityId}`, href: '#' },
  ];

  return (
    <Container size="xl" py="xl">
      <Breadcrumbs mb="md">
        {breadcrumbItems.map((item, index) => (
          <Anchor
            key={index}
            onClick={(e) => {
              e.preventDefault();
              if (item.href !== '#') navigate(item.href);
            }}
            style={{ cursor: item.href === '#' ? 'default' : 'pointer' }}
          >
            {item.title}
          </Anchor>
        ))}
      </Breadcrumbs>

      <Group justify="space-between" mb="md">
        <Group>
          <ActionIcon variant="subtle" onClick={() => navigate('/market-data/coverage')}>
            <IconArrowLeft size={20} />
          </ActionIcon>
          <Title order={2}>{security?.symbol || `Security ${securityId}`} - Coverage</Title>
        </Group>
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

      {data?.summary && (
        <SimpleGrid cols={{ base: 1, sm: 2, lg: 4 }} mb="lg">
          <Paper withBorder p="md" radius="md">
            <Group justify="space-between">
              <div>
                <Text size="xs" c="dimmed" tt="uppercase" fw={700}>Exchanges</Text>
                <Text size="xl" fw={700}>{data.summary.totalExchanges}</Text>
              </div>
              <IconDatabase size={32} stroke={1.5} color="var(--mantine-color-blue-6)" />
            </Group>
          </Paper>
          <Paper withBorder p="md" radius="md">
            <Group justify="space-between">
              <div>
                <Text size="xs" c="dimmed" tt="uppercase" fw={700}>Total Days</Text>
                <Text size="xl" fw={700}>{data.summary.totalDays.toLocaleString()}</Text>
              </div>
              <IconCalendar size={32} stroke={1.5} color="var(--mantine-color-green-6)" />
            </Group>
          </Paper>
          <Paper withBorder p="md" radius="md">
            <Group justify="space-between">
              <div>
                <Text size="xs" c="dimmed" tt="uppercase" fw={700}>Total Coverage</Text>
                <Text size="xl" fw={700}>{formatMinutes(data.summary.totalMinutes)}</Text>
              </div>
              <IconClock size={32} stroke={1.5} color="var(--mantine-color-orange-6)" />
            </Group>
          </Paper>
          <Paper withBorder p="md" radius="md">
            <Group justify="space-between">
              <div>
                <Text size="xs" c="dimmed" tt="uppercase" fw={700}>Total Size</Text>
                <Text size="xl" fw={700}>{formatBytes(data.summary.totalSizeBytes)}</Text>
              </div>
              <IconDatabase size={32} stroke={1.5} color="var(--mantine-color-violet-6)" />
            </Group>
          </Paper>
        </SimpleGrid>
      )}

      <Card withBorder>
        <Title order={4} mb="md">Coverage by Exchange</Title>
        <Text size="sm" c="dimmed" mb="md">Click on an exchange to view detailed day-by-day coverage</Text>
        <MantineReactTable table={table} />
      </Card>
    </Container>
  );
}

export default SecurityCoverage;

