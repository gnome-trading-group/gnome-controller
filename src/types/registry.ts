export interface Strategy {
  strategyId: number;
  name: string;
  description?: string;
  archived: boolean;
  parameters?: Record<string, unknown>;
  dateCreated: string;
  dateModified: string;
}

export const RISK_POLICY_TYPES = [
  { value: 'KILL_SWITCH', label: 'Kill Switch', parametersTemplate: '{}', parametersHint: '' },
  { value: 'MAX_ORDER_NOTIONAL', label: 'Max Order Notional', parametersTemplate: '{"maxOrderNotional": 0}', parametersHint: 'Per order. maxOrderNotional in dollars, e.g. 5000 for $5,000' },
  { value: 'MAX_ORDER_SIZE', label: 'Max Order Size', parametersTemplate: '{"maxOrderSize": 0}', parametersHint: 'Per order. maxOrderSize in contracts/units, e.g. 100' },
  { value: 'PRICE_COLLAR', label: 'Price Collar', parametersTemplate: '{"maxDeviation": 0}', parametersHint: 'Per order. Rejects buys more than maxDeviation above the mark and sells more than maxDeviation below it; maxDeviation in dollars, e.g. 0.10 for 10¢' },
  { value: 'MAX_POSITION', label: 'Max Position', parametersTemplate: '{"maxPosition": 0}', parametersHint: 'Per listing, whatever the policy applies to. maxPosition in contracts/units, e.g. 100' },
  { value: 'MAX_OPEN_ORDERS', label: 'Max Open Orders', parametersTemplate: '{"maxOpenOrders": 0}', parametersHint: "Each running session's total across its listings, or just that listing if the policy names one. maxOpenOrders is a count of working orders, e.g. 20" },
  { value: 'MAX_TOTAL_PNL_LOSS', label: 'Max Total PnL Loss', parametersTemplate: '{"maxLoss": 0}', parametersHint: "Each running session's total across its listings, or just that listing if the policy names one. maxLoss in dollars, e.g. 500 for $500" },
  { value: 'MAX_COMMITTED_CAPITAL', label: 'Max Committed Capital', parametersTemplate: '{"maxCapital": 0}', parametersHint: "Each running session's own cap on the dollars its positions and working orders tie up, across the listings the policy covers (on an exchange row, a per-session cap on this exchange, not a venue budget). maxCapital in dollars, e.g. 1000 for $1,000" },
  { value: 'MARKET_ORDER_SLIPPAGE', label: 'Market Order Slippage', parametersTemplate: '{"maxSlippage": 0}', parametersHint: 'Per order. A market order is sent as an immediate-or-cancel limit this far past the best price (0 takes at the touch); the tightest row that applies wins. maxSlippage in dollars, e.g. 0.02 for 2¢' },
  { value: 'MAX_CONSECUTIVE_REJECTS', label: 'Max Consecutive Rejects', parametersTemplate: '{"maxRejects": 0}', parametersHint: 'Halts after this many venue rejects in a row, at the policy\'s scope. maxRejects is a count, e.g. 5' },
] as const;

// Absent ids are null: a policy applies to exactly the ids it carries.
export interface RiskPolicy {
  policyId: number;
  policyType: string;
  sessionId?: string | null;
  strategyId?: number | null;
  // A listing already implies its exchange, so a row names one or the other.
  exchangeId?: number | null;
  listingId?: number | null;
  parameters: Record<string, unknown>;
  enabled: boolean;
  dateCreated: string;
  dateModified: string;
}

export type RiskPolicyHistoryAction = 'INSERT' | 'UPDATE' | 'DELETE';

export interface RiskPolicyHistory {
  historyId: number;
  policyId: number;
  action: RiskPolicyHistoryAction;
  oldEnabled: boolean | null;
  newEnabled: boolean | null;
  oldParameters: Record<string, unknown> | null;
  newParameters: Record<string, unknown> | null;
  actor: string | null;
  reason: string | null;
  changedAt: string;
}
