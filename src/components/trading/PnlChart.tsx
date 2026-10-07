import { useEffect, useMemo, useRef, useState } from 'react';
import { Box, Group, Loader, SegmentedControl, Text, useComputedColorScheme } from '@mantine/core';
import {
  AreaSeries, ColorType, createChart, createSeriesMarkers, CrosshairMode, HistogramSeries, IChartApi, ISeriesApi,
  ISeriesMarkersPluginApi, LineSeries, SeriesMarker, SeriesType, Time, UTCTimestamp,
} from 'lightweight-charts';
import { usePreferences } from '../../context/PreferencesContext';
import { PnlSeries, SeriesEventKind } from '../../types';
import { formatMoney, formatQty, formatTime, moneyToNumber, sizeToNumber } from '../../utils/format';
import { chartPoints, ChartPoint, chartTime, drawdown, fromChartTime, snapToPoint } from './chart-data';
import { ChartTooltip, TooltipState } from './ChartTooltip';

export type ChartView = 'total' | 'listings' | 'position' | 'fees';

const LISTING_COLORS = ['#4dabf7', '#ffa94d', '#da77f2', '#69db7c', '#ffd43b', '#f783ac', '#3bc9db', '#a9e34b'];

const EVENT_STYLE: Record<SeriesEventKind, { color: string; shape: 'arrowUp' | 'arrowDown' | 'circle' | 'square'; text: string }> = {
  SESSION_START: { color: '#40c057', shape: 'arrowUp', text: 'start' },
  SESSION_STOP: { color: '#868e96', shape: 'arrowDown', text: 'stop' },
  RESET: { color: '#fa5252', shape: 'square', text: 'reset' },
  ADJUSTMENT: { color: '#fd7e14', shape: 'square', text: 'adjusted' },
  MANUAL: { color: '#fab005', shape: 'square', text: 'manual trade' },
  GAP: { color: '#fa5252', shape: 'circle', text: 'gap' },
  RECOVERY: { color: '#4dabf7', shape: 'circle', text: 'recovered' },
};

interface Line {
  name: string;
  color: string;
  points: ChartPoint[];
  // How the axis, crosshair and legend write this line's values.
  format: (value: number) => string;
  minMove: number;
}

const MONEY_STEP = 0.01;

function money(value: number): string {
  return formatMoney(BigInt(Math.round(value * 1e9))).text;
}

// Quantities at the listing's lot size, as the tables show them.
function quantity(lotSize: string | null): Pick<Line, 'format' | 'minMove'> {
  return {
    format: (value: number) => formatQty(BigInt(Math.round(value * 1e6)), lotSize),
    minMove: lotSize ? Number(lotSize) / 1e6 : 1,
  };
}

interface PnlChartProps {
  series: PnlSeries | undefined;
  loading: boolean;
  // A session's chart has every view; a strategy's shows its total.
  views?: ChartView[];
  height?: number;
}

export function PnlChart({ series, loading, views = ['total'], height = 280 }: PnlChartProps) {
  const { timeZone } = usePreferences();
  const scheme = useComputedColorScheme('dark');
  const [view, setView] = useState<ChartView>(views[0]);
  const container = useRef<HTMLDivElement>(null);
  const [chart, setChart] = useState<IChartApi | null>(null);
  // The series drawn for the current set of lines, kept across polls so new data updates them in place.
  const drawn = useRef<{ lines: ISeriesApi<SeriesType>[]; drawdown: ISeriesApi<SeriesType> | null;
    markers: ISeriesMarkersPluginApi<Time> | null } | null>(null);
  const [hover, setHover] = useState<{ time: number; x: number; y: number } | null>(null);

  const lines = useMemo<Line[]>(() => {
    if (!series) return [];
    const pts = (values: string[], toNumber: (v: string) => number) => chartPoints(series.t, values.map(toNumber), timeZone);
    switch (view) {
      case 'total':
        return [
          { name: 'Total', color: '#4dabf7', points: pts(series.total, moneyToNumber), format: money, minMove: MONEY_STEP },
          { name: 'Realized', color: '#adb5bd', points: pts(series.realized, moneyToNumber), format: money, minMove: MONEY_STEP },
        ];
      case 'fees':
        return [{ name: 'Fees', color: '#ffa94d', points: pts(series.fees, moneyToNumber), format: money, minMove: MONEY_STEP }];
      case 'listings':
        return series.listings.map((l, i) => ({
          name: l.symbol ?? String(l.listingId), color: LISTING_COLORS[i % LISTING_COLORS.length],
          points: pts(l.total, moneyToNumber), format: money, minMove: MONEY_STEP,
        }));
      case 'position':
        return series.listings.map((l, i) => ({
          name: l.symbol ?? String(l.listingId), color: LISTING_COLORS[i % LISTING_COLORS.length],
          points: pts(l.netQuantity, sizeToNumber), ...quantity(l.lotSize),
        }));
    }
  }, [series, view, timeZone]);

  const drawdownPoints = useMemo(() => (view === 'total' && lines.length > 0 ? drawdown(lines[0].points) : []), [view, lines]);

  // Which series exist: a different view or a different set of listings draws new ones. Anything else (a poll's new
  // points) only updates their data, which keeps the viewer's zoom and lets the chart follow the newest point.
  const structure = `${view}|${lines.map(l => l.name).join(',')}`;

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
      crosshair: { mode: CrosshairMode.Magnet },
      timeScale: { timeVisible: true, secondsVisible: true, borderVisible: false },
      rightPriceScale: { borderVisible: false },
    });
    created.subscribeCrosshairMove(param => setHover(param.time === undefined || !param.point
      ? null : { time: Number(param.time), x: param.point.x, y: param.point.y }));
    setChart(created);
    return () => {
      // Its series go with it; React may run the series effect's cleanup after this one, so that must not touch it.
      drawn.current = null;
      setChart(null);
      created.remove();
    };
  }, [scheme]);

  useEffect(() => {
    if (!chart || lines.length === 0) return;
    const total = view === 'total';
    const seriesForLines: ISeriesApi<SeriesType>[] = lines.map((line, i) => {
      const options = {
        color: line.color,
        lineWidth: (i === 0 && total ? 2 : 1) as 1 | 2,
        priceFormat: { type: 'custom' as const, formatter: line.format, minMove: line.minMove },
        lastValueVisible: true,
        priceLineVisible: false,
      };
      return i === 0 && total
        ? chart.addSeries(AreaSeries, {
          ...options, lineColor: line.color, topColor: 'rgba(77,171,247,0.25)', bottomColor: 'rgba(77,171,247,0.02)',
        })
        : chart.addSeries(LineSeries, options);
    });
    const dd = total
      ? chart.addSeries(HistogramSeries, {
        color: 'rgba(250,82,82,0.6)',
        priceFormat: { type: 'custom', formatter: money, minMove: MONEY_STEP },
        lastValueVisible: false,
        priceLineVisible: false,
      }, 1)
      : null;
    if (dd) chart.panes()[1]?.setHeight(Math.round(height * 0.22));
    const current = { lines: seriesForLines, drawdown: dd, markers: total ? createSeriesMarkers(seriesForLines[0], []) : null };
    drawn.current = current;
    return () => {
      if (drawn.current !== current) return;
      drawn.current = null;
      for (const s of [...current.lines, ...(current.drawdown ? [current.drawdown] : [])]) chart.removeSeries(s);
    };
    // Rebuilt only when the structure changes; `lines` is read for it, its data is set below.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [chart, structure, height]);

  // Fits the chart to its data when a new set of series is first filled, not on every poll.
  const fitted = useRef<string | null>(null);

  useEffect(() => {
    const current = drawn.current;
    if (!chart || !current || current.lines.length !== lines.length) return;
    lines.forEach((line, i) => {
      current.lines[i].setData(line.points.map(p => ({ time: p.time as UTCTimestamp, value: p.value })));
    });
    if (current.drawdown) {
      current.drawdown.setData(drawdownPoints.map(p => ({ time: p.time as UTCTimestamp, value: p.value })));
    }
    if (current.markers && series) {
      const markers: SeriesMarker<Time>[] = [];
      for (const event of series.events) {
        const time = snapToPoint(lines[0].points, chartTime(Date.parse(event.time), timeZone));
        if (time === null) continue;
        const style = EVENT_STYLE[event.kind];
        const impact = event.pnlImpact && event.pnlImpact !== '0' ? ` ${formatMoney(event.pnlImpact).text}` : '';
        markers.push({ time: time as UTCTimestamp, position: 'aboveBar', color: style.color, shape: style.shape, text: `${style.text}${impact}` });
      }
      current.markers.setMarkers(markers);
    }
    const key = `${structure}|${series?.t[0] ?? ''}|${timeZone}`;
    if (fitted.current !== key) {
      fitted.current = key;
      chart.timeScale().fitContent();
    }
  }, [chart, lines, drawdownPoints, series, structure, timeZone]);

  const legendTime = hover?.time ?? lines[0]?.points[lines[0].points.length - 1]?.time ?? null;
  const valueAt = (line: Line, time: number) => [...line.points].reverse().find(p => p.time <= time);
  // The Total view's lower pane: how far below its best the total sits at the hovered time.
  const drawdownLine: Line | null = view === 'total' && lines.length > 0
    ? { name: 'Drawdown', color: 'rgba(250,82,82,0.8)', points: drawdownPoints, format: money, minMove: MONEY_STEP }
    : null;
  const tooltip: TooltipState | null = hover && {
    x: hover.x,
    y: hover.y,
    title: formatTime(fromChartTime(hover.time, timeZone), timeZone),
    rows: [...lines, ...(drawdownLine ? [drawdownLine] : [])].map(line => {
      const point = valueAt(line, hover.time);
      return { label: line.name, color: line.color, value: point === undefined ? '—' : line.format(point.value) };
    }),
  };
  return (
    <Box>
      <Group justify="space-between" mb={6} wrap="nowrap">
        <Group gap="md" wrap="wrap" style={{ minHeight: 22 }}>
          {legendTime !== null && lines.map(line => {
            const point = valueAt(line, legendTime);
            return (
              <Group key={line.name} gap={4} wrap="nowrap">
                <Box w={10} h={3} style={{ background: line.color, borderRadius: 2 }} />
                <Text size="xs" c="dimmed">{line.name}</Text>
                <Text size="xs" fw={600} style={{ fontVariantNumeric: 'tabular-nums' }}>
                  {point === undefined ? '—' : line.format(point.value)}
                </Text>
              </Group>
            );
          })}
          {legendTime !== null && series && (
            <Text size="xs" c="dimmed">at {formatTime(fromChartTime(legendTime, timeZone), timeZone)}</Text>
          )}
        </Group>
        {views.length > 1 && (
          <SegmentedControl
            size="xs"
            value={view}
            onChange={v => setView(v as ChartView)}
            data={views.map(v => ({ value: v, label: { total: 'Total', listings: 'By listing', position: 'Position', fees: 'Fees' }[v] }))}
          />
        )}
      </Group>
      <Box pos="relative" h={height}>
        <div ref={container} style={{ position: 'absolute', inset: 0 }} />
        <ChartTooltip tooltip={tooltip} chartWidth={container.current?.clientWidth ?? 0} />
        {loading && !series && (
          <Group pos="absolute" inset={0} justify="center"><Loader size="sm" /></Group>
        )}
        {series && series.t.length <= 1 && !loading && (
          <Group pos="absolute" inset={0} justify="center"><Text size="sm" c="dimmed">Nothing to chart yet</Text></Group>
        )}
      </Box>
      {series && (
        <Text size="xs" c="dimmed" mt={4}>
          One point per {series.resolutionMs >= 60_000 ? `${series.resolutionMs / 60_000} min` : `${series.resolutionMs / 1000}s`}
          {' '}· marked at the mid (else the last trade); drawdown below
        </Text>
      )}
    </Box>
  );
}
