import { AccountStatus, AccountTreasury, CashReconStatus, PositionCheckStatus, Transfer, TransferKind } from '../types/treasury';
import { parseScaled, plainDecimal } from './format';

export const ACCOUNT_STATUS_COLORS: Record<AccountStatus, string> = {
  PROVISIONING: 'gray',
  ACTIVE: 'teal',
  DRAINING: 'orange',
  RETIRED: 'dark',
};

export const RECON_COLORS: Record<CashReconStatus | PositionCheckStatus, string> = {
  OK: 'teal',
  PENDING: 'yellow',
  BREAK: 'red',
  UNKNOWN_VENUE_POSITION: 'red',
  ERROR: 'red',
  OFF: 'gray',
};

// The statuses an operator may move an account to from each, as the registry allows them.
export const ACCOUNT_TRANSITIONS: Record<AccountStatus, AccountStatus[]> = {
  PROVISIONING: ['ACTIVE', 'RETIRED'],
  ACTIVE: ['DRAINING'],
  DRAINING: ['ACTIVE', 'RETIRED'],
  RETIRED: [],
};

// Corrections can go either way; every other kind has the sign its direction gives it, so it is typed as a positive
// amount and signed here.
const SIGNED_KINDS = new Set<TransferKind>(['FEE_ADJUSTMENT', 'CORRECTION']);

export function isSignedTransferKind(kind: TransferKind): boolean {
  return SIGNED_KINDS.has(kind);
}

/**
 * A transfer's amount in price units from the dollars an operator typed, signed as the registry stores it: money in
 * positive, a withdrawal negative. Null when the text isn't an amount, when a minus is typed for a kind whose sign is
 * fixed, or when it is zero (only an opening balance may be zero: an account that starts empty).
 */
export function transferAmount(kind: TransferKind, dollars: string): bigint | null {
  const value = parseScaled(dollars, 'price');
  if (value === null) return null;
  if (value === 0n) return kind === 'OPENING' ? 0n : null;
  if (isSignedTransferKind(kind)) return value;
  if (value < 0n) return null;
  return kind === 'WITHDRAWAL' ? -value : value;
}

/** A non-negative dollar amount typed by an operator, in price units; null when it isn't one. */
export function dollarsToUnits(dollars: string): bigint | null {
  const value = parseScaled(dollars, 'price');
  return value === null || value < 0n ? null : value;
}

/**
 * Per-shard low-cash thresholds typed as "3=20, 2=5" (shard = dollars), in price units; an empty text clears them.
 * Null when it doesn't parse.
 */
export function parsePartitionThresholds(text: string): Record<string, string> | null {
  const thresholds: Record<string, string> = {};
  for (const part of text.split(',').map((p) => p.trim()).filter(Boolean)) {
    const match = /^(\d+)\s*=\s*(.+)$/.exec(part);
    const units = match ? dollarsToUnits(match[2].trim()) : null;
    if (!match || units === null) return null;
    thresholds[match[1]] = units.toString();
  }
  return thresholds;
}

/** The inverse of {@link parsePartitionThresholds}, for prefilling the field. */
export function formatPartitionThresholds(thresholds: Record<string, string>): string {
  return Object.entries(thresholds)
    .sort(([a], [b]) => Number(a) - Number(b))
    .map(([shard, units]) => `${shard}=${plainDecimal(units, 'price')}`)
    .join(', ');
}

/** "0=80, 3=20" as whole percents per shard adding up to 100, or null if it isn't that. */
export function parsePartitionTargets(text: string): Record<string, number> | null {
  const targets: Record<string, number> = {};
  for (const part of text.split(',').map((p) => p.trim()).filter(Boolean)) {
    const match = /^(\d+)\s*=\s*(\d+)\s*%?$/.exec(part);
    if (!match || Number(match[2]) > 100) return null;
    targets[match[1]] = Number(match[2]);
  }
  const total = Object.values(targets).reduce((sum, p) => sum + p, 0);
  return total === 100 ? targets : null;
}

/** The inverse of {@link parsePartitionTargets}, for prefilling the field. */
export function formatPartitionTargets(targets: Record<string, number>): string {
  return Object.entries(targets)
    .filter(([, percent]) => percent > 0)
    .sort(([a], [b]) => a.localeCompare(b, undefined, { numeric: true }))
    .map(([shard, percent]) => `${shard}=${percent}`)
    .join(', ');
}

/** The targets Kalshi rebalances toward: the account's where it names them, else what Kalshi was found set to. */
export function rebalancingTargets(t: AccountTreasury): Record<string, number> | null {
  return t.partitionTargets ?? t.rebalanceTargets?.allocations ?? null;
}

export interface TreasuryTotals {
  cashTotal: bigint;
  redeemable: bigint;
  committed: bigint;
  base: bigint;
  allocated: bigint;
  free: bigint;
}

const TOTAL_FIELDS = ['cashTotal', 'redeemable', 'committed', 'base', 'allocated', 'free'] as const;

// Added up exactly. An account with no fresh snapshot still counts: its last reading is the best there is, and the
// table flags it as stale.
export function treasuryTotals(accounts: AccountTreasury[]): TreasuryTotals {
  const totals: TreasuryTotals = { cashTotal: 0n, redeemable: 0n, committed: 0n, base: 0n, allocated: 0n, free: 0n };
  for (const account of accounts) {
    for (const field of TOTAL_FIELDS) totals[field] += BigInt(account[field] ?? '0');
  }
  return totals;
}

// The venues an account can be created on, and the credentials each one's secret holds, named as the orchestrator
// reads them (gnome-orchestrator gateways/credentials).
export interface CredentialField {
  key: string;
  label: string;
  optional?: boolean;
  // A key file's contents rather than a line of text.
  file?: boolean;
  options?: { value: string; label: string }[];
}

export const CREDENTIAL_FIELDS: Record<string, CredentialField[]> = {
  KALSHI: [
    { key: 'apiKey', label: 'API key id' },
    { key: 'privateKey', label: 'RSA private key (.pem / .key)', file: true },
    { key: 'subaccount', label: 'Subaccount number', optional: true },
  ],
  POLYMARKET_INTL: [
    { key: 'apiKey', label: 'API key' },
    { key: 'secret', label: 'API secret' },
    { key: 'passphrase', label: 'API passphrase' },
    { key: 'ethereumPrivateKey', label: 'Signer private key (0x hex)' },
    { key: 'signerAddress', label: 'Signer address' },
    { key: 'funderAddress', label: 'Funder (wallet) address' },
    {
      key: 'signatureType', label: 'Signature type', options: [
        { value: '0', label: '0: EOA' }, { value: '1', label: '1: Polymarket proxy' },
        { value: '2', label: '2: Gnosis Safe' }, { value: '3', label: '3: Deposit wallet (UI login)' },
      ],
    },
  ],
  POLYMARKET_US: [
    { key: 'apiKey', label: 'API key' },
    { key: 'secret', label: 'Ed25519 secret (base64)' },
  ],
};

// Every venue takes a trading key, a poller key and a market-data key, each its own so it can be revoked alone; these
// are the venues with no use for one, or for which one is optional. Mirrors KEYS_NOT_NEEDED and KEYS_OPTIONAL in the
// registry's venue-account-create, which enforces them.
export type KeyKind = 'read' | 'marketData';
const KEYS_NOT_NEEDED: Record<string, KeyKind[]> = {
  POLYMARKET_INTL: ['marketData'],
};
// A Polymarket Intl wallet is read from the chain; its CLOB API key only lets the poller split its liquidity rewards
// by market, so its strategies get them.
const KEYS_OPTIONAL: Record<string, KeyKind[]> = {
  POLYMARKET_INTL: ['read'],
};

export function needsKey(exchangeCode: string, kind: KeyKind): boolean {
  return !(KEYS_NOT_NEEDED[exchangeCode] ?? []).includes(kind);
}

export function keyOptional(exchangeCode: string, kind: KeyKind): boolean {
  return (KEYS_OPTIONAL[exchangeCode] ?? []).includes(kind);
}

// Fields the poller's key leaves out: it never holds a Polymarket wallet's private key or addresses.
export const READ_KEY_OMITS: Record<string, string[]> = {
  KALSHI: ['subaccount'],
  POLYMARKET_INTL: ['ethereumPrivateKey', 'signerAddress', 'funderAddress', 'signatureType'],
};

// Venues whose deposits and withdrawals the venue poller books itself; a person records one it can't see as a
// CORRECTION. Mirrors POLLED_MOVES in the registry's treasury-api.
export const POLLED_MOVE_EXCHANGES = ['KALSHI', 'POLYMARKET_INTL', 'POLYMARKET_US'];

export const SECRET_REGIONS = ['us-east-1', 'ap-northeast-1', 'eu-west-1'];

/**
 * The fields a credentials JSON file fills in for an exchange, as strings; keys the exchange doesn't take are
 * ignored. Null when the file isn't a JSON object.
 */
export function credentialsFromFile(exchangeCode: string, text: string): Record<string, string> | null {
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    return null;
  }
  if (parsed === null || typeof parsed !== 'object' || Array.isArray(parsed)) return null;
  const filled: Record<string, string> = {};
  for (const field of CREDENTIAL_FIELDS[exchangeCode] ?? []) {
    const value = (parsed as Record<string, unknown>)[field.key];
    if (value !== undefined && value !== null && String(value).trim() !== '') filled[field.key] = String(value).trim();
  }
  return filled;
}

/** The required fields still empty, by label. */
export function missingCredentials(exchangeCode: string, values: Record<string, string>, omit: string[] = []): string[] {
  return (CREDENTIAL_FIELDS[exchangeCode] ?? [])
    .filter((f) => !omit.includes(f.key) && !f.optional && !(values[f.key] ?? '').trim())
    .map((f) => f.label);
}

// Venue money that is PnL without being trading.
export const NON_TRADING_KINDS: TransferKind[] = ['REWARD', 'INTEREST', 'FEE_ADJUSTMENT'];

export interface RewardsBreakdown {
  total: bigint;
  byProgram: Map<string, bigint>;
  byExchange: Map<string, bigint>;
  // What each strategy was given, and (key null) what stays the firm's.
  byStrategy: Map<number | null, bigint>;
  pending: number;
  // Rewards some or all of which no strategy of ours earned, so stay the firm's.
  failed: number;
}

/** Non-trading transfers summed by program, venue and the strategy given each part; the rest is the firm's. */
export function rewardsBreakdown(transfers: Transfer[]): RewardsBreakdown {
  const add = <K>(map: Map<K, bigint>, key: K, amount: bigint) => map.set(key, (map.get(key) ?? 0n) + amount);
  const out: RewardsBreakdown = {
    total: 0n, byProgram: new Map(), byExchange: new Map(), byStrategy: new Map(), pending: 0, failed: 0,
  };
  for (const t of transfers) {
    if (!NON_TRADING_KINDS.includes(t.kind)) continue;
    const amount = BigInt(t.amount);
    out.total += amount;
    add(out.byProgram, t.program ?? t.kind, amount);
    add(out.byExchange, t.exchangeCode, amount);
    let given = 0n;
    for (const a of t.allocations) {
      add(out.byStrategy, a.strategyId, BigInt(a.amount));
      given += BigInt(a.amount);
    }
    if (amount !== given) add(out.byStrategy, null, amount - given);
    if (t.allocationState === 'PENDING') out.pending++;
    if (t.allocationState === 'FAILED' || t.allocationState === 'PARTIAL') out.failed++;
  }
  return out;
}

const PROGRAM_LABELS: Record<string, string> = {
  LIQUIDITY: 'Liquidity rewards', MAKER_REBATE: 'Maker rebates', TAKER_REBATE: 'Taker rebates', HOLDING: 'Holding yield',
  REFERRAL: 'Referral', VOLUME: 'Volume rewards', INTEREST: 'Interest', UNCLASSIFIED: 'Unclassified',
  REWARD: 'Other rewards', FEE_ADJUSTMENT: 'Fee adjustments',
};

export function programLabel(program: string): string {
  return PROGRAM_LABELS[program] ?? program;
}
