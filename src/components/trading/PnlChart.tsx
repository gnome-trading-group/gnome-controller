import { useEffect, useMemo, useRef, useState } from 'react';
import { Box, Group, LoadingOverlay, SegmentedControl, Skeleton, Text, UnstyledButton, useComputedColorScheme } from '@mantine/core';
import {
  AreaSeries, ColorType, createChart, createSeriesMarkers, CrosshairMode, HistogramSeries, IChartApi, ISeriesApi,
  ISeriesMarkersPluginApi, LineSeries, SeriesMarker, SeriesType, Time, UTCTimestamp,
} from 'lightweight-charts';
import { usePreferences } from '../../context/PreferencesContext';
import { PnlSeries, SeriesEventKind } from '../../types';
import { formatMoney, formatQty, formatTime, moneyToNumber, sizeToNumber } from '../../utils/format';
import {
  chartPoints, ChartPoint, chartTime, chartZoneOptions, drawdown, fromChartTime, pointAt, snapToPoint, volumeBars,
} from './chart-data';
import { ChartTooltip, TooltipState } from './ChartTooltip';
import { MarkerKind, MarkerToggles } from './MarkerToggles';

export type ChartView = 'total' | 'listings' | 'position' | 'fees';

// One per line the registry draws by listing (MAX_SERIES_LISTINGS), so none repeats; everything else is `other`.
const LISTING_COLORS = [
  '#4dabf7', '#ffa94d', '#da77f2', '#69db7c', '#ffd43b', '#f783ac', '#3bc9db', '#a9e34b', '#ff8787', '#9775fa',
  '#38d9a9', '#748ffc', '#e599f7', '#1c7ed6', '#e8590c', '#ae3ec9', '#2f9e44', '#f08c00', '#d6336c', '#0c8599',
  '#66a80f', '#e03131', '#7048e8', '#099268', '#4263eb',
];
const OTHER_COLOR = '#868e96';

const EVENT_STYLE: Record<SeriesEventKind, { color: string; shape: MarkerKind['shape']; text: string }> = {
  SESSION_START: { color: '#40c057', shape: 'arrowUp', text: 'start' },
  SESSION_STOP: { color: '#868e96', shape: 'arrowDown', text: 'stop' },
  RESET: { color: '#fa5252', shape: 'square', text: 'reset' },
  ADJUSTMENT: { color: '#fd7e14', shape: 'square', text: 'adjusted' },
  MANUAL: { color: '#fab005', shape: 'square', text: 'manual trade' },
  SETTLEMENT: { color: '#7950f2', shape: 'square', text: 'settled' },
  GAP: { color: '#fa5252', shape: 'circle', text: 'gap' },
  RECOVERY: { color: '#4dabf7', shape: 'circle', text: 'recovered' },
  REWARD: { color: '#12b886', shape: 'circle', text: 'reward' },
  NON_TRADING: { color: '#15aabf', shape: 'circle', text: 'non-trading' },
};

interface Line {
  key: string;
  name: string;
  color: string;
  points: ChartPoint[];
  // How the axis, crosshair and legend write this line's values.
  format: (value: number) => string;
  minMove: number;
}

const MONEY_STEP = 0.01;

// The Total view's lower panes, top to bottom, each switched off from the chart's footer and remembered.
type Pane = 'drawdown' | 'volume' | 'capital';

const PANES: { pane: Pane; label: string; hint: string }[] = [
  { pane: 'drawdown', label: 'Drawdown', hint: 'How far the total sits below its best so far' },
  { pane: 'volume', label: 'Volume', hint: 'Money traded in each step, the maker part in green' },
  { pane: 'capital', label: 'Capital at risk', hint: "What the held positions tie up: a binary contract's worst loss if it settles against it, anything else its cost" },
];

interface PaneLine extends Line {
  pane: Pane;
  bars: boolean;
}

function PaneToggles({ panes }: { panes: Pane[] }) {
  const { hiddenPanes, setPaneHidden } = usePreferences();
  return (
    <Group gap="sm" wrap="wrap">
      {PANES.filter(p => panes.includes(p.pane)).map(({ pane, label, hint }) => {
        const hidden = hiddenPanes.has(pane);
        return (
          <UnstyledButton
            key={pane}
            onClick={() => setPaneHidden(pane, !hidden)}
            aria-pressed={!hidden}
            title={`${hidden ? 'Show' : 'Hide'} ${label.toLowerCase()}: ${hint}`}
            style={{ opacity: hidden ? 0.4 : 1 }}
          >
            <Text span size="xs" c="dimmed" td={hidden ? 'line-through' : undefined}>{label}</Text>
          </UnstyledButton>
        );
      })}
    </Group>
  );
}

// Listings held or traded in the window that the registry left out of the per-listing lines.
function hiddenListings(series: PnlSeries): number {
  return Math.max(0, series.listingCount - series.listings.length);
}

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
  // A different window or scope is loading while the previous one's data is still drawn.
  refreshing?: boolean;
  // A session's chart has every view; a strategy's shows its total.
  views?: ChartView[];
  onViewChange?: (view: ChartView) => void;
  height?: number;
}

export function PnlChart({ series, loading, refreshing = false, views = ['total'], onViewChange, height = 280 }: PnlChartProps) {
  const { timeZone, hiddenMarkers, hiddenPanes } = usePreferences();
  const scheme = useComputedColorScheme('dark');
  const [view, setView] = useState<ChartView>(views[0]);
  const container = useRef<HTMLDivElement>(null);
  const [chart, setChart] = useState<IChartApi | null>(null);
  // The series drawn for the current set of lines, kept across polls so new data updates them in place.
  const drawn = useRef<{ lines: ISeriesApi<SeriesType>[]; panes: ISeriesApi<SeriesType>[];
    markers: ISeriesMarkersPluginApi<Time> | null } | null>(null);
  const [hover, setHover] = useState<{ time: number; x: number; y: number } | null>(null);

  const lines = useMemo<Line[]>(() => {
    if (!series) return [];
    const pts = (values: string[], toNumber: (v: string) => number) => chartPoints(series.t, values.map(toNumber));
    switch (view) {
      case 'total':
        return [
          { key: 'total', name: 'Total', color: '#4dabf7', points: pts(series.total, moneyToNumber), format: money, minMove: MONEY_STEP },
          { key: 'realized', name: 'Realized', color: '#adb5bd', points: pts(series.realized, moneyToNumber), format: money, minMove: MONEY_STEP },
        ];
      case 'fees':
        return [{ key: 'fees', name: 'Fees', color: '#ffa94d', points: pts(series.fees, moneyToNumber), format: money, minMove: MONEY_STEP }];
      case 'listings': {
        const own: Line[] = series.listings.map((l, i) => ({
          key: String(l.listingId), name: l.symbol ?? String(l.listingId), color: LISTING_COLORS[i % LISTING_COLORS.length],
          points: pts(l.total, moneyToNumber), format: money, minMove: MONEY_STEP,
        }));
        const other = series.other && (hiddenListings(series) > 0 || series.other.some(v => v !== '0'))
          ? [{ key: 'other', name: 'Other', color: OTHER_COLOR, points: pts(series.other, moneyToNumber), format: money, minMove: MONEY_STEP }]
          : [];
        return [...own, ...other];
      }
      case 'position':
        return series.listings.map((l, i) => ({
          key: String(l.listingId), name: l.symbol ?? String(l.listingId), color: LISTING_COLORS[i % LISTING_COLORS.length],
          points: pts(l.netQuantity, sizeToNumber), ...quantity(l.lotSize),
        }));
    }
  }, [series, view]);

  const markerKinds = useMemo<MarkerKind[]>(() => {
    const present = new Set(series?.events.map(e => e.kind) ?? []);
    return (Object.keys(EVENT_STYLE) as SeriesEventKind[])
      .filter(kind => present.has(kind))
      .map(kind => ({ key: `pnl:${kind}`, label: EVENT_STYLE[kind].text, color: EVENT_STYLE[kind].color, shape: EVENT_STYLE[kind].shape }));
  }, [series]);

  // A registry from before volume and capital sends neither, and the chart leaves those panes out.
  const available = useMemo<Pane[]>(() => (view !== 'total' || !series ? [] : [
    'drawdown' as const,
    ...(series.volume ? ['volume' as const] : []),
    ...(series.capital ? ['capital' as const] : []),
  ]), [series, view]);

  const paneLines = useMemo<PaneLine[]>(() => {
    if (!series || lines.length === 0) return [];
    const shown = available.filter(p => !hiddenPanes.has(p));
    const out: PaneLine[] = [];
    const moneyLine = { format: money, minMove: MONEY_STEP };
    if (shown.includes('drawdown')) {
      out.push({ pane: 'drawdown', bars: true, key: 'drawdown', name: 'Drawdown', color: 'rgba(250,82,82,0.6)',
        points: drawdown(lines[0].points), ...moneyLine });
    }
    if (shown.includes('volume')) {
      const bars = volumeBars(series.t, series.volume.map(moneyToNumber), series.maker.map(moneyToNumber), series.resolutionMs);
      out.push(
        { pane: 'volume', bars: true, key: 'volume', name: 'Volume', color: 'rgba(134,142,150,0.7)',
          points: bars.map(b => ({ time: b.time, value: b.total })), ...moneyLine },
        { pane: 'volume', bars: true, key: 'maker', name: 'Maker', color: 'rgba(32,201,151,0.8)',
          points: bars.map(b => ({ time: b.time, value: b.maker })), ...moneyLine },
      );
    }
    if (shown.includes('capital')) {
      out.push({ pane: 'capital', bars: false, key: 'capital', name: 'Capital at risk', color: '#fab005',
        points: chartPoints(series.t, series.capital.map(moneyToNumber)), ...moneyLine });
    }
    return out;
  }, [series, lines, available, hiddenPanes]);

  const paneCount = new Set(paneLines.map(l => l.pane)).size;
  const paneHeight = Math.round(height * 0.22);
  // The first lower pane fits within the given height, as the drawdown always did; each further one adds its own.
  const chartHeight = height + Math.max(0, paneCount - 1) * paneHeight;

  // Which series exist: a different view, set of listings or set of panes draws new ones. Anything else (a poll's new
  // points) only updates their data, which keeps the viewer's zoom and lets the chart follow the newest point.
  const structure = `${view}|${lines.map(l => l.key).join(',')}|${paneLines.map(l => l.key).join(',')}`;

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
    chart?.applyOptions(chartZoneOptions(timeZone));
  }, [chart, timeZone]);

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
    const paneIndex = new Map<Pane, number>();
    const seriesForPanes = paneLines.map(line => {
      if (!paneIndex.has(line.pane)) paneIndex.set(line.pane, paneIndex.size + 1);
      const options = {
        color: line.color,
        priceFormat: { type: 'custom' as const, formatter: line.format, minMove: line.minMove },
        lastValueVisible: false,
        priceLineVisible: false,
      };
      return line.bars
        ? chart.addSeries(HistogramSeries, options, paneIndex.get(line.pane))
        : chart.addSeries(LineSeries, { ...options, lineWidth: 1 }, paneIndex.get(line.pane));
    });
    for (const index of paneIndex.values()) chart.panes()[index]?.setHeight(paneHeight);
    const current = { lines: seriesForLines, panes: seriesForPanes, markers: total ? createSeriesMarkers(seriesForLines[0], []) : null };
    drawn.current = current;
    return () => {
      if (drawn.current !== current) return;
      drawn.current = null;
      for (const s of [...current.lines, ...current.panes]) chart.removeSeries(s);
    };
    // Rebuilt only when the structure changes; `lines` is read for it, its data is set below.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [chart, structure, height, paneHeight]);

  // Fits the chart to its data when a new set of series is first filled, not on every poll.
  const fitted = useRef<string | null>(null);

  useEffect(() => {
    const current = drawn.current;
    if (!chart || !current || current.lines.length !== lines.length) return;
    lines.forEach((line, i) => {
      current.lines[i].setData(line.points.map(p => ({ time: p.time as UTCTimestamp, value: p.value })));
    });
    if (current.panes.length !== paneLines.length) return;
    paneLines.forEach((line, i) => {
      current.panes[i].setData(line.points.map(p => ({ time: p.time as UTCTimestamp, value: p.value })));
    });
    if (current.markers && series) {
      const markers: SeriesMarker<Time>[] = [];
      for (const event of series.events) {
        if (hiddenMarkers.has(`pnl:${event.kind}`)) continue;
        const time = snapToPoint(lines[0].points, chartTime(Date.parse(event.time)));
        if (time === null) continue;
        const style = EVENT_STYLE[event.kind];
        // The registry can add event kinds before the controller ships styles for them.
        if (style === undefined) continue;
        const impact = event.pnlImpact && event.pnlImpact !== '0' ? ` ${formatMoney(event.pnlImpact).text}` : '';
        markers.push({ time: time as UTCTimestamp, position: 'aboveBar', color: style.color, shape: style.shape, text: `${style.text}${impact}` });
      }
      current.markers.setMarkers(markers);
    }
    const key = `${structure}|${series?.t[0] ?? ''}`;
    if (fitted.current !== key) {
      fitted.current = key;
      chart.timeScale().fitContent();
    }
  }, [chart, lines, paneLines, series, structure, hiddenMarkers]);

  const legendTime = hover?.time ?? lines[0]?.points[lines[0].points.length - 1]?.time ?? null;
  const valueAt = (line: Line, time: number) => pointAt(line.points, time);
  const tooltip: TooltipState | null = hover && {
    x: hover.x,
    y: hover.y,
    title: formatTime(fromChartTime(hover.time), timeZone),
    rows: [...lines, ...paneLines].map(line => {
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
              <Group key={line.key} gap={4} wrap="nowrap">
                <Box w={10} h={3} style={{ background: line.color, borderRadius: 2 }} />
                <Text size="xs" c="dimmed">{line.name}</Text>
                <Text size="xs" fw={600} style={{ fontVariantNumeric: 'tabular-nums' }}>
                  {point === undefined ? '—' : line.format(point.value)}
                </Text>
              </Group>
            );
          })}
          {legendTime !== null && series && (
            <Text size="xs" c="dimmed">at {formatTime(fromChartTime(legendTime), timeZone)}</Text>
          )}
          {(view === 'listings' || view === 'position') && series && hiddenListings(series) > 0 && (
            <Text size="xs" c="dimmed">
              top {series.listings.length} of {series.listingCount} listings held or traded{view === 'listings' ? '; the rest in Other' : ''}
            </Text>
          )}
        </Group>
        {views.length > 1 && (
          <SegmentedControl
            size="xs"
            value={view}
            onChange={v => {
              setView(v as ChartView);
              onViewChange?.(v as ChartView);
            }}
            data={views.map(v => ({ value: v, label: { total: 'Total', listings: 'By listing', position: 'Position', fees: 'Fees' }[v] }))}
          />
        )}
      </Group>
      <Box pos="relative" h={chartHeight}>
        <div ref={container} style={{ position: 'absolute', inset: 0 }} />
        <ChartTooltip tooltip={tooltip} chartWidth={container.current?.clientWidth ?? 0} />
        <LoadingOverlay visible={refreshing} zIndex={3} overlayProps={{ blur: 1, backgroundOpacity: 0.15 }} loaderProps={{ size: 'sm' }} />
        {loading && !series && (
          <Skeleton pos="absolute" inset={0} />
        )}
        {series && series.t.length <= 1 && !loading && (
          <Group pos="absolute" inset={0} justify="center"><Text size="sm" c="dimmed">Nothing to chart yet</Text></Group>
        )}
      </Box>
      {series && (
        <Group justify="space-between" gap="sm" mt={4} wrap="wrap">
          <Text size="xs" c="dimmed">
            One point per {series.resolutionMs >= 60_000 ? `${series.resolutionMs / 60_000} min` : `${series.resolutionMs / 1000}s`}
            {' '}· marked at the mid (else the last trade)
          </Text>
          {view === 'total' && (
            <Group gap="lg" wrap="wrap">
              <PaneToggles panes={available} />
              <MarkerToggles kinds={markerKinds} />
            </Group>
          )}
        </Group>
      )}
    </Box>
  );
}
