import { AttentionItem, Mode } from '../types';

// Problems with a venue account itself (its money or its lifecycle), dealt with on the treasury page.
const ACCOUNT_KINDS = new Set([
  'RECON_MISMATCH', 'RECON_STALE', 'BALANCE_LOW', 'SHARD_BALANCE_LOW', 'ALLOCATION_EXCEEDS_BALANCE', 'ACCOUNT_DUE_FOR_ROTATION',
  'ACCOUNT_READY_TO_RETIRE',
]);

export function treasuryLink(accountId: number | null): string {
  return accountId === null ? '/treasury' : `/treasury?account=${accountId}`;
}

// Where an item is dealt with: its account on the treasury page, its session, its strategy's position on the
// listing, its strategy (on the tab it concerns), the treasury page for a venue-wide halt, or the risk page for a
// halt that spans strategies.
export function attentionLink(item: AttentionItem, mode: Mode): string {
  if (ACCOUNT_KINDS.has(item.kind)) return treasuryLink(item.accountId);
  if (item.sessionId) return `/sessions/${item.sessionId}`;
  if (item.strategyId !== null && item.listingId !== null && !item.kind.endsWith('HALT')) {
    return `/strategies/${item.strategyId}/listings/${item.listingId}?mode=${mode}`;
  }
  if (item.strategyId !== null) {
    const tab = item.kind.endsWith('HALT') ? 'risk' : 'positions';
    return `/strategies/${item.strategyId}?mode=${mode}&tab=${tab}`;
  }
  if (item.kind === 'EXCHANGE_HALT') return '/treasury';
  return '/risk/policies';
}
