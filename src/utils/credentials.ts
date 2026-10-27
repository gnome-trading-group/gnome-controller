import { MarketDataKey, SecretStatus } from '../types/credentials';

export type KeySync = 'synced' | 'syncing' | 'out-of-sync' | 'not-set';

// Every session and collector in a region reads that region's copy, so a key is only usable everywhere once each
// replica holds the current value.
export function keySync(key: SecretStatus): KeySync {
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

// The sources whose market data signs in with a key, so they collect with dedicated accounts; other feeds are public.
export const SIGNED_SOURCES = ['KALSHI', 'POLYMARKET_US'];

// The registry's rule for a label: it names a secret (gnome/market-data/<source>/<label>) and appears in SOURCE_ACCOUNTS.
const LABEL_PATTERN = /^[a-z0-9][a-z0-9-]{0,31}$/;

/** Why a label can't be used, or null if it can: a new one mustn't repeat one the source already has. */
export function labelProblem(label: string, existing: string[]): string | null {
  if (!LABEL_PATTERN.test(label)) return 'Lowercase letters, digits and dashes, starting with a letter or digit, like md-1';
  if (existing.includes(label)) return `This source already has ${label}; replace its key instead`;
  return null;
}

/** The next free md-N label for a source, the convention shards default to (md-1). */
export function nextLabel(existing: string[]): string {
  for (let n = 1; ; n++) {
    if (!existing.includes(`md-${n}`)) return `md-${n}`;
  }
}
