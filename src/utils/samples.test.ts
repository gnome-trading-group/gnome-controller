import { describe, expect, it } from 'vitest';
import { ActivityData, LatencyKey, RuntimeData, Sample } from '../types/samples';
import {
  METRIC_DESCRIPTIONS, METRIC_ORDER,
  ALL, activitySeries, everyMsFor, feedSeries, latencyOptions, latencySeries, latestLatency, rejectionTotals,
  ringSeries, runtimeSeries, threadCpuSeries,
} from './samples';

function key(m: string, ex: string, act: string, kind: string, n: number, p50: number, p99: number): LatencyKey {
  return { m, ex, act, kind, n, p50, p90: p99, p99, p999: p99, max: p99 * 2 };
}

const latency: Sample[] = [
  { kind: 'latency.oms', tsMs: 60_000, data: { keys: [
    key('oms.process', 'KALSHI', 'NEW', 'MARKET_DATA', 10, 2_000, 8_000),
    key('oms.process', 'POLYMARKET_INTL', 'NEW', 'MARKET_DATA', 30, 4_000, 20_000),
  ] } },
  { kind: 'latency.strategy', tsMs: 60_000, data: { keys: [key('strat.queue', 'KALSHI', '', 'MARKET_DATA', 5, 1_000, 3_000)] } },
  { kind: 'latency.oms', tsMs: 120_000, data: { keys: [key('oms.process', 'KALSHI', 'CANCEL', 'EXEC_REPORT', 4, 1_000, 2_000)] } },
];

describe('latency', () => {
  it('lists the metrics in pipeline order and one metric\'s labels', () => {
    const options = latencyOptions(latency, 'oms.process');
    expect(options.metrics).toEqual(['strat.queue', 'oms.process']);
    expect(options.exchanges).toEqual(['KALSHI', 'POLYMARKET_INTL']);
    expect(options.actions).toEqual(['CANCEL', 'NEW']);
    expect(options.kinds).toEqual(['EXEC_REPORT', 'MARKET_DATA']);
  });

  it('across keys, sums counts, weights p50 and keeps the worst p99, in microseconds', () => {
    const points = latencySeries(latency, { metric: 'oms.process', exchange: ALL, action: ALL, kind: ALL });
    expect(points).toEqual([
      { t: 60_000, n: 40, p50: 3.5, p99: 20, max: 40 },
      { t: 120_000, n: 4, p50: 1, p99: 2, max: 4 },
    ]);
  });

  it('a filter narrows to the keys it names, leaving minutes without them out', () => {
    const points = latencySeries(latency, { metric: 'oms.process', exchange: 'KALSHI', action: 'NEW', kind: ALL });
    expect(points).toEqual([{ t: 60_000, n: 10, p50: 2, p99: 8, max: 16 }]);
  });

  it('the latest table takes each kind\'s newest minute, slowest first', () => {
    expect(latestLatency(latency).map(k => `${k.m} ${k.act}`)).toEqual(['strat.queue ', 'oms.process CANCEL']);
  });
});

describe('parts', () => {
  const parts: Sample[] = [
    { kind: 'latency.orders', tsMs: 60_000, data: { part: 0, parts: 2, keys: [key('order_to_ack', 'KALSHI', '', '', 3, 1_000, 5_000)] } },
    { kind: 'latency.orders', tsMs: 60_001, data: { part: 1, parts: 2, keys: [key('order_to_ack', 'POLYMARKET_INTL', '', '', 1, 3_000, 9_000)] } },
  ];

  it('a minute sent in parts charts as one point', () => {
    expect(latencySeries(parts, { metric: 'order_to_ack', exchange: ALL, action: ALL, kind: ALL }))
      .toEqual([{ t: 60_000, n: 4, p50: 1.5, p99: 9, max: 18 }]);
  });

  it('the latest table takes every part of the newest minute', () => {
    expect(latestLatency(parts).map(k => k.ex)).toEqual(['POLYMARKET_INTL', 'KALSHI']);
  });

  it('feeds sent in parts chart as one point', () => {
    const { points } = feedSeries([
      { kind: 'session.marketdata', tsMs: 120_000, data: { feeds: [{ name: 'A', reconnecting: false, records: 5 }] } },
      { kind: 'session.marketdata', tsMs: 120_001, data: { feeds: [{ name: 'B', reconnecting: false, records: -1 }] } },
    ]);
    expect(points).toEqual([{ t: 120_000, A: 5 }]);
  });

  it('readings a process couldn\'t take (-1) are left off the charts', () => {
    const series = runtimeSeries([runtime(0, { host: { cpuBusyPermille: -1, cpuStealPermille: 5, memAvailableBytes: -1,
      memTotalBytes: 1, processRssBytes: -1, diskFreeBytes: 1, tcpRetransmits: -1 } })]);
    expect(series.cpu).toEqual([{ t: 0, steal: 0.5 }]);
    expect(series.network).toEqual([{ t: 0 }]);
  });
});

describe('thinning', () => {
  it('keeps native samples when they fit the target, else a multiple of their interval', () => {
    expect(everyMsFor(3_600_000, 10_000)).toBeUndefined();
    expect(everyMsFor(7 * 86_400_000, 10_000)).toBe(840_000);
    expect(everyMsFor(7 * 86_400_000, 60_000)).toBe(840_000);
    expect(everyMsFor(86_400_000, 60_000)).toBe(120_000);
  });
});

const runtime = (tsMs: number, data: Partial<RuntimeData>): Sample<RuntimeData> => ({
  kind: 'runtime',
  tsMs,
  data: {
    intervalMs: 10_000,
    host: { cpuBusyPermille: 250, cpuStealPermille: -1, memAvailableBytes: 2 * 1024 ** 3, memTotalBytes: 4 * 1024 ** 3,
      processRssBytes: 1024 ** 3, diskFreeBytes: 1 },
    jvm: { heapUsedBytes: 512 * 1024 ** 2, heapCommittedBytes: 1, heapMaxBytes: 1, directBytes: 64 * 1024 ** 2,
      mappedBytes: 0, threads: 40, gc: [{ name: 'ZGC Pauses' }] },
    clock: { source: 'PHC', errorBoundNanos: 20_000, offsetNanos: 5, ageMs: 1 },
    threads: [],
    scheduling: null,
    ...data,
  } as RuntimeData,
});

describe('runtime', () => {
  it('reads gauges as they stand and leaves out what a process couldn\'t read', () => {
    const series = runtimeSeries([runtime(0, {})]);
    expect(series.cpu).toEqual([{ t: 0, busy: 25 }]);
    expect(series.memory).toEqual([{ t: 0, rss: 1024, heap: 512, direct: 64, available: 2048 }]);
    expect(series.gc).toEqual([]);
  });

  it('turns changes into rates over the sample\'s interval', () => {
    const series = runtimeSeries([runtime(10_000, {
      jvm: { heapUsedBytes: 1, heapCommittedBytes: 1, heapMaxBytes: 1, directBytes: 1, mappedBytes: 1, threads: 1,
        gc: [{ name: 'ZGC Pauses', collections: 2, ms: 30 }, { name: 'ZGC Cycles', collections: 1, ms: 70 }] },
    })]);
    expect(series.gc).toEqual([{ t: 10_000, msPerSecond: 10 }]);
  });

  it('gives each agent thread its share of a core', () => {
    const { names, points } = threadCpuSeries([runtime(0, { threads: [
      { name: 'oms', exited: false, cycles: 10, cpuNanos: 10_000_000_000 },
      { name: 'strategy', exited: false, cycles: 10, cpuNanos: 2_500_000_000 },
      { name: 'ledger', exited: false },
    ] })]);
    expect(names).toEqual(['oms', 'strategy']);
    expect(points).toEqual([{ t: 0, oms: 100, strategy: 25 }]);
  });
});

describe('activity', () => {
  const activity: Sample<ActivityData>[] = [
    { kind: 'session.activity', tsMs: 0, data: { intervalMs: 60_000, oms: {}, strategy: {} } },
    { kind: 'session.activity', tsMs: 60_000, data: { intervalMs: 60_000,
      strategy: { intents: 12 },
      oms: { newOrders: 4, cancels: 3, modifies: 1, reports: 9, 'report.FILL': 2, 'report.PARTIAL_FILL': 1,
        'reject.POST_ONLY_WOULD_CROSS': 2, 'refused.HALTED': 5, 'refused.MARKET_DATA_BAD': 0 } } },
  ];

  it('skips the first sample, which has no changes, and sums fills, rejects and refusals', () => {
    expect(activitySeries(activity)).toEqual([
      { t: 60_000, intents: 12, newOrders: 4, cancels: 3, modifies: 1, fills: 3, rejects: 2, refused: 5 },
    ]);
  });

  it('totals rejects and refusals by reason, most first', () => {
    expect(rejectionTotals(activity)).toEqual([
      { reason: 'HALTED', source: 'oms', count: 5 },
      { reason: 'POST_ONLY_WOULD_CROSS', source: 'venue', count: 2 },
    ]);
  });
});

describe('pipeline', () => {
  it('charts each ring\'s worst backlog', () => {
    const { names, points } = ringSeries([{ kind: 'session.rings', tsMs: 0, data: {
      intervalMs: 60_000, intents: { capacity: 1024, backlog: 0, backlogPeak: 7 }, orders: { capacity: 512, backlog: 1, backlogPeak: 2 },
    } }]);
    expect(names).toEqual(['intents', 'orders']);
    expect(points).toEqual([{ t: 0, intents: 7, orders: 2 }]);
  });

  it('charts each stream\'s records and totals its resyncs', () => {
    const { names, points, resyncs } = feedSeries([
      { kind: 'session.marketdata', tsMs: 0, data: { feeds: [{ name: 'KX-A', reconnecting: false }] } },
      { kind: 'session.marketdata', tsMs: 60_000, data: { feeds: [{ name: 'KX-A', reconnecting: true, records: 900, resyncs: 1 }] } },
    ]);
    expect(names).toEqual(['KX-A']);
    expect(points).toEqual([{ t: 60_000, 'KX-A': 900 }]);
    expect(resyncs.get('KX-A')).toBe(1);
  });
});

describe('metric descriptions', () => {
  it('explain every metric the pages order', () => {
    expect(METRIC_ORDER.filter(metric => !METRIC_DESCRIPTIONS[metric])).toEqual([]);
  });
});
