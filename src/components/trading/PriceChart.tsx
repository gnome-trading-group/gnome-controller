import { useEffect, useMemo, useRef, useState } from 'react';
import { Box, Group, Loader, Text, useComputedColorScheme } from '@mantine/core';
import {
  ColorType, createChart, createSeriesMarkers, CrosshairMode, IChartApi, ISeriesApi, ISeriesMarkersPluginApi,
  LineSeries, LineStyle, LineType, SeriesMarker, Time, UTCTimestamp,
} from 'lightweight-charts';
import { usePreferences } from '../../context/PreferencesContext';
import { LedgerFill, PnlSeries, PriceHistory } from '../../types';
import { formatMoney, formatPrice, formatQty, moneyToNumber, sizeToNumber } from '../../utils/format';
import { chartPoints, chartTime, ChartPoint, snapToPoint } from './chart-data';

// Past this many fills a marker's text would bury the price line; the markers alone still show where trading was.
const LABELLED_FILLS = 40;

interface PriceChartProps {
  prices: PriceHistory | undefined;
  // The strategy's series for this one listing: its position and PnL over the same window.
  series: PnlSeries | undefined;
  fills: LedgerFill[] | undefined;
  tickSize: string | null;
  lotSize: string | null;
  cents: boolean;
  loading: boolean;
  height?: number;
}

interface Drawn {
  mark: ISeriesApi<'Line'>;
  bid: ISeriesApi<'Line'>;
  ask: ISeriesApi<'Line'>;
  position: ISeriesApi<'Line'>;
  pnl: ISeriesApi<'Line'>;
  markers: ISeriesMarkersPluginApi<Time>;
}

function data(points: ChartPoint[]) {
  return points.map(p => ({ time: p.time as UTCTimestamp, value: p.value }));
}

// Known prices only: 0 means no price, which would otherwise be drawn as a crash to zero.
function known(points: ChartPoint[]): ChartPoint[] {
  return points.filter(p => p.value !== 0);
}

export function PriceChart({ prices, series, fills, tickSize, lotSize, cents, loading, height = 420 }: PriceChartProps) {
  const { timeZone } = usePreferences();
  const scheme = useComputedColorScheme('dark');
  const container = useRef<HTMLDivElement>(null);
  const [chart, setChart] = useState<IChartApi | null>(null);
  const drawn = useRef<Drawn | null>(null);
  const fitted = useRef<string | null>(null);

  const price = useMemo(() => (v: number) => formatPrice(BigInt(Math.round(v * 1e9)), { tickSize, cents, derived: true }), [tickSize, cents]);
  const quantity = useMemo(() => (v: number) => formatQty(BigInt(Math.round(v * 1e6)), lotSize), [lotSize]);

  useEffect(() => {
    if (!container.current) return;
    const dark = scheme === 'dark';
    const created = createChart(container.current, {
      autoSize: true,
      layout: {
        background: { type: ColorType.Solid, color: 'transparent' },
        textColor: dark ? '#c1c2c5' : '#495057',
        panes: { separatorColor: dark ? '#373a40' : '#dee2e6' },
      },
      grid: {
        vertLines: { color: dark ? 'rgba(255,255,255,0.04)' : 'rgba(0,0,0,0.05)' },
        horzLines: { color: dark ? 'rgba(255,255,255,0.06)' : 'rgba(0,0,0,0.06)' },
      },
      crosshair: { mode: CrosshairMode.Normal },
      timeScale: { timeVisible: true, secondsVisible: true, borderVisible: false },
      rightPriceScale: { borderVisible: false },
    });
    const priceFormat = { type: 'custom' as const, formatter: price, minMove: tickSize ? Number(tickSize) / 1e9 : 0.0001 };
    const common = { lastValueVisible: false, priceLineVisible: false };
    const mark = created.addSeries(LineSeries, { ...common, color: '#4dabf7', lineWidth: 2, priceFormat, lastValueVisible: true, title: 'mark' });
    const bid = created.addSeries(LineSeries, { ...common, color: 'rgba(56,217,169,0.6)', lineWidth: 1, lineStyle: LineStyle.Dotted, priceFormat, title: 'bid' });
    const ask = created.addSeries(LineSeries, { ...common, color: 'rgba(255,107,107,0.6)', lineWidth: 1, lineStyle: LineStyle.Dotted, priceFormat, title: 'ask' });
    const position = created.addSeries(LineSeries, {
      ...common, color: '#ffa94d', lineWidth: 2, lineType: LineType.WithSteps, title: 'position',
      priceFormat: { type: 'custom', formatter: quantity, minMove: lotSize ? Number(lotSize) / 1e6 : 1 },
    }, 1);
    const pnl = created.addSeries(LineSeries, {
      ...common, color: '#da77f2', lineWidth: 2, title: 'PnL', lastValueVisible: true,
      priceFormat: { type: 'custom', formatter: (v: number) => formatMoney(BigInt(Math.round(v * 1e9))).text, minMove: 0.01 },
    }, 2);
    created.panes()[1]?.setHeight(Math.round(height * 0.2));
    created.panes()[2]?.setHeight(Math.round(height * 0.2));
    drawn.current = { mark, bid, ask, position, pnl, markers: createSeriesMarkers(mark, []) };
    fitted.current = null;
    setChart(created);
    return () => {
      drawn.current = null;
      setChart(null);
      created.remove();
    };
  }, [scheme, height, price, quantity, tickSize, lotSize]);

  useEffect(() => {
    const d = drawn.current;
    if (!chart || !d) return;
    const markPoints = prices ? known(chartPoints(prices.t, prices.mark.map(moneyToNumber), timeZone)) : [];
    d.mark.setData(data(markPoints));
    d.bid.setData(data(prices ? known(chartPoints(prices.t, prices.bid.map(moneyToNumber), timeZone)) : []));
    d.ask.setData(data(prices ? known(chartPoints(prices.t, prices.ask.map(moneyToNumber), timeZone)) : []));
    const listing = series?.listings[0];
    d.position.setData(data(series && listing ? chartPoints(series.t, listing.netQuantity.map(sizeToNumber), timeZone) : []));
    d.pnl.setData(data(series && listing ? chartPoints(series.t, listing.total.map(moneyToNumber), timeZone) : []));

    const traded = (fills ?? [])
      .filter(f => f.fillPrice !== null && f.side !== null)
      .sort((a, b) => a.recordedAt.localeCompare(b.recordedAt));
    const labelled = traded.length <= LABELLED_FILLS;
    const markers: SeriesMarker<Time>[] = [];
    for (const f of traded) {
      // On the mark line, at the price point in force when it filled.
      const time = snapToPoint(markPoints, chartTime(Date.parse(f.recordedAt), timeZone));
      if (time === null) continue;
      const buy = f.side === 0;
      markers.push({
        time: time as UTCTimestamp,
        position: buy ? 'belowBar' : 'aboveBar',
        shape: buy ? 'arrowUp' : 'arrowDown',
        color: buy ? '#38d9a9' : '#ff6b6b',
        text: labelled ? `${buy ? '+' : '−'}${formatQty(f.fillQty, lotSize)} @ ${formatPrice(f.fillPrice, { tickSize, cents })}` : undefined,
      });
    }
    d.markers.setMarkers(markers);

    const key = `${prices?.t[0] ?? ''}|${timeZone}`;
    if (fitted.current !== key && markPoints.length > 0) {
      fitted.current = key;
      chart.timeScale().fitContent();
    }
  }, [chart, prices, series, fills, timeZone, tickSize, lotSize, cents]);

  const empty = !loading && prices !== undefined && prices.t.length === 0;
  return (
    <Box>
      <Group gap="md" mb={6}>
        {[['mark', '#4dabf7'], ['bid', '#38d9a9'], ['ask', '#ff6b6b'], ['position (middle)', '#ffa94d'], ['PnL (bottom)', '#da77f2']].map(([name, color]) => (
          <Group key={name} gap={4} wrap="nowrap">
            <Box w={10} h={3} style={{ background: color, borderRadius: 2 }} />
            <Text size="xs" c="dimmed">{name}</Text>
          </Group>
        ))}
        <Text size="xs" c="dimmed">▲ buy ▼ sell</Text>
      </Group>
      <Box pos="relative" h={height}>
        <div ref={container} style={{ position: 'absolute', inset: 0 }} />
        {loading && !prices && <Group pos="absolute" inset={0} justify="center"><Loader size="sm" /></Group>}
        {empty && <Group pos="absolute" inset={0} justify="center"><Text size="sm" c="dimmed">No prices recorded in this window</Text></Group>}
      </Box>
    </Box>
  );
}
