import { AccountStatus, AccountTreasury, CashReconStatus, PositionCheckStatus, TransferKind } from '../types/treasury';
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
// are the venues with no use for one. Mirrors KEYS_NOT_NEEDED in the registry's venue-account-create, which enforces it.
export type KeyKind = 'read' | 'marketData';
const KEYS_NOT_NEEDED: Record<string, KeyKind[]> = {
  POLYMARKET_INTL: ['read', 'marketData'],
};

export function needsKey(exchangeCode: string, kind: KeyKind): boolean {
  return !(KEYS_NOT_NEEDED[exchangeCode] ?? []).includes(kind);
}

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
export function missingCredentials(exchangeCode: string, values: Record<string, string>): string[] {
  return (CREDENTIAL_FIELDS[exchangeCode] ?? [])
    .filter((f) => !f.optional && !(values[f.key] ?? '').trim())
    .map((f) => f.label);
}
