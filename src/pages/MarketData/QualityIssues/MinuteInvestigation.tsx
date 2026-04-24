import { useState, useEffect, useMemo } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
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
import {
  MinuteInvestigationResponse,
  MinuteMetrics,
  MinuteInvestigationIssue,
  formatRuleType,
  getRuleTypeColor,
} from '../../../types/quality-issues';

const METRIC_LABELS: Record<string, string> = {
  tickCount: 'Tick Count',
  spread: 'Spread',
  midPrice: 'Mid Price',
  tradeVolume: 'Trade Volume',
  tradeFrequency: 'Trade Frequency',
  volatility: 'Volatility',
};

const RULE_TYPE_TO_METRIC: Record<string, string> = {
  TICK_COUNT_ANOMALY: 'tickCount',
  SPREAD_ANOMALY: 'spread',
  MID_PRICE_ANOMALY: 'midPrice',
  TRADE_VOLUME_ANOMALY: 'tradeVolume',
  TRADE_FREQUENCY_ANOMALY: 'tradeFrequency',
  VOLATILITY_ANOMALY: 'volatility',
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
  issues: MinuteInvestigationIssue[];
  baselineMean?: number;
}

function MetricChart({ metricName, data, issues, baselineMean }: MetricChartProps) {
  const label = METRIC_LABELS[metricName] || metricName;
  const color = METRIC_COLORS[metricName] || '#888';

  const issueByTime = new Map(issues.map((i) => [formatUtcTimestamp(i.timestamp), i]));

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
            content={(props) => {
              if (!props.active || !props.payload?.length) return null;
              const time = props.label as string;
              const val = props.payload[0]?.value;
              const issue = issueByTime.get(time);
              return (
                <div style={{ background: '#1a1a1a', border: `1px solid ${issue ? '#fa5252' : '#444'}`, borderRadius: 4, padding: '6px 10px', fontSize: 12, maxWidth: 240 }}>
                  <div style={{ color: '#aaa', marginBottom: 4 }}>{time}</div>
                  <div style={{ color }}>{label}: {formatMetricValue(metricName, val != null ? Number(val) : null)}</div>
                  {issue && (
                    <div style={{ marginTop: 6, borderTop: '1px solid #333', paddingTop: 6 }}>
                      <div style={{ color: '#fa5252', fontWeight: 600, marginBottom: 2 }}>{formatRuleType(issue.ruleType)}</div>
                      {issue.details && <div style={{ color: '#ccc' }}>{issue.details}</div>}
                    </div>
                  )}
                </div>
              );
            }}
          />
          {[...issueByTime.keys()].map((time) => (
            <ReferenceLine
              key={time}
              x={time}
              stroke="#fa5252"
              strokeWidth={2}
              strokeDasharray="4 2"
              label={{ value: '⚠', position: 'top', fill: '#fa5252', fontSize: 12 }}
            />
          ))}
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
  const navigate = useNavigate();
  const { listings, exchanges, securities } = useGlobalState();

  const [data, setData] = useState<MinuteInvestigationResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const { listingLabel } = useMemo(() => {
    const listing = listings.find((l) => l.listingId === Number(listingId));
    const exchange = listing ? exchanges.find((e) => e.exchangeId === listing.exchangeId) : undefined;
    const security = listing ? securities.find((s) => s.securityId === listing.securityId) : undefined;
    return {
      listingLabel: security && exchange ? `${security.symbol} @ ${exchange.exchangeName}` : `Listing ${listingId}`,
    };
  }, [listingId, listings, exchanges, securities]);

  useEffect(() => {
    if (!listingId || !timestamp) return;
    setLoading(true);
    setError(null);
    marketDataApi
      .investigateQualityIssue(Number(listingId), Number(timestamp))
      .then(setData)
      .catch((err) => setError(err instanceof Error ? err.message : 'Failed to load investigation data'))
      .finally(() => setLoading(false));
  }, [listingId, timestamp]);

  const { metricsPresent, chartDataByMetric } = useMemo(() => {
    if (!data) return { metricsPresent: [], chartDataByMetric: {} };

    const seen = new Set<string>();
    for (const minute of data.minutes) {
      for (const key of Object.keys(minute.metrics)) {
        seen.add(key);
      }
    }
    const metricsPresent = Object.keys(METRIC_LABELS).filter((m) => seen.has(m));

    const chartDataByMetric: Record<string, Array<{ timestamp: number; value: number | null }>> = {};
    for (const metric of metricsPresent) {
      chartDataByMetric[metric] = data.minutes.map((m: MinuteMetrics) => ({
        timestamp: m.timestamp,
        value: m.hasData ? (m.metrics[metric] ?? null) : null,
      }));
    }

    return { metricsPresent, chartDataByMetric };
  }, [data]);

  return (
    <Container size="xl" py="md">
      <Stack gap="md">
        <Breadcrumbs>
          <Anchor onClick={() => navigate('/market-data/quality-issues')} size="sm">Quality Issues</Anchor>
          <Text size="sm">{listingLabel}</Text>
          <Text size="sm">{timestamp ? formatFullUtc(Number(timestamp)) : ''}</Text>
        </Breadcrumbs>

        <Title order={2}>Minute Investigation</Title>

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

            {data.issues.some((i) => i.ruleType.endsWith('_ANOMALY') && !(i.ruleType in RULE_TYPE_TO_METRIC)) && (
              <Notification color="yellow" withCloseButton={false}>
                Some anomaly rule types have no chart mapping:{' '}
                {[...new Set(data.issues
                  .filter((i) => i.ruleType.endsWith('_ANOMALY') && !(i.ruleType in RULE_TYPE_TO_METRIC))
                  .map((i) => i.ruleType)
                )].join(', ')}
                . Add them to <code>RULE_TYPE_TO_METRIC</code> to show markers on the relevant chart.
              </Notification>
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
                    issues={data.issues.filter((i) => RULE_TYPE_TO_METRIC[i.ruleType] === metric)}
                    baselineMean={data.baseline[metric]?.mean}
                  />
                ))}
              </SimpleGrid>
            ) : (
              <Center py="xl">
                <Text c="dimmed">No data found for schema type <strong>{data.schemaType}</strong> in this time window.</Text>
              </Center>
            )}
          </>
        ) : null}
      </Stack>
    </Container>
  );
}

export default MinuteInvestigation;
