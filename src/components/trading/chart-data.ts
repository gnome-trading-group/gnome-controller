import { DeepPartial, Time, TickMarkType, TimeChartOptions } from 'lightweight-charts';
import { formatTime, TimeZoneChoice } from '../../utils/format';

// Chart times are UTC seconds: lightweight-charts needs them strictly increasing, which wall-clock times are not
// across a DST change (the repeated hour runs backwards). The chosen zone shows only in the labels.

export interface ChartPoint {
  time: number;
  value: number;
}

export function chartTime(ms: number): number {
  return Math.floor(ms / 1000);
}

export function fromChartTime(time: number): number {
  return time * 1000;
}

// Points sharing a second keep the last, the newest state in it.
export function chartPoints(times: number[], values: number[]): ChartPoint[] {
  const points: ChartPoint[] = [];
  times.forEach((ms, i) => {
    const time = chartTime(ms);
    if (points.length > 0 && points[points.length - 1].time === time) points[points.length - 1].value = values[i];
    else points.push({ time, value: values[i] });
  });
  return points;
}

const tickFormats = new Map<string, Intl.DateTimeFormat>();

function tickFormat(zone: TimeZoneChoice, options: Intl.DateTimeFormatOptions): Intl.DateTimeFormat {
  const key = `${zone}/${JSON.stringify(options)}`;
  let f = tickFormats.get(key);
  if (!f) {
    f = new Intl.DateTimeFormat('en-US', { ...options, timeZone: zone === 'UTC' ? 'UTC' : undefined, hourCycle: 'h23' });
    tickFormats.set(key, f);
  }
  return f;
}

// The library picks day and month ticks at UTC boundaries; in another zone those fall mid-day, so a date tick there
// carries its time too rather than passing for midnight.
export function tickLabel(time: number, type: TickMarkType, zone: TimeZoneChoice): string {
  const date = new Date(fromChartTime(time));
  const clock = (seconds: boolean) => tickFormat(zone, { hour: '2-digit', minute: '2-digit', second: seconds ? '2-digit' : undefined }).format(date);
  const midnight = clock(true) === '00:00:00';
  switch (type) {
    case TickMarkType.Year:
      return tickFormat(zone, { year: 'numeric' }).format(date) + (midnight ? '' : ` ${clock(false)}`);
    case TickMarkType.Month:
    case TickMarkType.DayOfMonth:
      return tickFormat(zone, { month: 'short', day: 'numeric' }).format(date) + (midnight ? '' : ` ${clock(false)}`);
    case TickMarkType.Time:
      return clock(false);
    case TickMarkType.TimeWithSeconds:
      return clock(true);
  }
}

export function chartZoneOptions(zone: TimeZoneChoice): DeepPartial<TimeChartOptions> {
  return {
    localization: { timeFormatter: (time: Time) => formatTime(fromChartTime(Number(time)), zone) },
    timeScale: { tickMarkFormatter: (time: Time, type: TickMarkType) => tickLabel(Number(time), type, zone) },
  };
}

// How far each point sits below the best before it: 0 at a new high, negative in a drawdown.
export function drawdown(points: ChartPoint[]): ChartPoint[] {
  let peak = -Infinity;
  return points.map(p => {
    peak = Math.max(peak, p.value);
    return { time: p.time, value: p.value - peak };
  });
}

// An event drawn on the series sits on the point at or before it.
// The last point at or before a time, found by halving: a chart holds thousands of points per line and is read for
// every line on every hover.
export function pointAt(points: ChartPoint[], time: number): ChartPoint | undefined {
  let lo = 0;
  let hi = points.length;
  while (lo < hi) {
    const mid = (lo + hi) >> 1;
    if (points[mid].time <= time) lo = mid + 1;
    else hi = mid;
  }
  return lo > 0 ? points[lo - 1] : undefined;
}

export function snapToPoint(points: ChartPoint[], time: number): number | null {
  return (pointAt(points, time) ?? points[0])?.time ?? null;
}
