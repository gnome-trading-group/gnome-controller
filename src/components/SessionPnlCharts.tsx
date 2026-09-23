import { useMemo } from 'react';
import {
  CartesianGrid,
  Legend,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip as RechartsTooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { Center, Loader, Stack, Text } from '@mantine/core';
import { PnlSnapshot } from '../types';
import { unscaleNotional } from '../utils/security-master';

const LINE_COLORS = ['#4dabf7', '#f08c00', '#e64980', '#cc5de8', '#20c997', '#ff6b6b', '#a9e34b', '#74c0fc'];

const TOOLTIP_STYLE = {
  background: 'var(--mantine-color-dark-7)',
  border: '1px solid var(--mantine-color-dark-4)',
};

function tooltipFormatter(value: unknown): [string] {
  return [typeof value === 'number' ? value.toFixed(4) : String(value)];
}

function yTickFormatter(v: number) {
  return v.toFixed(2);
}

function toLabel(isoTime: string) {
  return new Date(isoTime).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}

interface SessionPnlChartsProps {
  snapshots: PnlSnapshot[];
  loading: boolean;
}

export function SessionPnlCharts({ snapshots, loading }: SessionPnlChartsProps) {
  const listingIds = useMemo(
    () => [...new Set(snapshots.map(s => s.listingId))].sort((a, b) => a - b),
    [snapshots],
  );

  const aggregateData = useMemo(() => {
    const grouped = new Map<string, { time: string; totalPnl: number; realizedPnl: number; unrealizedPnl: number }>();
    snapshots.forEach(s => {
      const existing = grouped.get(s.snapshotTime) ?? { time: s.snapshotTime, totalPnl: 0, realizedPnl: 0, unrealizedPnl: 0 };
      existing.totalPnl += s.totalPnl;
      existing.realizedPnl += s.realizedPnl;
      existing.unrealizedPnl += s.unrealizedPnl;
      grouped.set(s.snapshotTime, existing);
    });
    return Array.from(grouped.values())
      .sort((a, b) => new Date(a.time).getTime() - new Date(b.time).getTime())
      .map(d => ({
        label: toLabel(d.time),
        totalPnl: unscaleNotional(d.totalPnl),
        realizedPnl: unscaleNotional(d.realizedPnl),
        unrealizedPnl: unscaleNotional(d.unrealizedPnl),
      }));
  }, [snapshots]);

  const perListingData = useMemo(() => {
    const grouped = new Map<string, Record<string, number | string>>();
    snapshots.forEach(s => {
      const existing = grouped.get(s.snapshotTime) ?? { time: s.snapshotTime };
      existing[String(s.listingId)] = unscaleNotional(s.totalPnl);
      grouped.set(s.snapshotTime, existing);
    });
    return Array.from(grouped.values())
      .sort((a, b) => new Date(String(a.time)).getTime() - new Date(String(b.time)).getTime())
      .map(d => ({ ...d, label: toLabel(String(d.time)) }));
  }, [snapshots]);

  if (loading && snapshots.length === 0) {
    return (
      <Center h={250}>
        <Stack align="center" gap="md">
          <Loader size="lg" color="blue" />
          <Text fw={500} c="dimmed">Loading history</Text>
        </Stack>
      </Center>
    );
  }

  if (snapshots.length === 0) {
    return (
      <Center h={150}>
        <Text c="dimmed">No PnL history available for this time range</Text>
      </Center>
    );
  }

  const axisStyle = { fontSize: 11 };
  const gridStyle = { strokeDasharray: '3 3', stroke: 'var(--mantine-color-dark-4)' };

  return (
    <Stack gap="xl">
      <div>
        <Text size="sm" fw={600} mb="xs">Aggregate PnL</Text>
        <ResponsiveContainer width="100%" height={250}>
          <LineChart data={aggregateData}>
            <CartesianGrid {...gridStyle} />
            <XAxis dataKey="label" tick={axisStyle} interval="preserveStartEnd" />
            <YAxis tick={axisStyle} tickFormatter={yTickFormatter} width={70} />
            <RechartsTooltip contentStyle={TOOLTIP_STYLE} formatter={tooltipFormatter} />
            <Legend />
            <Line type="monotone" dataKey="totalPnl" name="Total PnL" stroke="#2f9e44" dot={false} strokeWidth={2} />
            <Line type="monotone" dataKey="realizedPnl" name="Realized" stroke="#4dabf7" dot={false} strokeWidth={1.5} />
            <Line type="monotone" dataKey="unrealizedPnl" name="Unrealized" stroke="#cc5de8" dot={false} strokeWidth={1.5} />
          </LineChart>
        </ResponsiveContainer>
      </div>

      {listingIds.length > 1 && (
        <div>
          <Text size="sm" fw={600} mb="xs">PnL by Listing</Text>
          <ResponsiveContainer width="100%" height={250}>
            <LineChart data={perListingData}>
              <CartesianGrid {...gridStyle} />
              <XAxis dataKey="label" tick={axisStyle} interval="preserveStartEnd" />
              <YAxis tick={axisStyle} tickFormatter={yTickFormatter} width={70} />
              <RechartsTooltip contentStyle={TOOLTIP_STYLE} formatter={tooltipFormatter} />
              <Legend />
              {listingIds.map((id, i) => (
                <Line
                  key={id}
                  type="monotone"
                  dataKey={String(id)}
                  name={`Listing ${id}`}
                  stroke={LINE_COLORS[i % LINE_COLORS.length]}
                  dot={false}
                  strokeWidth={1.5}
                />
              ))}
            </LineChart>
          </ResponsiveContainer>
        </div>
      )}
    </Stack>
  );
}
