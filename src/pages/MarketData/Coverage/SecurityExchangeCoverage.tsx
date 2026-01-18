import React, { useState, useEffect, useMemo } from 'react';
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
  Badge,
  ScrollArea,
  Box,
  Tabs,
} from '@mantine/core';
import { IconRefresh, IconDatabase, IconClock, IconCalendar, IconArrowLeft, IconTable, IconLayoutGrid } from '@tabler/icons-react';
import { MantineReactTable, useMantineReactTable, type MRT_ColumnDef } from 'mantine-react-table';
import { marketDataApi } from '../../../utils/api';
import { useGlobalState } from '../../../context/GlobalStateContext';
import { SecurityExchangeCoverageResponse, DayCoverage } from '../../../types/coverage';

// Helper function to format bytes to human-readable string
function formatBytes(bytes: number): string {
  if (bytes === 0) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return `${parseFloat((bytes / Math.pow(k, i)).toFixed(2))} ${sizes[i]}`;
}

// Helper function to format minutes
function formatMinutes(minutes: number): string {
  if (minutes < 60) return `${minutes} min`;
  if (minutes < 1440) return `${(minutes / 60).toFixed(1)} hrs`;
  return `${(minutes / 1440).toFixed(1)} days`;
}

interface TableRow extends DayCoverage {
  date: string;
  schemaTypesList: string[];
  totalSizeBytes: number;
}

// Get color intensity based on coverage (for heatmap)
function getCoverageColor(minutes: number, maxMinutes: number): string {
  if (minutes === 0) return 'var(--mantine-color-gray-2)';
  const intensity = Math.min(minutes / maxMinutes, 1);
  if (intensity < 0.25) return 'var(--mantine-color-green-2)';
  if (intensity < 0.5) return 'var(--mantine-color-green-4)';
  if (intensity < 0.75) return 'var(--mantine-color-green-6)';
  return 'var(--mantine-color-green-8)';
}

// Group dates by month for calendar view
function groupByMonth(dates: string[]): Map<string, string[]> {
  const groups = new Map<string, string[]>();
  dates.forEach(date => {
    const [year, month] = date.split('-');
    const key = `${year}-${month}`;
    if (!groups.has(key)) {
      groups.set(key, []);
    }
    groups.get(key)!.push(date);
  });
  return groups;
}

function SecurityExchangeCoverage() {
  const { securityId, exchangeId } = useParams<{ securityId: string; exchangeId: string }>();
  const navigate = useNavigate();
  const { securities, exchanges } = useGlobalState();
  const [data, setData] = useState<SecurityExchangeCoverageResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [viewMode, setViewMode] = useState<string | null>('calendar');

  const security = securities.find(s => s.securityId === Number(securityId));
  const exchange = exchanges.find(e => e.exchangeId === Number(exchangeId));

  const loadData = async () => {
    if (!securityId || !exchangeId) return;
    try {
      setLoading(true);
      setError(null);
      const response = await marketDataApi.getSecurityExchangeCoverage(
        Number(securityId),
        Number(exchangeId)
      );
      setData(response);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load coverage data');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, [securityId, exchangeId]);

  const tableData = useMemo((): TableRow[] => {
    if (!data?.coverage) return [];
    return Object.entries(data.coverage)
      .map(([date, coverage]) => {
        // Calculate total size from schema types
        const totalSizeBytes = Object.values(coverage.schemaTypes || {})
          .reduce((sum, schema) => sum + (schema.sizeBytes || 0), 0);
        return {
          ...coverage,
          date,
          schemaTypesList: Object.keys(coverage.schemaTypes || {}),
          totalSizeBytes,
        };
      })
      .sort((a, b) => b.date.localeCompare(a.date)); // Sort by date descending
  }, [data]);

  // Get maxMinutes for heatmap coloring
  const maxMinutes = useMemo(() => {
    return Math.max(...tableData.map(d => d.totalMinutes), 1);
  }, [tableData]);

  // Group data by month for calendar heatmap
  const calendarData = useMemo(() => {
    const dateToData = new Map<string, DayCoverage>();
    tableData.forEach(row => dateToData.set(row.date, row));
    const months = groupByMonth(tableData.map(d => d.date));
    return { dateToData, months };
  }, [tableData]);

  const columns = useMemo<MRT_ColumnDef<TableRow>[]>(() => [
    { accessorKey: 'date', header: 'Date', size: 110 },
    {
      accessorKey: 'hasCoverage',
      header: 'Status',
      size: 80,
      Cell: ({ cell }) => (
        <Badge color={cell.getValue<boolean>() ? 'green' : 'gray'} size="sm">
          {cell.getValue<boolean>() ? 'Yes' : 'No'}
        </Badge>
      ),
    },
    {
      accessorKey: 'totalMinutes',
      header: 'Minutes',
      size: 90,
      Cell: ({ cell }) => formatMinutes(cell.getValue<number>()),
    },
    {
      accessorKey: 'totalSizeBytes',
      header: 'Size',
      size: 90,
      Cell: ({ cell }) => formatBytes(cell.getValue<number>() || 0),
    },
    {
      accessorKey: 'schemaTypesList',
      header: 'Schema Types',
      size: 200,
      Cell: ({ cell }) => (
        <Group gap={4}>
          {cell.getValue<string[]>().map(schema => (
            <Badge key={schema} size="xs" variant="light">{schema}</Badge>
          ))}
        </Group>
      ),
    },
  ], []);

  const table = useMantineReactTable({
    columns,
    data: tableData,
    enablePagination: true,
    enableBottomToolbar: true,
    enableTopToolbar: true,
    initialState: { density: 'xs', pagination: { pageSize: 31, pageIndex: 0 } },
    state: { isLoading: loading },
  });

  // Render calendar heatmap for a month
  const renderMonthCalendar = (monthKey: string, _dates: string[]) => {
    const [year, month] = monthKey.split('-').map(Number);
    const monthName = new Date(year, month - 1).toLocaleString('default', { month: 'long', year: 'numeric' });
    const firstDay = new Date(year, month - 1, 1).getDay();
    const daysInMonth = new Date(year, month, 0).getDate();

    const cells: React.ReactNode[] = [];
    // Add empty cells for days before the first of the month
    for (let i = 0; i < firstDay; i++) {
      cells.push(<Box key={`empty-${i}`} w={24} h={24} />);
    }
    // Add cells for each day
    for (let day = 1; day <= daysInMonth; day++) {
      const dateStr = `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
      const coverage = calendarData.dateToData.get(dateStr);
      const minutes = coverage?.totalMinutes || 0;
      cells.push(
        <Tooltip
          key={day}
          label={`${dateStr}: ${minutes > 0 ? formatMinutes(minutes) : 'No data'}`}
          position="top"
          withArrow
        >
          <Box
            w={24}
            h={24}
            style={{
              backgroundColor: getCoverageColor(minutes, maxMinutes),
              borderRadius: 4,
              cursor: 'pointer',
            }}
          />
        </Tooltip>
      );
    }

    return (
      <Paper key={monthKey} withBorder p="sm" radius="md">
        <Text size="sm" fw={600} mb="xs">{monthName}</Text>
        <Group gap={2}>
          {['S', 'M', 'T', 'W', 'T', 'F', 'S'].map((d, i) => (
            <Box key={i} w={24} ta="center"><Text size="xs" c="dimmed">{d}</Text></Box>
          ))}
        </Group>
        <Group gap={2} wrap="wrap" style={{ width: 7 * 26 }}>
          {cells}
        </Group>
      </Paper>
    );
  };

  if (loading && !data) {
    return (
      <Container size="xl" py="xl">
        <Center style={{ minHeight: '60vh' }}>
          <Stack align="center" gap="xl">
            <Loader size="xl" color="green" />
            <Stack align="center" gap="xs">
              <Title order={3} c="dimmed">Loading Coverage Details</Title>
              <Text size="sm" c="dimmed">
                Fetching coverage for {security?.symbol || securityId} on {exchange?.exchangeName || exchangeId}...
              </Text>
            </Stack>
          </Stack>
        </Center>
      </Container>
    );
  }

  const breadcrumbItems = [
    { title: 'Coverage', href: '/market-data/coverage' },
    { title: security?.symbol || `Security ${securityId}`, href: `/market-data/coverage/${securityId}` },
    { title: exchange?.exchangeName || `Exchange ${exchangeId}`, href: '#' },
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
          <ActionIcon variant="subtle" onClick={() => navigate(`/market-data/coverage/${securityId}`)}>
            <IconArrowLeft size={20} />
          </ActionIcon>
          <Title order={2}>
            {security?.symbol || `Security ${securityId}`} - {exchange?.exchangeName || `Exchange ${exchangeId}`}
          </Title>
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
                <Text size="xs" c="dimmed" tt="uppercase" fw={700}>Days with Data</Text>
                <Text size="xl" fw={700}>{data.summary.totalDays}</Text>
              </div>
              <IconCalendar size={32} stroke={1.5} color="var(--mantine-color-blue-6)" />
            </Group>
          </Paper>
          <Paper withBorder p="md" radius="md">
            <Group justify="space-between">
              <div>
                <Text size="xs" c="dimmed" tt="uppercase" fw={700}>Total Coverage</Text>
                <Text size="xl" fw={700}>{formatMinutes(data.summary.totalMinutes)}</Text>
              </div>
              <IconClock size={32} stroke={1.5} color="var(--mantine-color-green-6)" />
            </Group>
          </Paper>
          <Paper withBorder p="md" radius="md">
            <Group justify="space-between">
              <div>
                <Text size="xs" c="dimmed" tt="uppercase" fw={700}>Total Size</Text>
                <Text size="xl" fw={700}>{formatBytes(data.summary.totalSizeBytes)}</Text>
              </div>
              <IconDatabase size={32} stroke={1.5} color="var(--mantine-color-orange-6)" />
            </Group>
          </Paper>
          <Paper withBorder p="md" radius="md">
            <Group justify="space-between">
              <div>
                <Text size="xs" c="dimmed" tt="uppercase" fw={700}>Date Range</Text>
                <Text size="sm" fw={700}>{data.summary.earliestDate}</Text>
                <Text size="xs" c="dimmed">to {data.summary.latestDate}</Text>
              </div>
              <IconCalendar size={32} stroke={1.5} color="var(--mantine-color-violet-6)" />
            </Group>
          </Paper>
        </SimpleGrid>
      )}

      {data?.summary?.schemaTypes && data.summary.schemaTypes.length > 0 && (
        <Card withBorder mb="lg">
          <Text size="sm" fw={600} mb="xs">Available Schema Types</Text>
          <Group gap="xs">
            {data.summary.schemaTypes.map(schema => (
              <Badge key={schema} size="md" variant="light">{schema}</Badge>
            ))}
          </Group>
        </Card>
      )}

      <Card withBorder>
        <Tabs value={viewMode} onChange={setViewMode}>
          <Tabs.List mb="md">
            <Tabs.Tab value="calendar" leftSection={<IconLayoutGrid size={16} />}>
              Calendar Heatmap
            </Tabs.Tab>
            <Tabs.Tab value="table" leftSection={<IconTable size={16} />}>
              Table View
            </Tabs.Tab>
          </Tabs.List>

          <Tabs.Panel value="calendar">
            <Box mb="md">
              <Group gap="xs" mb="xs">
                <Text size="xs" c="dimmed">Less</Text>
                <Box w={16} h={16} style={{ backgroundColor: 'var(--mantine-color-gray-2)', borderRadius: 3 }} />
                <Box w={16} h={16} style={{ backgroundColor: 'var(--mantine-color-green-2)', borderRadius: 3 }} />
                <Box w={16} h={16} style={{ backgroundColor: 'var(--mantine-color-green-4)', borderRadius: 3 }} />
                <Box w={16} h={16} style={{ backgroundColor: 'var(--mantine-color-green-6)', borderRadius: 3 }} />
                <Box w={16} h={16} style={{ backgroundColor: 'var(--mantine-color-green-8)', borderRadius: 3 }} />
                <Text size="xs" c="dimmed">More</Text>
              </Group>
            </Box>
            <ScrollArea>
              <SimpleGrid cols={{ base: 1, sm: 2, md: 3, lg: 4 }} spacing="md">
                {Array.from(calendarData.months.entries())
                  .sort(([a], [b]) => b.localeCompare(a))
                  .map(([monthKey, dates]) => renderMonthCalendar(monthKey, dates))}
              </SimpleGrid>
            </ScrollArea>
          </Tabs.Panel>

          <Tabs.Panel value="table">
            <MantineReactTable table={table} />
          </Tabs.Panel>
        </Tabs>
      </Card>
    </Container>
  );
}

export default SecurityExchangeCoverage;
