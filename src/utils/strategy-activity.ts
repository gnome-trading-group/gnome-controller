import { RiskPolicy } from '../types';
import { StrategySession } from '../types/strategy-sessions';
import { isKilled } from './kill-switch';
import { isActiveSessionStatus } from './policy-target';

export interface StrategyActivity {
  label: string;
  color: string;
}

export function runningSessionCount(strategyId: number, sessions: StrategySession[]): number {
  return sessions.filter((s) => s.strategyId === strategyId && isActiveSessionStatus(s.status)).length;
}

// A strategy has no status of its own: what it's doing is read off its trading sessions and its kill switch, so the
// label can't drift from reality the way a hand-set status did.
export function strategyActivity(
  strategyId: number,
  sessions: StrategySession[],
  policies: RiskPolicy[] | null,
): StrategyActivity {
  const running = runningSessionCount(strategyId, sessions);
  if (isKilled(policies, { strategyId })) {
    return { label: running > 0 ? `Killed · ${running} running` : 'Killed', color: 'red' };
  }
  if (running > 0) return { label: `Running (${running})`, color: 'green' };
  return { label: 'Idle', color: 'gray' };
}
