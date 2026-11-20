import { useEffect, useRef, useState } from 'react';
import { Box, Group, LoadingOverlay, Skeleton, Text, useComputedColorScheme } from '@mantine/core';
import { ColorType, createChart, HistogramSeries, IChartApi, ISeriesApi, Time } from 'lightweight-charts';
import { DailyPnl, DailyPnlDay } from '../../types';
import { formatMoney, moneyToNumber } from '../../utils/format';
import { volumeSummary } from '../../utils/volume';
import { ChartTooltip, TooltipState } from './ChartTooltip';

// Bars are keyed by calendar date; the chart reports a hovered bar's date as text or as year/month/day.
function dateOf(time: Time): string {
  if (typeof time === 'string') return time;
  if (typeof time === 'number') return new Date(time * 1000).toISOString().slice(0, 10);
  return `${time.year}-${String(time.month).padStart(2, '0')}-${String(time.day).padStart(2, '0')}`;
}

export type DailyMetric = 'pnl' | 'volume' | 'fees';

const UP = 'rgba(18,184,134,0.85)';
const DOWN = 'rgba(250,82,82,0.85)';

// What a day's bar shows: its PnL (green up, red down), the money it traded, or the fees it paid. A registry from
// before volume sends days without it, which show as nothing traded.
const METRICS: Record<DailyMetric, { label: string; empty: string; value: (d: DailyPnlDay) => string; color: (d: DailyPnlDay) => string }> = {
  pnl: { label: 'PnL', empty: 'No PnL in this window', value: d => d.pnl, color: d => (BigInt(d.pnl) < 0n ? DOWN : UP) },
  volume: { label: 'Volume', empty: 'Nothing traded in this window', value: d => d.volume?.notional ?? '0', color: () => 'rgba(116,143,252,0.85)' },
  fees: { label: 'Fees', empty: 'No fees in this window', value: d => d.volume?.fees ?? '0', color: () => 'rgba(255,169,77,0.85)' },
};

interface DailyBarsProps {
  daily: DailyPnl | undefined;
  loading: boolean;
  // A different window is loading while the previous one's days are still drawn.
  refreshing?: boolean;
  metric?: DailyMetric;
  height?: number;
}

// One bar per local day; days are calendar dates, so no time-zone shifting is needed.
export function DailyBars({ daily, loading, refreshing = false, metric = 'pnl', height = 220 }: DailyBarsProps) {
  const shown = METRICS[metric];
  const scheme = useComputedColorScheme('dark');
  const container = useRef<HTMLDivElement>(null);
  const [drawn, setDrawn] = useState<{ chart: IChartApi; bars: ISeriesApi<'Histogram'> } | null>(null);
  const [hover, setHover] = useState<{ date: string; x: number; y: number } | null>(null);

  useEffect(() => {
    if (!container.current) return;
    const dark = scheme === 'dark';
    const chart = createChart(container.current, {
      autoSize: true,
      layout: { background: { type: ColorType.Solid, color: 'transparent' }, textColor: dark ? '#c1c2c5' : '#495057' },
      grid: {
        vertLines: { visible: false },
        horzLines: { color: dark ? 'rgba(255,255,255,0.06)' : 'rgba(0,0,0,0.06)' },
      },
      timeScale: { borderVisible: false },
      rightPriceScale: { borderVisible: false },
    });
    const bars = chart.addSeries(HistogramSeries, {
      priceLineVisible: false,
      priceFormat: { type: 'custom', formatter: (v: number) => formatMoney(BigInt(Math.round(v * 1e9))).text, minMove: 0.01 },
    });
    chart.subscribeCrosshairMove(param => setHover(param.time === undefined || !param.point
      ? null : { date: dateOf(param.time), x: param.point.x, y: param.point.y }));
    setDrawn({ chart, bars });
    return () => {
      setDrawn(null);
      chart.remove();
    };
  }, [scheme]);

  useEffect(() => {
    if (!drawn || !daily) return;
    drawn.bars.setData(daily.days.map(d => ({ time: d.date, value: moneyToNumber(shown.value(d)), color: shown.color(d) })));
    drawn.chart.timeScale().fitContent();
  }, [drawn, daily, shown]);

  const day = hover && daily?.days.find(d => d.date === hover.date);
  const tooltip: TooltipState | null = hover && day ? {
    x: hover.x,
    y: hover.y,
    title: `${day.date} (${daily?.timeZone})`,
    rows: [
      { label: shown.label, color: shown.color(day), value: formatMoney(shown.value(day), metric === 'pnl').text },
      ...(metric === 'volume' && day.volume ? [{ label: 'Fills', color: 'transparent', value: volumeSummary(day.volume) ?? '—' }] : []),
    ],
  } : null;

  return (
    <Box pos="relative" h={height}>
      <div ref={container} style={{ position: 'absolute', inset: 0 }} />
      <ChartTooltip tooltip={tooltip} chartWidth={container.current?.clientWidth ?? 0} />
      <LoadingOverlay visible={refreshing} zIndex={3} overlayProps={{ blur: 1, backgroundOpacity: 0.15 }} loaderProps={{ size: 'sm' }} />
      {loading && !daily && <Skeleton pos="absolute" inset={0} />}
      {daily && daily.days.every(d => shown.value(d) === '0') && (
        <Group pos="absolute" inset={0} justify="center"><Text size="sm" c="dimmed">{shown.empty}</Text></Group>
      )}
    </Box>
  );
}
