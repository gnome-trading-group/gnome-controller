import { FeeComponent, FeeDefinition, FeeScheduleRow, FeeScope } from '../types';

const MODE_LABELS: Record<string, string> = {
  CEIL: 'up', HALF_UP: 'half up', HALF_EVEN: 'half-even',
};

function rate(value: number): string {
  return String(Number(value.toPrecision(6)));
}

function describeComponent(c: FeeComponent): string {
  const shape = c.kind === 'PRICE_CURVE'
    ? `× p(1−p)${(c.exponent ?? 1) === 1 ? '' : `^${c.exponent}`}`
    : c.kind === 'NOTIONAL' ? 'of notional' : 'per contract';
  const side = c.side ? ` (${c.side.toLowerCase()}s only)` : '';
  return `taker ${rate(c.taker)} / maker ${rate(c.maker)} ${shape}${side}`;
}

/** One line for a schedule, e.g. "taker 0.0695 / maker -0.0125 × p(1−p) · half-even to $0.01". */
export function describeFeeDefinition(definition: FeeDefinition | null): string {
  if (definition === null) return 'Cleared (falls back to the next scope out)';
  const parts = definition.components.map(describeComponent).join(' + ');
  const r = definition.rounding;
  if (r.mode === 'NONE') return `${parts} · unrounded`;
  const scope = r.scope === 'ORDER_ACCUMULATOR' ? ' per order' : '';
  return `${parts} · ${MODE_LABELS[r.mode]} to $${r.increment}${scope}`;
}

export function feeScope(row: Pick<FeeScheduleRow, 'feeGroup' | 'feeEvent' | 'listingId'>): FeeScope {
  if (row.listingId !== null) return 'LISTING';
  if (row.feeEvent !== null) return 'FEE_EVENT';
  if (row.feeGroup !== null) return 'FEE_GROUP';
  return 'EXCHANGE';
}

export const FEE_SCOPE_LABELS: Record<FeeScope, string> = {
  EXCHANGE: 'Exchange', FEE_GROUP: 'Fee group', FEE_EVENT: 'Fee event', LISTING: 'Listing',
};

/** What a row targets within its exchange: the fee group, fee event or listing, or nothing for the exchange itself. */
export function feeTarget(row: Pick<FeeScheduleRow, 'feeGroup' | 'feeEvent' | 'listingId'>): string {
  return row.feeGroup ?? row.feeEvent ?? (row.listingId !== null ? `listing ${row.listingId}` : '');
}

/**
 * Rows a later correction replaced: another row for the same target and effective time recorded after it. Only the
 * latest of those is ever in force.
 */
export function supersededFeeSchedules(rows: FeeScheduleRow[]): Set<string> {
  const latest = new Map<string, FeeScheduleRow>();
  const key = (r: FeeScheduleRow) => [r.exchangeId, feeScope(r), feeTarget(r), Date.parse(r.effectiveFrom)].join('|');
  for (const row of rows) {
    const current = latest.get(key(row));
    if (!current || Date.parse(row.recordedAt) > Date.parse(current.recordedAt)) latest.set(key(row), row);
  }
  return new Set(rows.filter((r) => latest.get(key(r)) !== r).map((r) => r.feeScheduleId));
}
