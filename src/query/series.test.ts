import { describe, expect, it } from 'vitest';
import { mergeSeries } from './series';
import { PnlSeries } from '../types';

function series(t: number[], total: string[], extra: Partial<PnlSeries> = {}): PnlSeries {
  return {
    resolutionMs: 1000, t, total, realized: total, unrealized: total, fees: total.map(() => '0'),
    listings: [{ listingId: 1, symbol: 'A', lotSize: null, total, netQuantity: total }], events: [], ...extra,
  };
}

describe('appending polled points to a chart', () => {
  it('replaces the newest point, which may have moved, and appends the rest', () => {
    const merged = mergeSeries(series([1000, 2000, 2500], ['1', '2', '3']), series([2500, 3000], ['4', '5']));
    expect(merged.t).toEqual([1000, 2000, 2500, 3000]);
    expect(merged.total).toEqual(['1', '2', '4', '5']);
    expect(merged.listings[0].total).toEqual(['1', '2', '4', '5']);
  });

  it('lines up a listing first seen in the poll, and keeps each event once', () => {
    const event = { time: 't', kind: 'RESET' as const, sessionId: 's', listingId: 1, pnlImpact: '0', actor: null, reason: null };
    const tail = series([3000], ['9'], {
      listings: [{ listingId: 2, symbol: 'B', lotSize: null, total: ['9'], netQuantity: ['1'] }],
      events: [event],
    });
    const merged = mergeSeries(series([1000, 2000], ['1', '2'], { events: [event] }), tail);
    expect(merged.listings).toEqual([{ listingId: 2, symbol: 'B', lotSize: null, total: ['0', '0', '9'], netQuantity: ['0', '0', '1'] }]);
    expect(merged.events).toHaveLength(1);
  });

  it('keeps the chart as it was when a poll brings nothing', () => {
    const previous = series([1000], ['1']);
    expect(mergeSeries(previous, series([], []))).toBe(previous);
  });
});
