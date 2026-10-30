import {
  CollectionRule, CollectionShard, CollectionTarget, ShardStreamStatus, ShardTaskStatus, StreamCoverage, WARMING,
} from '../types/collection';

const NANOS_PER_MS = 1_000_000;
const MS_PER_MINUTE = 60_000;
// A shard writes its status every 15 s; three missed and its task no longer counts as collecting.
export const STATUS_FRESH_MS = 45_000;
// Its status this old and something is wrong, though its task may still be running.
export const STATUS_LATE_MS = 20_000;

// Every state a shard reports a stream in, healthiest first; NONE is a stream it hasn't started.
export const STREAM_STATES = [
  'LIVE', 'EMPTY', 'SUSPECT', 'SUBSCRIBING', 'REMOVING', 'NONE', 'STALE', 'QUARANTINED', 'FAILED',
] as const;
const COVERED = new Set(['LIVE', 'SUSPECT', 'EMPTY']);
const STATE_COLORS: Record<string, string> = {
  LIVE: 'teal', EMPTY: 'cyan', SUSPECT: 'yellow', SUBSCRIBING: 'blue', REMOVING: 'gray', NONE: 'gray',
  STALE: 'orange', QUARANTINED: 'red', FAILED: 'red',
};

/** Epoch nanoseconds as a Date; null for 0 or missing. */
export function nsToDate(ns: number | null | undefined): Date | null {
  return ns ? new Date(ns / NANOS_PER_MS) : null;
}

export function nsToMs(ns: number | null | undefined): number | null {
  return ns ? ns / NANOS_PER_MS : null;
}

/** Stream ids typed or pasted any way (commas, spaces, new lines); throws on anything that isn't one. */
// Rule parameters that list ids: the rule form edits them as pasted text rather than one tag per id.
export const ID_LIST_PARAMETERS = new Set(['stream_ids', 'event_ids']);

export const RULE_TYPE_LABELS: Record<CollectionRule['ruleType'], string> = {
  static_streams: 'Streams',
  event: 'Events',
  event_filter: 'Event filter',
};

/** How many streams a rule selects: its own list, or what the reconciler last resolved it to (null before that). */
export function ruleStreamCount(rule: CollectionRule): number | null {
  if (rule.ruleType === 'static_streams') {
    return ((rule.parameters.stream_ids as number[] | undefined) ?? []).length;
  }
  return rule.resolvedStreams ?? null;
}

const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? '' : 's'}`;

/** What a rule selects now, for the rules table: e.g. "3 events · 6 streams · 1 waiting" or "streams · capped". */
export function ruleSelection(rule: CollectionRule): string {
  if (rule.ruleType === 'static_streams') return plural(ruleStreamCount(rule) ?? 0, 'stream');
  if (rule.resolvedStreams == null) return 'not resolved yet';
  const parts = [plural(rule.resolvedEvents ?? 0, 'event'), plural(rule.resolvedStreams, 'stream')];
  if (rule.waitingEvents) parts.push(`${rule.waitingEvents} waiting`);
  if (rule.capped) parts.push('capped');
  return parts.join(' · ');
}

/** An event_filter rule's parameters in a line: e.g. "top 20 by volume · ≥ $5K · max 200 streams". */
export function ruleCriteria(rule: CollectionRule): string | null {
  if (rule.ruleType !== 'event_filter') return null;
  const p = rule.parameters;
  const parts: string[] = [];
  if (p.top_n != null) parts.push(`top ${p.top_n} by volume`);
  if (p.min_volume_24h != null) parts.push(`≥ $${Number(p.min_volume_24h).toLocaleString('en-US')} 24h`);
  if (p.expires_within_hours != null) parts.push(`expiring within ${p.expires_within_hours}h`);
  for (const key of ['exchange_ids', 'categories', 'tags'] as const) {
    const values = p[key] as unknown[] | undefined;
    if (values?.length) parts.push(`${key.replace('_ids', 's')}: ${values.join(', ')}`);
  }
  parts.push(`max ${p.max_streams} streams`);
  return parts.join(' · ');
}

export function parseStreamIds(text: string): number[] {
  const parts = text.split(/[\s,]+/).filter(Boolean);
  const ids = parts.map((part) => {
    if (!/^\d+$/.test(part) || Number(part) <= 0) throw new Error(`"${part}" is not a stream id`);
    return Number(part);
  });
  return [...new Set(ids)].sort((a, b) => a - b);
}

/** A cut minute as the UTC time it falls at; null for none or warming. */
export function cutTime(minute: number | null | undefined): string | null {
  if (!minute || minute === WARMING) return null;
  return new Date(minute * MS_PER_MINUTE).toISOString().slice(11, 16) + ' UTC';
}

export function isCovered(state: string): boolean {
  return COVERED.has(state);
}

export function stateColor(state: string): string {
  return STATE_COLORS[state] ?? 'gray';
}

/** How many streams are in each state, in STREAM_STATES order, leaving out states with none. */
export function stateCounts(states: string[]): { state: string; count: number }[] {
  const counts = new Map<string, number>();
  states.forEach((s) => counts.set(s, (counts.get(s) ?? 0) + 1));
  const known: string[] = [...STREAM_STATES];
  const order = [...known, ...[...counts.keys()].filter((s) => !known.includes(s))];
  return order.filter((s) => counts.has(s)).map((state) => ({ state, count: counts.get(state)! }));
}

/** The status a shard's page is about: its newest task's. */
export function currentStatus(statuses: ShardTaskStatus[]): ShardTaskStatus | null {
  return statuses.reduce<ShardTaskStatus | null>((a, b) => (a && a.writtenAtNs >= b.writtenAtNs ? a : b), null);
}

export type ShardHealthLevel = 'healthy' | 'late' | 'down' | 'starting';

/** How a shard is from its newest status' age: none yet reads as starting until it should have reported. */
export function shardHealth(status: ShardTaskStatus | null, createdAtNs: number, nowMs: number): ShardHealthLevel {
  if (!status) return nowMs - createdAtNs / NANOS_PER_MS > 5 * MS_PER_MINUTE ? 'down' : 'starting';
  const age = nowMs - status.writtenAtNs / NANOS_PER_MS;
  if (age <= STATUS_LATE_MS) return 'healthy';
  return age <= STATUS_FRESH_MS ? 'late' : 'down';
}

export const HEALTH_COLORS: Record<ShardHealthLevel, string> = {
  healthy: 'teal', late: 'yellow', down: 'red', starting: 'gray',
};

export type StreamRole = 'owned' | 'warming' | 'taking over' | 'handing off' | 'draining';

/** One stream on a shard: what the reconciler assigned it, and what the shard last reported of it. */
export interface ShardStreamRow {
  streamId: number;
  role: StreamRole;
  cut: string | null;
  status: ShardStreamStatus | null;
  state: string;
  // A session leases it, so the shard should be sending it.
  leased: boolean;
}

/**
 * The shard's assignment joined with its newest status: every stream either has, problems first. A stream the shard
 * reports but isn't assigned (being removed) is kept, so nothing it still holds is hidden.
 */
export function shardStreams(shard: CollectionShard, status: ShardTaskStatus | null): ShardStreamRow[] {
  const reported = new Map((status?.streams ?? []).map((s) => [s.id, s]));
  const ids = [...new Set([...shard.streams, ...shard.draining, ...reported.keys()])];
  const rows = ids.map((streamId) => {
    const cutMinute = shard.cuts[String(streamId)];
    const draining = shard.draining.includes(streamId);
    let role: StreamRole = 'owned';
    if (draining) role = cutMinute ? 'handing off' : 'draining';
    else if (cutMinute === WARMING) role = 'warming';
    else if (cutMinute) role = 'taking over';
    const s = reported.get(streamId) ?? null;
    return {
      streamId, role, cut: cutTime(cutMinute), status: s, state: s?.state ?? 'NONE', leased: shard.publish.includes(streamId),
    };
  });
  // Covered streams are all fine; the rest by how bad their state is, an unknown one worst.
  const rank = (state: string) => {
    if (isCovered(state)) return 0;
    const i = (STREAM_STATES as readonly string[]).indexOf(state);
    return i < 0 ? STREAM_STATES.length : i;
  };
  return rows.sort((a, b) => rank(b.state) - rank(a.state) || a.streamId - b.streamId);
}

/** The shard's process line (gnome-orchestrator CollectorHeartbeat), as far as the page reads it. */
export interface ProcessLine {
  heap_used_mb?: number;
  heap_max_mb?: number;
  rss_mb?: number;
  cpu_busy_permille?: number;
  cpu_steal_permille?: number;
  gc?: Record<string, { count: number; ms: number }>;
  uploads_queued?: number;
  uploads_failed?: number;
  probes?: number;
  probe_mismatches?: number;
  sched_latency?: Record<string, number> | null;
}

export function processLine(status: ShardTaskStatus | null): ProcessLine {
  return (status?.process ?? {}) as ProcessLine;
}

export type HandoffStep = 'warming' | 'cut' | 'settling';

/** Where a hand-off is: warming until the cut is set, then cut until its minute starts, then settling. */
export function handoffStep(target: CollectionTarget, nowMs: number): HandoffStep | null {
  if (!target.drainingFromShardId) return null;
  if (!target.cutMinute) return 'warming';
  return nowMs < target.cutMinute * MS_PER_MINUTE ? 'cut' : 'settling';
}

export interface AttentionItem {
  key: string;
  color: string;
  text: string;
}

/** What is wrong right now, one line per kind: uncovered streams per source, region and reason, unplaced, shards down. */
export function attentionItems(
  targets: CollectionTarget[],
  shards: CollectionShard[],
  health: Map<string, ShardHealthLevel>,
  nowMs: number,
): AttentionItem[] {
  const items: AttentionItem[] = [];
  const down = shards.filter((s) => s.state !== 'DELETED' && health.get(s.shardId) === 'down');
  if (down.length) {
    items.push({ key: 'down', color: 'red', text: `${down.length} shard${down.length > 1 ? 's' : ''} with no healthy task: ${down.map((s) => s.shardId).join(', ')}` });
  }
  const unplaced = targets.filter((t) => t.state === 'DESIRED' && !t.shardId).length;
  if (unplaced) items.push({ key: 'unplaced', color: 'orange', text: `${unplaced} stream${unplaced > 1 ? 's' : ''} not placed on any shard` });
  const uncovered = new Map<string, { count: number; since: number }>();
  for (const t of targets) {
    if (t.state !== 'DESIRED' || !t.shardId || !t.uncoveredSinceNs) continue;
    const key = `${t.source} in ${t.region}: ${(t.uncoveredReason ?? 'uncovered').toLowerCase()}`;
    const entry = uncovered.get(key) ?? { count: 0, since: Infinity };
    entry.count += 1;
    entry.since = Math.min(entry.since, t.uncoveredSinceNs / NANOS_PER_MS);
    uncovered.set(key, entry);
  }
  for (const [key, { count, since }] of uncovered) {
    const minutes = Math.max(0, Math.round((nowMs - since) / MS_PER_MINUTE));
    items.push({ key, color: 'yellow', text: `${count} ${key} (for ${minutes} min)` });
  }
  return items;
}

export interface CollectionCounts {
  wanted: number;
  covered: number;
  uncovered: number;
  unplaced: number;
  handingOff: number;
  retiring: number;
  shards: number;
  draining: number;
}

export function collectionCounts(targets: CollectionTarget[], shards: CollectionShard[]): CollectionCounts {
  const wanted = targets.filter((t) => t.state === 'DESIRED');
  return {
    wanted: wanted.length,
    covered: wanted.filter((t) => t.shardId && !t.uncoveredSinceNs).length,
    uncovered: wanted.filter((t) => t.shardId && (t.uncoveredSinceNs ?? 0) > 0).length,
    unplaced: wanted.filter((t) => !t.shardId).length,
    handingOff: targets.filter((t) => t.drainingFromShardId != null).length,
    retiring: targets.filter((t) => t.state === 'RETIRING').length,
    shards: shards.filter((s) => s.state !== 'DELETED').length,
    draining: shards.filter((s) => s.state === 'DRAINING').length,
  };
}

export type SegmentKind = 'covered' | 'gap' | 'uncovered';

export interface CoverageSegment {
  kind: SegmentKind;
  startMs: number;
  endMs: number;
  // A gap's reason, or the shard that covered it.
  label: string;
}

/**
 * A stream's coverage over [fromMs, toMs] as segments to draw, in time order: intervals it was covered, gaps written
 * with their reason, and the gap still open (uncovered now). Each is clipped to the range; time with neither is time
 * collection didn't want the stream.
 */
export function coverageSegments(coverage: StreamCoverage, fromMs: number, toMs: number, nowMs: number): CoverageSegment[] {
  const clip = (startMs: number, endMs: number) => [Math.max(startMs, fromMs), Math.min(endMs, toMs)] as const;
  const segments: CoverageSegment[] = [];
  const add = (kind: SegmentKind, startNs: number, endMs: number, label: string) => {
    const [start, end] = clip(startNs / NANOS_PER_MS, endMs);
    if (end > start) segments.push({ kind, startMs: start, endMs: end, label });
  };
  for (const i of coverage.intervals) {
    add('covered', i.fromNs, i.open ? nowMs : i.toNs / NANOS_PER_MS, i.shardId ?? 'covered');
  }
  for (const g of coverage.gaps) add('gap', g.fromNs, g.toNs / NANOS_PER_MS, (g.reason ?? 'gap').toLowerCase());
  if (coverage.openGap) add('uncovered', coverage.openGap.fromNs, nowMs, (coverage.openGap.reason ?? 'uncovered').toLowerCase());
  return segments.sort((a, b) => a.startMs - b.startMs);
}

/** Total time in segments of one kind, in ms. */
export function segmentTime(segments: CoverageSegment[], kind: SegmentKind): number {
  return segments.filter(s => s.kind === kind).reduce((sum, s) => sum + s.endMs - s.startMs, 0);
}
