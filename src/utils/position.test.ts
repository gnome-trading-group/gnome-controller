import { describe, expect, it } from 'vitest';
import { applyTrade } from './position';

const CENT = 10_000_000n;
const UNIT = 1_000_000n;

// The same cases as the registry's ledger-math tests, so the preview and the booking agree.
describe('previewing a trade booked by hand', () => {
  it('closing a long realizes the move from its average entry', () => {
    expect(applyTrade({ netQuantity: 10n * UNIT, totalCost: 400n * CENT }, 1, 10n * UNIT, 55n * CENT))
      .toEqual({ netQuantity: 0n, totalCost: 0n, realized: 150n * CENT });
  });

  it('a partial close keeps the rest at its entry', () => {
    expect(applyTrade({ netQuantity: 10n * UNIT, totalCost: 400n * CENT }, 1, 4n * UNIT, 30n * CENT))
      .toEqual({ netQuantity: 6n * UNIT, totalCost: 240n * CENT, realized: -40n * CENT });
  });

  it('closing a short gains when bought back lower', () => {
    expect(applyTrade({ netQuantity: -5n * UNIT, totalCost: 300n * CENT }, 0, 5n * UNIT, 50n * CENT))
      .toEqual({ netQuantity: 0n, totalCost: 0n, realized: 50n * CENT });
  });

  it('a trade past flat opens the rest at its price', () => {
    expect(applyTrade({ netQuantity: 2n * UNIT, totalCost: 80n * CENT }, 1, 5n * UNIT, 50n * CENT))
      .toEqual({ netQuantity: -3n * UNIT, totalCost: 150n * CENT, realized: 20n * CENT });
  });
});
