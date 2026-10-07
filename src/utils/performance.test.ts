import { describe, expect, it } from 'vitest';
import { dailyStats } from './performance';

const days = (...pnls: number[]) => pnls.map((pnl, i) => ({ date: `2026-10-0${i + 1}`, pnl: String(pnl) }));

describe('daily statistics', () => {
  it('finds the best and worst days, and the win rate over days that traded', () => {
    const stats = dailyStats(days(5, 0, -3, 8, 0, -1));
    expect([stats.total, stats.best?.pnl, stats.best?.date, stats.worst?.pnl]).toEqual([9n, 8n, '2026-10-04', -3n]);
    expect([stats.winning, stats.losing, stats.flat, stats.winRate]).toEqual([2, 2, 2, 0.5]);
    expect(stats.averageDay).toBe(2n);
  });

  it('measures the deepest drawdown from an earlier high, and how far below the high it ends', () => {
    // End of day: 5, 2, 10, 4, 6
    const stats = dailyStats(days(5, -3, 8, -6, 2));
    expect(stats.maxDrawdown).toEqual({ amount: -6n, peakDate: '2026-10-03', troughDate: '2026-10-04' });
    expect(stats.currentDrawdown).toBe(-4n);
  });

  it("counts a fall from the window's start, and has nothing to say about a window without trading", () => {
    expect(dailyStats(days(-2, -1)).maxDrawdown).toEqual({ amount: -3n, peakDate: null, troughDate: '2026-10-02' });
    const quiet = dailyStats(days(0, 0));
    expect([quiet.best, quiet.worst, quiet.winRate, quiet.averageDay, quiet.maxDrawdown]).toEqual([null, null, null, null, null]);
  });
});
