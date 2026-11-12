import { describe, expect, it } from 'vitest';
import {
  credentialsFromFile, dollarsToUnits, formatPartitionTargets, formatPartitionThresholds, missingCredentials,
  parsePartitionTargets, parsePartitionThresholds,
  keyOptional, needsKey, programLabel, READ_KEY_OMITS, rewardsBreakdown, transferAmount, treasuryTotals,
} from './treasury';
import { AccountTreasury, Transfer, TransferAllocation } from '../types/treasury';

describe('transfer amounts', () => {
  it('are typed in dollars and stored in price units', () => {
    expect(transferAmount('DEPOSIT', '1250.5')).toBe(1_250_500_000_000n);
    expect(transferAmount('INTEREST', '0.000000001')).toBe(1n);
    expect(transferAmount('DEPOSIT', '0.0000000001')).toBeNull();
  });

  it('take their sign from the kind, so a withdrawal is typed as a positive amount', () => {
    expect(transferAmount('WITHDRAWAL', '40')).toBe(-40_000_000_000n);
    expect(transferAmount('WITHDRAWAL', '-40')).toBeNull();
    expect(transferAmount('DEPOSIT', '-40')).toBeNull();
  });

  it('keep the sign typed for corrections and fee adjustments', () => {
    expect(transferAmount('CORRECTION', '-1.25')).toBe(-1_250_000_000n);
    expect(transferAmount('FEE_ADJUSTMENT', '0.10')).toBe(100_000_000n);
  });

  it('may be zero only for an opening balance', () => {
    expect(transferAmount('OPENING', '0')).toBe(0n);
    expect(transferAmount('DEPOSIT', '0')).toBeNull();
    expect(transferAmount('WITHDRAWAL', '0')).toBeNull();
    expect(transferAmount('OPENING', 'abc')).toBeNull();
  });
});

describe('settings in dollars', () => {
  it('convert to non-negative price units', () => {
    expect(dollarsToUnits('25')).toBe(25_000_000_000n);
    expect(dollarsToUnits('0.05')).toBe(50_000_000n);
    expect(dollarsToUnits('-1')).toBeNull();
    expect(dollarsToUnits('')).toBeNull();
  });
});

describe('treasury totals', () => {
  it('add each money field exactly, past what a float holds', () => {
    const account = (fields: Partial<AccountTreasury>) => ({
      cashTotal: '0', redeemable: '0', committed: '0', base: '0', allocated: '0', free: '0', ...fields,
    }) as AccountTreasury;
    const totals = treasuryTotals([
      account({ cashTotal: '9007199254740993', base: '100', free: '-50' }),
      account({ cashTotal: '1', base: '200', allocated: '75', free: '25' }),
    ]);
    expect(totals.cashTotal).toBe(9007199254740994n);
    expect(totals.base).toBe(300n);
    expect(totals.allocated).toBe(75n);
    expect(totals.free).toBe(-25n);
  });
});

describe('account credentials', () => {
  it('fills a venue\'s fields from a credentials file, as strings, ignoring keys it doesn\'t take', () => {
    const file = JSON.stringify({ apiKey: 'k', signatureType: 3, funderAddress: '0xabc', unrelated: 'x', secret: '' });
    expect(credentialsFromFile('POLYMARKET_INTL', file)).toEqual({ apiKey: 'k', signatureType: '3', funderAddress: '0xabc' });
    expect(credentialsFromFile('POLYMARKET_INTL', 'not json')).toBeNull();
    expect(credentialsFromFile('KALSHI', '[1]')).toBeNull();
  });

  it('names the required fields still empty, never an optional one', () => {
    expect(missingCredentials('KALSHI', { apiKey: 'k' })).toEqual(['RSA private key (.pem / .key)']);
    expect(missingCredentials('KALSHI', { apiKey: 'k', privateKey: '-----BEGIN' })).toEqual([]);
  });

  it('needs every key by default, except those a venue has no use for', () => {
    expect(needsKey('KALSHI', 'read')).toBe(true);
    expect(needsKey('POLYMARKET_US', 'read')).toBe(true);
    expect(needsKey('POLYMARKET_US', 'marketData')).toBe(true);
    expect(needsKey('POLYMARKET_INTL', 'read')).toBe(true);
    expect(keyOptional('POLYMARKET_INTL', 'read')).toBe(true);
    expect(keyOptional('KALSHI', 'read')).toBe(false);
    expect(needsKey('POLYMARKET_INTL', 'marketData')).toBe(false);
  });

  it('asks a Polymarket Intl poller key for its CLOB API credentials only', () => {
    expect(missingCredentials('POLYMARKET_INTL', { apiKey: 'k' }, READ_KEY_OMITS.POLYMARKET_INTL))
      .toEqual(['API secret', 'API passphrase']);
  });
});

describe('shard thresholds', () => {
  it('reads shard=dollars pairs into price units and writes them back', () => {
    const parsed = parsePartitionThresholds('3=20, 0 = 50.5');
    expect(parsed).toEqual({ 3: '20000000000', 0: '50500000000' });
    expect(formatPartitionThresholds(parsed as Record<string, string>)).toBe('0=50.5, 3=20');
    expect(parsePartitionThresholds('')).toEqual({});
    expect(parsePartitionThresholds('x=1')).toBeNull();
    expect(parsePartitionThresholds('3=-1')).toBeNull();
  });

  it('reads shard rebalancing targets as whole percents adding up to 100, and writes them back', () => {
    expect(parsePartitionTargets('3=20, 0 = 80%')).toEqual({ 0: 80, 3: 20 });
    expect(formatPartitionTargets({ 3: 20, 0: 80, 2: 0 })).toBe('0=80, 3=20');
    expect(parsePartitionTargets('0=80, 3=10')).toBeNull();
    expect(parsePartitionTargets('0=150')).toBeNull();
    expect(parsePartitionTargets('0=50.5, 3=49.5')).toBeNull();
    expect(parsePartitionTargets('')).toBeNull();
  });
});

describe('rewards breakdown', () => {
  const transfer = (fields: Partial<Transfer>): Transfer => ({
    transferId: '1', accountId: 1, label: 'x', exchangeCode: 'POLYMARKET_INTL', kind: 'REWARD', amount: '0',
    occurredAt: '2026-11-12T00:45:00Z', externalRef: null, reason: null, actor: 'venue-poller', recordedAt: '2026-11-12T00:46:00Z',
    program: null, venueMarket: null, asset: 'USD', assetAmount: null, allocationState: null, allocations: [],
    unallocated: null, ...fields,
  });
  const allocation = (strategyId: number, amount: string): TransferAllocation => ({
    allocationId: strategyId, strategyId, listingId: null, venueMarket: null, amount, basis: 'MAKER_FILLS', strategies: 2,
    periodStart: null, periodEnd: null,
  });

  it('sums non-trading money by program, venue and strategy, the unallocated part the firm\'s', () => {
    const b = rewardsBreakdown([
      transfer({ program: 'MAKER_REBATE', amount: '400', allocationState: 'DONE', allocations: [allocation(1, '75'), allocation(2, '225')] }),
      transfer({ program: 'LIQUIDITY', amount: '50', allocationState: 'PENDING' }),
      transfer({ kind: 'INTEREST', program: 'INTEREST', amount: '30', exchangeCode: 'KALSHI' }),
      transfer({ kind: 'FEE_ADJUSTMENT', amount: '-5', exchangeCode: 'KALSHI' }),
      transfer({ kind: 'DEPOSIT', amount: '1000' }),
    ]);
    expect(b.total).toBe(475n);
    expect(Object.fromEntries(b.byProgram)).toEqual({ MAKER_REBATE: 400n, LIQUIDITY: 50n, INTEREST: 30n, FEE_ADJUSTMENT: -5n });
    expect(Object.fromEntries(b.byExchange)).toEqual({ POLYMARKET_INTL: 450n, KALSHI: 25n });
    expect([...b.byStrategy]).toEqual([[1, 75n], [2, 225n], [null, 175n]]);
    expect(b.pending).toBe(1);
    expect(programLabel('MAKER_REBATE')).toBe('Maker rebates');
  });
});
