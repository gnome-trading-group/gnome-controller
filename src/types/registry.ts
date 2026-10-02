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
  { value: 'MAX_NOTIONAL', label: 'Max Notional', parametersTemplate: '{"maxNotionalValue": 0}', parametersHint: 'maxNotionalValue in price units (1e9 = $1)' },
  { value: 'MAX_ORDER_SIZE', label: 'Max Order Size', parametersTemplate: '{"maxOrderSize": 0}', parametersHint: 'maxOrderSize in size units (1e6 = 1 unit)' },
  { value: 'MAX_POSITION', label: 'Max Position', parametersTemplate: '{"maxPosition": 0}', parametersHint: 'maxPosition in size units (1e6 = 1 unit)' },
  { value: 'MAX_PNL_LOSS', label: 'Max PnL Loss', parametersTemplate: '{"maxLoss": 0}', parametersHint: 'maxLoss in price units (1e9 = $1)' },
  { value: 'MAX_TOTAL_PNL_LOSS', label: 'Max Total PnL Loss', parametersTemplate: '{"maxLoss": 0}', parametersHint: 'maxLoss in price units (1e9 = $1)' },
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
