import { RelationshipEvidence } from '../types';

export const FLAG_DESCRIPTIONS: Record<string, string> = {
  RESOLUTION_SOURCE_DIFFERS:
    'Both contracts ask the same question but settle on different sources (e.g. CF Benchmarks vs Binance), so they ' +
    'can resolve differently. Not safe to trade as the same contract.',
  RESOLUTION_SOURCE_UNKNOWN:
    "At least one contract's resolution source couldn't be read, so they may settle on different sources.",
};

export const STORED_ROWS_NOTE =
  'Only the fewest rows that rebuild every relationship are stored: a ladder keeps one row per step, and No sides ' +
  "follow from their Yes sides. gnomepy's RelationshipGraph rebuilds the implied pairs.";

export function flagLabel(flag: string): string {
  return flag.replace(/_/g, ' ').toLowerCase();
}

const COMPARATOR_SYMBOLS: Record<string, string> = { GT: '>', GTE: '≥', LT: '<', LTE: '≤' };

const FIELD_ORDER = [
  'kind', 'measure', 'comparator', 'value', 'low', 'high', 'low_inclusive', 'high_inclusive', 'unit', 'observation',
  'window_start', 'window_end', 'entity', 'scope', 'stability', 'resolution_source', 'negated', 'unknown',
];

function num(v: unknown): string {
  return typeof v === 'number' ? v.toLocaleString('en-US', { maximumFractionDigits: 6 }) : String(v);
}

function time(v: unknown): string {
  if (typeof v !== 'string') return String(v);
  const d = new Date(v);
  return Number.isNaN(d.getTime()) ? v : d.toISOString().replace('T', ' ').replace(/:00\.000Z$|\.000Z$/, 'Z');
}

/** One line for what a proposition pays on, e.g. "NOT price ≥ 78,200 usd at 2026-10-30 16:00Z · cf-benchmarks-brti". */
export function summarizeProposition(fields: Record<string, unknown>): string {
  const parts: string[] = [];
  const measure = fields.measure ? String(fields.measure) : '';
  const unit = fields.unit ? ` ${fields.unit}` : '';
  switch (fields.kind) {
    case 'THRESHOLD': {
      const cmp = COMPARATOR_SYMBOLS[String(fields.comparator)] ?? '?';
      parts.push(`${measure || 'value'} ${cmp} ${fields.value == null ? '?' : num(fields.value)}${unit}`);
      break;
    }
    case 'RANGE': {
      const open = fields.low_inclusive === false ? '(' : '[';
      const close = fields.high_inclusive === false ? ')' : ']';
      parts.push(`${measure || 'value'} in ${open}${fields.low == null ? '?' : num(fields.low)}, ` +
        `${fields.high == null ? '?' : num(fields.high)}${close}${unit}`);
      break;
    }
    case 'WINNER':
      parts.push(`${fields.entity ?? '?'} wins${measure ? ` ${measure}` : ''}`);
      break;
    case 'OCCURS_BY':
      parts.push(`${measure || 'event'} occurs`);
      break;
    default:
      parts.push(measure || String(fields.kind ?? 'other'));
  }
  if (fields.window_end) {
    const at = fields.observation === 'AT_TIME' ? 'at' : 'by';
    parts[0] += fields.window_start && fields.observation !== 'AT_TIME'
      ? ` from ${time(fields.window_start)} ${at} ${time(fields.window_end)}`
      : ` ${at} ${time(fields.window_end)}`;
  }
  if (fields.kind !== 'WINNER' && fields.entity) parts.push(String(fields.entity));
  if (fields.scope) parts.push(String(fields.scope));
  if (fields.resolution_source) parts.push(String(fields.resolution_source));
  const line = parts.join(' · ');
  return fields.negated ? `NOT ${line}` : line;
}

export function formatFieldValue(field: string, v: unknown): string {
  if (v === null || v === undefined || v === '') return '—';
  if (Array.isArray(v)) return v.length === 0 ? '—' : v.join(', ');
  if (field === 'comparator') return COMPARATOR_SYMBOLS[String(v)] ?? String(v);
  if (field === 'window_start' || field === 'window_end') return time(v);
  if (typeof v === 'number') return num(v);
  return String(v);
}

export interface EvidenceRow {
  field: string;
  a: string;
  b: string;
  differs: boolean;
}

/** The fields a relationship's rule compared, side by side, in the classifier's field order. */
export function evidenceRows(evidence: RelationshipEvidence): EvidenceRow[] {
  const keys = new Set([...Object.keys(evidence.a ?? {}), ...Object.keys(evidence.b ?? {})]);
  const ordered = [...FIELD_ORDER.filter(k => keys.has(k)), ...[...keys].filter(k => !FIELD_ORDER.includes(k)).sort()];
  return ordered.map(field => {
    const a = formatFieldValue(field, evidence.a?.[field]);
    const b = formatFieldValue(field, evidence.b?.[field]);
    return { field, a, b, differs: a !== b };
  });
}

/** An unordered pair of subjects, so a dismissed duplicate stays dismissed whichever side is listed first. */
export function subjectPairKey(a: number, b: number): string {
  return a < b ? `${a}-${b}` : `${b}-${a}`;
}
