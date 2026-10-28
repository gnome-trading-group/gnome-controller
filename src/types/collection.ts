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
  // Stream id to cut minute; WARMING means collecting without writing yet.
  cuts: Record<string, number>;
  accounts: Record<string, string>;
  version: string;
  state: ShardState;
  createdAtNs: number;
  emptySinceNs: number;
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
