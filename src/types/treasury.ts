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
// What a rebalance leaves behind for resting orders: nothing, the largest single commitment, or every order's margin.
export type RebalanceReservation = 'none' | 'max' | 'sum';

export interface PartitionTreasury {
  cash: string;
  heldAtCost: string;
  base: string;
  allocated: string;
  free: string;
}

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
  // Per shard: its cash, positions at cost, and the full budget of every live session trading its markets (a session
  // trading several shards counts against each). Null on venues that don't split.
  partitions: Record<string, PartitionTreasury> | null;
  // Kalshi moves free cash between shards toward targets (percent per shard). What the latest reading found it set to,
  // with why it couldn't be read or set (null on venues that don't rebalance), and what the account wants: null leaves
  // Kalshi's alone, empty turns rebalancing off. The poller sets Kalshi to the account's.
  rebalanceTargets: { allocations?: Record<string, number>; restingMarginReservation?: string; error?: string } | null;
  partitionTargets: Record<string, number> | null;
  rebalanceReservation: RebalanceReservation;
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

// The venue program behind a reward or interest payment.
export const TRANSFER_PROGRAMS = [
  'LIQUIDITY', 'MAKER_REBATE', 'TAKER_REBATE', 'HOLDING', 'REFERRAL', 'VOLUME', 'INTEREST', 'UNCLASSIFIED',
] as const;

export type TransferProgram = typeof TRANSFER_PROGRAMS[number];

// Where a reward stands in being given to the strategies that earned it; null when it isn't given out. PARTIAL: some
// of its markets had no strategy of ours, and that part stays the firm's.
export type AllocationState = 'PENDING' | 'DONE' | 'PARTIAL' | 'FAILED';

// The part of a reward one strategy earned, on the listing it earned it on (none for a taker rebate), split among
// `strategies` of ours by `basis`.
export interface TransferAllocation {
  allocationId: number;
  strategyId: number;
  listingId: number | null;
  venueMarket: string | null;
  amount: string;
  basis: 'ACCRUAL' | 'RESTING_TIME' | 'MAKER_FILLS' | 'TAKER_FEES';
  strategies: number;
  periodStart: string | null;
  periodEnd: string | null;
}

// A part of a reward left to the firm, and why.
export interface UnallocatedPart {
  venueMarket: string | null;
  amount: string;
  reason: string;
}

export interface Transfer {
  transferId: string;
  accountId: number;
  label: string;
  exchangeCode: string;
  kind: TransferKind;
  amount: string;
  occurredAt: string;
  externalRef: string | null;
  reason: string | null;
  // 'venue-poller' when the poller booked it from the venue, else the person who recorded it.
  actor: string;
  recordedAt: string;
  program: TransferProgram | null;
  venueMarket: string | null;
  asset: string;
  assetAmount: string | null;
  allocationState: AllocationState | null;
  allocations: TransferAllocation[];
  unallocated: UnallocatedPart[] | null;
}

export interface TransferFilters {
  accountId?: number;
  kind?: TransferKind;
  program?: TransferProgram;
  strategyId?: number;
  since?: string;
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
  partitionTargets?: Record<string, number> | null;
  rebalanceReservation?: RebalanceReservation;
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
  // Left out to replace only the poller's key.
  credentials?: Record<string, string>;
  readCredentials?: Record<string, string>;
}

export interface DeletedSecrets {
  label: string;
  deleted: string[];
  recoveryWindowDays: number;
}
