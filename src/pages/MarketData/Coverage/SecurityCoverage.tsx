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
  Select,
} from '@mantine/core';
import { IconRefresh, IconDatabase, IconClock, IconCalendar, IconArrowLeft } from '@tabler/icons-react';
import {
  ComposedChart,
  Area,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip as RechartsTooltip,
  ResponsiveContainer,
} from 'recharts';
import { MantineReactTable, useMantineReactTable, type MRT_ColumnDef } from 'mantine-react-table';
import { marketDataApi } from '../../../utils/api';
import { useGlobalState } from '../../../context/GlobalStateContext';
import { SecurityCoverageResponse, ExchangeCoverage } from '../../../types/coverage';
import { ListingStatisticsHistoryPoint } from '../../../types/quality-issues';

function formatBytes(bytes: number): string {
  if (bytes === 0) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return `${parseFloat((bytes / Math.pow(k, i)).toFixed(2))} ${sizes[i]}`;
}

function formatMinutes(minutes: number): string {
  if (minutes < 60) return `${minutes} min`;
  if (minutes < 1440) return `${(minutes / 60).toFixed(1)} hrs`;
  return `${(minutes / 1440).toFixed(1)} days`;
}

const METRIC_LABELS: Record<string, string> = {
  tickCount: 'Tick Count',
  spread: 'Spread',
  midPrice: 'Mid Price',
  tradeVolume: 'Trade Volume',
  tradeFrequency: 'Trade Frequency',
  volatility: 'Volatility',
};

const METRIC_COLORS: Record<string, string> = {
  tickCount: '#4c6ef5',
  spread: '#f76707',
  midPrice: '#2f9e44',
  tradeVolume: '#ae3ec9',
  tradeFrequency: '#e03131',
  volatility: '#1098ad',
};

interface TableRow extends ExchangeCoverage {
  exchangeName: string;
}

function SecurityCoverage() {
  const { securityId } = useParams<{ securityId: string }>();
  const navigate = useNavigate();
  const { securities, exchanges, listings } = useGlobalState();
  const [data, setData] = useState<SecurityCoverageResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [selectedListingId, setSelectedListingId] = useState<string | null>(null);
  const [metricsHistory, setMetricsHistory] = useState<ListingStatisticsHistoryPoint[] | null>(null);
  const [metricsLoading, setMetricsLoading] = useState(false);

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

  const securityListings = useMemo(() => {
    return listings
      .filter(l => l.securityId === Number(securityId))
      .map(l => ({
        value: String(l.listingId),
        label: exchanges.find(e => e.exchangeId === l.exchangeId)?.exchangeName || `Exchange ${l.exchangeId}`,
      }));
  }, [listings, exchanges, securityId]);

  useEffect(() => {
    if (securityListings.length > 0 && !selectedListingId) {
      setSelectedListingId(securityListings[0].value);
    }
  }, [securityListings]);

  useEffect(() => {
    if (!selectedListingId) return;
    setMetricsLoading(true);
    setMetricsHistory(null);
    marketDataApi
      .getListingStatisticsHistory(Number(selectedListingId), 30)
      .then(d => setMetricsHistory(d.history))
      .catch(() => setMetricsHistory(null))
      .finally(() => setMetricsLoading(false));
  }, [selectedListingId]);

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

  const metricNames = useMemo(() => {
    if (!metricsHistory || metricsHistory.length === 0) return [];
    const seen = new Set<string>();
    metricsHistory.forEach(point => Object.keys(point.metrics).forEach(m => seen.add(m)));
    return Array.from(seen).sort();
  }, [metricsHistory]);

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

      <Card withBorder mb="lg">
        <Title order={4} mb="md">Coverage by Exchange</Title>
        <Text size="sm" c="dimmed" mb="md">Click on an exchange to view detailed day-by-day coverage</Text>
        <MantineReactTable table={table} />
      </Card>

      <Card withBorder>
        <Group justify="space-between" mb="md">
          <Title order={4}>Quality Metrics (30-day history)</Title>
          {securityListings.length > 1 && (
            <Select
              size="xs"
              data={securityListings}
              value={selectedListingId}
              onChange={setSelectedListingId}
              style={{ minWidth: 180 }}
            />
          )}
        </Group>

        {metricsLoading && (
          <Center py="xl">
            <Loader size="sm" />
          </Center>
        )}

        {!metricsLoading && (!metricsHistory || metricsHistory.length === 0) && (
          <Text c="dimmed" size="sm">No metrics data available for this listing.</Text>
        )}

        {!metricsLoading && metricsHistory && metricsHistory.length > 0 && (
          <SimpleGrid cols={{ base: 1, sm: 2, lg: 3 }} spacing="md">
            {metricNames.map(metric => {
              const color = METRIC_COLORS[metric] ?? '#868e96';
              const chartData = metricsHistory.map(point => {
                const m = point.metrics[metric];
                if (!m) return { date: point.date.slice(5), mean: null, lower: null, band: null };
                return {
                  date: point.date.slice(5),
                  mean: m.mean,
                  lower: m.mean - m.stddev,
                  band: 2 * m.stddev,
                };
              });
              return (
                <Paper key={metric} withBorder p="sm" radius="md">
                  <Text size="xs" fw={600} mb="xs" c="dimmed" tt="uppercase">
                    {METRIC_LABELS[metric] ?? metric}
                  </Text>
                  <ResponsiveContainer width="100%" height={140}>
                    <ComposedChart data={chartData} margin={{ top: 4, right: 8, bottom: 0, left: 0 }}>
                      <CartesianGrid strokeDasharray="3 3" stroke="var(--mantine-color-gray-2)" />
                      <XAxis
                        dataKey="date"
                        tick={{ fontSize: 10 }}
                        interval="preserveStartEnd"
                        tickLine={false}
                      />
                      <YAxis
                        tick={{ fontSize: 10 }}
                        tickLine={false}
                        axisLine={false}
                        width={50}
                        tickFormatter={(v: number) =>
                          v >= 1_000_000
                            ? `${(v / 1_000_000).toFixed(1)}M`
                            : v >= 1_000
                            ? `${(v / 1_000).toFixed(1)}K`
                            : v.toFixed(2)
                        }
                      />
                      <RechartsTooltip
                        content={(props) => {
                          if (!props.active || !props.payload?.length) return null;
                          const d = props.payload[0]?.payload;
                          if (d?.mean == null) return null;
                          const upper = (d.lower + d.band).toFixed(4);
                          const lower = Number(d.lower).toFixed(4);
                          const mean = Number(d.mean).toFixed(4);
                          return (
                            <div style={{ background: 'var(--mantine-color-dark-7)', border: '1px solid var(--mantine-color-dark-4)', padding: '6px 10px', fontSize: 11, borderRadius: 4 }}>
                              <div style={{ marginBottom: 4, color: 'var(--mantine-color-dimmed)' }}>{props.label}</div>
                              <div style={{ color }}>Mean: {mean}</div>
                              <div style={{ color: 'var(--mantine-color-dimmed)' }}>+1σ: {upper}</div>
                              <div style={{ color: 'var(--mantine-color-dimmed)' }}>−1σ: {lower}</div>
                            </div>
                          );
                        }}
                      />
                      <Area
                        type="monotone"
                        dataKey="lower"
                        stackId="band"
                        fill="transparent"
                        stroke="none"
                        dot={false}
                        isAnimationActive={false}
                        legendType="none"
                      />
                      <Area
                        type="monotone"
                        dataKey="band"
                        stackId="band"
                        fill={color}
                        fillOpacity={0.15}
                        stroke="none"
                        dot={false}
                        isAnimationActive={false}
                        legendType="none"
                      />
                      <Line
                        type="monotone"
                        dataKey="mean"
                        stroke={color}
                        dot={false}
                        strokeWidth={1.5}
                        connectNulls
                      />
                    </ComposedChart>
                  </ResponsiveContainer>
                </Paper>
              );
            })}
          </SimpleGrid>
        )}
      </Card>
    </Container>
  );
}

export default SecurityCoverage;
