import { useEffect, useRef, useState } from 'react';
import { Box, Group, Loader, Text, useComputedColorScheme } from '@mantine/core';
import { ColorType, createChart, HistogramSeries, IChartApi, ISeriesApi } from 'lightweight-charts';
import { DailyPnl } from '../../types';
import { formatMoney, moneyToNumber } from '../../utils/format';

// One bar per local day, green up and red down; days are calendar dates, so no time-zone shifting is needed.
export function DailyBars({ daily, loading, height = 220 }: { daily: DailyPnl | undefined; loading: boolean; height?: number }) {
  const scheme = useComputedColorScheme('dark');
  const container = useRef<HTMLDivElement>(null);
  const [drawn, setDrawn] = useState<{ chart: IChartApi; bars: ISeriesApi<'Histogram'> } | null>(null);

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
    setDrawn({ chart, bars });
    return () => {
      setDrawn(null);
      chart.remove();
    };
  }, [scheme]);

  useEffect(() => {
    if (!drawn || !daily) return;
    drawn.bars.setData(daily.days.map(d => ({
      time: d.date,
      value: moneyToNumber(d.pnl),
      color: BigInt(d.pnl) < 0n ? 'rgba(250,82,82,0.85)' : 'rgba(18,184,134,0.85)',
    })));
    drawn.chart.timeScale().fitContent();
  }, [drawn, daily]);

  return (
    <Box pos="relative" h={height}>
      <div ref={container} style={{ position: 'absolute', inset: 0 }} />
      {loading && !daily && <Group pos="absolute" inset={0} justify="center"><Loader size="sm" /></Group>}
      {daily && daily.days.every(d => d.pnl === '0') && (
        <Group pos="absolute" inset={0} justify="center"><Text size="sm" c="dimmed">No PnL in this window</Text></Group>
      )}
    </Box>
  );
}
