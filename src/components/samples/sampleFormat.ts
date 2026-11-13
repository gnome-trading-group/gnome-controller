import { SampleWindow } from '../../utils/api';
import { MINUTE_MS } from '../../utils/samples';

// Ranges, colours and number formats every samples view shares.

// Samples are kept 7 days.
export const RANGES: Record<string, number> = { '1h': 3_600_000, '6h': 21_600_000, '24h': 86_400_000, '7d': 7 * 86_400_000 };
export const COLORS = ['#4dabf7', '#ff922b', '#51cf66', '#f06595', '#cc5de8', '#fcc419', '#20c997', '#ff6b6b', '#94d82d', '#748ffc'];

/** The range back from now, rounded up to the minute; worked out when each read runs, so a live view moves with it. */
export function windowBackFromNow(rangeMs: number): SampleWindow {
  const toMs = Math.ceil(Date.now() / MINUTE_MS) * MINUTE_MS;
  return { fromMs: toMs - rangeMs, toMs };
}

export function time(t: number, rangeMs: number): string {
  const date = new Date(t);
  return rangeMs > 86_400_000
    ? date.toLocaleString(undefined, { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })
    : date.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' });
}

export function number(value: number, digits = 1): string {
  return Math.abs(value) >= 1_000 ? value.toLocaleString(undefined, { maximumFractionDigits: 0 }) : value.toFixed(digits);
}

