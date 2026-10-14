import { MarketDataKey } from '../types/credentials';

export type KeySync = 'synced' | 'syncing' | 'out-of-sync' | 'not-set';

// Every session and collector in a region reads that region's copy, so a key is only usable everywhere once each
// replica holds the current value.
export function keySync(key: MarketDataKey): KeySync {
  if (!key.exists) return 'not-set';
  if (key.inSync) return 'synced';
  if (key.replicas.some((r) => r.status === 'Failed' || r.status === 'Missing')) return 'out-of-sync';
  return 'syncing';
}

export const KEY_SYNC_LABELS: Record<KeySync, { label: string; color: string }> = {
  synced: { label: 'all 3 in sync', color: 'teal' },
  syncing: { label: 'syncing', color: 'blue' },
  'out-of-sync': { label: 'out of sync', color: 'red' },
  'not-set': { label: 'not set', color: 'orange' },
};

/** The exchanges whose market data can't start: no key, or a region without the current one. */
export function unusableKeys(keys: MarketDataKey[]): MarketDataKey[] {
  return keys.filter((k) => keySync(k) === 'not-set' || keySync(k) === 'out-of-sync');
}
