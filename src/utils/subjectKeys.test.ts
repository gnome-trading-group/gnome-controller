import { describe, expect, it } from 'vitest';
import { ContractProposition, SubjectKeyAlias } from '../types';
import { effectiveKeys, keyUsage, possibleSplits } from './subjectKeys';

const SUBJECT = 'game:cs2:2026-11-12:nordic-rgg';

function prop(securityId: number, eventId: number, exchangeCode: string, fields: Record<string, unknown>,
  eventResolved = false): ContractProposition {
  return {
    securityId, subjectId: 1, extractedSubjectId: 1, method: 'VENUE', extractorVersion: 'p1', sourceHash: 'h',
    dateCreated: '', dateModified: '', eventId, exchangeCode, eventResolved,
    fields: { kind: 'WINNER', measure: 'winner', scope: 'match', subject: SUBJECT, ...fields },
  };
}

const winner = (securityId: number, eventId: number, venue: string, entity: string) =>
  prop(securityId, eventId, venue, { entity });

function alias(key: string, canonicalKey: string, kind: SubjectKeyAlias['kind'] = 'ENTITY'): SubjectKeyAlias {
  return {
    requestedSubjectId: 1, canonicalSubjectId: 1, subjectId: 1, kind, key, canonicalKey, flags: [], origin: 'MERGE',
    mergeLogId: 1, reason: null, actor: 'classifier:subject-merger', dateCreated: '', dateModified: '',
  };
}

// The 2026-11-11 Nordic Valor vs RoundsGG subject: one venue keys RoundsGG two ways across its events.
const NORDIC_RGG = [
  winner(1, 10, 'POLYMARKET_INTL', 'nordic-valor'), winner(2, 10, 'POLYMARKET_INTL', 'roundsgg'),
  winner(3, 11, 'POLYMARKET_INTL', 'nordic-valor'), winner(4, 11, 'POLYMARKET_INTL', 'rounds'),
  winner(5, 12, 'KALSHI', 'nor'), winner(6, 12, 'KALSHI', 'rgg'),
];
const NORDIC_RGG_ALIASES = [alias('nordic-valor', 'nor'), alias('rounds', 'rgg')];

describe('effectiveKeys', () => {
  it('reads a chain through to its end and leaves other keys alone', () => {
    const eff = effectiveKeys([alias('a', 'b'), alias('b', 'c'), alias('maps_played', 'total_maps', 'MEASURE')]);
    expect([eff.entity('a'), eff.entity('b'), eff.entity('x')]).toEqual(['c', 'c', 'x']);
    expect(eff.measure('maps_played')).toBe('total_maps');
  });
});

describe('keyUsage', () => {
  it('lists each key with what it derives as, its venues and contracts', () => {
    const uses = keyUsage(NORDIC_RGG, NORDIC_RGG_ALIASES);
    expect(uses.map(u => [u.key, u.effective, u.venues.join(','), u.contracts])).toEqual([
      ['nor', 'nor', 'KALSHI', 1],
      ['nordic-valor', 'nor', 'POLYMARKET_INTL', 2],
      ['rgg', 'rgg', 'KALSHI', 1],
      ['rounds', 'rgg', 'POLYMARKET_INTL', 1],
      ['roundsgg', 'roundsgg', 'POLYMARKET_INTL', 1],
    ]);
  });

  it('counts a margin\'s team and a score\'s sides, and leaves resolved events out', () => {
    const uses = keyUsage([
      prop(1, 10, 'KALSHI', { kind: 'THRESHOLD', measure: 'margin:nxs', entity: null }),
      prop(2, 11, 'KALSHI', { kind: 'SCORE', measure: null, entity: null, scores: [['nxs', 2], ['baks', 1]] }),
      prop(3, 12, 'KALSHI', { entity: 'gone' }, true),
    ], []);
    expect(uses.map(u => [u.key, u.contracts])).toEqual([['baks', 1], ['nxs', 2]]);
  });
});

describe('possibleSplits', () => {
  it('finds one venue keying a team two ways against the same opponent', () => {
    expect(possibleSplits(NORDIC_RGG, NORDIC_RGG_ALIASES)).toEqual([{
      slot: 'WINNER winner match',
      reasons: ['SAME_OPPONENT'],
      keys: [{ key: 'rgg', venues: ['KALSHI', 'POLYMARKET_INTL'] }, { key: 'roundsgg', venues: ['POLYMARKET_INTL'] }],
    }]);
  });

  it('finds nothing once an alias joins the two keys', () => {
    expect(possibleSplits(NORDIC_RGG, [...NORDIC_RGG_ALIASES, alias('roundsgg', 'rgg')])).toEqual([]);
  });

  it('finds two venues each keying the teams their own way', () => {
    const split = possibleSplits([
      winner(1, 10, 'HYPERLIQUID', 'bos'), winner(2, 10, 'HYPERLIQUID', 'tor'),
      winner(3, 20, 'POLYMARKET_INTL', 'celtics'), winner(4, 20, 'POLYMARKET_INTL', 'raptors'),
    ], []);
    expect(split.map(s => [s.reasons, s.keys.map(k => k.key)])).toEqual([
      [['VENUES_DISAGREE'], ['bos', 'celtics', 'raptors', 'tor']],
    ]);
  });

  it('leaves a draw listed with both teams alone, and a venue listing more outcomes', () => {
    expect(possibleSplits([
      winner(1, 10, 'KALSHI', 'ars'), winner(2, 10, 'KALSHI', 'draw'), winner(3, 10, 'KALSHI', 'che'),
      winner(4, 20, 'POLYMARKET_INTL', 'ars'), winner(5, 20, 'POLYMARKET_INTL', 'che'),
    ], [])).toEqual([]);
  });

  it('ignores the No side of a binary market', () => {
    expect(possibleSplits([
      winner(1, 10, 'KALSHI', 'nor'), winner(2, 10, 'KALSHI', 'rgg'),
      prop(3, 11, 'KALSHI', { entity: 'nor', negated: true }), prop(4, 11, 'KALSHI', { entity: 'x' }),
    ], [])).toEqual([]);
  });
});
