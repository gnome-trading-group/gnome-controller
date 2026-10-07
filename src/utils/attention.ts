import { AttentionItem, Mode } from '../types';

// Where an item is dealt with: its session, its strategy's position on the listing, its strategy (on the tab it
// concerns), or the risk page for a halt that spans strategies.
export function attentionLink(item: AttentionItem, mode: Mode): string {
  if (item.sessionId) return `/sessions/${item.sessionId}`;
  if (item.strategyId !== null && item.listingId !== null && !item.kind.endsWith('HALT')) {
    return `/strategies/${item.strategyId}/listings/${item.listingId}?mode=${mode}`;
  }
  if (item.strategyId !== null) {
    const tab = item.kind.endsWith('HALT') ? 'risk' : 'positions';
    return `/strategies/${item.strategyId}?mode=${mode}&tab=${tab}`;
  }
  return '/risk/policies';
}
