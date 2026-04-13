export interface ListingSpec {
  listingId: number;
  tickSize: number;
  lotSize: number;
  minNotional?: number;
  dateCreated: string;
  dateModified: string;
}

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
  snapshotTime: string;
}

export const RISK_POLICY_TYPES = [
  { value: 'KILL_SWITCH', label: 'Kill Switch', parametersTemplate: '{}' },
  { value: 'MAX_NOTIONAL', label: 'Max Notional', parametersTemplate: '{"maxNotionalValue": 0}' },
  { value: 'MAX_ORDER_SIZE', label: 'Max Order Size', parametersTemplate: '{"maxOrderSize": 0}' },
  { value: 'MAX_POSITION', label: 'Max Position', parametersTemplate: '{"maxPosition": 0}' },
  { value: 'MAX_PNL_LOSS', label: 'Max PnL Loss', parametersTemplate: '{"maxLoss": 0}' },
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
