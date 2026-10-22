import { describe, expect, it } from 'vitest';
import { capital, exposure } from './exposure';

const CENT = 10_000_000n;
const UNIT = 1_000_000n;
const s = (v: bigint) => v.toString();

describe('the money in a position', () => {
  it('a long costs its size at its entry and is worth its size at the mark', () => {
    expect(exposure(s(20n * UNIT), s(53n * CENT), s(60n * CENT))).toEqual({ cost: 1060n * CENT, notional: 1200n * CENT });
  });

  it('a short is sized by its absolute quantity', () => {
    expect(exposure(s(-10n * UNIT), s(40n * CENT), s(30n * CENT))).toEqual({ cost: 400n * CENT, notional: 300n * CENT });
  });

  it('has no notional without a price', () => {
    expect(exposure(s(10n * UNIT), s(40n * CENT), '0')?.notional).toBeNull();
  });

  it('a flat listing holds nothing', () => {
    expect(exposure('0', '0', s(50n * CENT))).toBeNull();
    expect(capital('0', '0', s(5n * CENT), true)).toBeNull();
  });

  it('a long ties up what it paid plus its fees', () => {
    expect(capital(s(20n * UNIT), s(53n * CENT), s(35n * CENT), true)).toBe(1095n * CENT);
  });

  it('a binary short ties up a dollar a contract less what it sold for, plus fees', () => {
    expect(capital(s(-10n * UNIT), s(40n * CENT), s(10n * CENT), true)).toBe(610n * CENT);
  });

  it('a short off a prediction market is counted at its cost', () => {
    expect(capital(s(-10n * UNIT), s(40n * CENT), '0', false)).toBe(400n * CENT);
  });
});
