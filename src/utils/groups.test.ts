import { describe, expect, it } from 'vitest';
import { groupStatus, lockedReturn } from './groups';

const leg = (netQuantity: string) => ({ held: { netQuantity } }) as never;

describe('groupStatus', () => {
  it('reads open, awaiting settlement, exited and settled from resolution and whether anything is held', () => {
    expect(groupStatus({ resolved: false, legs: [leg('5'), leg('0')] })).toBe('open');
    expect(groupStatus({ resolved: true, legs: [leg('5')] })).toBe('awaiting');
    expect(groupStatus({ resolved: false, legs: [leg('0')] })).toBe('exited');
    expect(groupStatus({ resolved: true, legs: [leg('0'), leg('0')] })).toBe('settled');
  });
});

describe('lockedReturn', () => {
  const now = new Date('2026-11-17T00:00:00Z');

  it('divides the locked gain by capital and scales it to a year until the close', () => {
    // $0.50 locked on $9.50, closing in 73 days (a fifth of a year).
    const ret = lockedReturn({ locked: '500000000', expiry: '2027-01-29T00:00:00Z', resolved: false }, 9_500_000_000n, now);
    expect(ret?.simple).toBeCloseTo(0.0526, 4);
    expect(ret?.annualized).toBeCloseTo(0.263, 3);
  });

  it('gives no rate for a locked loss, no capital, or no close ahead', () => {
    expect(lockedReturn({ locked: '-100', expiry: null, resolved: false }, 1000n, now)).toBeNull();
    expect(lockedReturn({ locked: '100', expiry: null, resolved: false }, 0n, now)).toBeNull();
    expect(lockedReturn({ locked: '100', expiry: '2026-11-01T00:00:00Z', resolved: false }, 1000n, now)?.annualized).toBeNull();
  });
});
