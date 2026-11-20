import { describe, expect, it } from 'vitest';
import { TickMarkType } from 'lightweight-charts';
import { chartPoints, chartTime, drawdown, fromChartTime, pointAt, snapToPoint, tickLabel, volumeBars } from './chart-data';

describe('chart points', () => {
  it('keeps the newest value when two points fall in one second', () => {
    expect(chartPoints([1_000, 2_000, 2_400, 3_000], [1, 2, 5, 3]))
      .toEqual([{ time: 1, value: 1 }, { time: 2, value: 5 }, { time: 3, value: 3 }]);
  });

  it('measures drawdown from the best value so far', () => {
    const points = [1, 3, 2, 5, 4].map((value, i) => ({ time: i, value }));
    expect(drawdown(points).map(p => p.value)).toEqual([0, 0, -1, 0, -1]);
  });

  it('places an event on the point at or before it', () => {
    const points = [10, 20, 30].map(time => ({ time, value: 0 }));
    expect([snapToPoint(points, 25), snapToPoint(points, 30), snapToPoint(points, 5)]).toEqual([20, 30, 10]);
  });

  it('reads a line at a time as its last point at or before it', () => {
    const points = [10, 20, 30, 40].map(time => ({ time, value: time / 10 }));
    expect([5, 10, 25, 40, 99].map(t => pointAt(points, t)?.value)).toEqual([undefined, 1, 2, 4, 4]);
    expect(pointAt([], 10)).toBeUndefined();
  });
});

describe('chart time zones', () => {
  it('round-trips an instant through the chart', () => {
    const ms = Date.parse('2026-10-06T13:04:05Z');
    expect(fromChartTime(chartTime(ms))).toBe(ms);
  });

  it('keeps times increasing through the hour a DST change repeats', () => {
    const start = Date.parse('2026-11-01T04:00:00Z');
    const times = Array.from({ length: 24 }, (_, i) => start + i * 15 * 60_000);
    const points = chartPoints(times, times.map(() => 0));
    expect(points.every((p, i) => i === 0 || p.time > points[i - 1].time)).toBe(true);
  });

  it('labels ticks in UTC, adding the time to a date tick that is not midnight there', () => {
    const midnight = chartTime(Date.parse('2026-11-04T00:00:00Z'));
    expect(tickLabel(midnight, TickMarkType.DayOfMonth, 'UTC')).toBe('Nov 4');
    expect(tickLabel(midnight + 3600, TickMarkType.DayOfMonth, 'UTC')).toBe('Nov 4 01:00');
    expect(tickLabel(midnight + 3661, TickMarkType.TimeWithSeconds, 'UTC')).toBe('01:01:01');
  });
});

describe('volume bars', () => {
  it('sums the points a poll added between steps into the step they end in, drawn at its newest point', () => {
    // Steps of 60 s: 60 s and 120 s are on the grid, 90 s and 100 s came from polls, 130 s is the newest.
    const bars = volumeBars([60_000, 90_000, 100_000, 120_000, 130_000], [5, 1, 2, 3, 4], [5, 0, 2, 1, 0], 60_000);
    expect(bars).toEqual([
      { time: 60, total: 5, maker: 5 },
      { time: 120, total: 6, maker: 3 },
      { time: 130, total: 4, maker: 0 },
    ]);
  });

  it('keeps bar times strictly increasing when a point between one-second steps shares the second before it', () => {
    const bars = volumeBars([702_000, 703_000, 703_400], [1, 2, 3], [0, 0, 0], 1_000);
    expect(bars).toEqual([
      { time: 702, total: 1, maker: 0 },
      { time: 703, total: 5, maker: 0 },
    ]);
  });
});
