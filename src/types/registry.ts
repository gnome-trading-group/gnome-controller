export enum StrategyStatus {
  INACTIVE = 0,
  ACTIVE = 1,
  PAUSED = 2,
}

export interface Strategy {
  strategyId: number;
  name: string;
  description?: string;
  status: number;
  parameters?: Record<string, unknown>;
  dateCreated: string;
  dateModified: string;
}

export interface PnlSnapshot {
  snapshotId: number;
  strategyId: number;
  listingId: number;
  netQuantity: number;
  avgEntryPrice: number;
  realizedPnl: number;
  totalFees: number;
  leavesBuyQty: number;
  leavesSellQty: number;
  markPrice: number;
  unrealizedPnl: number;
  totalPnl: number;
  snapshotTime: string;
  sessionId?: string;
  mode?: string;
}

export const RISK_POLICY_TYPES = [
  { value: 'KILL_SWITCH', label: 'Kill Switch', parametersTemplate: '{}', parametersHint: '' },
  { value: 'MAX_NOTIONAL', label: 'Max Notional', parametersTemplate: '{"maxNotionalValue": 0}', parametersHint: 'maxNotionalValue in dollars, e.g. 5000 for $5,000' },
  { value: 'MAX_ORDER_SIZE', label: 'Max Order Size', parametersTemplate: '{"maxOrderSize": 0}', parametersHint: 'maxOrderSize in contracts/units, e.g. 100' },
  { value: 'MAX_POSITION', label: 'Max Position', parametersTemplate: '{"maxPosition": 0}', parametersHint: 'maxPosition in contracts/units, e.g. 100' },
  { value: 'MAX_PNL_LOSS', label: 'Max PnL Loss', parametersTemplate: '{"maxLoss": 0}', parametersHint: 'maxLoss in dollars, e.g. 500 for $500' },
  { value: 'MAX_TOTAL_PNL_LOSS', label: 'Max Total PnL Loss', parametersTemplate: '{"maxLoss": 0}', parametersHint: 'maxLoss in dollars, e.g. 500 for $500' },
] as const;

export interface RiskPolicy {
  policyId: number;
  policyType: string;
  scope: number;
  strategyId?: number;
  listingId?: number;
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
