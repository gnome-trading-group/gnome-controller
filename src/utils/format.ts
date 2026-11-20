// Every money, price and quantity on the trading pages is formatted here, from the registry's scaled-integer strings,
// with BigInt so nothing is lost to floating point before the final rounding.
//   money     always to the cent, signed when it is PnL; the exact value is offered for a hover
//   prices    on the listing's price grid: exactly the decimals of the step where the price sits for prices traded on
//             the book, one more for derived prices (an average entry or a mid can fall between grid points), and
//             never rounding away digits a value really has (a fill on an older, finer grid shows up to two more)
//   quantity  at the lot size's decimals, with the same rule
// Prediction-market prices are shown in cents, as the venues show them.

import type { PriceBand } from '../types/security-master';

const PRICE_DIGITS = 9;
const SIZE_DIGITS = 6;
const EXTRA_DIGITS = 2;
// Without a listing spec, show prices to a tenth of a cent and quantities as they are.
const DEFAULT_PRICE_DECIMALS = 3;

const PREDICTION_EXCHANGE_CODES = new Set(['KALSHI', 'POLYMARKET_INTL', 'POLYMARKET_US']);

export type Scaled = string | bigint | number | null | undefined;

function toBig(value: Scaled): bigint | null {
  if (value === null || value === undefined || value === '') return null;
  return typeof value === 'bigint' ? value : BigInt(value);
}

// The decimals a scaled value needs to be written exactly.
function exactDecimals(value: bigint, digits: number): number {
  if (value === 0n) return 0;
  let v = value < 0n ? -value : value;
  let decimals = digits;
  while (decimals > 0 && v % 10n === 0n) {
    v /= 10n;
    decimals--;
  }
  return decimals;
}

// value / 10^digits, rounded half away from zero to `decimals`, with thousands separators.
function decimalString(value: bigint, digits: number, decimals: number): string {
  const negative = value < 0n;
  const abs = negative ? -value : value;
  const drop = digits - decimals;
  let units: bigint;
  if (drop >= 0) {
    const divisor = 10n ** BigInt(drop);
    units = (abs + divisor / 2n) / divisor;
  } else {
    units = abs * 10n ** BigInt(-drop);
  }
  const text = units.toString().padStart(decimals + 1, '0');
  const whole = text.slice(0, text.length - decimals).replace(/\B(?=(\d{3})+(?!\d))/g, ',');
  const fraction = decimals > 0 ? `.${text.slice(text.length - decimals)}` : '';
  return `${negative && units !== 0n ? '-' : ''}${whole}${fraction}`;
}

function displayDecimals(value: bigint, digits: number, base: number): number {
  return Math.min(Math.max(base, exactDecimals(value, digits)), base + EXTRA_DIGITS);
}

export function isPredictionMarket(exchangeCode: string | null | undefined): boolean {
  return exchangeCode != null && PREDICTION_EXCHANGE_CODES.has(exchangeCode);
}

export interface MoneyText {
  text: string;
  exact: string;
  sign: -1 | 0 | 1;
}

// signed: PnL shows its sign (+$1.20 / −$0.40); fees and costs don't.
export function formatMoney(value: Scaled, signed = true): MoneyText {
  const v = toBig(value);
  if (v === null) return { text: '—', exact: '—', sign: 0 };
  const sign = v > 0n ? 1 : v < 0n ? -1 : 0;
  const abs = v < 0n ? -v : v;
  const cents = decimalString(abs, PRICE_DIGITS, 2);
  const roundsToZero = cents === '0.00';
  const prefix = sign < 0 && !roundsToZero ? '−' : signed && sign > 0 && !roundsToZero ? '+' : '';
  return {
    text: `${prefix}$${cents}`,
    exact: `${sign < 0 ? '−' : ''}$${decimalString(abs, PRICE_DIGITS, exactDecimals(abs, PRICE_DIGITS) || 2)}`,
    sign: roundsToZero ? 0 : sign,
  };
}

export interface PriceFormat {
  priceBands?: PriceBand[] | null;
  cents?: boolean;
  // Average entries and mids can fall between grid points.
  derived?: boolean;
}

// The step of the band holding the price, or null without bands.
function stepAt(bands: PriceBand[] | null | undefined, price: bigint): bigint | null {
  if (!bands || bands.length === 0) return null;
  const abs = price < 0n ? -price : price;
  for (let i = bands.length - 1; i >= 0; i--) {
    if (BigInt(bands[i].start) <= abs) return BigInt(bands[i].step);
  }
  return BigInt(bands[0].step);
}

// The finest step anywhere on the grid, or null without bands.
export function finestStep(bands: PriceBand[] | null | undefined): number | null {
  if (!bands || bands.length === 0) return null;
  return Math.min(...bands.map(band => band.step));
}

export function formatPrice(value: Scaled, format: PriceFormat = {}): string {
  const v = toBig(value);
  if (v === null || v === 0n) return '—';
  const step = stepAt(format.priceBands, v);
  const tickDecimals = step !== null && step > 0n ? exactDecimals(step, PRICE_DIGITS) : DEFAULT_PRICE_DECIMALS;
  if (format.cents) {
    const base = Math.max(0, tickDecimals - 2) + (format.derived ? 1 : 0);
    return `${decimalString(v, PRICE_DIGITS - 2, displayDecimals(v, PRICE_DIGITS - 2, base))}¢`;
  }
  // Dollar prices always show cents, even on a coarser grid.
  const base = Math.max(2, tickDecimals) + (format.derived ? 1 : 0);
  return `$${decimalString(v, PRICE_DIGITS, displayDecimals(v, PRICE_DIGITS, base))}`;
}

// A price written exactly, in cents or dollars: a grid's step or edge.
function exactPrice(value: bigint, cents: boolean): string {
  if (cents) return `${decimalString(value, PRICE_DIGITS - 2, exactDecimals(value, PRICE_DIGITS - 2))}¢`;
  return `$${decimalString(value, PRICE_DIGITS, exactDecimals(value, PRICE_DIGITS))}`;
}

// A price grid in a line: its one step, or each band's step with where it applies ("0.1¢ <10¢ · 1¢ 10¢–90¢ ·
// 0.1¢ ≥90¢").
export function formatPriceBands(bands: PriceBand[] | null | undefined, cents: boolean): string {
  if (!bands || bands.length === 0) return '—';
  if (bands.length === 1) return exactPrice(BigInt(bands[0].step), cents);
  const edge = (units: number) => exactPrice(BigInt(units), cents);
  return bands.map((band, i) => {
    const step = exactPrice(BigInt(band.step), cents);
    if (i === 0) return `${step} <${edge(band.end ?? 0)}`;
    if (i === bands.length - 1 || band.end === null) return `${step} ≥${edge(band.start)}`;
    return `${step} ${edge(band.start)}–${edge(band.end)}`;
  }).join(' · ');
}

// What an outcome paid when its market settled. Unlike a price, 0 is a real value here (the outcome paid nothing),
// so it is written out rather than shown as unknown.
export function formatSettlement(value: Scaled, cents: boolean): string {
  const v = toBig(value);
  if (v === null) return '—';
  if (cents) return `${decimalString(v, PRICE_DIGITS - 2, exactDecimals(v, PRICE_DIGITS - 2))}¢`;
  return `$${decimalString(v, PRICE_DIGITS, Math.max(2, exactDecimals(v, PRICE_DIGITS)))}`;
}

export type SettlementState = 'full' | 'none' | 'partial';

// Whether a settled outcome paid its full $1, nothing, or something in between (scalar and "fair value" settlements).
export function settlementState(value: Scaled): SettlementState | null {
  const v = toBig(value);
  if (v === null) return null;
  if (v === 10n ** BigInt(PRICE_DIGITS)) return 'full';
  return v === 0n ? 'none' : 'partial';
}

export function formatQty(value: Scaled, lotSize?: string | null, signed = false): string {
  const v = toBig(value);
  if (v === null) return '—';
  const lot = toBig(lotSize);
  const base = lot !== null && lot > 0n ? exactDecimals(lot, SIZE_DIGITS) : 0;
  const text = decimalString(v, SIZE_DIGITS, displayDecimals(v, SIZE_DIGITS, base));
  if (v < 0n) return text.replace('-', '−');
  return signed && v > 0n ? `+${text}` : text;
}

// Charts only: a float is precise enough to draw, never to add up.
export function moneyToNumber(value: Scaled): number {
  const v = toBig(value);
  return v === null ? 0 : Number(v) / 1e9;
}

export function sizeToNumber(value: Scaled): number {
  const v = toBig(value);
  return v === null ? 0 : Number(v) / 1e6;
}

export type TimeZoneChoice = 'UTC' | 'local';

const formatters = new Map<string, Intl.DateTimeFormat>();

function formatter(zone: TimeZoneChoice, withSeconds: boolean, withMillis: boolean): Intl.DateTimeFormat {
  const key = `${zone}/${withSeconds}/${withMillis}`;
  let f = formatters.get(key);
  if (!f) {
    // fractionalSecondDigits is in every current browser but newer than this project's TypeScript lib.
    const options: Intl.DateTimeFormatOptions & { fractionalSecondDigits?: 3 } = {
      timeZone: zone === 'UTC' ? 'UTC' : undefined,
      year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit',
      second: withSeconds ? '2-digit' : undefined,
      fractionalSecondDigits: withMillis ? 3 : undefined,
      hourCycle: 'h23',
    };
    f = new Intl.DateTimeFormat('en-CA', options);
    formatters.set(key, f);
  }
  return f;
}

export function formatTime(
  value: string | number | Date | null | undefined, zone: TimeZoneChoice, precision: 'minute' | 'second' | 'ms' = 'second',
): string {
  if (value === null || value === undefined) return '—';
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return '—';
  const text = formatter(zone, precision !== 'minute', precision === 'ms').format(date).replace(',', '');
  return zone === 'UTC' ? `${text} UTC` : text;
}

export function zoneName(zone: TimeZoneChoice): string {
  return zone === 'UTC' ? 'UTC' : Intl.DateTimeFormat().resolvedOptions().timeZone;
}

const COMPACT_USD = new Intl.NumberFormat('en-US', {
  style: 'currency', currency: 'USD', notation: 'compact', minimumFractionDigits: 0, maximumFractionDigits: 1,
});

/** An event's 24h volume (about USD, a plain number from the registry) as e.g. "$12.5K"; "-" before any reading. */
export function formatVolume(usd: number | null | undefined): string {
  return usd == null ? '-' : COMPACT_USD.format(usd);
}

export function formatDuration(ms: number | null | undefined): string {
  if (ms === null || ms === undefined || ms < 0) return '—';
  const seconds = Math.floor(ms / 1000);
  if (seconds < 60) return `${seconds}s`;
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ${seconds % 60}s`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ${minutes % 60}m`;
  return `${Math.floor(hours / 24)}d ${hours % 24}h`;
}

// Parses typed decimal text ("12", "-0.435") into scaled units without passing through a float; null if it isn't a
// number or has more precision than the scale holds.
export function parseScaled(text: string, scale: 'price' | 'size'): bigint | null {
  const digits = scale === 'price' ? PRICE_DIGITS : SIZE_DIGITS;
  const match = /^\s*(-?)(\d*)(?:\.(\d*))?\s*$/.exec(text);
  if (!match || (match[2] === '' && (match[3] ?? '') === '')) return null;
  const fraction = match[3] ?? '';
  if (fraction.length > digits) return null;
  const value = BigInt(`${match[2] || '0'}${fraction.padEnd(digits, '0')}`);
  return match[1] === '-' ? -value : value;
}

// The exact value as plain decimal text, for prefilling an input: no separators, sign or rounding.
export function plainDecimal(value: Scaled, scale: 'price' | 'size'): string {
  const v = toBig(value);
  if (v === null) return '';
  const digits = scale === 'price' ? PRICE_DIGITS : SIZE_DIGITS;
  return decimalString(v, digits, exactDecimals(v, digits)).replace(/,/g, '');
}

// The trading pages' numbers: right-aligned tabular figures, PnL coloured with an arrow as well, so the sign never
// depends on colour alone.
export const NUMERIC = { fontVariantNumeric: 'tabular-nums', whiteSpace: 'nowrap' } as const;
