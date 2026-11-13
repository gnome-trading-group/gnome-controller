import { describe, expect, it } from 'vitest';
import { CounterData, DropsData, FeedShardsData, LaneMinuteData, LatencyKey, Sample, ShardStreamsData } from '../types/samples';
import {
  MARKET_DATA_PATH, blockSeries, blockTotals, dropTotals, feedShardSeries, feedShardTotals, laneSeries,
  shardStreamsSeries, stageBreakdown, worstStreams,
} from './processSamples';

function key(m: string, act: string, n: number, p50: number, p99: number): LatencyKey {
  return { m, ex: '', act, kind: '', n, p50, p90: p99, p99, p999: p99, max: p99 * 2 };
}

describe('stage breakdown', () => {
  it('takes each stage\'s newest minute, its keys together, in microseconds', () => {
    const samples: Sample[] = [
      { kind: 'latency.shard.publisher', tsMs: 60_000, data: { keys: [key('shard.wait', '', 10, 1_000_000, 9_000_000)] } },
      { kind: 'latency.shard.publisher', tsMs: 120_000, data: { keys: [key('shard.wait', '', 4, 2_000, 8_000)] } },
      { kind: 'latency.paper', tsMs: 60_000, data: { keys: [
        key('paper.queue', '', 1, 100_000, 100_000), key('paper.lag', '', 3, 5_000_000, 50_000_000),
      ] } },
    ];
    const rows = stageBreakdown(samples, MARKET_DATA_PATH);
    const wait = rows.find(r => r.metric === 'shard.wait')!;
    expect(wait).toMatchObject({ minuteMs: 120_000, n: 4, p50Us: 2, p99Us: 8, maxUs: 16 });
    expect(rows.find(r => r.metric === 'paper.lag')).toMatchObject({ n: 3, p99Us: 50_000 });
    expect(rows.find(r => r.metric === 'feed.network')).toMatchObject({ minuteMs: null, n: 0 });
    expect(rows.map(r => r.metric)).toEqual(MARKET_DATA_PATH.map(s => s.metric));
  });

  it('weights p50 by count across keys and keeps the worst p99', () => {
    const samples: Sample[] = [{ kind: 'latency.lane.5', tsMs: 0, data: { keys: [
      key('venue.answer', 'NEW', 1, 10_000, 20_000), key('venue.answer', 'CANCEL', 3, 2_000, 90_000),
    ] } }];
    expect(stageBreakdown(samples, [{ metric: 'venue.answer', label: '', where: '' }])[0])
      .toMatchObject({ n: 4, p50Us: 4, p99Us: 90 });
  });
});

describe('counter blocks', () => {
  const samples: Sample<CounterData>[] = [
    { kind: 'gateway.agents', tsMs: 0, data: { intervalMs: 60_000, lane: { passes: 10, passGapPeakNanos: 3_000_000 } } },
    { kind: 'gateway.agents', tsMs: 60_000, data: { intervalMs: 60_000, lane: { passes: 20 } } },
    { kind: 'gateway.agents', tsMs: 120_000, data: { intervalMs: 60_000, feed: { passes: 5 } } },
  ];

  it('charts the chosen counters, nanosecond peaks in ms, leaving out samples without the block', () => {
    expect(blockSeries(samples, 'lane', { passes: 'passes', gap: 'passGapPeakNanos' })).toEqual([
      { t: 0, passes: 10, gap: 3 },
      { t: 60_000, passes: 20 },
    ]);
  });

  it('sums a block\'s counts above zero, largest first', () => {
    const refused: Sample<CounterData>[] = [
      { kind: 'gateway.transport', tsMs: 0, data: { intervalMs: 1, refused: { HALTED: 2, SELF_TRADE: 0 } } },
      { kind: 'gateway.transport', tsMs: 1, data: { intervalMs: 1, refused: { HALTED: 1, SESSION_CAP: 5 } } },
    ];
    expect(blockTotals(refused, 'refused')).toEqual([{ name: 'SESSION_CAP', count: 5 }, { name: 'HALTED', count: 3 }]);
  });

  it('totals drops but not the self-trade index\'s size', () => {
    const drops: Sample<DropsData>[] = [
      { kind: 'gateway.drops', tsMs: 0, data: { intervalMs: 1, selfTradeHeld: 40, unlinkedOrders: 1, fragmented: 0 } },
      { kind: 'gateway.drops', tsMs: 1, data: { intervalMs: 1, selfTradeHeld: 41, unlinkedOrders: 2 } },
    ];
    expect(dropTotals(drops)).toEqual([{ name: 'unlinkedOrders', count: 3 }]);
  });
});

describe('lanes', () => {
  const minute = (accountId: number, orders: number): LaneMinuteData => ({
    accountId, name: `acct-${accountId}`, cancels: 1, cancelWaitP99Us: 2_000, cancelWaitMaxUs: 0, orders,
    orderWaitP99Us: 4_000, orderWaitMaxUs: 0, held: 1, refusedWaiting: 1, refusedWithoutConnection: 1, dropped: 0,
    orderAnswerP50Us: 0, orderAnswerP99Us: 30_000, cancelAnswerP50Us: 0, cancelAnswerP99Us: 20_000, unanswered: 0,
    connectionsBusy: 0, venueRefusals: 2, sessions: [],
  });

  it('splits by account in time order, waits in ms', () => {
    const lanes = laneSeries([
      { kind: 'gateway.lanes', tsMs: 120_000, data: minute(5, 7) },
      { kind: 'gateway.lanes', tsMs: 60_000, data: minute(5, 3) },
      { kind: 'gateway.lanes', tsMs: 60_000, data: minute(2, 1) },
    ]);
    expect(lanes.map(l => l.accountId)).toEqual([2, 5]);
    expect(lanes[1].sends).toEqual([{ t: 60_000, orders: 3, cancels: 1 }, { t: 120_000, orders: 7, cancels: 1 }]);
    expect(lanes[1].waits[0]).toEqual({ t: 60_000, orderWait: 4, cancelWait: 2, orderAnswer: 30, cancelAnswer: 20 });
    expect(lanes[1].problems[0]).toMatchObject({ refused: 2, venueRefusals: 2 });
    expect(lanes[1].latest.orders).toBe(7);
  });
});

describe('feed', () => {
  const sample = (t: number, network: number, records: number): Sample<FeedShardsData> => ({
    kind: 'feed.shards', tsMs: t, data: {
      intervalMs: 60_000, streams: 3, bad: 1,
      shards: [
        { shardId: 'a', records, networkPeakNanos: network, shardWaitPeakNanos: 1_000_000, statusGapPeakNanos: 0 },
        { shardId: 'b', records: 2, networkPeakNanos: 1_000_000, shardWaitPeakNanos: 7_000_000, statusGapPeakNanos: 0 },
      ],
      worstBehind: [],
    },
  });

  it('charts the worst shard per minute in ms and sums records', () => {
    expect(feedShardSeries([sample(0, 3_000_000, 10)])).toEqual([
      { t: 0, network: 3, shardWait: 7, statusGap: 0, records: 12, bad: 1, streams: 3 },
    ]);
  });

  it('keeps each shard\'s worst minute, worst network first', () => {
    const rows = feedShardTotals([sample(0, 3_000_000, 10), sample(60_000, 9_000_000, 5)]);
    expect(rows[0]).toEqual({ shardId: 'a', records: 15, networkPeakMs: 9, shardWaitPeakMs: 1, statusGapPeakMs: 0 });
  });
});

describe('shards', () => {
  it('takes each stream at its worst across the minutes it was named, worst first', () => {
    const rows = worstStreams(
      [[{ streamId: 1, name: 'x', v: 3 }, { streamId: 2, name: 'y', v: 9 }], [{ streamId: 1, name: 'x', v: 12 }]],
      r => r.v,
    );
    expect(rows).toEqual([
      { streamId: 1, name: 'x', value: 12, minutes: 2 },
      { streamId: 2, name: 'y', value: 9, minutes: 1 },
    ]);
  });

  it('charts publish, wait (ms), collect and states', () => {
    const data: ShardStreamsData = {
      intervalMs: 60_000, generation: 3, streams: 2, states: { LIVE: 2 }, connections: 1, reconnecting: 0, probes: 0,
      probeMismatches: 0,
      publish: { publications: 2, offered: 100, held: 4, streamsHeld: 1, lapped: 0, resent: 3, waitPeakNanos: 250_000_000 },
      collect: { records: 120, ringFullWaits: 0, backlogPeak: 7, uploadsQueued: 0, uploadsFailed: 0 },
      worstWait: [], worstHeld: [],
    };
    const series = shardStreamsSeries([{ kind: 'shard.streams', tsMs: 0, data }]);
    expect(series.wait).toEqual([{ t: 0, waitPeak: 250 }]);
    expect(series.publish[0]).toMatchObject({ offered: 100, held: 4 });
    expect(series.collect[0]).toMatchObject({ records: 120, backlogPeak: 7 });
    expect(series.states).toEqual([{ t: 0, LIVE: 2 }]);
    expect(series.stateNames).toEqual(['LIVE']);
  });
});
