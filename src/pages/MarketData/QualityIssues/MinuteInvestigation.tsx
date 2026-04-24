import { useState, useEffect, useMemo } from 'react';
import { useParams, useNavigate, useSearchParams } from 'react-router-dom';
import {
  Container,
  Title,
  Text,
  Group,
  Stack,
  Notification,
  Center,
  Loader,
  Badge,
  Select,
  Anchor,
  Breadcrumbs,
  Paper,
  SimpleGrid,
  Card,
} from '@mantine/core';
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip as RechartsTooltip,
  ResponsiveContainer,
  ReferenceLine,
} from 'recharts';
import { marketDataApi } from '../../../utils/api';
import { useGlobalState } from '../../../context/GlobalStateContext';
import { MinuteInvestigationResponse, MinuteMetrics, MinuteInvestigationIssue } from '../../../types/quality-issues';
import { formatRuleType, getRuleTypeColor } from '../../../types/quality-issues';

const SCHEMA_TYPES = ['mbp-10', 'mbp-1', 'mbo', 'trades', 'bbo-1s', 'bbo-1m', 'ohlcv-1s', 'ohlcv-1m', 'ohlcv-1h'];

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

function formatUtcTimestamp(epochSeconds: number): string {
  const d = new Date(epochSeconds * 1000);
  const hours = String(d.getUTCHours()).padStart(2, '0');
  const minutes = String(d.getUTCMinutes()).padStart(2, '0');
  return `${hours}:${minutes}`;
}

function formatFullUtc(epochSeconds: number): string {
  const d = new Date(epochSeconds * 1000);
  return d.toISOString().slice(0, 16).replace('T', ' ') + 'Z';
}

function formatMetricValue(metricName: string, value: number | null): string {
  if (value === null || value === undefined) return '-';
  if (metricName === 'spread' || metricName === 'volatility') {
    return value.toExponential(3);
  }
  if (metricName === 'midPrice') {
    return value.toFixed(2);
  }
  return value.toFixed(1);
}

interface MetricChartProps {
  metricName: string;
  data: Array<{ timestamp: number; value: number | null }>;
  centerTimestamp: number;
  baselineMean?: number;
}

function MetricChart({ metricName, data, centerTimestamp, baselineMean }: MetricChartProps) {
  const label = METRIC_LABELS[metricName] || metricName;
  const color = METRIC_COLORS[metricName] || '#888';
  const centerLabel = formatUtcTimestamp(centerTimestamp);

  const chartData = data.map((d) => ({
    time: formatUtcTimestamp(d.timestamp),
    value: d.value,
    timestamp: d.timestamp,
  }));

  return (
    <Paper p="md" withBorder>
      <Text fw={500} mb="xs" size="sm">{label}</Text>
      <ResponsiveContainer width="100%" height={160}>
        <LineChart data={chartData} margin={{ top: 4, right: 8, left: 0, bottom: 0 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="#333" />
          <XAxis
            dataKey="time"
            tick={{ fontSize: 10, fill: '#aaa' }}
            interval="preserveStartEnd"
          />
          <YAxis tick={{ fontSize: 10, fill: '#aaa' }} width={60} />
          <RechartsTooltip
            contentStyle={{ background: '#1a1a1a', border: '1px solid #444', fontSize: 12 }}
            formatter={(val) => [formatMetricValue(metricName, Number(val)), label]}
          />
          <ReferenceLine
            x={centerLabel}
            stroke="#fa5252"
            strokeWidth={2}
            strokeDasharray="4 2"
            label={{ value: '⚠', position: 'top', fill: '#fa5252', fontSize: 12 }}
          />
          {baselineMean !== undefined && (
            <ReferenceLine
              y={baselineMean}
              stroke="#888"
              strokeDasharray="4 4"
              label={{ value: 'avg', position: 'insideTopRight', fill: '#888', fontSize: 10 }}
            />
          )}
          <Line
            type="monotone"
            dataKey="value"
            stroke={color}
            dot={false}
            strokeWidth={1.5}
            connectNulls={false}
          />
        </LineChart>
      </ResponsiveContainer>
    </Paper>
  );
}

function IssueCard({ issue }: { issue: MinuteInvestigationIssue }) {
  return (
    <Card withBorder p="sm">
      <Group justify="space-between" mb={4}>
        <Badge color={getRuleTypeColor(issue.ruleType)} size="sm">
          {formatRuleType(issue.ruleType)}
        </Badge>
        <Badge color={issue.status === 'UNREVIEWED' ? 'yellow' : 'gray'} size="xs" variant="outline">
          {issue.status}
        </Badge>
      </Group>
      <Text size="xs" c="dimmed" mb={4}>{formatFullUtc(issue.timestamp)}</Text>
      {issue.details && <Text size="sm">{issue.details}</Text>}
      {issue.recordCount !== null && (
        <Text size="xs" c="dimmed" mt={4}>{issue.recordCount} records</Text>
      )}
    </Card>
  );
}

function MinuteInvestigation() {
  const { listingId, timestamp } = useParams<{ listingId: string; timestamp: string }>();
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const { listings, exchanges, securities } = useGlobalState();

  const initialSchemaType = searchParams.get('schemaType') || 'mbp-10';
  const [schemaType, setSchemaType] = useState<string>(initialSchemaType);
  const [data, setData] = useState<MinuteInvestigationResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const listing = listings.find((l) => l.listingId === Number(listingId));
  const exchange = listing ? exchanges.find((e) => e.exchangeId === listing.exchangeId) : undefined;
  const security = listing ? securities.find((s) => s.securityId === listing.securityId) : undefined;
  const listingLabel = security && exchange ? `${security.symbol} @ ${exchange.exchangeName}` : `Listing ${listingId}`;

  useEffect(() => {
    if (!listingId || !timestamp) return;
    setLoading(true);
    setError(null);
    marketDataApi
      .investigateQualityIssue(Number(listingId), Number(timestamp), schemaType)
      .then(setData)
      .catch((err) => setError(err instanceof Error ? err.message : 'Failed to load investigation data'))
      .finally(() => setLoading(false));
  }, [listingId, timestamp, schemaType]);

  const metricsPresent = useMemo(() => {
    if (!data) return [];
    const seen = new Set<string>();
    for (const minute of data.minutes) {
      for (const key of Object.keys(minute.metrics)) {
        seen.add(key);
      }
    }
    return Object.keys(METRIC_LABELS).filter((m) => seen.has(m));
  }, [data]);

  const chartDataByMetric = useMemo(() => {
    if (!data) return {};
    const result: Record<string, Array<{ timestamp: number; value: number | null }>> = {};
    for (const metric of metricsPresent) {
      result[metric] = data.minutes.map((m: MinuteMetrics) => ({
        timestamp: m.timestamp,
        value: m.hasData ? (m.metrics[metric] ?? null) : null,
      }));
    }
    return result;
  }, [data, metricsPresent]);

  return (
    <Container size="xl" py="md">
      <Stack gap="md">
        <Breadcrumbs>
          <Anchor onClick={() => navigate('/market-data/quality-issues')} size="sm">Quality Issues</Anchor>
          <Text size="sm">{listingLabel}</Text>
          <Text size="sm">{timestamp ? formatFullUtc(Number(timestamp)) : ''}</Text>
        </Breadcrumbs>

        <Group justify="space-between" align="flex-end">
          <Title order={2}>Minute Investigation</Title>
          <Select
            label="Schema Type"
            data={SCHEMA_TYPES.map((s) => ({ value: s, label: s }))}
            value={schemaType}
            onChange={(v) => v && setSchemaType(v)}
            style={{ minWidth: 160 }}
            size="sm"
          />
        </Group>

        {error && (
          <Notification color="red" onClose={() => setError(null)}>{error}</Notification>
        )}

        {loading ? (
          <Center py="xl"><Loader /></Center>
        ) : data ? (
          <>
            {data.issues.length > 0 && (
              <Stack gap="xs">
                <Text fw={500} size="sm">Issues in Window</Text>
                <SimpleGrid cols={{ base: 1, sm: 2, md: 3 }}>
                  {data.issues.map((issue) => (
                    <IssueCard key={issue.issueId} issue={issue} />
                  ))}
                </SimpleGrid>
              </Stack>
            )}

            {Object.keys(data.baseline).length > 0 && (
              <Paper withBorder p="md">
                <Text fw={500} size="sm" mb="xs">Rolling Baseline ({data.windowMinutes * 2 + 1}-min window shown, baseline from 14-day avg)</Text>
                <Group gap="xl">
                  {Object.entries(data.baseline).map(([metric, stats]) => (
                    <Stack key={metric} gap={2}>
                      <Text size="xs" c="dimmed">{METRIC_LABELS[metric] || metric}</Text>
                      <Text size="sm" fw={500}>{formatMetricValue(metric, stats.mean)} ± {formatMetricValue(metric, stats.stddev)}</Text>
                      <Text size="xs" c="dimmed">{stats.count} samples</Text>
                    </Stack>
                  ))}
                </Group>
              </Paper>
            )}

            {metricsPresent.length > 0 ? (
              <SimpleGrid cols={{ base: 1, md: 2 }}>
                {metricsPresent.map((metric) => (
                  <MetricChart
                    key={metric}
                    metricName={metric}
                    data={chartDataByMetric[metric] || []}
                    centerTimestamp={data.centerTimestamp}
                    baselineMean={data.baseline[metric]?.mean}
                  />
                ))}
              </SimpleGrid>
            ) : (
              <Center py="xl">
                <Text c="dimmed">No data found for schema type <strong>{schemaType}</strong> in this time window.</Text>
              </Center>
            )}
          </>
        ) : null}
      </Stack>
    </Container>
  );
}

export default MinuteInvestigation;
