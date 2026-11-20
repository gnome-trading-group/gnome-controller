// The registry's PnL and ledger reads. Money, prices and quantities are scaled-integer strings (prices and money
// 1e9 per dollar, quantities 1e6 per unit), formatted only by utils/format; times are ISO UTC.

import type { PriceBand } from './security-master';

export type Mode = 'paper' | 'live';

export type OpeningSource = 'INHERITED' | 'FLAT' | 'NONE';

// Money traded in venue fills (quantity x price), split by fills that rested (maker) and crossed (taker); a fill the
// venue didn't classify is in notional only. Settlements, resets, corrections and hand-booked trades don't count.
export interface Volume {
  notional: string;
  maker: string;
  taker: string;
  fills: number;
  fees: string;
}

export interface ListingRef {
  listingId: number;
  symbol: string | null;
  exchangeId: number | null;
  priceBands: PriceBand[] | null;
  lotSize: string | null;
}

interface ValuedListing extends ListingRef {
  netQuantity: string;
  avgEntryPrice: string;
  markPrice: string | null;
  bid: string | null;
  ask: string | null;
  markTime: string | null;
  total: string;
  realized: string;
  unrealized: string;
  fees: string;
  version: string | null;
  needsReview: boolean;
  lastFillAt: string | null;
}

// What became of a position a stopped session left open, for reading only: it never changes the session's PnL, and
// counts in the strategy's PnL outside sessions instead. impact is what that booking changed the strategy's PnL by.
export type AfterSessionKind =
  | 'SETTLED' | 'CLOSED_MANUALLY' | 'ADJUSTED' | 'RESET' | 'INHERITED' | 'AWAITING_SETTLEMENT' | 'OPEN';

export interface AfterSession {
  kind: AfterSessionKind;
  at: string | null;
  // INHERITED: the session that held it next; RESET: the session that started flat.
  sessionId: string | null;
  price: string | null;
  impact: string | null;
  // SETTLED, or AWAITING_SETTLEMENT once the result is recorded but not yet booked.
  settlementPrice: string | null;
}

export interface SessionListingPnl extends ValuedListing {
  carry: string;
  trading: string;
  afterSession: AfterSession | null;
  opening: {
    source: OpeningSource;
    netQuantity: string;
    avgEntryPrice: string;
    markPrice: string | null;
    unrealized: string;
    markMissing: boolean;
  };
}

export interface SessionSummary {
  scope: {
    kind: 'session';
    sessionId: string;
    strategyId: number;
    mode: Mode;
    status: string;
    startedAt: string;
    stoppedAt: string | null;
  };
  asOf: string;
  opening: OpeningSource;
  totals: {
    total: string;
    realized: string;
    unrealized: string;
    fees: string;
    carry: string;
    trading: string;
    openingUnrealized: string;
  };
  counts: { fills: number; orders: number; openOrders: number; refused: number };
  volume: Volume;
  refusals: { listingId: number; reason: string; count: number }[];
  // A paper session's own estimate of the venue liquidity rewards its orders earned, outside its trading PnL; a live
  // session has none. Absent from registries that predate it.
  rewards?: { estimatedGross: string; estimatedPaid: string; programs: RewardAccrual[] };
  listings: SessionListingPnl[];
}

// A session's latest estimate for one listing and venue program (registry ledger.reward_accrual). Amounts are price
// units; gross is ours on this listing, marketPaid what the venue would pay the whole market once the period ends
// (closed: it had ended by asOf).
export interface RewardAccrual {
  sessionId: string;
  strategyId: number;
  listingId: number;
  exchangeCode: string;
  venueMarket: string;
  venueProgramId: string;
  program: string;
  periodStart: string;
  periodEnd: string | null;
  asOf: string;
  closed: boolean;
  gross: string;
  marketGross: string;
  marketPaid: string;
  countingNanos: string;
  oneSidedNanos: string;
  depthUnknownNanos: string;
  noDataNanos: string;
  gaps: number;
}

// One per listing and venue account: a strategy relaunched onto another account holds the listing on each separately.
// Paper positions belong to no account.
export interface StrategyListingPnl extends ValuedListing {
  accountId: number | null;
  accountLabel: string | null;
  today: string;
  // Venue rewards given to the strategy on this listing (on its first row when it's held on several accounts); not in
  // total, which is trading PnL. Live only.
  rewards: string;
}

export interface StrategySummary {
  scope: { kind: 'strategy'; strategyId: number; mode: Mode; timeZone: string; dayStart: string };
  asOf: string;
  modesWithData: Mode[];
  totals: {
    lifetime: string;
    today: string;
    realized: string;
    unrealized: string;
    fees: string;
    // Venue rewards given to the strategy (liquidity rewards, maker and taker rebates), in lifetime and today; in paper,
    // its sessions' estimates.
    rewards: string;
    rewardsToday: string;
    // How lifetime differs from the sum of the sessions' PnL; carry is the mark moving on inventory no session held.
    outsideSessions: {
      total: string;
      settlements: string;
      manual: string;
      adjustments: string;
      resets: string;
      rewards: string;
      carry: string;
    };
  };
  openPositions: number;
  volumeToday: Volume;
  // The rows left out of listings: flat and untraded since the day started, each one's PnL closed. Paged on demand.
  history: { count: number; total: string; realized: string; fees: string };
  // Rows held, needing review or traded today; with a listingId, that listing's rows instead.
  listings: StrategyListingPnl[];
}

export interface FirmSummary {
  scope: { kind: 'firm'; mode: Mode; timeZone: string; dayStart: string };
  asOf: string;
  // lifetime and today are the firm's all in: every strategy's (with its rewards) plus the firm's own non-trading PnL.
  totals: {
    lifetime: string; today: string; realized: string; unrealized: string; fees: string;
    rewards: string; rewardsToday: string; nonTrading: string; nonTradingToday: string;
  };
  // Non-trading money no strategy earned: interest, holding yield, referral, fee adjustments, and rewards that couldn't
  // be given out; by program (or kind, where there's no program) and by exchange. Live only.
  nonTrading: {
    lifetime: string;
    today: string;
    byProgram: Record<string, { lifetime: string; today: string }>;
    byExchange: Record<string, { lifetime: string; today: string }>;
  };
  volumeToday: Volume;
  strategies: {
    strategyId: number; lifetime: string; today: string; unrealized: string; rewards: string; openPositions: number;
    volumeToday: Volume;
  }[];
}

export interface SessionTotals {
  sessionId: string;
  opening: OpeningSource;
  totals: SessionSummary['totals'];
  fills: number;
  volume: Volume;
  // The session's estimated venue rewards (paper), outside its trading PnL.
  rewardsEstimated?: string;
}

// A listing's price history, one point per resolution step; mark is the mid, else the last trade (0 unknown).
export interface PriceHistory {
  resolutionMs: number;
  t: number[];
  bid: string[];
  ask: string[];
  lastTrade: string[];
  mark: (string | null)[];
}

// PnL per day in a time zone: the change in lifetime PnL over each local day, oldest first (today's so far).
export interface DailyPnlDay {
  date: string;
  start: string;
  pnl: string;
  volume: Volume;
}

export interface DailyPnl {
  timeZone: string;
  days: DailyPnlDay[];
  // Only for the firm-wide read asked to break it down: each strategy's own days.
  strategies?: { strategyId: number; days: DailyPnlDay[] }[];
}

// Trading on each exchange over the last `days` local days (registry /pnl/exchanges). rewards are what the exchange paid
// for it (live: rewards and rebates booked on its accounts; paper: the sessions' estimates); netCostPer100 is fees less
// rewards per $100 traded, in price units (null without volume). Live breaks it down by venue account, the unit an
// exchange's fee tiers count; paper trades through no account.
export interface ExchangeVolume {
  exchangeId: number;
  exchangeCode: string | null;
  exchangeName: string | null;
  volume: Volume;
  rewards: string;
  netCostPer100: string | null;
  accounts: { accountId: number; label: string | null; volume: Volume; rewards: string }[];
  strategies: { strategyId: number; name: string | null; volume: Volume }[];
}

export interface ExchangeVolumes {
  scope: { mode: Mode; timeZone: string; days: number; from: string; to: string };
  // Every exchange traded or rewarded in the window; with an exchangeId, that one, active or not.
  exchanges: ExchangeVolume[];
  // Only with an exchangeId: its volume per local day, oldest first.
  daily?: { date: string; start: string; volume: Volume }[];
}

// How close a running session is to each risk limit that applies to it (registry /risk/usage).
export interface PolicyUsage {
  policyId: number;
  policyType: string;
  level: 'session' | 'strategy' | 'strategy-exchange' | 'exchange' | 'listing' | 'global';
  listingId: number | null;
  limit: string;
  value: string | null;
  usage: number | null;
  perOrder: boolean;
  bindingListingId: number | null;
  bindingSymbol: string | null;
}

export interface RiskUsage {
  sessionId: string;
  asOf: string;
  status: string;
  refusedByRisk: number;
  policies: PolicyUsage[];
}

// A held contract or other position, as the group view shows it.
export interface HeldPosition {
  listingId: number;
  symbol: string | null;
  exchangeId: number | null;
  priceBands: PriceBand[] | null;
  lotSize: string | null;
  netQuantity: string;
  avgEntryPrice: string;
  markPrice: string | null;
  unrealized: string;
  total: string;
}

// Prediction-market positions grouped by what offsets what (registry /pnl/groups): contracts the relationship rows,
// binary complements and multi-outcome events tie together, across venues and, in the firm view, across strategies.
// Each world is one way the group's contracts can settle together ($1 if true, $0 if not) and its PnL then.
export interface RiskGroup {
  // The group's lowest security id: stable while its contracts are.
  key: number;
  title: string;
  expiry: string | null;
  resolved: boolean;
  resolvedAt: string | null;
  exchangeIds: number[];
  // Firm view only.
  strategyIds?: number[];
  // settlementPrice: what the contract settled at (price units), null while open.
  legs: {
    strategyId: number; eventId: number; eventTitle: string; outcome: string; settlementPrice: string | null; held: HeldPosition;
  }[];
  current: string;
  // Worst first, consistent with every settlement so far. paysListingIds: the legs paying $1 in it; paying: the net
  // contracts paying (shorts count against).
  worlds: GroupWorld[];
  // Worlds against what has already settled on some venue: they happen only if a venue still open settles differently.
  divergent: GroupWorld[];
  // Every leg paid by its venue's void rule, when the venues void differently or a relationship is flagged so.
  void: { pnl: string; change: string } | null;
  // The worst world: what the group makes however it settles, if the venues settle it alike.
  locked: string | null;
  // The lowest of locked, void and divergent.
  worst: string | null;
  best: string | null;
  // The spread of net contracts paying across worlds: 0 when fully hedged.
  gap: string | null;
  // Flags on the relationships joining the group (settlement rules that differ between venues).
  flags: string[];
  // Too many contracts to list its worlds.
  tooLarge: boolean;
}

export interface GroupWorld {
  label: string;
  paysListingIds: number[];
  pnl: string;
  change: string;
  paying: string;
}

export interface GroupPositions {
  asOf: string;
  groups: RiskGroup[];
  // Held listings that aren't event contracts; in history, the newest flat ones, on the first page only.
  other: (HeldPosition & { strategyId: number })[];
  // Groups still held, flat contracts outside them, and flat listings that aren't event contracts.
  counts: { active: number; flatContracts: number; flatOther: number };
  // Set on a history page with more after it.
  nextBefore: string | null;
}

export interface AttentionItem {
  // A monitoring rule's finding, or an alert something reported (a failed pipeline or launch, a CloudWatch alarm).
  source: 'finding' | 'alert';
  alertId: number | null;
  severity: 'critical' | 'warning' | 'info';
  kind: string;
  title: string;
  detail: string | null;
  strategyId: number | null;
  strategyName: string | null;
  sessionId: string | null;
  listingId: number | null;
  symbol: string | null;
  exchangeId: number | null;
  exchangeName: string | null;
  accountId: number | null;
  accountLabel: string | null;
  // Who last turned a kill switch on (halts only), and the agent, gateway or account a session item is about.
  actor: string | null;
  subject: string | null;
  since: string | null;
  // Someone has acknowledged its alert: still a problem, but someone has it.
  acknowledgedBy: string | null;
  acknowledgedReason: string | null;
}

export type SeriesEventKind = 'SESSION_START' | 'SESSION_STOP' | 'RESET' | 'ADJUSTMENT' | 'MANUAL' | 'SETTLEMENT' | 'GAP'
  | 'RECOVERY' | 'REWARD' | 'NON_TRADING';

export interface PnlSeries {
  resolutionMs: number;
  t: number[];
  total: string[];
  realized: string[];
  unrealized: string[];
  fees: string[];
  // Money traded since the point before (the first point's is 0), and what the positions held at each point tie up:
  // a binary contract's worst loss at settlement, anything else its cost.
  volume: string[];
  maker: string[];
  taker: string[];
  capital: string[];
  // Each listing's own line, only when asked for (byListing, listingIds or a listingId): the ones that moved most, at
  // most 25 of the listingCount held or traded in the window, with `other` summing the rest so the lines add up.
  listings: { listingId: number; symbol: string | null; lotSize: string | null; total: string[]; netQuantity: string[] }[];
  listingCount: number;
  other: string[] | null;
  events: {
    time: string;
    kind: SeriesEventKind;
    sessionId: string | null;
    listingId: number | null;
    pnlImpact: string | null;
    actor: string | null;
    reason: string | null;
  }[];
  // Only on the firm-wide series: each strategy's own lifetime line.
  strategies?: { strategyId: number; total: string[] }[];
}

export type FillSource = 'VENUE' | 'RECOVERY' | 'RESET' | 'ADJUSTMENT' | 'MANUAL' | 'SETTLEMENT' | 'GAP';

export interface LedgerFill {
  fillId: string;
  source: FillSource;
  sessionId: string | null;
  originSessionId: string | null;
  strategyId: number;
  listingId: number;
  mode: Mode;
  clientOidCounter: string | null;
  side: 0 | 1 | null;
  fillQty: string | null;
  fillPrice: string | null;
  fee: string | null;
  liquidity: 'MAKER' | 'TAKER' | null;
  netQuantityAfter: string;
  realizedPnlAfter: string | null;
  actor: string | null;
  reason: string | null;
  // When it traded, by the venue's clock (epoch ns; earlier rows may carry none).
  eventTimeNs: string | null;
  recordedAt: string;
  symbol: string | null;
  exchangeId: number | null;
  priceBands: PriceBand[] | null;
  lotSize: string | null;
  markPrice: string | null;
  slippage: string | null;
  // What the fill's order was for in its strategy (null: unstated, or a fill of no order) and its episode.
  orderRole: OrderRole | null;
  orderEpisodeId: string | null;
}

// What an order was for in its strategy: a resting quote, a hedge completing a fill, an arbitrage leg, a trade closing
// inventory.
export type OrderRole = 'QUOTE' | 'HEDGE' | 'ARB_LEG' | 'EXIT';

export interface LedgerOrder {
  orderSeq: string;
  sessionId: string;
  clientOidCounter: string;
  strategyId: number;
  listingId: number;
  exchangeId: number;
  mode: Mode;
  side: 0 | 1 | null;
  price: string | null;
  size: string | null;
  exchangeOrderId: string | null;
  status: 'OPEN' | 'CLOSED' | 'RECOVERED';
  closeState: 'FILLED' | 'CANCELED' | 'REJECTED' | 'EXPIRED' | null;
  rejectReason: string | null;
  filledQty: string | null;
  openedAt: string | null;
  ackedAt: string | null;
  closedAt: string | null;
  symbol: string | null;
  priceBands: PriceBand[] | null;
  lotSize: string | null;
  fills: string;
  fillQty: string;
  avgFillPrice: string | null;
  fees: string;
  role: OrderRole | null;
  // The strategy's id for orders that belong together, and the time in force sent.
  episodeId: string | null;
  timeInForce: 'GOOD_TILL_CANCELED' | 'IMMEDIATE_OR_CANCELED' | 'FILL_OR_KILL' | null;
}

export interface LedgerPage<T> {
  rows: T[];
  nextBefore: string | null;
}

// What a running session reports every few seconds (see the orchestrator's SessionHeartbeatAgent).
export interface SessionHealth {
  uptimeMs: number;
  agents: { name: string; hotPath: boolean; stalledMs: number; exited: boolean }[];
  // marketDataBadMs: how long the book has been flagged bad data (new orders refused); 0 is trusted. Older sessions omit it.
  listings: { listingId: number; priceUnchangedMs: number; marketDataBadMs?: number }[];
  ledger: { lastAcceptedAgoMs: number | null; consecutiveFailures: number; fenced: boolean } | null;
  // Older sessions don't report the rest.
  gateways: { name: string; reconnecting: boolean; resyncsLast5m?: number }[];
  risk?: { stale: boolean; unguarded: boolean; unbuildablePolicies: number; droppedLatches: number } | null;
  // A reading the host can't give (no /proc off Linux, no CPU share before the second sample) is -1.
  host?: {
    cpuBusyPermille: number;
    cpuStealPermille: number;
    memAvailableBytes: number;
    memTotalBytes: number;
    processRssBytes: number;
    heapUsedBytes: number;
    heapMaxBytes: number;
    diskFreeBytes: number;
  } | null;
  // Null with the journal off.
  journal?: { pendingSegments: number; oldestPendingMs: number; segmentBytes: number } | null;
  // Each order gateway link (live:<exchange>:main or paper:<exchange>:main); workingOrders are its orders there not
  // known to have ended.
  orderGateways?: { key: string; linked: boolean; unlinkedMs: number; workingOrders: number }[];
}
