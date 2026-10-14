// Venue accounts and their treasury (registry /venue-accounts and /treasury). Money is scaled-integer strings in price
// units (1e9 per dollar), quantities in size units (1e6 per unit), as everywhere else on the trading pages.

export type AccountStatus = 'PROVISIONING' | 'ACTIVE' | 'DRAINING' | 'RETIRED';

export interface VenueAccount {
  accountId: number;
  exchangeId: number;
  exchangeCode: string;
  label: string;
  status: AccountStatus;
  venueRef: Record<string, unknown>;
  tradingSecretName: string;
  readSecretName: string | null;
  createdAt: string;
  activatedAt: string | null;
  drainingAt: string | null;
  retiredAt: string | null;
  actor: string | null;
  note: string | null;
  activeSessions: number;
  openPositions: number;
}

export interface AccountStatusChange {
  account: VenueAccount;
  // Sessions whose kill switch draining turned on; each must be relaunched to trade on another account.
  haltedSessions: string[];
  reason: string;
}

export interface SessionAccount {
  accountId: number;
  exchangeId: number;
  label: string;
  status: AccountStatus;
  tradingSecretName: string;
  venueRef: Record<string, unknown>;
}

export type CashReconStatus = 'OK' | 'PENDING' | 'BREAK' | 'ERROR' | 'OFF';

// What one account holds and what is promised out of it. base = cash + redeemable + positions at cost; free = base -
// minBuffer - allocated, where allocated counts each active live session's budget plus positions no session holds.
export interface AccountTreasury {
  accountId: number;
  exchangeId: number;
  exchangeCode: string;
  label: string;
  status: AccountStatus;
  snapshotAt: string | null;
  snapshotFresh: boolean;
  // The latest reading of any outcome; when it failed, why (snapshotAt stays the last good one).
  lastReadingAt: string | null;
  lastReadingError: string | null;
  cashTotal: string;
  cashAvailable: string;
  portfolioValue: string;
  redeemable: string;
  heldAtCost: string;
  committed: string;
  base: string;
  allocated: string;
  minBuffer: string;
  free: string;
  lowBalanceThreshold: string;
  // Kalshi splits cash by exchange shard, and a shard's cash only backs orders on its own markets: the latest
  // reading's split (null on venues that don't split), and the low-cash threshold set per shard.
  cashByPartition: Record<string, string> | null;
  partitionLowThresholds: Record<string, string>;
  recon: {
    cashStatus: CashReconStatus;
    cashDiff: string | null;
    expectedCash: string | null;
    venueCash: string | null;
    ranAt: string;
    positionsChecked: number;
    positionBreaks: number;
  } | null;
}

export interface TreasurySummary {
  asOf: string;
  accounts: AccountTreasury[];
}

export const TRANSFER_KINDS = [
  'OPENING', 'DEPOSIT', 'WITHDRAWAL', 'INTEREST', 'REWARD', 'FEE_ADJUSTMENT', 'CORRECTION',
] as const;

export type TransferKind = typeof TRANSFER_KINDS[number];

export interface Transfer {
  transferId: string;
  accountId: number;
  label: string;
  kind: TransferKind;
  amount: string;
  occurredAt: string;
  externalRef: string | null;
  reason: string | null;
  actor: string;
  recordedAt: string;
}

export type PositionCheckStatus = 'OK' | 'PENDING' | 'BREAK' | 'UNKNOWN_VENUE_POSITION';

export interface PositionCheck {
  venueKey: string;
  listingIds: number[];
  venueQty: string;
  ledgerQty: string;
  status: PositionCheckStatus;
  consecutiveMismatches: number;
  firstMismatchAt: string | null;
  checkedAt: string;
}

export interface ReconRun {
  runId: string;
  ranAt: string;
  expectedCash: string | null;
  venueCash: string | null;
  cashDiff: string | null;
  cashStatus: CashReconStatus;
  positionsChecked: number;
  positionBreaks: number;
}

export interface ReconDetail {
  accountId: number;
  positions: PositionCheck[];
  runs: ReconRun[];
}

// Only what is given changes. Money in price units; the two intervals in minutes.
export interface AccountConfigUpdate {
  accountId: number;
  minBuffer?: string;
  lowBalanceThreshold?: string;
  cashTolerance?: string;
  dustThreshold?: string;
  maxActiveDays?: number | null;
  reconSince?: string | null;
  reconEnabled?: boolean;
  snapshotMaxAgeMinutes?: number;
  settlementGraceMinutes?: number;
  partitionLowThresholds?: Record<string, string>;
}

export interface ManualSnapshot {
  accountId: number;
  status: 'OK';
  cashTotal: string;
  cashAvailable?: string;
  redeemableValue?: string;
  // A manual reading lists no positions, so only cash is reconciled against it.
  positions: null;
}

// A new venue account: the credentials go to Secrets Manager, and come back only as the names of the secrets that
// hold them. Field names are the orchestrator's, all strings.
export interface CreateAccountRequest {
  exchangeId: number;
  credentials: Record<string, string>;
  readCredentials?: Record<string, string>;
  note?: string;
}

export interface CreatedSecret {
  name: string;
  regions: string[];
}

export interface CreatedAccount {
  account: VenueAccount;
  secrets: CreatedSecret[];
}

// New credentials for an existing account, written to its own label's secrets.
export interface UpdateCredentialsRequest {
  accountId: number;
  credentials: Record<string, string>;
  readCredentials?: Record<string, string>;
}

export interface DeletedSecrets {
  label: string;
  deleted: string[];
  recoveryWindowDays: number;
}
