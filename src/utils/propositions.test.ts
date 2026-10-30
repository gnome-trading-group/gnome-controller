import { describe, expect, it } from 'vitest';
import { evidenceRows, formatFieldValue, subjectPairKey, summarizeProposition } from './propositions';

describe('a proposition in one line', () => {
  it('reads a price threshold at a time with its source', () => {
    expect(summarizeProposition({
      kind: 'THRESHOLD', measure: 'price', comparator: 'GTE', value: 78200, unit: 'usd', observation: 'AT_TIME',
      window_end: '2026-10-30T20:00:00+00:00', resolution_source: 'cf-benchmarks-brti',
    })).toBe('price ≥ 78,200 usd at 2026-10-30 20:00Z · cf-benchmarks-brti');
  });

  it('marks a negated proposition and shows range bounds as open or closed', () => {
    expect(summarizeProposition({
      kind: 'RANGE', measure: 'price', low: 1, high: 2, high_inclusive: false, negated: true,
    })).toBe('NOT price in [1, 2)');
  });

  it('reads a winner and a by-deadline window', () => {
    expect(summarizeProposition({ kind: 'WINNER', entity: 'lakers', scope: 'game' })).toBe('lakers wins · game');
    expect(summarizeProposition({
      kind: 'OCCURS_BY', measure: 'fed-cut', observation: 'ANY_TIME', window_start: '2026-10-01T00:00:00Z',
      window_end: '2026-12-31T00:00:00Z',
    })).toBe('fed-cut occurs from 2026-10-01 00:00Z by 2026-12-31 00:00Z');
  });

  it('marks what extraction could not read', () => {
    expect(summarizeProposition({ kind: 'THRESHOLD', measure: 'goals', comparator: 'GT' })).toBe('goals > ?');
  });
});

describe('evidence side by side', () => {
  it('lists fields in the classifier order and marks the ones that differ', () => {
    const rows = evidenceRows({
      rule: 'threshold-subset', version: 'd1',
      a: { resolution_source: 'x', kind: 'THRESHOLD', value: 2, comparator: 'GT' },
      b: { kind: 'THRESHOLD', value: 1, comparator: 'GT', resolution_source: 'x' },
    });
    expect(rows.map(r => [r.field, r.differs])).toEqual([
      ['kind', false], ['comparator', false], ['value', true], ['resolution_source', false],
    ]);
  });

  it('shows a field only one side has as missing on the other', () => {
    expect(evidenceRows({ rule: 'r', version: 'd1', a: { entity: 'x' }, b: {} })).toEqual([
      { field: 'entity', a: 'x', b: '—', differs: true },
    ]);
  });
});

describe('field values', () => {
  it('shows comparators as symbols, empty lists as missing and times in UTC', () => {
    expect(formatFieldValue('comparator', 'LTE')).toBe('≤');
    expect(formatFieldValue('unknown', [])).toBe('—');
    expect(formatFieldValue('window_end', '2026-10-30T16:30:00-04:00')).toBe('2026-10-30 20:30Z');
  });
});

describe('subject pairs', () => {
  it('are the same whichever subject comes first', () => {
    expect(subjectPairKey(7, 3)).toBe(subjectPairKey(3, 7));
  });
});
