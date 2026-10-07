import { describe, expect, it } from 'vitest';
import { formatLimit, usageColor } from './risk-usage';

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
});
