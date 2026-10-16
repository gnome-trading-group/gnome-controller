import { StrategySession, StrategySessionStatus } from '../types';

// Keyed by the enum so adding a status fails to compile until it has a colour.
export const SESSION_STATUS_COLORS: Record<StrategySessionStatus, string> = {
  [StrategySessionStatus.SUBMITTED]: 'blue',
  [StrategySessionStatus.STARTING]: 'cyan',
  [StrategySessionStatus.RUNNING]: 'green',
  [StrategySessionStatus.STOPPING]: 'orange',
  [StrategySessionStatus.STOPPED]: 'gray',
  [StrategySessionStatus.FAILED]: 'red',
};

// "launcher:<rule>" and "strategy" come from services; a person's stop is recorded under their email.
function stopperLabel(stoppedBy: string): string {
  if (stoppedBy === 'strategy') return 'the strategy';
  const [kind, who] = stoppedBy.includes(':') ? stoppedBy.split(/:(.*)/s, 2) : [stoppedBy, ''];
  if (kind === 'launcher' && who) return `launcher rule ${who}`;
  if (kind === 'ui' || kind === 'slack') return who;
  return stoppedBy;
}

// "Stopped by the strategy: match went live", or null for a session nobody has stopped.
export function stopSummary(session: Pick<StrategySession, 'stopReason' | 'stoppedBy'>): string | null {
  if (!session.stoppedBy && !session.stopReason) return null;
  const by = session.stoppedBy ? `Stopped by ${stopperLabel(session.stoppedBy)}` : 'Stopped';
  return session.stopReason ? `${by}: ${session.stopReason}` : by;
}
