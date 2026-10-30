import { ContractProposition, ContractRelationship } from '../types';
import { formatFieldValue, summarizeProposition } from './propositions';

// Views of one subject's stored relationships, grouped the way the classifier derives them: contracts in different
// units never relate (snapshots at different times, deadlines on different events), so each unit is drawn on its own.

/** A Yes/No pair drawn as one outcome (its No side mirrors the Yes side), or a contract without a complement. */
export interface Outcome {
  key: string;
  primary: ContractProposition;
  other?: ContractProposition;
  securityIds: number[];
}

export interface Unit {
  key: string;
  label: string;
  kind: 'ladder' | 'graph';
  outcomes: Outcome[];
}

type Fields = Record<string, unknown>;

function unitKey(f: Fields): string {
  const measure = String(f.measure ?? '');
  if (f.kind === 'WINNER' || (f.kind === 'THRESHOLD' && measure.startsWith('margin:'))) return 'winners';
  if (f.kind === 'OCCURS_BY') return `deadline:${measure}`;
  if (!f.window_end) return `value:${f.observation ?? ''}:none`;
  return `value:${f.observation ?? ''}:${f.window_start ?? ''}:${f.window_end}`;
}

function unitLabel(key: string, f: Fields): string {
  if (key === 'winners') return 'Winners';
  if (key.startsWith('deadline:')) return `By deadline · ${f.measure ?? 'event'}`;
  const measure = String(f.measure ?? 'value');
  if (!f.window_end) return measure;
  const at = f.observation === 'AT_TIME' ? 'at' : 'by';
  return `${measure} ${at} ${formatFieldValue('window_end', f.window_end)}`;
}

/** Pairs the two sides of each BINARY event (one negated) into one outcome. */
export function pairOutcomes(propositions: ContractProposition[]): Outcome[] {
  const byEvent = new Map<number, ContractProposition[]>();
  const loose: ContractProposition[] = [];
  for (const p of propositions) {
    if (p.eventId == null) loose.push(p);
    else byEvent.set(p.eventId, [...(byEvent.get(p.eventId) ?? []), p]);
  }
  const outcomes: Outcome[] = [];
  for (const members of byEvent.values()) {
    const [a, b] = members;
    if (members.length === 2 && Boolean(a.fields.negated) !== Boolean(b.fields.negated)) {
      const [primary, other] = a.fields.negated ? [b, a] : [a, b];
      outcomes.push({ key: String(primary.securityId), primary, other, securityIds: [primary.securityId, other.securityId] });
    } else {
      loose.push(...members);
    }
  }
  for (const p of loose) outcomes.push({ key: String(p.securityId), primary: p, securityIds: [p.securityId] });
  return outcomes.sort((x, y) => x.primary.securityId - y.primary.securityId);
}

function isLadder(outcomes: Outcome[]): boolean {
  if (outcomes.length < 3) return false;
  const measures = new Set(outcomes.map(o => o.primary.fields.measure));
  return measures.size === 1 && outcomes.every(o => o.primary.fields.kind === 'THRESHOLD' || o.primary.fields.kind === 'RANGE');
}

/** The subject's units: contracts grouped by the classifier's keys, joined where a stored row links two groups. */
export function buildUnits(propositions: ContractProposition[], relationships: ContractRelationship[]): Unit[] {
  const outcomes = pairOutcomes(propositions);
  const outcomeOf = new Map<number, Outcome>();
  outcomes.forEach(o => o.securityIds.forEach(sid => outcomeOf.set(sid, o)));

  const parent = new Map<string, string>();
  const root = (k: string): string => {
    while (parent.get(k) !== k) {
      const up = parent.get(k)!;
      parent.set(k, parent.get(up)!);
      k = up;
    }
    return k;
  };
  const keyOf = new Map<Outcome, string>();
  for (const o of outcomes) {
    const k = unitKey(o.primary.fields);
    keyOf.set(o, k);
    if (!parent.has(k)) parent.set(k, k);
  }
  for (const r of relationships) {
    const a = outcomeOf.get(r.securityIdA);
    const b = outcomeOf.get(r.securityIdB);
    if (!a || !b) continue;
    const ra = root(keyOf.get(a)!);
    const rb = root(keyOf.get(b)!);
    if (ra !== rb) parent.set(rb, ra);
  }

  const grouped = new Map<string, Outcome[]>();
  for (const o of outcomes) {
    const k = root(keyOf.get(o)!);
    grouped.set(k, [...(grouped.get(k) ?? []), o]);
  }
  return [...grouped.entries()]
    .map(([key, members]) => ({
      key,
      label: unitLabel(key, members[0].primary.fields),
      kind: isLadder(members) ? 'ladder' as const : 'graph' as const,
      outcomes: members,
    }))
    .sort((a, b) => a.label.localeCompare(b.label));
}

// ── Ladder ─────────────────────────────────────────────────────────────

export interface LadderRow {
  key: string;
  label: string;
  cells: Record<string, Outcome[]>;
  /** Whether the row's venues are stored as equivalent, and the flags if they are. */
  equivalence: 'none' | 'equal' | 'flagged';
  flags: string[];
}

export interface Ladder {
  venues: string[];
  rows: LadderRow[];
}

function rowSort(f: Fields): number {
  const n = (v: unknown) => (typeof v === 'number' ? v : Number.NEGATIVE_INFINITY);
  return f.kind === 'RANGE' ? n(f.low) : n(f.value);
}

function rowKey(f: Fields): string {
  if (f.kind === 'RANGE') {
    return `${f.negated ? 'not ' : ''}${f.low_inclusive === false ? '(' : '['}${f.low},${f.high}${f.high_inclusive === false ? ')' : ']'}`;
  }
  return `${f.negated ? 'not ' : ''}${f.comparator}:${f.value}`;
}

function rowLabel(f: Fields): string {
  const summary = summarizeProposition({ ...f, window_end: null, window_start: null, resolution_source: null });
  return summary.replace(`${f.measure ?? ''} `, '');
}

/** One row per value (strike or range), highest first; one column per venue. */
export function buildLadder(unit: Unit, relationships: ContractRelationship[]): Ladder {
  const rows = new Map<string, LadderRow & { sort: number }>();
  const venues = new Set<string>();
  for (const o of unit.outcomes) {
    const f = o.primary.fields;
    const venue = o.primary.exchangeCode ?? '?';
    venues.add(venue);
    const key = rowKey(f);
    const row = rows.get(key) ?? { key, label: rowLabel(f), cells: {}, equivalence: 'none', flags: [], sort: rowSort(f) };
    row.cells[venue] = [...(row.cells[venue] ?? []), o];
    rows.set(key, row);
  }
  const rowOf = new Map<number, string>();
  for (const row of rows.values()) {
    for (const cell of Object.values(row.cells)) cell.forEach(o => o.securityIds.forEach(sid => rowOf.set(sid, row.key)));
  }
  for (const r of relationships) {
    if (r.relationshipType !== 'EQUIVALENT') continue;
    const key = rowOf.get(r.securityIdA);
    if (key === undefined || key !== rowOf.get(r.securityIdB)) continue;
    const row = rows.get(key)!;
    const flags = new Set([...row.flags, ...(r.flags ?? [])]);
    row.flags = [...flags].sort();
    row.equivalence = row.flags.length > 0 ? 'flagged' : 'equal';
  }
  return {
    venues: [...venues].sort(),
    rows: [...rows.values()].sort((a, b) => b.sort - a.sort || a.key.localeCompare(b.key))
      .map(row => ({ key: row.key, label: row.label, cells: row.cells, equivalence: row.equivalence, flags: row.flags })),
  };
}

// ── Graph ──────────────────────────────────────────────────────────────

/** How a stored row reads between two outcomes: on their Yes sides, A ⇒ B, A ≡ B, A excludes B (A ⇒ not B), A or B
 * (not A ⇒ B), or A ≡ not B. */
export type GraphEdgeKind = 'implies' | 'equivalent' | 'excludes' | 'covers' | 'opposite';

export interface GraphNode {
  id: string;
  label: string;
  venue: string;
  highlighted: boolean;
}

export interface GraphEdge {
  id: string;
  source: string;
  target: string;
  kind: GraphEdgeKind;
  flags: string[];
  relationship: ContractRelationship;
}

export function buildGraph(unit: Unit, relationships: ContractRelationship[], highlight: Set<number> = new Set()):
  { nodes: GraphNode[]; edges: GraphEdge[] } {
  const side = new Map<number, { outcome: Outcome; negative: boolean }>();
  for (const o of unit.outcomes) {
    side.set(o.primary.securityId, { outcome: o, negative: false });
    if (o.other) side.set(o.other.securityId, { outcome: o, negative: true });
  }
  const nodes = unit.outcomes.map(o => ({
    id: o.key,
    label: summarizeProposition({ ...o.primary.fields, window_end: null, window_start: null }),
    venue: o.primary.exchangeCode ?? '?',
    highlighted: o.securityIds.some(sid => highlight.has(sid)),
  }));
  const edges: GraphEdge[] = [];
  for (const r of relationships) {
    const a = side.get(r.securityIdA);
    const b = side.get(r.securityIdB);
    if (!a || !b || a.outcome === b.outcome) continue;
    let source = a.outcome.key;
    let target = b.outcome.key;
    let kind: GraphEdgeKind;
    if (r.relationshipType === 'EQUIVALENT') {
      kind = a.negative === b.negative ? 'equivalent' : 'opposite';
    } else if (!a.negative && !b.negative) {
      kind = 'implies';
    } else if (a.negative && b.negative) {
      kind = 'implies';
      [source, target] = [target, source];
    } else {
      kind = a.negative ? 'covers' : 'excludes';
    }
    edges.push({ id: String(r.relationshipId), source, target, kind, flags: r.flags ?? [], relationship: r });
  }
  return { nodes, edges };
}
