import { describe, expect, it } from 'vitest';
import {
  CollectionRule, CollectionShard, CollectionTarget, ShardStreamStatus, ShardTaskStatus, StreamCoverage, WARMING,
} from '../types/collection';
import {
  attentionItems, collectionCounts, coverageSegments, currentStatus, cutTime, handoffStep, parseStreamIds, ruleCriteria,
  ruleSelection, ruleStreamCount, segmentTime, shardHealth, shardStreams, stateCounts,
} from './collection';

const MIN = 60_000;
const status = (writtenAtMs: number, streams: Partial<ShardStreamStatus>[] = []) =>
  ({ writtenAtNs: writtenAtMs * 1_000_000, streams, taskId: `t${writtenAtMs}` }) as unknown as ShardTaskStatus;
const shard = (over: Partial<CollectionShard> = {}) =>
  ({ shardId: 's', streams: [], draining: [], cuts: {}, state: 'ACTIVE', createdAtNs: 0, ...over }) as CollectionShard;

describe('parseStreamIds', () => {
  it('takes ids however they are separated, deduplicated and sorted', () => {
    expect(parseStreamIds('12, 3\n7 3')).toEqual([3, 7, 12]);
  });

  it('refuses anything that is not a positive whole number', () => {
    expect(() => parseStreamIds('1, abc')).toThrow('"abc" is not a stream id');
    expect(() => parseStreamIds('0')).toThrow();
  });
});

describe('cutTime', () => {
  it('shows a cut as its UTC minute, and nothing for none or warming', () => {
    expect(cutTime(29_000_000)).toBe(new Date(29_000_000 * MIN).toISOString().slice(11, 16) + ' UTC');
    expect(cutTime(WARMING)).toBeNull();
    expect(cutTime(undefined)).toBeNull();
  });
});

describe('stateCounts', () => {
  it('counts in health order, unknown states last', () => {
    expect(stateCounts(['STALE', 'LIVE', 'LIVE', 'ODD', 'SUBSCRIBING'])).toEqual([
      { state: 'LIVE', count: 2 }, { state: 'SUBSCRIBING', count: 1 }, { state: 'STALE', count: 1 }, { state: 'ODD', count: 1 },
    ]);
  });
});

describe('shardHealth', () => {
  it('reads the newest status age: healthy, late, down; starting until 5 min without one', () => {
    expect(shardHealth(status(100_000), 0, 110_000)).toBe('healthy');
    expect(shardHealth(status(100_000), 0, 130_000)).toBe('late');
    expect(shardHealth(status(100_000), 0, 160_000)).toBe('down');
    expect(shardHealth(null, 0, 4 * MIN)).toBe('starting');
    expect(shardHealth(null, 0, 6 * MIN)).toBe('down');
  });

  it('takes the newest task as current', () => {
    expect(currentStatus([status(1), status(3), status(2)])?.taskId).toBe('t3');
    expect(currentStatus([])).toBeNull();
  });
});

describe('shardStreams', () => {
  it('joins assignment and status, roles from the cuts, problems first', () => {
    const s = shard({ streams: [1, 2, 3], draining: [4, 5], cuts: { '2': WARMING, '3': 29_000_000, '4': 29_000_000 } });
    const rows = shardStreams(s, status(0, [
      { id: 1, state: 'LIVE' }, { id: 2, state: 'LIVE' }, { id: 3, state: 'STALE' }, { id: 4, state: 'LIVE' },
      { id: 6, state: 'REMOVING' },
    ]));

    expect(rows.map((r) => [r.streamId, r.role, r.state])).toEqual([
      [3, 'taking over', 'STALE'], [5, 'draining', 'NONE'], [6, 'owned', 'REMOVING'],
      [1, 'owned', 'LIVE'], [2, 'warming', 'LIVE'], [4, 'handing off', 'LIVE'],
    ]);
  });
});

describe('handoffStep', () => {
  const t = (over: Partial<CollectionTarget>) => over as CollectionTarget;

  it('warming, then cut until its minute, then settling', () => {
    expect(handoffStep(t({}), 0)).toBeNull();
    expect(handoffStep(t({ drainingFromShardId: 'a' }), 0)).toBe('warming');
    expect(handoffStep(t({ drainingFromShardId: 'a', cutMinute: 10 }), 9 * MIN)).toBe('cut');
    expect(handoffStep(t({ drainingFromShardId: 'a', cutMinute: 10 }), 10 * MIN)).toBe('settling');
  });
});

describe('attentionItems and collectionCounts', () => {
  const targets = [
    { state: 'DESIRED', shardId: 'a', source: 'KALSHI', region: 'us-east-1', uncoveredSinceNs: 0 },
    { state: 'DESIRED', shardId: 'a', source: 'KALSHI', region: 'us-east-1', uncoveredSinceNs: MIN * 1e6, uncoveredReason: 'STALE' },
    { state: 'DESIRED', shardId: 'a', source: 'KALSHI', region: 'us-east-1', uncoveredSinceNs: 2 * MIN * 1e6, uncoveredReason: 'STALE' },
    { state: 'DESIRED', source: 'KALSHI', region: 'us-east-1' },
    { state: 'RETIRING', shardId: 'b', drainingFromShardId: 'a' },
  ] as CollectionTarget[];
  const shards = [shard({ shardId: 'a' }), shard({ shardId: 'b', state: 'DRAINING' }), shard({ shardId: 'c', state: 'DELETED' })];

  it('groups uncovered streams by source, region and reason; lists unplaced and down shards', () => {
    const items = attentionItems(targets, shards, new Map([['a', 'healthy'], ['b', 'down']]), 11 * MIN);
    expect(items.map((i) => i.text)).toEqual([
      '1 shard with no healthy task: b',
      '1 stream not placed on any shard',
      '2 KALSHI in us-east-1: stale (for 10 min)',
    ]);
  });

  it('counts wanted streams by coverage, and live shards', () => {
    expect(collectionCounts(targets, shards)).toEqual({
      wanted: 4, covered: 1, uncovered: 2, unplaced: 1, handingOff: 1, retiring: 1, shards: 2, draining: 1,
    });
  });
});

describe('rule summaries', () => {
  const rule = (over: Partial<CollectionRule>) => ({
    ruleId: 'r', name: 'r', ruleType: 'static_streams', parameters: {}, priority: 'RESEARCH', tier: 'standard',
    status: 'ACTIVE', ...over,
  }) as CollectionRule;

  it('counts a static rule from its own list and the others from what the reconciler resolved', () => {
    expect(ruleStreamCount(rule({ parameters: { stream_ids: [1, 2, 3] } }))).toBe(3);
    expect(ruleStreamCount(rule({ ruleType: 'event', parameters: { event_ids: [7] } }))).toBeNull();
    expect(ruleStreamCount(rule({ ruleType: 'event', resolvedStreams: 6 }))).toBe(6);
  });

  it('says what a rule selects, waiting events and a cap included', () => {
    expect(ruleSelection(rule({ parameters: { stream_ids: [1] } }))).toBe('1 stream');
    expect(ruleSelection(rule({ ruleType: 'event' }))).toBe('not resolved yet');
    expect(ruleSelection(rule({ ruleType: 'event', resolvedEvents: 3, resolvedStreams: 6, waitingEvents: 1 })))
      .toBe('3 events · 6 streams · 1 waiting');
    expect(ruleSelection(rule({ ruleType: 'event_filter', resolvedEvents: 1, resolvedStreams: 2, capped: true })))
      .toBe('1 event · 2 streams · capped');
  });

  it('puts an event filter in a line', () => {
    expect(ruleCriteria(rule({
      ruleType: 'event_filter',
      parameters: { top_n: 20, min_volume_24h: 5000, exchange_ids: [1, 2], tags: ['nfl'], max_streams: 200 },
    }))).toBe('top 20 by volume · ≥ $5,000 24h · exchanges: 1, 2 · tags: nfl · max 200 streams');
    expect(ruleCriteria(rule({ parameters: { stream_ids: [1] } }))).toBeNull();
  });
});

describe('coverageSegments', () => {
  const ns = (ms: number) => ms * 1_000_000;
  const coverage = (over: Partial<StreamCoverage>): StreamCoverage => ({
    streamId: 1, fromNs: 0, toNs: 0, intervals: [], gaps: [], openGap: null, coveredFraction: 0, ...over,
  });

  it('draws intervals, gaps and the open gap in time order, clipped to the range', () => {
    const segments = coverageSegments(coverage({
      intervals: [
        { fromNs: ns(0), toNs: ns(50 * MIN), open: false, shardId: 's1' },
        { fromNs: ns(52 * MIN), toNs: ns(80 * MIN), open: false, shardId: 's2' },
      ],
      gaps: [{ fromNs: ns(50 * MIN), toNs: ns(52 * MIN), reason: 'TASK_STOPPED' }],
      openGap: { fromNs: ns(80 * MIN), reason: 'NOT_PLACED' },
    }), 10 * MIN, 120 * MIN, 90 * MIN);

    expect(segments.map(s => [s.kind, s.startMs / MIN, s.endMs / MIN, s.label])).toEqual([
      ['covered', 10, 50, 's1'],
      ['gap', 50, 52, 'task_stopped'],
      ['covered', 52, 80, 's2'],
      ['uncovered', 80, 90, 'not_placed'],
    ]);
    expect(segmentTime(segments, 'covered')).toBe(68 * MIN);
  });

  it('runs an open interval to now and leaves out what falls outside the range', () => {
    const segments = coverageSegments(coverage({
      intervals: [{ fromNs: ns(30 * MIN), toNs: ns(31 * MIN), open: true, shardId: 's1' }],
      gaps: [{ fromNs: ns(0), toNs: ns(5 * MIN), reason: 'REMOVED' }],
    }), 10 * MIN, 60 * MIN, 45 * MIN);

    expect(segments.map(s => [s.kind, s.startMs / MIN, s.endMs / MIN])).toEqual([['covered', 30, 45]]);
  });
});
