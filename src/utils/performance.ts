// Statistics over daily PnL (registry /pnl/daily): days in the viewer's time zone, oldest first, each the change in
// lifetime PnL over that day. Money stays BigInt so totals are exact.

export interface Day {
  date: string;
  pnl: string;
}

export interface DayValue {
  date: string;
  pnl: bigint;
}

export interface DailyStats {
  total: bigint;
  best: DayValue | null;
  worst: DayValue | null;
  winning: number;
  losing: number;
  flat: number;
  // Of the days that made or lost money; null when none did.
  winRate: number | null;
  // Over the days that made or lost money.
  averageDay: bigint | null;
  // The deepest fall in end-of-day PnL from an earlier high in the window (0 or negative), from the high's day to the
  // low's.
  maxDrawdown: { amount: bigint; peakDate: string | null; troughDate: string } | null;
  // How far the last day ended below the window's best end of day.
  currentDrawdown: bigint;
}

export function dailyStats(days: Day[]): DailyStats {
  const values: DayValue[] = days.map(d => ({ date: d.date, pnl: BigInt(d.pnl) }));
  const active = values.filter(d => d.pnl !== 0n);
  const winning = active.filter(d => d.pnl > 0n).length;
  const total = values.reduce((sum, d) => sum + d.pnl, 0n);

  // End-of-day PnL since the window opened; the window's start (0) counts as the first high.
  let equity = 0n;
  let peak = 0n;
  let peakDate: string | null = null;
  let maxDrawdown: DailyStats['maxDrawdown'] = null;
  for (const d of values) {
    equity += d.pnl;
    if (equity > peak) {
      peak = equity;
      peakDate = d.date;
    }
    const drawdown = equity - peak;
    if (drawdown < 0n && (maxDrawdown === null || drawdown < maxDrawdown.amount)) {
      maxDrawdown = { amount: drawdown, peakDate, troughDate: d.date };
    }
  }

  const byPnl = [...active].sort((a, b) => (a.pnl < b.pnl ? -1 : a.pnl > b.pnl ? 1 : 0));
  return {
    total,
    best: byPnl.length > 0 && byPnl[byPnl.length - 1].pnl > 0n ? byPnl[byPnl.length - 1] : null,
    worst: byPnl.length > 0 && byPnl[0].pnl < 0n ? byPnl[0] : null,
    winning,
    losing: active.length - winning,
    flat: values.length - active.length,
    winRate: active.length === 0 ? null : winning / active.length,
    averageDay: active.length === 0 ? null : active.reduce((sum, d) => sum + d.pnl, 0n) / BigInt(active.length),
    maxDrawdown,
    currentDrawdown: equity - peak,
  };
}
