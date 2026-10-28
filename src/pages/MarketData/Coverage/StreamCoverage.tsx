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
  Skeleton,
} from '@mantine/core';
import { IconRefresh, IconDatabase, IconClock, IconCalendar, IconArrowLeft, IconTable, IconLayoutGrid, IconChartBar } from '@tabler/icons-react';
import { AreaChart, Area, XAxis, YAxis, CartesianGrid, ResponsiveContainer, Tooltip as RechartsTooltip } from 'recharts';
import { MantineReactTable, useMantineReactTable, type MRT_ColumnDef } from 'mantine-react-table';
import { marketDataApi, registryApi } from '../../../utils/api';
import { StatValue } from '../../../components/StatValue';
import { DenormalizedListing, Stream } from '../../../types';
import { StreamCoverageResponse, DayCoverage } from '../../../types/coverage';
import { usePageTitleLabels } from '../../../context/PageTitleContext';

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
  recordTypesList: string[];
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

function StreamCoverage() {
  const { streamId } = useParams<{ streamId: string }>();
  const navigate = useNavigate();
  const [data, setData] = useState<StreamCoverageResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [viewMode, setViewMode] = useState<string | null>('calendar');
  const [stream, setStream] = useState<Stream | null>(null);
  const [listing, setListing] = useState<DenormalizedListing | null>(null);

  // A listing's book is named by its listing; any other stream by its source and subject.
  const title = listing
    ? `${listing.securitySymbol} - ${listing.exchangeName}`
    : stream ? `${stream.sourceCode} ${stream.nativeSubjectId}` : `Stream ${streamId}`;
  usePageTitleLabels([{ segment: streamId, label: title }]);

  const loadData = async () => {
    if (!streamId) return;
    try {
      setLoading(true);
      setError(null);
      const response = await marketDataApi.getStreamCoverage(Number(streamId));
      setData(response);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load coverage data');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, [streamId]);

  useEffect(() => {
    if (!streamId) return;
    let cancelled = false;
    registryApi.listStreamsByIds([Number(streamId)])
      .then(async rows => {
        const found = rows[0] ?? null;
        if (cancelled) return;
        setStream(found);
        if (found?.listingId == null) {
          setListing(null);
          return;
        }
        const listings = await registryApi.listListingsByIds([found.listingId]);
        if (!cancelled) setListing(listings[0] ?? null);
      })
      .catch(() => { if (!cancelled) { setStream(null); setListing(null); } });
    return () => { cancelled = true; };
  }, [streamId]);

  const tableData = useMemo((): TableRow[] => {
    if (!data?.coverage) return [];
    return Object.entries(data.coverage)
      .map(([date, coverage]) => {
        const totalSizeBytes = Object.values(coverage.recordTypes || {})
          .reduce((sum, record) => sum + (record.sizeBytes || 0), 0);
        return {
          ...coverage,
          date,
          recordTypesList: Object.keys(coverage.recordTypes || {}),
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

  // Chart data sorted ascending for trend chart
  const chartData = useMemo(() => {
    return [...tableData]
      .sort((a, b) => a.date.localeCompare(b.date))
      .map(row => ({ date: row.date, minutes: row.totalMinutes }));
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
      accessorKey: 'recordTypesList',
      header: 'Record Types',
      size: 200,
      Cell: ({ cell }) => (
        <Group gap={4}>
          {cell.getValue<string[]>().map(record => (
            <Badge key={record} size="xs" variant="light">{record}</Badge>
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
  const renderMonthCalendar = (monthKey: string) => {
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

  const breadcrumbItems = [
    { title: 'Coverage', href: '/market-data/coverage' },
    { title, href: '#' },
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
          <Title order={2}>{title}</Title>
          <Badge variant="light">Stream {streamId}</Badge>
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

      {(data?.summary || (loading && !data)) && (
        <SimpleGrid cols={{ base: 1, sm: 2, lg: 4 }} mb="lg">
          <Paper withBorder p="md" radius="md">
            <Group justify="space-between">
              <div>
                <Text size="xs" c="dimmed" tt="uppercase" fw={700}>Days with Data</Text>
                <StatValue value={data?.summary && data.summary.totalDays} />
              </div>
              <IconCalendar size={32} stroke={1.5} color="var(--mantine-color-blue-6)" />
            </Group>
          </Paper>
          <Paper withBorder p="md" radius="md">
            <Group justify="space-between">
              <div>
                <Text size="xs" c="dimmed" tt="uppercase" fw={700}>Total Coverage</Text>
                <StatValue value={data?.summary && formatMinutes(data.summary.totalMinutes)} />
              </div>
              <IconClock size={32} stroke={1.5} color="var(--mantine-color-green-6)" />
            </Group>
          </Paper>
          <Paper withBorder p="md" radius="md">
            <Group justify="space-between">
              <div>
                <Text size="xs" c="dimmed" tt="uppercase" fw={700}>Total Size</Text>
                <StatValue value={data?.summary && formatBytes(data.summary.totalSizeBytes)} />
              </div>
              <IconDatabase size={32} stroke={1.5} color="var(--mantine-color-orange-6)" />
            </Group>
          </Paper>
          <Paper withBorder p="md" radius="md">
            <Group justify="space-between">
              <div>
                <Text size="xs" c="dimmed" tt="uppercase" fw={700}>Date Range</Text>
                {data?.summary ? (
                  <>
                    <Text size="sm" fw={700}>{data.summary.earliestDate}</Text>
                    <Text size="xs" c="dimmed">to {data.summary.latestDate}</Text>
                  </>
                ) : (
                  <>
                    <Skeleton h={14} w={90} mt={6} />
                    <Skeleton h={10} w={70} mt={6} />
                  </>
                )}
              </div>
              <IconCalendar size={32} stroke={1.5} color="var(--mantine-color-violet-6)" />
            </Group>
          </Paper>
        </SimpleGrid>
      )}

      {data?.summary?.recordTypes && data.summary.recordTypes.length > 0 && (
        <Card withBorder mb="lg">
          <Text size="sm" fw={600} mb="xs">Available Record Types</Text>
          <Group gap="xs">
            {data.summary.recordTypes.map(record => (
              <Badge key={record} size="md" variant="light">{record}</Badge>
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
            <Tabs.Tab value="statistics" leftSection={<IconChartBar size={16} />}>
              Trend
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
                {loading && !data
                  ? [0, 1, 2, 3].map(i => (
                    <Paper key={i} withBorder p="sm" radius="md">
                      <Skeleton h={14} w="50%" mb="xs" />
                      <Skeleton h={150} w={7 * 26} />
                    </Paper>
                  ))
                  : Array.from(calendarData.months.entries())
                    .sort(([a], [b]) => b.localeCompare(a))
                    .map(([monthKey]) => renderMonthCalendar(monthKey))}
              </SimpleGrid>
            </ScrollArea>
          </Tabs.Panel>

          <Tabs.Panel value="table">
            <MantineReactTable table={table} />
          </Tabs.Panel>

          <Tabs.Panel value="statistics">
            <Stack gap="lg">
              {/* Coverage Trend Chart */}
              <div>
                <Text size="sm" fw={600} mb="sm">Coverage Trend</Text>
                {chartData.length === 0 ? (
                  <Text size="sm" c="dimmed">No coverage data available</Text>
                ) : (
                  <ResponsiveContainer width="100%" height={220}>
                    <AreaChart data={chartData} margin={{ top: 4, right: 8, left: 0, bottom: 0 }}>
                      <defs>
                        <linearGradient id="coverageGradient" x1="0" y1="0" x2="0" y2="1">
                          <stop offset="5%" stopColor="var(--mantine-color-green-6)" stopOpacity={0.3} />
                          <stop offset="95%" stopColor="var(--mantine-color-green-6)" stopOpacity={0} />
                        </linearGradient>
                      </defs>
                      <CartesianGrid strokeDasharray="3 3" stroke="var(--mantine-color-gray-3)" />
                      <XAxis
                        dataKey="date"
                        tick={{ fontSize: 11 }}
                        tickFormatter={val => val.slice(5)}
                        interval="preserveStartEnd"
                      />
                      <YAxis
                        tick={{ fontSize: 11 }}
                        tickFormatter={val => formatMinutes(val)}
                        width={52}
                      />
                      <RechartsTooltip
                        formatter={(val) => [formatMinutes(Number(val)), 'Coverage']}
                        labelFormatter={label => `Date: ${label}`}
                      />
                      <Area
                        type="monotone"
                        dataKey="minutes"
                        stroke="var(--mantine-color-green-6)"
                        strokeWidth={2}
                        fill="url(#coverageGradient)"
                        dot={false}
                      />
                    </AreaChart>
                  </ResponsiveContainer>
                )}
              </div>
            </Stack>
          </Tabs.Panel>
        </Tabs>
      </Card>
    </Container>
  );
}

export default StreamCoverage;
