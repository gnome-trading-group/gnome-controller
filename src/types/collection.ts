// The collection control plane (gnome-market-data `collection/*`): rules people edit, and the reconciler's targets
// and shards. Times are epoch nanoseconds; cut minutes are minutes since the epoch.

export type Priority = 'PRODUCTION' | 'RESEARCH';

export interface CollectionRule {
  ruleId: string;
  name: string;
  ruleType: 'static_streams';
  parameters: { streamIds: number[] };
  priority: Priority;
  tier: string;
  status: 'ACTIVE' | 'PAUSED';
  retireGraceMinutes?: number;
  createdBy?: string;
  createdAt?: string;
  updatedBy?: string;
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
  stream_ids: number[];
  priority: Priority;
  tier: string;
  retire_grace_minutes?: number;
}

export interface RuleChange {
  name?: string;
  stream_ids?: number[];
  status?: 'ACTIVE' | 'PAUSED';
  retire_grace_minutes?: number;
}
