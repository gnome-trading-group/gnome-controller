import { describe, expect, it } from 'vitest';
import { chartPoints, chartTime, drawdown, fromChartTime, snapToPoint } from './chart-data';

describe('chart points', () => {
  it('keeps the newest value when two points fall in one second', () => {
    expect(chartPoints([1_000, 2_000, 2_400, 3_000], [1, 2, 5, 3], 'UTC'))
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
});

describe('chart time zones', () => {
  it('round-trips an instant through the chart, in either zone', () => {
    const ms = Date.parse('2026-10-06T13:04:05Z');
    expect(fromChartTime(chartTime(ms, 'UTC'), 'UTC')).toBe(ms);
    expect(fromChartTime(chartTime(ms, 'local'), 'local')).toBe(ms);
  });
});
