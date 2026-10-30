import { describe, expect, it } from 'vitest';
import { ContractProposition, ContractRelationship } from '../types';
import { buildGraph, buildLadder, buildUnits, pairOutcomes } from './relationshipViews';

const END = '2026-10-30T20:00:00+00:00';

function prop(securityId: number, eventId: number, fields: Record<string, unknown>, exchangeCode = 'KALSHI'): ContractProposition {
  return {
    securityId, subjectId: 1, extractedSubjectId: 1, method: 'VENUE', extractorVersion: 'p1', sourceHash: 'h',
    dateCreated: '', dateModified: '', eventId, exchangeCode, symbol: `s${securityId}`,
    fields: { kind: 'THRESHOLD', measure: 'price', comparator: 'GT', unit: 'usd', observation: 'AT_TIME', window_end: END, ...fields },
  };
}

/** Yes id = 10 * strike index + 1, its No side + 1, one event per strike. */
function ladder(strikes: number[], venue = 'KALSHI', base = 0): ContractProposition[] {
  return strikes.flatMap((value, i) => [
    prop(base + 10 * i + 1, base + i, { value }, venue),
    prop(base + 10 * i + 2, base + i, { value, negated: true }, venue),
  ]);
}

function rel(id: number, a: number, b: number, relationshipType: 'IMPLIES' | 'EQUIVALENT', flags: string[] = []): ContractRelationship {
  return { relationshipId: id, securityIdA: a, securityIdB: b, relationshipType, method: 'derived', flags, dateCreated: '' };
}

describe('outcomes', () => {
  it('pair the two sides of an event into one, Yes side first', () => {
    const outcomes = pairOutcomes(ladder([100]));
    expect(outcomes).toHaveLength(1);
    expect(outcomes[0].primary.securityId).toBe(1);
    expect(outcomes[0].other?.securityId).toBe(2);
  });

  it('leave a multi-outcome event as one outcome per contract', () => {
    const outcomes = pairOutcomes([prop(1, 5, { kind: 'WINNER', entity: 'a' }), prop(2, 5, { kind: 'WINNER', entity: 'b' }),
      prop(3, 5, { kind: 'WINNER', entity: 'c' })]);
    expect(outcomes.map(o => o.securityIds)).toEqual([[1], [2], [3]]);
  });
});

describe('units', () => {
  it('split snapshots at different times and call a strike ladder a ladder', () => {
    const units = buildUnits([...ladder([100, 200, 300]),
      prop(100, 50, { value: 100, window_end: '2026-10-30T21:00:00+00:00' })], []);
    expect(units.map(u => [u.outcomes.length, u.kind])).toEqual([[3, 'ladder'], [1, 'graph']]);
    expect(units[0].label).toBe('price at 2026-10-30 20:00Z');
  });

  it('join groups a stored row links, as a margin joins the winners', () => {
    const margin = prop(1, 1, { measure: 'margin:navi', observation: 'CUMULATIVE', window_end: null, value: 1.5 });
    const spread = prop(2, 2, { measure: 'spread', observation: 'CUMULATIVE', window_end: null, value: 0.5 });
    const units = buildUnits([margin, spread, prop(3, 3, { kind: 'WINNER', entity: 'navi' })], [rel(1, 1, 2, 'IMPLIES')]);
    expect(units).toHaveLength(1);
  });
});

describe('ladder table', () => {
  it('puts each strike on a row, highest first, with venues as columns and marks equivalent venues', () => {
    const props = [...ladder([100, 200]), ...ladder([100, 200], 'POLYMARKET_US', 1000)];
    const [unit] = buildUnits(props, []);
    const table = buildLadder(unit, [rel(1, 1, 1001, 'EQUIVALENT', ['RESOLUTION_SOURCE_DIFFERS']), rel(2, 11, 1011, 'EQUIVALENT')]);
    expect(table.venues).toEqual(['KALSHI', 'POLYMARKET_US']);
    expect(table.rows.map(r => [r.label, r.equivalence, Object.keys(r.cells).length])).toEqual([
      ['> 200 usd', 'equal', 2],
      ['> 100 usd', 'flagged', 2],
    ]);
    expect(table.rows[1].flags).toEqual(['RESOLUTION_SOURCE_DIFFERS']);
  });
});

describe('graph', () => {
  const [unit] = buildUnits([...ladder([100, 200]), prop(30, 9, { value: 150 })], []);

  it('draws a Yes-side row as implication and a No-side row reversed', () => {
    const { nodes, edges } = buildGraph(unit, [rel(1, 11, 1, 'IMPLIES'), rel(2, 2, 12, 'IMPLIES')]);
    expect(nodes).toHaveLength(3);
    expect(edges.map(e => [e.source, e.target, e.kind])).toEqual([['11', '1', 'implies'], ['11', '1', 'implies']]);
  });

  it('reads mixed sides as exclusion, cover or opposites', () => {
    const { edges } = buildGraph(unit, [rel(1, 11, 2, 'IMPLIES'), rel(2, 2, 11, 'IMPLIES'), rel(3, 1, 12, 'EQUIVALENT')]);
    expect(edges.map(e => e.kind)).toEqual(['excludes', 'covers', 'opposite']);
  });

  it('highlights outcomes holding a given security and skips rows leaving the unit', () => {
    const { nodes, edges } = buildGraph(unit, [rel(1, 1, 999, 'IMPLIES')], new Set([12]));
    expect(nodes.filter(n => n.highlighted).map(n => n.id)).toEqual(['11']);
    expect(edges).toEqual([]);
  });
});
