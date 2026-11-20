import { describe, expect, it } from 'vitest';
import { addVolumes, makerPercent, volumeSummary } from './volume';

const volume = (maker: number, taker: number, fills: number, notional = maker + taker) => ({
  notional: String(notional), maker: String(maker), taker: String(taker), fills, fees: '0',
});

describe('volume', () => {
  it('rounds the maker share of what the venue classified', () => {
    expect(makerPercent(volume(2, 1, 3))).toBe(67);
    // Unclassified volume counts in neither part.
    expect(makerPercent(volume(1, 1, 3, 10))).toBe(50);
    expect(makerPercent(volume(0, 0, 1, 5))).toBeNull();
    expect(makerPercent(undefined)).toBeNull();
  });

  it('says how many fills and how much was maker', () => {
    expect(volumeSummary(volume(1, 0, 1))).toBe('1 fill · 100% maker');
    expect(volumeSummary(volume(0, 0, 0))).toBe('0 fills');
  });

  it('adds volumes field by field', () => {
    expect(addVolumes([volume(1, 2, 1), volume(3, 4, 2)])).toEqual(volume(4, 6, 3));
    expect(addVolumes([])).toEqual(volume(0, 0, 0));
  });
});
