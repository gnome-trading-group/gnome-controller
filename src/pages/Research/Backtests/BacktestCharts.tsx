import { useMemo, useState } from 'react';
import { Card, Group, NumberInput, Select, Stack, Switch, Text } from '@mantine/core';
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  ErrorBar,
  ResponsiveContainer,
  Tooltip as RechartsTooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { BacktestJob } from '../../../types/backtests';
import {
  DEFAULT_HISTOGRAM_BINS, Distribution, GroupStats, Grouping, HistogramBin, PNL_KEY, PNL_WITH_REWARDS_KEY,
  describe, formatMetric, groupStats, metricValue, outlierRange, rangedHistogram,
} from '../../../utils/backtestStats';

export interface MetricOption {
  value: string;
  label: string;
}

// Metrics where the sign is the verdict (made or lost money); the rest are drawn in one neutral colour.
const SIGNED_METRICS = new Set([PNL_KEY, PNL_WITH_REWARDS_KEY, 'sharpe', 'sortino']);
const BIN_OPTIONS = ['10', '20', '30', '50', '100'];
// Past this many groups the bars get too thin to read, so only the best and worst are drawn.
const MAX_GROUPS = 40;

const GREEN = '#2f9e44';
const RED = '#c92a2a';
const BLUE = '#1971c2';
const ORANGE = '#e8590c';
const TOOLTIP_STYLE = { background: '#1a1b1e', border: '1px solid #373a40' };

const pct = (f: number) => `${(f * 100).toFixed(0)}%`;

function barColor(metric: string, value: number): string {
  if (!SIGNED_METRICS.has(metric)) return BLUE;
  return value >= 0 ? GREEN : RED;
}

function binLabel(bin: HistogramBin): string {
  if (bin.overflow === 'below') return `< ${formatMetric(bin.to)}`;
  if (bin.overflow === 'above') return `> ${formatMetric(bin.from)}`;
  return formatMetric(bin.from);
}

function Stat({ label, value, color }: { label: string; value: string; color?: string }) {
  return (
    <Stack gap={0}>
      <Text size="xs" c="dimmed">{label}</Text>
      <Text size="sm" fw={500} c={color}>{value}</Text>
    </Stack>
  );
}

function StatsStrip({ d, signed }: { d: Distribution; signed: boolean }) {
  const tone = (v: number) => (signed ? (v >= 0 ? 'green' : 'red') : undefined);
  return (
    <Group gap="xl" mb="sm">
      <Stat label="Jobs" value={String(d.count)} />
      <Stat label="Mean" value={formatMetric(d.mean)} color={tone(d.mean)} />
      <Stat label="Median" value={formatMetric(d.median)} color={tone(d.median)} />
      <Stat label="p5 / p95" value={`${formatMetric(d.p5)} / ${formatMetric(d.p95)}`} />
      <Stat label="Min / max" value={`${formatMetric(d.min)} / ${formatMetric(d.max)}`} />
      {signed && <Stat label="Above zero" value={pct(d.positiveFraction)} />}
    </Group>
  );
}

function MetricSelect({ metrics, value, onChange }: { metrics: MetricOption[]; value: string; onChange: (v: string) => void }) {
  return (
    <Select
      size="xs"
      w={170}
      data={metrics}
      value={value}
      onChange={v => v && onChange(v)}
      allowDeselect={false}
      aria-label="Metric"
    />
  );
}

export function MetricDistribution({ jobs, metrics, defaultMetric }: {
  jobs: BacktestJob[];
  metrics: MetricOption[];
  defaultMetric: string;
}) {
  const [metric, setMetric] = useState(defaultMetric);
  const [bins, setBins] = useState(String(DEFAULT_HISTOGRAM_BINS));
  const [foldOutliers, setFoldOutliers] = useState(true);
  const [min, setMin] = useState<number | ''>('');
  const [max, setMax] = useState<number | ''>('');

  const values = useMemo(
    () => jobs.map(j => metricValue(j, metric)).filter((v): v is number => v !== undefined),
    [jobs, metric],
  );
  const stats = useMemo(() => describe(values), [values]);
  const range = useMemo<[number, number] | null>(() => {
    if (min !== '' || max !== '') {
      if (!stats) return null;
      const lo = min === '' ? stats.min : min;
      const hi = max === '' ? stats.max : max;
      return lo < hi ? [lo, hi] : null;
    }
    return foldOutliers ? outlierRange(values) : null;
  }, [min, max, foldOutliers, values, stats]);
  const data = useMemo(
    () => rangedHistogram(values, range, Number(bins)).map(b => ({ ...b, label: binLabel(b) })),
    [values, range, bins],
  );
  const folded = data.filter(b => b.overflow).reduce((n, b) => n + b.count, 0);
  const signed = SIGNED_METRICS.has(metric);
  const manualRange = min !== '' || max !== '';

  return (
    <Card withBorder mb="md" p="md">
      <Group justify="space-between" mb="sm" align="flex-end">
        <Group gap="xs" align="baseline">
          <Text fw={500}>Distribution</Text>
          <Text size="xs" c="dimmed">sort the table for the best and worst jobs</Text>
        </Group>
        <Group gap="xs" align="flex-end">
          <MetricSelect metrics={metrics} value={metric} onChange={(v) => { setMetric(v); setMin(''); setMax(''); }} />
          <Select size="xs" w={80} data={BIN_OPTIONS} value={bins} onChange={v => v && setBins(v)}
                  allowDeselect={false} aria-label="Bins" leftSection={<Text size="xs" c="dimmed">#</Text>} />
          <NumberInput size="xs" w={100} placeholder="min" value={min} onChange={v => setMin(typeof v === 'number' ? v : '')}
                       hideControls aria-label="Range minimum" />
          <NumberInput size="xs" w={100} placeholder="max" value={max} onChange={v => setMax(typeof v === 'number' ? v : '')}
                       hideControls aria-label="Range maximum" />
          <Switch size="xs" label="Fold outliers" checked={foldOutliers} disabled={manualRange}
                  onChange={e => setFoldOutliers(e.currentTarget.checked)} />
        </Group>
      </Group>
      {stats && <StatsStrip d={stats} signed={signed} />}
      <ResponsiveContainer width="100%" height={240}>
        <BarChart data={data} margin={{ top: 4, right: 8, bottom: 4, left: 0 }} barCategoryGap={1}>
          <CartesianGrid strokeDasharray="3 3" opacity={0.2} />
          <XAxis dataKey="label" tick={{ fontSize: 10 }} minTickGap={24} />
          <YAxis tick={{ fontSize: 11 }} allowDecimals={false} />
          <RechartsTooltip
            labelFormatter={(_, payload) => {
              const bin = payload?.[0]?.payload as HistogramBin | undefined;
              if (!bin) return '';
              const span = `${formatMetric(bin.from)} to ${formatMetric(bin.to)}`;
              return bin.overflow ? `${span} (outside the range)` : span;
            }}
            formatter={(value) => [value, 'Jobs']}
            contentStyle={TOOLTIP_STYLE}
          />
          <Bar dataKey="count" isAnimationActive={false}>
            {data.map((bin, i) => (
              <Cell key={i} fill={bin.overflow ? ORANGE : barColor(metric, bin.from + bin.to)} />
            ))}
          </Bar>
        </BarChart>
      </ResponsiveContainer>
      {folded > 0 && (
        <Text size="xs" c="dimmed" mt={4}>
          {folded} job{folded === 1 ? '' : 's'} outside {formatMetric(range![0])} to {formatMetric(range![1])} in the
          orange edge bins
        </Text>
      )}
    </Card>
  );
}

interface GroupDatum extends GroupStats {
  spread: [number, number];
}

function GroupTooltip({ active, payload }: { active?: boolean; payload?: { payload: GroupDatum }[] }) {
  const g = payload?.[0]?.payload;
  if (!active || !g) return null;
  return (
    <div style={{ ...TOOLTIP_STYLE, padding: '6px 10px', fontSize: 12 }}>
      <div style={{ fontWeight: 600, marginBottom: 2 }}>{g.key}</div>
      <div>{g.count} job{g.count === 1 ? '' : 's'}</div>
      <div>median {formatMetric(g.median)}</div>
      <div>p25 to p75 {formatMetric(g.p25)} to {formatMetric(g.p75)}</div>
      <div>mean {formatMetric(g.mean)}</div>
      <div>{pct(g.positiveFraction)} above zero</div>
    </div>
  );
}

// The best and worst groups by median, kept in the order groupStats gave them.
function capGroups(stats: GroupStats[]): GroupStats[] {
  if (stats.length <= MAX_GROUPS) return stats;
  const half = MAX_GROUPS / 2;
  const byMedian = [...stats].sort((a, b) => b.median - a.median);
  const keep = new Set([...byMedian.slice(0, half), ...byMedian.slice(-half)].map(s => s.key));
  return stats.filter(s => keep.has(s.key));
}

export function GroupBreakdown({ jobs, groupings, metrics, defaultMetric }: {
  jobs: BacktestJob[];
  groupings: Grouping[];
  metrics: MetricOption[];
  defaultMetric: string;
}) {
  const [groupingId, setGroupingId] = useState(groupings[0].id);
  const [metric, setMetric] = useState(defaultMetric);
  const grouping = groupings.find(g => g.id === groupingId) ?? groupings[0];

  const all = useMemo(() => groupStats(jobs, grouping.keyOf, metric), [jobs, grouping, metric]);
  const data = useMemo<GroupDatum[]>(
    () => capGroups(all).map(s => ({ ...s, spread: [s.median - s.p25, s.p75 - s.median] })),
    [all],
  );
  const capped = data.length < all.length;

  return (
    <Card withBorder mb="md" p="md">
      <Group justify="space-between" mb="sm" align="flex-end">
        <Group gap="xs" align="baseline">
          <Text fw={500}>Breakdown</Text>
          <Text size="xs" c="dimmed">median per group, whiskers p25 to p75</Text>
        </Group>
        <Group gap="xs">
          <Select
            size="xs"
            w={170}
            data={groupings.map(g => ({ value: g.id, label: `by ${g.label}` }))}
            value={grouping.id}
            onChange={v => v && setGroupingId(v)}
            allowDeselect={false}
            aria-label="Group by"
          />
          <MetricSelect metrics={metrics} value={metric} onChange={setMetric} />
        </Group>
      </Group>
      <ResponsiveContainer width="100%" height={260}>
        <BarChart data={data} margin={{ top: 8, right: 8, bottom: 48, left: 0 }}>
          <CartesianGrid strokeDasharray="3 3" opacity={0.2} />
          <XAxis dataKey="key" tick={{ fontSize: 10 }} angle={-35} textAnchor="end" interval={0} />
          <YAxis tick={{ fontSize: 11 }} />
          <RechartsTooltip content={<GroupTooltip />} />
          <Bar dataKey="median" isAnimationActive={false}>
            {data.map((g, i) => <Cell key={i} fill={barColor(metric, g.median)} opacity={0.85} />)}
            <ErrorBar dataKey="spread" width={4} stroke="#adb5bd" direction="y" />
          </Bar>
        </BarChart>
      </ResponsiveContainer>
      {capped && (
        <Text size="xs" c="dimmed">Showing the best and worst {MAX_GROUPS / 2} of {all.length} groups by median.</Text>
      )}
    </Card>
  );
}
