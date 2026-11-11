import { ContractProposition, SubjectKeyAlias } from '../types';

// How a subject's readings key their entities once its stored aliases apply, as the classifier's derivation reads
// them (`canonical.apply_stored`): an entity alias renames an entity, a score's side and the part of a measure after
// `:` (`margin:nxs`); a measure alias renames the part before it. Chains read through to their end. Two venues (or
// two events) keying one team two ways relate nothing until an alias joins them, so the subject page lists every key
// and points out the keys that look like one entity split.

export interface EffectiveKeys {
  entity: (key: string) => string;
  measure: (head: string) => string;
}

function throughChains(pairs: [string, string][]): Map<string, string> {
  const direct = new Map(pairs);
  const out = new Map<string, string>();
  for (const key of direct.keys()) {
    let target = direct.get(key) as string;
    const seen = new Set([key]);
    while (direct.has(target) && !seen.has(target)) {
      seen.add(target);
      target = direct.get(target) as string;
    }
    if (target !== key) out.set(key, target);
  }
  return out;
}

export function effectiveKeys(aliases: SubjectKeyAlias[]): EffectiveKeys {
  const entities = throughChains(aliases.filter(a => a.kind === 'ENTITY').map(a => [a.key, a.canonicalKey]));
  const measures = throughChains(aliases.filter(a => a.kind === 'MEASURE').map(a => [a.key, a.canonicalKey]));
  return { entity: k => entities.get(k) ?? k, measure: h => measures.get(h) ?? h };
}

interface KeyReading {
  slot: string;
  key: string;
}

/** Each entity key one reading names, with the slot (kind, measure, scope) it is compared in. */
function keysOf(fields: Record<string, unknown>, eff: EffectiveKeys): KeyReading[] {
  const kind = String(fields.kind ?? '');
  const scope = String(fields.scope ?? 'match');
  const [head, tail] = String(fields.measure ?? '').split(/:(.*)/s);
  const measure = eff.measure(head);
  const out: KeyReading[] = [];
  if (typeof fields.entity === 'string' && fields.entity) out.push({ slot: `${kind} ${measure} ${scope}`, key: fields.entity });
  if (tail) out.push({ slot: `${kind} ${measure}:* ${scope}`, key: tail });
  if (Array.isArray(fields.scores)) {
    for (const side of fields.scores) {
      if (Array.isArray(side) && typeof side[0] === 'string') out.push({ slot: `SCORE ${scope}`, key: side[0] });
    }
  }
  return out;
}

const isOpen = (p: ContractProposition) => p.eventResolved !== true;

export interface KeyUse {
  key: string;
  // The key derivation compares it as, after the aliases.
  effective: string;
  venues: string[];
  contracts: number;
  slots: string[];
}

/** Every entity key the subject's open contracts use, with what it derives as, by venue. */
export function keyUsage(propositions: ContractProposition[], aliases: SubjectKeyAlias[]): KeyUse[] {
  const eff = effectiveKeys(aliases);
  const byKey = new Map<string, { venues: Set<string>; contracts: Set<number>; slots: Set<string> }>();
  for (const p of propositions.filter(isOpen)) {
    for (const { slot, key } of keysOf(p.fields, eff)) {
      const use = byKey.get(key) ?? { venues: new Set(), contracts: new Set(), slots: new Set() };
      use.venues.add(p.exchangeCode ?? '?');
      use.contracts.add(p.securityId);
      use.slots.add(slot);
      byKey.set(key, use);
    }
  }
  return [...byKey.entries()]
    .map(([key, u]) => ({
      key, effective: eff.entity(key), venues: [...u.venues].sort(), contracts: u.contracts.size, slots: [...u.slots].sort(),
    }))
    .sort((a, b) => a.effective.localeCompare(b.effective) || a.key.localeCompare(b.key));
}

export type SplitReason = 'VENUES_DISAGREE' | 'SAME_OPPONENT';

export interface SplitSlot {
  slot: string;
  reasons: SplitReason[];
  // Effective keys, with the venues using each.
  keys: { key: string; venues: string[] }[];
}

/** Slots whose keys look like one entity keyed two ways:
 * - VENUES_DISAGREE: two venues each use a key the other doesn't (the classifier's key reconcile asks Claude about
 *   these);
 * - SAME_OPPONENT: two keys are each one side of a two-outcome event against the same other key, and never outcomes
 *   of one event together (one venue's `roundsgg` and `rgg`, each against `nor`), which the reconcile does not see
 *   when one venue uses both. */
export function possibleSplits(propositions: ContractProposition[], aliases: SubjectKeyAlias[]): SplitSlot[] {
  const eff = effectiveKeys(aliases);
  const slots = new Map<string, { venues: Map<string, Set<string>>; events: Map<number, Set<string>> }>();
  for (const p of propositions.filter(isOpen)) {
    for (const { slot, key } of keysOf(p.fields, eff)) {
      const s = slots.get(slot) ?? { venues: new Map(), events: new Map() };
      const k = eff.entity(key);
      const venue = p.exchangeCode ?? '?';
      s.venues.set(venue, (s.venues.get(venue) ?? new Set()).add(k));
      if (p.eventId != null && p.fields.negated !== true) {
        s.events.set(p.eventId, (s.events.get(p.eventId) ?? new Set()).add(k));
      }
      slots.set(slot, s);
    }
  }
  const out: SplitSlot[] = [];
  for (const [slot, s] of [...slots.entries()].sort(([a], [b]) => a.localeCompare(b))) {
    const flagged = new Set<string>();
    const reasons = new Set<SplitReason>();
    const venues = [...s.venues.entries()];
    for (let i = 0; i < venues.length; i++) {
      for (let j = i + 1; j < venues.length; j++) {
        const onlyA = [...venues[i][1]].filter(k => !venues[j][1].has(k));
        const onlyB = [...venues[j][1]].filter(k => !venues[i][1].has(k));
        if (onlyA.length > 0 && onlyB.length > 0) {
          [...onlyA, ...onlyB].forEach(k => flagged.add(k));
          reasons.add('VENUES_DISAGREE');
        }
      }
    }
    const together = new Set<string>();
    const opponents = new Map<string, Set<string>>();
    for (const keys of s.events.values()) {
      const list = [...keys];
      list.forEach(a => list.forEach(b => { if (a < b) together.add(`${a}|${b}`); }));
      if (list.length === 2) {
        const [a, b] = list;
        opponents.set(a, (opponents.get(a) ?? new Set()).add(b));
        opponents.set(b, (opponents.get(b) ?? new Set()).add(a));
      }
    }
    const keys = [...opponents.keys()].sort();
    for (const a of keys) {
      for (const b of keys) {
        if (a >= b || together.has(`${a}|${b}`)) continue;
        const shared = [...(opponents.get(a) as Set<string>)].some(o => opponents.get(b)?.has(o));
        if (shared) {
          flagged.add(a);
          flagged.add(b);
          reasons.add('SAME_OPPONENT');
        }
      }
    }
    if (flagged.size === 0) continue;
    out.push({
      slot,
      reasons: [...reasons].sort(),
      keys: [...flagged].sort().map(key => ({
        key, venues: venues.filter(([, ks]) => ks.has(key)).map(([v]) => v).sort(),
      })),
    });
  }
  return out;
}
