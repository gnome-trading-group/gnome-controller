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

export interface SessionListingPnl extends ValuedListing {
  carry: string;
  trading: string;
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

export interface StrategyListingPnl extends ValuedListing {
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
    betweenSessions: string;
  };
  openPositions: number;
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
  level: 'session' | 'strategy' | 'listing' | 'global';
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
  other: HeldPosition[];
}

export interface AttentionItem {
  severity: 'critical' | 'warning' | 'info';
  kind: string;
  title: string;
  detail: string | null;
  strategyId: number | null;
  strategyName: string | null;
  sessionId: string | null;
  listingId: number | null;
  symbol: string | null;
  since: string | null;
}

export type SeriesEventKind = 'SESSION_START' | 'SESSION_STOP' | 'RESET' | 'ADJUSTMENT' | 'MANUAL' | 'GAP' | 'RECOVERY';

export interface PnlSeries {
  resolutionMs: number;
  t: number[];
  total: string[];
  realized: string[];
  unrealized: string[];
  fees: string[];
  listings: { listingId: number; symbol: string | null; lotSize: string | null; total: string[]; netQuantity: string[] }[];
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

export type FillSource = 'VENUE' | 'RECOVERY' | 'RESET' | 'ADJUSTMENT' | 'MANUAL' | 'GAP';

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
  listings: { listingId: number; priceUnchangedMs: number }[];
  ledger: { lastAcceptedAgoMs: number | null; consecutiveFailures: number; fenced: boolean } | null;
  gateways: { name: string; reconnecting: boolean }[];
}
