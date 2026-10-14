import { describe, expect, it } from 'vitest';
import { formatRiskParameters, scaleRiskParameters, unscaleRiskParameters } from './risk-parameters';

describe('risk limits', () => {
  it('store dollars in price units, sizes in size units and counts as typed', () => {
    expect(scaleRiskParameters({ maxCapital: 1500.25 })).toEqual({ maxCapital: 1_500_250_000_000 });
    expect(scaleRiskParameters({ maxOrderNotional: 50 })).toEqual({ maxOrderNotional: 50_000_000_000 });
    expect(scaleRiskParameters({ maxPosition: 2.5 })).toEqual({ maxPosition: 2_500_000 });
    expect(scaleRiskParameters({ maxRejects: 5, maxOpenOrders: 20 })).toEqual({ maxRejects: 5, maxOpenOrders: 20 });
    expect(scaleRiskParameters({ maxSlippage: 0.02 })).toEqual({ maxSlippage: 20_000_000 });
  });

  it('refuse a negative or non-numeric limit', () => {
    expect(() => scaleRiskParameters({ maxCapital: -1 })).toThrow('maxCapital must be a non-negative number of dollars');
    expect(() => scaleRiskParameters({ maxOrderNotional: '5' })).toThrow();
  });

  it('read back as the dollars and counts that were typed', () => {
    expect(unscaleRiskParameters({ maxCapital: 1_500_250_000_000, maxRejects: 5 })).toEqual({ maxCapital: 1500.25, maxRejects: 5 });
    expect(formatRiskParameters({ maxCapital: 1_000_000_000_000 })).toBe('maxCapital: $1000');
    expect(formatRiskParameters({ maxRejects: 5 })).toBe('maxRejects: 5');
  });
});
