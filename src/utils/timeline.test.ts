import { describe, expect, it } from 'vitest';
import { timelineLanes } from './timeline';
import { StrategySession, StrategySessionStatus } from '../types';

const DAY = 86_400_000;
const FROM = Date.parse('2026-10-01T00:00:00Z');
const TO = FROM + 10 * DAY;

function session(id: string, strategyId: number, startDay: number, endDay: number | null, status = StrategySessionStatus.STOPPED) {
  return {
    sessionId: id, strategyId, status, mode: 'paper',
    startedAt: new Date(FROM + startDay * DAY).toISOString(),
    stoppedAt: endDay === null ? null : new Date(FROM + endDay * DAY).toISOString(),
  } as StrategySession;
}

describe('the sessions timeline', () => {
  it('places each session by when it ran, one lane per strategy', () => {
    const lanes = timelineLanes([
      session('b', 2, 5, 6, StrategySessionStatus.FAILED),
      session('a', 1, 1, 3),
      session('r', 1, 8, null, StrategySessionStatus.RUNNING),
    ], FROM, TO);
    expect(lanes.map(l => [l.strategyId, l.bars.map(b => [b.sessionId, Math.round(b.leftPct), Math.round(b.widthPct)])])).toEqual([
      [1, [['a', 10, 20], ['r', 80, 20]]],
      [2, [['b', 50, 10]]],
    ]);
  });

  it('clips a session that began before the window, drops ones outside it, and keeps short ones visible', () => {
    const lanes = timelineLanes([
      session('old', 1, -3, 2),
      session('gone', 1, -5, -4),
      session('blip', 1, 4, 4.0001),
    ], FROM, TO);
    expect(lanes[0].bars.map(b => [b.sessionId, Math.round(b.leftPct), b.widthPct >= 0.4])).toEqual([
      ['old', 0, true], ['blip', 40, true],
    ]);
  });
});
