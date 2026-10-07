import { StrategySession, StrategySessionStatus } from '../types';

// Lays sessions out on a window of time: one lane per strategy, one bar per session, as percentages of the window.
// A running session reaches the window's end; a session that started before the window is clipped to it.

export interface TimelineBar {
  sessionId: string;
  status: StrategySessionStatus;
  mode: string;
  startedAt: string;
  stoppedAt: string | null;
  leftPct: number;
  widthPct: number;
}

export interface TimelineLane {
  strategyId: number;
  bars: TimelineBar[];
}

// So a session of a few minutes in a week's window still shows.
const MIN_WIDTH_PCT = 0.4;

export function timelineLanes(sessions: StrategySession[], fromMs: number, toMs: number): TimelineLane[] {
  const span = toMs - fromMs;
  const lanes = new Map<number, TimelineBar[]>();
  for (const s of sessions) {
    if (!s.startedAt) continue;
    const start = Date.parse(s.startedAt);
    const end = s.stoppedAt ? Date.parse(s.stoppedAt) : toMs;
    if (end < fromMs || start > toMs) continue;
    const left = Math.max(start, fromMs);
    const right = Math.min(end, toMs);
    const bar: TimelineBar = {
      sessionId: s.sessionId, status: s.status, mode: s.mode, startedAt: s.startedAt, stoppedAt: s.stoppedAt,
      leftPct: ((left - fromMs) / span) * 100,
      widthPct: Math.max(MIN_WIDTH_PCT, ((right - left) / span) * 100),
    };
    lanes.set(s.strategyId, [...(lanes.get(s.strategyId) ?? []), bar]);
  }
  return [...lanes.entries()]
    .map(([strategyId, bars]) => ({ strategyId, bars: bars.sort((a, b) => a.leftPct - b.leftPct) }))
    .sort((a, b) => a.strategyId - b.strategyId);
}
