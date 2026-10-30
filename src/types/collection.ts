// The collection control plane (gnome-market-data `collection/*`): rules people edit, and the reconciler's targets
// and shards. Times are epoch nanoseconds; cut minutes are minutes since the epoch.

import { JsonSchema } from './jsonSchema';

export type Priority = 'PRODUCTION' | 'RESEARCH';

export type CollectionRuleType = 'static_streams' | 'event' | 'event_filter';

// A rule's parameters keep the snake_case names its type's schema gives them (see collection/rule-types).
export type RuleParameters = Record<string, unknown>;

export interface CollectionRule {
  ruleId: string;
  name: string;
  ruleType: CollectionRuleType;
  parameters: RuleParameters;
  priority: Priority;
  tier: string;
  status: 'ACTIVE' | 'PAUSED';
  retireGraceMinutes?: number;
  // The system that owns the rule: only it changes what the rule selects.
  managedBy?: string;
  createdBy?: string;
  createdAt?: string;
  updatedBy?: string;
  updatedAt?: string;
  // What the reconciler last resolved an event or event_filter rule to.
  resolvedEvents?: number;
  resolvedStreams?: number;
  waitingEvents?: number;
  capped?: boolean;
  resolvedAtNs?: number;
}

export interface RuleTypeSchema extends JsonSchema {
  description: string;
}

export interface RulePreview {
  events: number;
  streams: number;
  capped: boolean;
  sample: { eventId: number; title: string; volume24h: number | null; streams: number }[];
}

export type TargetState = 'DESIRED' | 'RETIRING' | 'RETIRED';

export interface CollectionTarget {
  streamId: number;
  source: string;
  region: string;
  sourceKind: string;
  priority: Priority;
  tier: string;
  wantedBy?: string[];
  state: TargetState;
  shardId?: string;
  retireAfterNs?: number;
  uncoveredSinceNs?: number;
  uncoveredReason?: string;
  drainingFromShardId?: string;
  handoffCoveredSinceNs?: number;
  cutMinute?: number;
}

export type ShardState = 'ACTIVE' | 'DRAINING' | 'DELETED';

export interface CollectionShard {
  shardId: string;
  region: string;
  sourceKind: string;
  priority: Priority;
  tier: string;
  generation: number;
  streams: number[];
  draining: number[];
  // Streams a session leases (or released under 5 minutes ago), which the shard sends over Aeron.
  publish: number[];
  // Stream id to cut minute; WARMING means collecting without writing yet.
  cuts: Record<string, number>;
  accounts: Record<string, string>;
  version: string;
  state: ShardState;
  createdAtNs: number;
  emptySinceNs: number;
  // Since when all its streams would fit on its partition's other shards (0: they wouldn't); after the reconciler's
  // consolidation wait it drains into them.
  mergeableSinceNs: number;
}

export const WARMING = 2147483647;

export interface ShardConnection {
  name: string;
  source: string;
  account: string | null;
  markets: number;
  reconnecting: boolean;
}

export interface ShardStreamStatus {
  id: number;
  state: string;
  lastEventNs: number;
  lastReceiveNs: number;
  lastVerifiedNs: number;
  resyncs: number;
  records: number;
  // Whether a session leases it, so the shard sends it over Aeron; and what reached or missed that publication.
  published?: boolean;
  offered?: number;
  dropped?: number;
  failure?: string;
}

// [stream id, from state, to state, at (ns)]
export type ShardTransition = [number, string, string, number];

// One task's latest status, as the shard wrote it (gnome-orchestrator ShardStatusWriter).
export interface ShardTaskStatus {
  shardId: string;
  taskId: string;
  privateIp: string | null;
  version: string;
  startedAtNs: number;
  writtenAtNs: number;
  appliedGeneration: number;
  process: Record<string, unknown> | null;
  connections: ShardConnection[];
  streams: ShardStreamStatus[];
  transitionsRecorded: number;
  transitions: ShardTransition[];
}

export interface ShardDetail {
  shard: CollectionShard;
  statuses: ShardTaskStatus[];
}

export interface ShardLogs {
  shardId: string;
  taskId: string;
  events: { timestamp: number; message: string }[];
}

export interface NewRule {
  name: string;
  rule_type: CollectionRuleType;
  parameters: RuleParameters;
  priority: Priority;
  tier: string;
  retire_grace_minutes?: number;
}

export interface RuleChange {
  name?: string;
  parameters?: RuleParameters;
  status?: 'ACTIVE' | 'PAUSED';
  retire_grace_minutes?: number;
}

// A stream's collection history over a range (market-data collection/coverage): what shards covered, and the gaps.
// Times are epoch nanoseconds. An open interval runs to now.
export interface CoverageInterval {
  fromNs: number;
  toNs: number;
  open: boolean;
  shardId?: string;
  taskId?: string;
  closeReason?: string;
}

export interface CoverageGap {
  fromNs: number;
  toNs: number;
  reason?: string;
}

export interface StreamCoverage {
  streamId: number;
  fromNs: number;
  toNs: number;
  intervals: CoverageInterval[];
  gaps: CoverageGap[];
  // Uncovered since then, now: written as a gap only once coverage resumes.
  openGap: { fromNs: number; reason?: string } | null;
  targetState?: TargetState;
  coveredFraction: number;
}

// A session's lease on market-data streams (market-data collection/leases): where each stream is read from.
export type LeasedStreamState = 'UNPLACED' | 'WARMING' | 'LIVE';

export interface LeaseEndpoint {
  privateIp: string;
  port: number;
}

export interface LeasePlacement {
  shardId: string | null;
  state: string | null;
  endpoint: LeaseEndpoint | null;
}

export interface LeasedStream {
  streamId: number;
  state: LeasedStreamState;
  shardId: string | null;
  endpoint: LeaseEndpoint | null;
  // Where it is moving during a hand-off or roll; null otherwise.
  next: LeasePlacement | null;
}

export interface SessionLease {
  sessionId: string;
  status: 'ACTIVE' | 'RELEASED';
  mode: string;
  priority: Priority;
  // Epoch seconds; the reconciler extends it while the session runs.
  expiresAt: number | null;
  // Epoch seconds; null while ACTIVE.
  releasedAt: number | null;
  releaseReason: 'DELETED' | 'SESSION_ENDED' | 'EXPIRED' | null;
  streams: LeasedStream[];
}
