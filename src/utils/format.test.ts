import { describe, expect, it } from 'vitest';
import {
  formatDuration, formatMoney, formatPrice, formatQty, formatSettlement, formatTime, parseScaled, plainDecimal,
  settlementState,
} from './format';

const CENT_TICK = '10000000';
const TENTH_CENT_TICK = '1000000';

describe('money', () => {
  it('rounds to the cent with a sign and separators, keeping the exact value', () => {
    expect(formatMoney('1234567890000')).toEqual({ text: '+$1,234.57', exact: '$1,234.56789', sign: 1 });
    expect(formatMoney('-400000000').text).toBe('−$0.40');
    expect(formatMoney('-400000000', false).text).toBe('−$0.40');
    expect(formatMoney('400000000', false).text).toBe('$0.40');
  });

  it('calls a sub-cent amount zero but still shows it exactly', () => {
    expect(formatMoney('-1000000')).toEqual({ text: '$0.00', exact: '−$0.001', sign: 0 });
    expect(formatMoney(null).text).toBe('—');
  });
});

describe('prices', () => {
  it('shows a book price at exactly the tick, in cents on prediction markets', () => {
    expect(formatPrice('430000000', { tickSize: CENT_TICK, cents: true })).toBe('43¢');
    expect(formatPrice('435000000', { tickSize: TENTH_CENT_TICK, cents: true })).toBe('43.5¢');
    expect(formatPrice('64231100000000', { tickSize: '100000000' })).toBe('$64,231.10');
    expect(formatPrice('64231000000000', { tickSize: '1000000000' })).toBe('$64,231.00');
  });

  it('gives a derived price one more digit, and never rounds away digits a value has', () => {
    expect(formatPrice('435000000', { tickSize: CENT_TICK, cents: true, derived: true })).toBe('43.5¢');
    expect(formatPrice('430000000', { tickSize: CENT_TICK, cents: true, derived: true })).toBe('43.0¢');
    expect(formatPrice('432500000', { tickSize: CENT_TICK, cents: true })).toBe('43.25¢');
    expect(formatPrice('432512345', { tickSize: CENT_TICK, cents: true })).toBe('43.25¢');
  });

  it('shows nothing for an unknown price', () => {
    expect(formatPrice('0', { tickSize: CENT_TICK })).toBe('—');
    expect(formatPrice(null)).toBe('—');
  });
});

describe('quantities', () => {
  it('uses the lot size, with an explicit sign when asked', () => {
    expect(formatQty('12000000', '1000000')).toBe('12');
    expect(formatQty('-12000000', '1000000')).toBe('−12');
    expect(formatQty('12500000', '10000', true)).toBe('+12.50');
    expect(formatQty('1500000', '1000000')).toBe('1.5');
  });
});

describe('time', () => {
  it('labels UTC and shows milliseconds when asked', () => {
    expect(formatTime('2026-10-06T13:04:05.123Z', 'UTC')).toBe('2026-10-06 13:04:05 UTC');
    expect(formatTime('2026-10-06T13:04:05.123Z', 'UTC', 'ms')).toBe('2026-10-06 13:04:05.123 UTC');
    expect(formatTime(null, 'UTC')).toBe('—');
  });

  it('writes durations at a useful precision', () => {
    expect([formatDuration(4_200), formatDuration(250_000), formatDuration(7_500_000), formatDuration(200_000_000)])
      .toEqual(['4s', '4m 10s', '2h 5m', '2d 7h']);
  });
});

describe('parsing typed amounts', () => {
  it('reads decimals exactly into scaled units', () => {
    expect(parseScaled('12', 'size')).toBe(12_000_000n);
    expect(parseScaled('-0.435', 'price')).toBe(-435_000_000n);
    expect(parseScaled('.5', 'size')).toBe(500_000n);
  });

  it('refuses what is not a number, or finer than the scale', () => {
    expect([parseScaled('', 'size'), parseScaled('abc', 'size'), parseScaled('1.0000001', 'size')]).toEqual([null, null, null]);
  });
});

describe('prefilling inputs', () => {
  it('writes the exact value with no separators', () => {
    expect([plainDecimal('-12500000', 'size'), plainDecimal('430000000', 'price'), plainDecimal('1234000000000', 'price')])
      .toEqual(['-12.5', '0.43', '1234']);
  });
});

describe('settlements', () => {
  it('writes out a settlement of 0 instead of showing it as unknown', () => {
    expect(formatSettlement('0', true)).toBe('0¢');
    expect(formatSettlement('0', false)).toBe('$0.00');
    expect(formatSettlement('1000000000', true)).toBe('100¢');
    expect(formatSettlement('470000000', true)).toBe('47¢');
    expect(formatSettlement('475000000', false)).toBe('$0.475');
    expect(formatSettlement(null, true)).toBe('—');
  });

  it('tells a full payout from nothing and from a partial one', () => {
    expect(settlementState('1000000000')).toBe('full');
    expect(settlementState('0')).toBe('none');
    expect(settlementState('470000000')).toBe('partial');
    expect(settlementState(null)).toBeNull();
  });
});
