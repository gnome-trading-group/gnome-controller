import { TimeZoneChoice } from '../../utils/format';

// Shapes series points for lightweight-charts, which wants strictly increasing whole-second times and has no time
// zone of its own: local time is drawn by shifting each point by its zone offset.

export interface ChartPoint {
  time: number;
  value: number;
}

export function chartTime(ms: number, zone: TimeZoneChoice): number {
  const shift = zone === 'local' ? -new Date(ms).getTimezoneOffset() * 60 : 0;
  return Math.floor(ms / 1000) + shift;
}

// Back from a chart time to the instant it shows, in milliseconds.
export function fromChartTime(time: number, zone: TimeZoneChoice): number {
  if (zone === 'UTC') return time * 1000;
  const approx = time * 1000;
  return approx + new Date(approx).getTimezoneOffset() * 60_000;
}

// Points sharing a second keep the last, the newest state in it.
export function chartPoints(times: number[], values: number[], zone: TimeZoneChoice): ChartPoint[] {
  const points: ChartPoint[] = [];
  times.forEach((ms, i) => {
    const time = chartTime(ms, zone);
    if (points.length > 0 && points[points.length - 1].time === time) points[points.length - 1].value = values[i];
    else points.push({ time, value: values[i] });
  });
  return points;
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
