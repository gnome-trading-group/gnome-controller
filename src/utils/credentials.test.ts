import { describe, expect, it } from 'vitest';
import { MarketDataKey } from '../types/credentials';
import { keySync, labelProblem, nextLabel, unusableKeys } from './credentials';

const key = (overrides: Partial<MarketDataKey>): MarketDataKey => ({
  exchangeCode: 'KALSHI', secretName: 'gnome/market-data/kalshi', exists: true, apiKeyId: 'f054773a', updatedBy: 'ops',
  lastChangedAt: '2026-10-14T12:00:00Z', inSync: true,
  replicas: [{ region: 'ap-northeast-1', status: 'InSync', message: null }, { region: 'eu-west-1', status: 'InSync', message: null }],
  ...overrides,
});

describe('market data key sync', () => {
  it('is usable only once every region holds the current key', () => {
    expect(keySync(key({}))).toBe('synced');
    expect(keySync(key({ exists: false, inSync: false }))).toBe('not-set');
    expect(keySync(key({ inSync: false, replicas: [{ region: 'eu-west-1', status: 'InProgress', message: null }] }))).toBe('syncing');
    expect(keySync(key({ inSync: false, replicas: [{ region: 'eu-west-1', status: 'Failed', message: 'x' }] }))).toBe('out-of-sync');
  });

  it('flags the keys that stop market data, not one still syncing', () => {
    const missing = key({ exchangeCode: 'POLYMARKET_US', exists: false, inSync: false });
    const syncing = key({ inSync: false, replicas: [{ region: 'eu-west-1', status: 'InProgress', message: null }] });
    expect(unusableKeys([key({}), missing, syncing])).toEqual([missing]);
  });
});

describe('market data account labels', () => {
  it('takes what a secret name and SOURCE_ACCOUNTS can carry, once per source', () => {
    expect(labelProblem('md-2', ['md-1'])).toBeNull();
    expect(labelProblem('MD 2', [])).toMatch(/Lowercase/);
    expect(labelProblem('-md', [])).toMatch(/Lowercase/);
    expect(labelProblem('md-1', ['md-1'])).toMatch(/already has md-1/);
  });

  it('suggests the next free md-N, filling a gap', () => {
    expect(nextLabel([])).toBe('md-1');
    expect(nextLabel(['md-1', 'md-2'])).toBe('md-3');
    expect(nextLabel(['md-2'])).toBe('md-1');
  });
});
