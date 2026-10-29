// The registry's PnL and ledger reads. Money, prices and quantities are scaled-integer strings (prices and money
// 1e9 per dollar, quantities 1e6 per unit), formatted only by utils/format; times are ISO UTC.

export type Mode = 'paper' | 'live';

export type OpeningSource = 'INHERITED' | 'FLAT' | 'NONE';

export interface ListingRef {
  listingId: number;
  symbol: string | null;
  exchangeId: number | null;
  tickSize: string | null;
  lotSize: string | null;
}

interface ValuedListing extends ListingRef {
  netQuantity: string;
  avgEntryPrice: string;
  markPrice: string;
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
    markPrice: string;
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
  refusals: { listingId: number; reason: string; count: number }[];
  listings: SessionListingPnl[];
}

// One per listing and venue account: a strategy relaunched onto another account holds the listing on each separately.
// Paper positions belong to no account.
export interface StrategyListingPnl extends ValuedListing {
  accountId: number | null;
  accountLabel: string | null;
  today: string;
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
    // How lifetime differs from the sum of the sessions' PnL; carry is the mark moving on inventory no session held.
    outsideSessions: {
      total: string;
      settlements: string;
      manual: string;
      adjustments: string;
      resets: string;
      carry: string;
    };
  };
  openPositions: number;
  // The rows left out of listings: flat and untraded since the day started, each one's PnL closed. Paged on demand.
  history: { count: number; total: string; realized: string; fees: string };
  // Rows held, needing review or traded today; with a listingId, that listing's rows instead.
  listings: StrategyListingPnl[];
}

export interface FirmSummary {
  scope: { kind: 'firm'; mode: Mode; timeZone: string; dayStart: string };
  asOf: string;
  totals: { lifetime: string; today: string; realized: string; unrealized: string; fees: string };
  strategies: { strategyId: number; lifetime: string; today: string; unrealized: string; openPositions: number }[];
}

export interface SessionTotals {
  sessionId: string;
  opening: OpeningSource;
  totals: SessionSummary['totals'];
  fills: number;
}

// A listing's price history, one point per resolution step; mark is the mid, else the last trade (0 unknown).
export interface PriceHistory {
  resolutionMs: number;
  t: number[];
  bid: string[];
  ask: string[];
  lastTrade: string[];
  mark: string[];
}

// PnL per day in a time zone: the change in lifetime PnL over each local day, oldest first (today's so far).
export interface DailyPnl {
  timeZone: string;
  days: { date: string; start: string; pnl: string }[];
  // Only for the firm-wide read asked to break it down: each strategy's own days.
  strategies?: { strategyId: number; days: { date: string; start: string; pnl: string }[] }[];
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

// A held contract or other position, as the event view shows it.
export interface HeldPosition {
  listingId: number;
  symbol: string | null;
  exchangeId: number | null;
  tickSize: string | null;
  lotSize: string | null;
  netQuantity: string;
  avgEntryPrice: string;
  markPrice: string;
  unrealized: string;
  total: string;
}

// A strategy's prediction-market positions by event (registry /pnl/events). Each market's scenarios are the
// lifetime PnL of its contracts if that outcome wins; other listings (hedges) are not in them.
export interface EventPositions {
  asOf: string;
  events: {
    eventId: number;
    title: string;
    expiry: string | null;
    resolved: boolean;
    resolvedAt: string | null;
    markets: {
      key: string;
      kind: 'BINARY' | 'MULTI_OUTCOME';
      outcomes: { outcome: string; listingId: number | null; symbol: string | null; held: HeldPosition | null }[];
      netExposure: { outcome: string; quantity: string } | null;
      current: string;
      scenarios: { label: string; pnl: string; change: string }[];
      worst: string | null;
      best: string | null;
    }[];
  }[];
  // Held listings that aren't event contracts; in history, the newest flat ones, on the first page only.
  other: HeldPosition[];
  // Events still held, events with every contract flat, and flat listings that aren't event contracts.
  counts: { active: number; history: number; flatOther: number };
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
  | 'RECOVERY';

export interface PnlSeries {
  resolutionMs: number;
  t: number[];
  total: string[];
  realized: string[];
  unrealized: string[];
  fees: string[];
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
  recordedAt: string;
  symbol: string | null;
  exchangeId: number | null;
  tickSize: string | null;
  lotSize: string | null;
  markPrice: string | null;
  slippage: string | null;
}

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
  tickSize: string | null;
  lotSize: string | null;
  fills: string;
  fillQty: string;
  avgFillPrice: string | null;
  fees: string;
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
  rateLimit?: { account: string; throttling: boolean }[];
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
}
