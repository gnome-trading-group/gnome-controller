import { describe, expect, it } from 'vitest';
import { FeeScheduleRow } from '../types';
import { describeFeeDefinition, feeScope, feeTarget, supersededFeeSchedules } from './fees';

const row = (id: string, effectiveFrom: string, recordedAt: string, target: Partial<FeeScheduleRow> = {}): FeeScheduleRow => ({
  feeScheduleId: id, exchangeId: 1, feeGroup: null, feeEvent: null, listingId: null, effectiveFrom, recordedAt,
  definition: null, source: 'MANUAL', sourceRef: null, actor: null, ...target,
});

describe('fee schedule display', () => {
  it('summarizes a definition in one line', () => {
    expect(describeFeeDefinition({
      currency: 'USD', components: [{ kind: 'PRICE_CURVE', taker: 0.0695, maker: -0.0125, exponent: 1 }],
      rounding: { mode: 'HALF_EVEN', increment: 0.01, scope: 'FILL' },
    })).toBe('taker 0.0695 / maker -0.0125 × p(1−p) · half-even to $0.01');
    expect(describeFeeDefinition({
      currency: 'USD', components: [{ kind: 'PRICE_CURVE', taker: 0.07, maker: 0.0175 }],
      rounding: { mode: 'CEIL', increment: 0.0001, scope: 'ORDER_ACCUMULATOR' },
    })).toBe('taker 0.07 / maker 0.0175 × p(1−p) · up to $0.0001 per order');
    expect(describeFeeDefinition({
      currency: 'USD', components: [{ kind: 'NOTIONAL', taker: 0.00045, maker: 0.00015 }], rounding: { mode: 'NONE' },
    })).toBe('taker 0.00045 / maker 0.00015 of notional · unrounded');
    expect(describeFeeDefinition(null)).toMatch(/^Cleared/);
  });

  it('names the most specific target a row has', () => {
    expect(feeScope(row('1', '2026-01-01', '2026-01-01'))).toBe('EXCHANGE');
    expect(feeTarget(row('1', '2026-01-01', '2026-01-01', { feeEvent: 'KXMLBHIT-G' }))).toBe('KXMLBHIT-G');
    expect(feeScope(row('1', '2026-01-01', '2026-01-01', { listingId: 7 }))).toBe('LISTING');
  });

  it('marks rows a later correction of the same target and time replaced', () => {
    const rows = [
      row('1', '2026-04-03T04:00:00Z', '2026-10-01T00:00:00Z'),
      row('2', '2026-04-03T04:00:00Z', '2026-10-02T00:00:00Z'),
      row('3', '2026-07-01T04:00:00Z', '2026-10-01T00:00:00Z'),
      row('4', '2026-04-03T04:00:00Z', '2026-10-01T00:00:00Z', { feeGroup: 'table-tennis' }),
    ];
    expect([...supersededFeeSchedules(rows)]).toEqual(['1']);
  });
});
