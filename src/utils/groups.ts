import { RiskGroup } from '../types';

export type GroupStatus = 'awaiting' | 'open' | 'exited' | 'settled';

const YEAR_MS = 365 * 24 * 3_600_000;

// A resolved group still holding contracts is waiting on the settlement sweeper; once it books them every leg is flat.
export function groupStatus(group: Pick<RiskGroup, 'resolved' | 'legs'>): GroupStatus {
  const flat = group.legs.every(l => l.held.netQuantity === '0');
  if (group.resolved) return flat ? 'settled' : 'awaiting';
  return flat ? 'exited' : 'open';
}

// Locked PnL over the capital it ties up, and that per year to the group's close. Only for a group that locks a gain:
// a negative "return" on a hedged loss reads as a rate it isn't. Annualized only while the close is ahead.
export function lockedReturn(
  group: Pick<RiskGroup, 'locked' | 'expiry' | 'resolved'>, capital: bigint, now: Date,
): { simple: number; annualized: number | null } | null {
  if (group.locked === null || capital <= 0n) return null;
  const locked = BigInt(group.locked);
  if (locked <= 0n) return null;
  const simple = Number(locked) / Number(capital);
  const remaining = group.expiry && !group.resolved ? Date.parse(group.expiry) - now.getTime() : null;
  return { simple, annualized: remaining !== null && remaining > 0 ? simple * (YEAR_MS / remaining) : null };
}
