import { describe, expect, it } from 'vitest';
import { CollectionShard, CollectionTarget, ShardStreamStatus, ShardTaskStatus, WARMING } from '../types/collection';
import {
  attentionItems, collectionCounts, currentStatus, cutTime, handoffStep, parseStreamIds, shardHealth, shardStreams,
  stateCounts,
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
