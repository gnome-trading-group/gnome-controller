// Samples: readings over time a session (and gateways, shards) sends to the registry's samples API (ops.sample, kept
// 7 days). Durations are nanoseconds; counters are the change since the previous sample of the kind, absent from a
// subject's first; -1 is a reading the process couldn't take.

export interface Sample<T = Record<string, unknown>> {
  kind: string;
  tsMs: number;
  data: T;
}

export interface SamplePage {
  samples: Sample[];
  next: string | null;
}

export interface LatencyKey {
  m: string;
  ex: string;
  exchangeId?: number;
  act: string;
  kind: string;
  n: number;
  p50: number;
  p90: number;
  p99: number;
  p999: number;
  max: number;
}

export interface LatencyData {
  keys: LatencyKey[];
}

export interface RuntimeData {
  intervalMs: number;
  host: {
    cpuBusyPermille: number;
    cpuStealPermille: number;
    loadHundredths?: number;
    memAvailableBytes: number;
    memTotalBytes: number;
    processRssBytes: number;
    diskFreeBytes: number;
    netRxBytes?: number;
    netTxBytes?: number;
    tcpRetransmits?: number;
    udpInDatagrams?: number;
    udpOutDatagrams?: number;
    udpInErrors?: number;
    udpRcvbufErrors?: number;
    udpSndbufErrors?: number;
  };
  jvm: {
    heapUsedBytes: number;
    heapCommittedBytes: number;
    heapMaxBytes: number;
    directBytes: number;
    mappedBytes: number;
    threads: number;
    gc: { name: string; collections?: number; ms?: number }[];
  };
  clock: { source: string; errorBoundNanos: number; offsetNanos: number; ageMs: number };
  threads: { name: string; exited: boolean; cycles?: number; cpuNanos?: number }[];
  scheduling: { samples: number; p50Micros: number; p99Micros: number; p999Micros: number; maxMicros: number } | null;
  aeron?: Record<string, number>;
}

// session.activity: each block's counters by name (counts are the minute's change; gauges and peaks as read).
export interface ActivityData {
  intervalMs: number;
  [block: string]: number | Record<string, number>;
}

export interface RingReading {
  capacity: number;
  backlog: number;
  backlogPeak: number;
  published?: number;
  fullWaits?: number;
}

export interface FeedReading {
  name: string;
  reconnecting: boolean;
  resyncs?: number;
  records?: number;
  bytes?: number;
  resentRepeats?: number;
  refused?: number;
}

export interface LedgerReading {
  published: number;
  stored: number;
  lag: number;
  fenced: boolean;
  consecutiveFailures: number;
  lastStoredAgoMs: number;
}

export interface JournalReading {
  pendingSegments: number;
  oldestPendingMs: number;
  segmentBytes: number;
}

// ----- order gateways and shards -----

// A CounterSampler sample (gateway.agents, gateway.transport, shard.agents): each block's counters by name, counts as
// the interval's change, gauges as read, peaks the interval's largest.
export type CounterData = { intervalMs: number } & Record<string, number | Record<string, number>>;

// gateway.lanes: one live account's lane minute, tsMs when it ended.
export interface LaneMinuteData {
  accountId: number;
  name: string;
  cancels: number;
  cancelWaitP99Us: number;
  cancelWaitMaxUs: number;
  orders: number;
  orderWaitP99Us: number;
  orderWaitMaxUs: number;
  held: number;
  refusedWaiting: number;
  refusedWithoutConnection: number;
  dropped: number;
  orderAnswerP50Us: number;
  orderAnswerP99Us: number;
  cancelAnswerP50Us: number;
  cancelAnswerP99Us: number;
  unanswered: number;
  connectionsBusy: number;
  venueRefusals: number;
  sessions: { slot: number; sessionId: string | null; sent: number }[];
}

// gateway.drops: what ingress and egress dropped, and the self-trade check, since the last sample.
export type DropsData = { intervalMs: number; selfTradeHeld: number } & Record<string, number>;

// feed.shards: a gateway's shard reader, per shard it reads and its streams furthest behind. Peaks in nanoseconds.
export interface FeedShardsData {
  intervalMs: number;
  streams: number;
  bad: number;
  shards: { shardId: string; records: number; networkPeakNanos: number; shardWaitPeakNanos: number; statusGapPeakNanos: number }[];
  worstBehind: { streamId: number; name: string; behindPeakBytes: number }[];
}

// shard.streams: a shard's streams summed over the minute, and its worst streams.
export interface ShardStreamsData {
  intervalMs: number;
  generation: number;
  streams: number;
  states: Record<string, number>;
  connections: number;
  reconnecting: number;
  probes: number;
  probeMismatches: number;
  publish: {
    publications: number;
    offered: number;
    held: number;
    streamsHeld: number;
    lapped: number;
    resent: number;
    waitPeakNanos: number;
  };
  collect: { records: number; ringFullWaits: number; backlogPeak: number; uploadsQueued: number; uploadsFailed: number };
  worstWait: { streamId: number; name: string; waitPeakNanos: number }[];
  worstHeld: { streamId: number; name: string; heldAndLapped: number }[];
}
