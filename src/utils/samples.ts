import {
  ActivityData, FeedReading, JournalReading, LatencyData, LatencyKey, LedgerReading, RingReading, RuntimeData, Sample,
} from '../types/samples';

// Chart rows: a time (epoch ms) and named values; a value a sample didn't have is left out, so a line breaks there.
export type Point = { t: number } & Record<string, number>;

// How many points a chart aims for; a longer range is thinned to about this many samples per kind.
export const TARGET_POINTS = 720;
export const RUNTIME_INTERVAL_MS = 10_000;
export const MINUTE_MS = 60_000;

/** The thinning for a range: none when the native samples already fit, else a multiple of their interval. */
export function everyMsFor(rangeMs: number, nativeMs: number): number | undefined {
  const step = Math.ceil(rangeMs / TARGET_POINTS / nativeMs) * nativeMs;
  return step <= nativeMs ? undefined : step;
}

// A kind that grows with the session (latency keys, positions, feeds) arrives in parts a millisecond apart, all within
// the second their sample was taken; they chart as one point.
function moment(tsMs: number): number {
  return tsMs - (tsMs % 1_000);
}

export function ofKind<T>(samples: Sample[] | undefined, kind: string): Sample<T>[] {
  return (samples ?? []).filter(s => s.kind === kind) as Sample<T>[];
}

// ----- latency -----

export const ALL = '';

export interface LatencyFilter {
  metric: string;
  exchange: string;
  action: string;
  kind: string;
}

export interface LatencyOptions {
  metrics: string[];
  exchanges: string[];
  actions: string[];
  kinds: string[];
}

// Each pipeline's metrics in the order a record or order passes through them.
const METRIC_ORDER = [
  'strat.transit', 'strat.queue', 'strat.decision', 'oms.process', 'session.tick_to_order', 'order_to_ack',
  'cancel_to_ack',
  'shard.venue_to_recv', 'shard.wait', 'feed.shard_wait', 'feed.network', 'paper.queue', 'paper.lag',
  'gw.transit', 'gw.queue', 'gw.budget_wait', 'gw.sign_send', 'venue.answer', 'gw.report_out',
];

function keysOf(samples: Sample[]): LatencyKey[] {
  return samples.flatMap(s => ((s.data as unknown as LatencyData).keys ?? []));
}

function sorted(values: Iterable<string>, order: string[] = []): string[] {
  return [...new Set(values)].sort((a, b) => {
    const ia = order.indexOf(a);
    const ib = order.indexOf(b);
    if (ia >= 0 || ib >= 0) return (ia < 0 ? Infinity : ia) - (ib < 0 ? Infinity : ib);
    return a.localeCompare(b);
  });
}

/** The metrics in these latency samples, and for one metric the labels its keys take. */
export function latencyOptions(samples: Sample[], metric: string): LatencyOptions {
  const keys = keysOf(samples);
  const ofMetric = keys.filter(k => k.m === metric);
  return {
    metrics: sorted(keys.map(k => k.m), METRIC_ORDER),
    exchanges: sorted(ofMetric.map(k => k.ex).filter(Boolean)),
    actions: sorted(ofMetric.map(k => k.act).filter(Boolean)),
    kinds: sorted(ofMetric.map(k => k.kind).filter(Boolean)),
  };
}

function matches(key: LatencyKey, filter: LatencyFilter): boolean {
  return key.m === filter.metric
    && (filter.exchange === ALL || key.ex === filter.exchange)
    && (filter.action === ALL || key.act === filter.action)
    && (filter.kind === ALL || key.kind === filter.kind);
}

/**
 * One point per minute for the keys the filter selects, in microseconds. Several keys can't be merged into true
 * percentiles, so across them a point shows the count summed, p50 weighted by count (an estimate), and p99 and max as
 * the worst key's: never better than the truth.
 */
export function latencySeries(samples: Sample[], filter: LatencyFilter): Point[] {
  const points: Point[] = [];
  const byTime = new Map<number, Point>();
  for (const sample of samples) {
    const keys = ((sample.data as unknown as LatencyData).keys ?? []).filter(k => matches(k, filter));
    const n = keys.reduce((sum, k) => sum + k.n, 0);
    if (n === 0) continue;
    const t = moment(sample.tsMs);
    const existing = byTime.get(t);
    const point: Point = existing ?? { t, n: 0, p50: 0, p99: 0, max: 0 };
    const p50 = keys.reduce((sum, k) => sum + k.p50 * k.n, 0) / n / 1_000;
    point.p50 = (point.p50 * point.n + p50 * n) / (point.n + n);
    point.p99 = Math.max(point.p99, ...keys.map(k => k.p99 / 1_000));
    point.max = Math.max(point.max, ...keys.map(k => k.max / 1_000));
    point.n += n;
    if (!existing) {
      points.push(point);
      byTime.set(point.t, point);
    }
  }
  return points.sort((a, b) => a.t - b.t);
}

/** Every key in the newest minute of each latency kind (all its parts), slowest p99 first. */
export function latestLatency(samples: Sample[]): LatencyKey[] {
  const newest = new Map<string, number>();
  for (const sample of samples) {
    newest.set(sample.kind, Math.max(newest.get(sample.kind) ?? 0, moment(sample.tsMs)));
  }
  return keysOf(samples.filter(s => moment(s.tsMs) === newest.get(s.kind))).sort((a, b) => b.p99 - a.p99);
}

// ----- runtime -----

const PERCENT = 100;

/** CPU, memory, GC, scheduling and Aeron over time from runtime samples; -1 readings and missing deltas left out. */
export function runtimeSeries(samples: Sample<RuntimeData>[]) {
  const cpu: Point[] = [];
  const memory: Point[] = [];
  const gc: Point[] = [];
  const scheduling: Point[] = [];
  const network: Point[] = [];
  const aeron: Point[] = [];
  const udp: Point[] = [];
  for (const { tsMs: t, data } of samples) {
    const seconds = (data.intervalMs || RUNTIME_INTERVAL_MS) / 1_000;
    const host = data.host;
    cpu.push(withoutMissing({ t, busy: permilleToPercent(host?.cpuBusyPermille), steal: permilleToPercent(host?.cpuStealPermille) }));
    memory.push(withoutMissing({
      t,
      rss: mib(host?.processRssBytes),
      heap: mib(data.jvm?.heapUsedBytes),
      direct: mib(data.jvm?.directBytes),
      available: mib(host?.memAvailableBytes),
    }));
    const gcMs = (data.jvm?.gc ?? []).filter(c => c.ms !== undefined && c.ms >= 0);
    if (gcMs.length > 0) gc.push({ t, msPerSecond: gcMs.reduce((sum, c) => sum + (c.ms ?? 0), 0) / seconds });
    if (data.scheduling) {
      scheduling.push({ t, p99: data.scheduling.p99Micros, max: data.scheduling.maxMicros });
    }
    network.push(withoutMissing({
      t,
      rxKbPerSecond: rate(host?.netRxBytes, seconds, 1_024),
      txKbPerSecond: rate(host?.netTxBytes, seconds, 1_024),
      retransmits: host?.tcpRetransmits,
    }));
    if (host?.udpRcvbufErrors !== undefined) {
      udp.push(withoutMissing({
        t,
        inPerSecond: rate(host.udpInDatagrams, seconds),
        outPerSecond: rate(host.udpOutDatagrams, seconds),
        rcvbufErrors: nonNegative(host.udpRcvbufErrors),
        sndbufErrors: nonNegative(host.udpSndbufErrors),
      }));
    }
    if (data.aeron) {
      aeron.push(withoutMissing({
        t,
        naksSent: data.aeron.naksSent,
        naksReceived: data.aeron.naksReceived,
        lossGapFills: data.aeron.lossGapFills,
        senderMaxCycleUs: data.aeron.senderMaxCycleNs === undefined ? undefined : data.aeron.senderMaxCycleNs / 1_000,
      }));
    }
  }
  return { cpu, memory, gc, scheduling, network, aeron, udp };
}

/** Each agent thread's share of a core over time, in percent, by thread name. */
export function threadCpuSeries(samples: Sample<RuntimeData>[]): { names: string[]; points: Point[] } {
  const names = new Set<string>();
  const points: Point[] = [];
  for (const { tsMs: t, data } of samples) {
    const point: Point = { t };
    for (const thread of data.threads ?? []) {
      if (thread.cpuNanos === undefined || thread.cpuNanos < 0) continue;
      names.add(thread.name);
      point[thread.name] = (thread.cpuNanos / ((data.intervalMs || RUNTIME_INTERVAL_MS) * 1e6)) * PERCENT;
    }
    if (Object.keys(point).length > 1) points.push(point);
  }
  return { names: [...names].sort(), points };
}

function permilleToPercent(value: number | undefined): number | undefined {
  return value === undefined || value < 0 ? undefined : value / 10;
}

function mib(bytes: number | undefined): number | undefined {
  return bytes === undefined || bytes < 0 ? undefined : bytes / (1024 * 1024);
}

function rate(delta: number | undefined, seconds: number, unit = 1): number | undefined {
  return delta === undefined || delta < 0 ? undefined : delta / seconds / unit;
}

// Every charted reading is a size, rate or count, so a negative one is a reading the process couldn't take (-1).
function nonNegative(value: number | undefined): number | undefined {
  return value === undefined || value < 0 ? undefined : value;
}

function withoutMissing(row: Record<string, number | undefined>): Point {
  return Object.fromEntries(
    Object.entries(row).filter(([, v]) => v !== undefined && Number.isFinite(v) && v >= 0)) as Point;
}

// ----- activity -----

function block(data: ActivityData, name: string): Record<string, number> {
  const value = data[name];
  return value && typeof value === 'object' ? value : {};
}

function sumPrefixed(counters: Record<string, number>, prefix: string): number {
  return Object.entries(counters).filter(([k]) => k.startsWith(prefix)).reduce((sum, [, v]) => sum + v, 0);
}

/** Per minute: what the strategy and OMS sent, what the venue filled, and what was rejected or refused. */
export function activitySeries(samples: Sample<ActivityData>[]): Point[] {
  return samples
    .filter(s => Object.keys(block(s.data, 'oms')).length > 0 || Object.keys(block(s.data, 'strategy')).length > 0)
    .map(({ tsMs: t, data }) => {
      const oms = block(data, 'oms');
      const strategy = block(data, 'strategy');
      return withoutMissing({
        t,
        intents: strategy.intents,
        newOrders: oms.newOrders,
        cancels: oms.cancels,
        modifies: oms.modifies,
        fills: oms['report.FILL'] === undefined ? undefined : (oms['report.FILL'] ?? 0) + (oms['report.PARTIAL_FILL'] ?? 0),
        rejects: oms.reports === undefined ? undefined : sumPrefixed(oms, 'reject.'),
        refused: oms.reports === undefined ? undefined : sumPrefixed(oms, 'refused.'),
      });
    })
    .filter(p => Object.keys(p).length > 1);
}

/** Rejects and refusals over the samples, by reason, most first. */
export function rejectionTotals(samples: Sample<ActivityData>[]): { reason: string; source: 'venue' | 'oms'; count: number }[] {
  const totals = new Map<string, number>();
  for (const { data } of samples) {
    for (const [name, value] of Object.entries(block(data, 'oms'))) {
      if ((name.startsWith('reject.') || name.startsWith('refused.')) && value > 0) {
        totals.set(name, (totals.get(name) ?? 0) + value);
      }
    }
  }
  return [...totals.entries()]
    .map(([name, count]) => ({
      reason: name.slice(name.indexOf('.') + 1),
      source: name.startsWith('reject.') ? 'venue' as const : 'oms' as const,
      count,
    }))
    .sort((a, b) => b.count - a.count);
}

// ----- pipeline -----

/** Each ring's worst backlog per sample, by ring name. */
export function ringSeries(samples: Sample[]): { names: string[]; points: Point[] } {
  const names = new Set<string>();
  const points = samples.map(({ tsMs: t, data }) => {
    const point: Point = { t };
    for (const [name, value] of Object.entries(data)) {
      if (value && typeof value === 'object' && 'backlogPeak' in value) {
        names.add(name);
        point[name] = (value as RingReading).backlogPeak;
      }
    }
    return point;
  });
  return { names: [...names], points };
}

/** Records per minute per market-data stream, and each stream's resyncs over the samples. */
export function feedSeries(samples: Sample<{ feeds: FeedReading[] }>[]) {
  const names = new Set<string>();
  const resyncs = new Map<string, number>();
  const byTime = new Map<number, Point>();
  for (const { tsMs, data } of samples) {
    const t = moment(tsMs);
    const point: Point = byTime.get(t) ?? { t };
    byTime.set(t, point);
    for (const feed of data.feeds ?? []) {
      names.add(feed.name);
      if (feed.records !== undefined && feed.records >= 0) point[feed.name] = feed.records;
      if (feed.resyncs !== undefined && feed.resyncs > 0) resyncs.set(feed.name, (resyncs.get(feed.name) ?? 0) + feed.resyncs);
    }
  }
  const points = [...byTime.values()].filter(p => Object.keys(p).length > 1).sort((a, b) => a.t - b.t);
  return { names: [...names].sort(), points, resyncs };
}

export function ledgerSeries(samples: Sample<LedgerReading>[]): Point[] {
  return samples.map(({ tsMs: t, data }) => withoutMissing({ t, lag: data.lag, failures: data.consecutiveFailures }));
}

export function journalSeries(samples: Sample<JournalReading>[]): Point[] {
  return samples.map(({ tsMs: t, data }) => withoutMissing({
    t, pending: data.pendingSegments, oldestSeconds: data.oldestPendingMs / 1_000,
  }));
}
