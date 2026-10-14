import { describe, expect, it } from 'vitest';
import {
  credentialsFromFile, dollarsToUnits, formatPartitionThresholds, missingCredentials, parsePartitionThresholds,
  needsKey, transferAmount, treasuryTotals,
} from './treasury';
import { AccountTreasury } from '../types/treasury';

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
    expect(needsKey('POLYMARKET_INTL', 'read')).toBe(false);
    expect(needsKey('POLYMARKET_INTL', 'marketData')).toBe(false);
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
});
