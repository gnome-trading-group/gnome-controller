import {
  CounterData, DropsData, FeedShardsData, LaneMinuteData, LatencyData, Sample, ShardStreamsData,
} from '../types/samples';
import { Point } from './samples';

// Order gateways' and shards' samples as the controller shows them. Durations arrive in nanoseconds; charts show
// microseconds for latency stages and milliseconds for peaks.

const NANOS_PER_MICRO = 1_000;
const NANOS_PER_MILLI = 1_000_000;
const MICROS_PER_MILLI = 1_000;

/** A market-data record's path through a shard and a paper gateway, as the samples measure it, in order. */
export const MARKET_DATA_PATH: { metric: string; label: string; where: string }[] = [
  { metric: 'shard.venue_to_recv', label: 'Venue → shard', where: 'shard (venue clock: a trend, not a level)' },
  { metric: 'shard.wait', label: 'Inside the shard', where: 'shard publisher, held records included' },
  { metric: 'feed.shard_wait', label: 'Inside the shard (as the gateway saw it)', where: 'gateway reader' },
  { metric: 'feed.network', label: 'Network + Aeron', where: 'gateway reader, against the shard\'s send stamp' },
  { metric: 'paper.queue', label: 'Gateway queue → books', where: 'paper lane' },
  { metric: 'paper.lag', label: 'Total: venue receipt → books', where: 'paper lane' },
];

/** An order's path through a gateway, in order. */
export const ORDER_PATH: { metric: string; label: string; where: string }[] = [
  { metric: 'gw.transit', label: 'Session → gateway', where: 'from the OMS\'s send stamp (session clock)' },
  { metric: 'gw.queue', label: 'Waiting for the lane', where: 'ingress → lane' },
  { metric: 'gw.budget_wait', label: 'Waiting for the rate budget', where: 'lane' },
  { metric: 'gw.sign_send', label: 'Encode, sign, write', where: 'lane' },
  { metric: 'venue.answer', label: 'Venue round trip', where: 'lane' },
  { metric: 'gw.report_out', label: 'Report → session', where: 'its receipt to egress\'s send' },
];

export interface StageRow {
  metric: string;
  label: string;
  where: string;
  minuteMs: number | null;
  n: number;
  p50Us: number;
  p99Us: number;
  maxUs: number;
}

/**
 * Each stage's newest minute, every key of its metric in that minute together: count summed, p50 weighted by count
 * (an estimate), p99 and max the worst key's. A stage with no minute in the samples has n 0.
 */
export function stageBreakdown(samples: Sample[], stages: { metric: string; label: string; where: string }[]): StageRow[] {
  return stages.map(stage => {
    let newest = -1;
    for (const sample of samples) {
      const keys = (sample.data as unknown as LatencyData).keys ?? [];
      if (sample.tsMs > newest && keys.some(k => k.m === stage.metric && k.n > 0)) newest = sample.tsMs;
    }
    const keys = samples
      .filter(s => s.tsMs === newest)
      .flatMap(s => ((s.data as unknown as LatencyData).keys ?? []).filter(k => k.m === stage.metric && k.n > 0));
    const n = keys.reduce((sum, k) => sum + k.n, 0);
    return {
      ...stage,
      minuteMs: newest < 0 ? null : newest,
      n,
      p50Us: n === 0 ? 0 : keys.reduce((sum, k) => sum + k.p50 * k.n, 0) / n / NANOS_PER_MICRO,
      p99Us: Math.max(0, ...keys.map(k => k.p99 / NANOS_PER_MICRO)),
      maxUs: Math.max(0, ...keys.map(k => k.max / NANOS_PER_MICRO)),
    };
  });
}

function block(data: CounterData, name: string): Record<string, number> {
  const value = data[name];
  return value && typeof value === 'object' ? value : {};
}

/** Chosen counters of one block over time, by the label to chart them under; counters a sample lacks left out. */
export function blockSeries(samples: Sample<CounterData>[], blockName: string, counters: Record<string, string>): Point[] {
  const points: Point[] = [];
  for (const { tsMs: t, data } of samples) {
    const values = block(data, blockName);
    const point: Point = { t };
    for (const [label, counter] of Object.entries(counters)) {
      const value = values[counter];
      if (value !== undefined && value >= 0) point[label] = counter.endsWith('Nanos') ? value / NANOS_PER_MILLI : value;
    }
    if (Object.keys(point).length > 1) points.push(point);
  }
  return points;
}

/** A block's counts over the samples, those above zero, largest first. */
export function blockTotals(samples: Sample<CounterData>[], blockName: string): { name: string; count: number }[] {
  const totals = new Map<string, number>();
  for (const { data } of samples) {
    for (const [name, value] of Object.entries(block(data, blockName))) {
      if (value > 0) totals.set(name, (totals.get(name) ?? 0) + value);
    }
  }
  return [...totals.entries()].map(([name, count]) => ({ name, count })).sort((a, b) => b.count - a.count);
}

/** What a gateway dropped over the samples, what was above zero, largest first. */
export function dropTotals(samples: Sample<DropsData>[]): { name: string; count: number }[] {
  const totals = new Map<string, number>();
  for (const { data } of samples) {
    for (const [name, value] of Object.entries(data)) {
      if (name !== 'intervalMs' && name !== 'selfTradeHeld' && value > 0) totals.set(name, (totals.get(name) ?? 0) + value);
    }
  }
  return [...totals.entries()].map(([name, count]) => ({ name, count })).sort((a, b) => b.count - a.count);
}

export interface LaneSeries {
  accountId: number;
  name: string;
  sends: Point[];
  waits: Point[];
  problems: Point[];
  latest: LaneMinuteData;
}

/** Each live account's lane minutes over time: what it sent, how long requests waited and the venue answered (ms). */
export function laneSeries(samples: Sample<LaneMinuteData>[]): LaneSeries[] {
  const byAccount = new Map<number, LaneSeries>();
  for (const { tsMs: t, data } of [...samples].sort((a, b) => a.tsMs - b.tsMs)) {
    let lane = byAccount.get(data.accountId);
    if (!lane) {
      lane = { accountId: data.accountId, name: data.name, sends: [], waits: [], problems: [], latest: data };
      byAccount.set(data.accountId, lane);
    }
    lane.latest = data;
    lane.sends.push({ t, orders: data.orders, cancels: data.cancels });
    lane.waits.push({
      t,
      orderWait: data.orderWaitP99Us / MICROS_PER_MILLI,
      cancelWait: data.cancelWaitP99Us / MICROS_PER_MILLI,
      orderAnswer: data.orderAnswerP99Us / MICROS_PER_MILLI,
      cancelAnswer: data.cancelAnswerP99Us / MICROS_PER_MILLI,
    });
    lane.problems.push({
      t,
      held: data.held,
      refused: data.refusedWaiting + data.refusedWithoutConnection,
      venueRefusals: data.venueRefusals,
      unanswered: data.unanswered,
    });
  }
  return [...byAccount.values()].sort((a, b) => a.accountId - b.accountId);
}

/** A gateway's shard reader over time: the worst network and in-shard times and status gap of any shard (ms). */
export function feedShardSeries(samples: Sample<FeedShardsData>[]): Point[] {
  return samples.map(({ tsMs: t, data }) => {
    const shards = data.shards ?? [];
    const worst = (pick: (s: FeedShardsData['shards'][number]) => number) =>
      Math.max(0, ...shards.map(pick)) / NANOS_PER_MILLI;
    return {
      t,
      network: worst(s => s.networkPeakNanos),
      shardWait: worst(s => s.shardWaitPeakNanos),
      statusGap: worst(s => s.statusGapPeakNanos),
      records: shards.reduce((sum, s) => sum + Math.max(0, s.records), 0),
      bad: data.bad,
      streams: data.streams,
    };
  });
}

/** The newest sample, or undefined. */
export function newest<T>(samples: Sample<T>[]): Sample<T> | undefined {
  return samples.reduce<Sample<T> | undefined>((best, s) => (!best || s.tsMs > best.tsMs ? s : best), undefined);
}

/** Each shard's worst minute across the samples, worst network time first. */
export function feedShardTotals(samples: Sample<FeedShardsData>[]) {
  const byShard = new Map<string, { shardId: string; records: number; networkPeakMs: number; shardWaitPeakMs: number; statusGapPeakMs: number }>();
  for (const { data } of samples) {
    for (const s of data.shards ?? []) {
      const row = byShard.get(s.shardId) ?? { shardId: s.shardId, records: 0, networkPeakMs: 0, shardWaitPeakMs: 0, statusGapPeakMs: 0 };
      row.records += Math.max(0, s.records);
      row.networkPeakMs = Math.max(row.networkPeakMs, s.networkPeakNanos / NANOS_PER_MILLI);
      row.shardWaitPeakMs = Math.max(row.shardWaitPeakMs, s.shardWaitPeakNanos / NANOS_PER_MILLI);
      row.statusGapPeakMs = Math.max(row.statusGapPeakMs, s.statusGapPeakNanos / NANOS_PER_MILLI);
      byShard.set(s.shardId, row);
    }
  }
  return [...byShard.values()].sort((a, b) => b.networkPeakMs - a.networkPeakMs);
}

/** Streams named among the worst in any sample, each at its worst value across them, worst first. */
export function worstStreams<T extends { streamId: number; name: string }>(
  rows: T[][], value: (row: T) => number, limit = 10,
): { streamId: number; name: string; value: number; minutes: number }[] {
  const byStream = new Map<number, { streamId: number; name: string; value: number; minutes: number }>();
  for (const minute of rows) {
    for (const row of minute) {
      const seen = byStream.get(row.streamId) ?? { streamId: row.streamId, name: row.name, value: 0, minutes: 0 };
      seen.value = Math.max(seen.value, value(row));
      seen.minutes++;
      byStream.set(row.streamId, seen);
    }
  }
  return [...byStream.values()].sort((a, b) => b.value - a.value).slice(0, limit);
}

/** A shard's minutes over time: what it sent sessions and what held it back, what it collected, and its states. */
export function shardStreamsSeries(samples: Sample<ShardStreamsData>[]) {
  const stateNames = new Set<string>();
  const publish: Point[] = [];
  const wait: Point[] = [];
  const collect: Point[] = [];
  const states: Point[] = [];
  for (const { tsMs: t, data } of samples) {
    const p = data.publish;
    const c = data.collect;
    if (p) {
      publish.push({ t, offered: p.offered, held: p.held, lapped: p.lapped, resent: p.resent, streamsHeld: p.streamsHeld });
      wait.push({ t, waitPeak: p.waitPeakNanos / NANOS_PER_MILLI });
    }
    if (c) {
      collect.push({
        t, records: c.records, ringFullWaits: c.ringFullWaits, backlogPeak: c.backlogPeak, uploadsQueued: c.uploadsQueued,
        uploadsFailed: c.uploadsFailed,
      });
    }
    const point: Point = { t };
    for (const [name, count] of Object.entries(data.states ?? {})) {
      stateNames.add(name);
      point[name] = count;
    }
    states.push(point);
  }
  return { publish, wait, collect, states, stateNames: [...stateNames].sort() };
}
