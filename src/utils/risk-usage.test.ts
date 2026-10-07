import { describe, expect, it } from 'vitest';
import { closestLimit, formatLimit, usageColor } from './risk-usage';
import { PolicyUsage } from '../types';

describe('limit usage', () => {
  it('is green below 70%, amber from 70% and red from 90%', () => {
    expect([0, 0.69, 0.7, 0.89, 0.9, 1.4].map(usageColor)).toEqual(['teal', 'teal', 'orange', 'orange', 'red', 'red']);
  });

  it("writes values in each policy's units", () => {
    expect(formatLimit('MAX_POSITION', '8000000')).toBe('8');
    expect(formatLimit('MAX_OPEN_ORDERS', '2')).toBe('2');
    expect(formatLimit('MAX_TOTAL_PNL_LOSS', '510000000')).toBe('$0.51');
    expect(formatLimit('MAX_ORDER_SIZE', null)).toBe('—');
  });

  it('picks the standing limit nearest to binding, ignoring per-order checks and unread ones', () => {
    const policy = (policyType: string, usage: number | null, perOrder = false) => ({ policyType, usage, perOrder }) as PolicyUsage;
    expect(closestLimit([
      policy('MAX_POSITION', 0.4), policy('MAX_ORDER_SIZE', 0.99, true), policy('MAX_TOTAL_PNL_LOSS', 0.62), policy('MAX_OPEN_ORDERS', null),
    ])).toEqual({ usage: 0.62, label: 'Max loss' });
    expect(closestLimit([policy('MAX_ORDER_SIZE', 0.5, true)])).toBeNull();
    expect(closestLimit(undefined)).toBeNull();
  });
});
