import React, { useMemo, useState } from 'react';
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
import { Center, Loader, Stack, Tabs, Text } from '@mantine/core';
import { PnlSnapshot } from '../types';
import { unscaleNotional, unscalePrice, unscaleSize } from '../utils/security-master';

const LINE_COLORS = ['#4c6ef5', '#f76707', '#2f9e44', '#ae3ec9', '#e03131', '#1098ad', '#f59f00', '#74c0fc'];

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

function bucketTime(isoTime: string): string {
  const d = new Date(isoTime);
  const rounded = Math.round(d.getSeconds() / 30) * 30;
  d.setSeconds(rounded, 0);
  return d.toISOString();
}

function toLabel(isoTime: string) {
  return new Date(isoTime).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}

function toTooltipLabel(isoTime: string) {
  return new Date(isoTime).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });
}

function tooltipLabelFormatter(_label: React.ReactNode, payload: readonly any[]) {
  return payload?.[0]?.payload?.tooltipLabel ?? _label;
}

interface SessionPnlChartsProps {
  snapshots: PnlSnapshot[];
  loading: boolean;
}

export function SessionPnlCharts({ snapshots, loading }: SessionPnlChartsProps) {
  const [activeTab, setActiveTab] = useState<string | null>('aggregate');

  const listingIds = useMemo(
    () => [...new Set(snapshots.map(s => s.listingId))].sort((a, b) => a - b),
    [snapshots],
  );

  const aggregateData = useMemo(() => {
    const grouped = new Map<string, { time: string; totalPnl: number; realizedPnl: number; unrealizedPnl: number }>();
    snapshots.forEach(s => {
      const key = bucketTime(s.snapshotTime);
      const existing = grouped.get(key) ?? { time: key, totalPnl: 0, realizedPnl: 0, unrealizedPnl: 0 };
      existing.totalPnl += Number(s.totalPnl);
      existing.realizedPnl += Number(s.realizedPnl);
      existing.unrealizedPnl += Number(s.unrealizedPnl);
      grouped.set(key, existing);
    });
    return Array.from(grouped.values())
      .sort((a, b) => new Date(a.time).getTime() - new Date(b.time).getTime())
      .map(d => ({
        label: toLabel(d.time),
        tooltipLabel: toTooltipLabel(d.time),
        totalPnl: unscaleNotional(d.totalPnl),
        realizedPnl: unscaleNotional(d.realizedPnl),
        unrealizedPnl: unscaleNotional(d.unrealizedPnl),
      }));
  }, [snapshots]);

  const perListingData = useMemo(() => {
    const grouped = new Map<string, Record<string, number | string>>();
    snapshots.forEach(s => {
      const key = bucketTime(s.snapshotTime);
      const existing = grouped.get(key) ?? { time: key };
      existing[String(s.listingId)] = unscaleNotional(Number(s.totalPnl));
      grouped.set(key, existing);
    });
    return Array.from(grouped.values())
      .sort((a, b) => new Date(String(a.time)).getTime() - new Date(String(b.time)).getTime())
      .map(d => ({ ...d, label: toLabel(String(d.time)), tooltipLabel: toTooltipLabel(String(d.time)) }));
  }, [snapshots]);

  const aggregateFeesData = useMemo(() => {
    const grouped = new Map<string, { time: string; totalFees: number }>();
    snapshots.forEach(s => {
      const key = bucketTime(s.snapshotTime);
      const existing = grouped.get(key) ?? { time: key, totalFees: 0 };
      existing.totalFees += Number(s.totalFees);
      grouped.set(key, existing);
    });
    return Array.from(grouped.values())
      .sort((a, b) => new Date(a.time).getTime() - new Date(b.time).getTime())
      .map(d => ({ label: toLabel(d.time), tooltipLabel: toTooltipLabel(d.time), totalFees: unscalePrice(d.totalFees) }));
  }, [snapshots]);

  const perListingFeesData = useMemo(() => {
    const grouped = new Map<string, Record<string, number | string>>();
    snapshots.forEach(s => {
      const key = bucketTime(s.snapshotTime);
      const existing = grouped.get(key) ?? { time: key };
      existing[String(s.listingId)] = unscalePrice(Number(s.totalFees));
      grouped.set(key, existing);
    });
    return Array.from(grouped.values())
      .sort((a, b) => new Date(String(a.time)).getTime() - new Date(String(b.time)).getTime())
      .map(d => ({ ...d, label: toLabel(String(d.time)), tooltipLabel: toTooltipLabel(String(d.time)) }));
  }, [snapshots]);

  const positionsData = useMemo(() => {
    const grouped = new Map<string, Record<string, number | string>>();
    snapshots.forEach(s => {
      const key = bucketTime(s.snapshotTime);
      const existing = grouped.get(key) ?? { time: key };
      existing[String(s.listingId)] = unscaleSize(Number(s.netQuantity));
      grouped.set(key, existing);
    });
    return Array.from(grouped.values())
      .sort((a, b) => new Date(String(a.time)).getTime() - new Date(String(b.time)).getTime())
      .map(d => ({ ...d, label: toLabel(String(d.time)), tooltipLabel: toTooltipLabel(String(d.time)) }));
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
    <Tabs value={activeTab} onChange={setActiveTab}>
      <Tabs.List mb="sm">
        <Tabs.Tab value="aggregate">Aggregate</Tabs.Tab>
        <Tabs.Tab value="by-listing">By Listing</Tabs.Tab>
        <Tabs.Tab value="positions">Positions</Tabs.Tab>
        <Tabs.Tab value="fees">Fees</Tabs.Tab>
      </Tabs.List>

      <Tabs.Panel value="aggregate">
        <ResponsiveContainer width="100%" height={250}>
          <LineChart data={aggregateData}>
            <CartesianGrid {...gridStyle} />
            <XAxis dataKey="label" tick={axisStyle} interval="preserveStartEnd" />
            <YAxis tick={axisStyle} tickFormatter={yTickFormatter} width={70} />
            <RechartsTooltip contentStyle={TOOLTIP_STYLE} formatter={tooltipFormatter} labelFormatter={tooltipLabelFormatter} />
            <Legend />
            <Line type="monotone" dataKey="totalPnl" name="Total PnL" stroke="#2f9e44" dot={false} strokeWidth={2} />
            <Line type="monotone" dataKey="realizedPnl" name="Realized" stroke="#4c6ef5" dot={false} strokeWidth={1.5} />
            <Line type="monotone" dataKey="unrealizedPnl" name="Unrealized" stroke="#f76707" dot={false} strokeWidth={1.5} />
          </LineChart>
        </ResponsiveContainer>
      </Tabs.Panel>

      <Tabs.Panel value="by-listing">
        <ResponsiveContainer width="100%" height={250}>
          <LineChart data={perListingData}>
            <CartesianGrid {...gridStyle} />
            <XAxis dataKey="label" tick={axisStyle} interval="preserveStartEnd" />
            <YAxis tick={axisStyle} tickFormatter={yTickFormatter} width={70} />
            <RechartsTooltip contentStyle={TOOLTIP_STYLE} formatter={tooltipFormatter} labelFormatter={tooltipLabelFormatter} />
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
      </Tabs.Panel>

      <Tabs.Panel value="positions">
        <ResponsiveContainer width="100%" height={250}>
          <LineChart data={positionsData}>
            <CartesianGrid {...gridStyle} />
            <XAxis dataKey="label" tick={axisStyle} interval="preserveStartEnd" />
            <YAxis tick={axisStyle} tickFormatter={yTickFormatter} width={70} />
            <RechartsTooltip contentStyle={TOOLTIP_STYLE} formatter={tooltipFormatter} labelFormatter={tooltipLabelFormatter} />
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
      </Tabs.Panel>
      <Tabs.Panel value="fees">
        <Stack gap="md">
          <ResponsiveContainer width="100%" height={200}>
            <LineChart data={aggregateFeesData}>
              <CartesianGrid {...gridStyle} />
              <XAxis dataKey="label" tick={axisStyle} interval="preserveStartEnd" />
              <YAxis tick={axisStyle} tickFormatter={yTickFormatter} width={70} />
              <RechartsTooltip contentStyle={TOOLTIP_STYLE} formatter={tooltipFormatter} labelFormatter={tooltipLabelFormatter} />
              <Legend />
              <Line type="monotone" dataKey="totalFees" name="Total Fees" stroke="#e03131" dot={false} strokeWidth={2} />
            </LineChart>
          </ResponsiveContainer>
          <ResponsiveContainer width="100%" height={200}>
            <LineChart data={perListingFeesData}>
              <CartesianGrid {...gridStyle} />
              <XAxis dataKey="label" tick={axisStyle} interval="preserveStartEnd" />
              <YAxis tick={axisStyle} tickFormatter={yTickFormatter} width={70} />
              <RechartsTooltip contentStyle={TOOLTIP_STYLE} formatter={tooltipFormatter} labelFormatter={tooltipLabelFormatter} />
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
        </Stack>
      </Tabs.Panel>
    </Tabs>
  );
}
