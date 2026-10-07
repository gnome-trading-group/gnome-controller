import { PolicyUsage } from '../types';
import { formatMoney, formatQty } from './format';

// Bands for how close a limit is to binding.
const AMBER_FROM = 0.7;
const RED_FROM = 0.9;

export function usageColor(usage: number): string {
  return usage >= RED_FROM ? 'red' : usage >= AMBER_FROM ? 'orange' : 'teal';
}

const LABELS: Record<string, string> = {
  MAX_POSITION: 'Max position',
  MAX_OPEN_ORDERS: 'Max open orders',
  MAX_TOTAL_PNL_LOSS: 'Max loss',
  MAX_ORDER_SIZE: 'Max order size',
  MAX_NOTIONAL: 'Max order notional',
  PRICE_COLLAR: 'Price collar',
};

export function usageLabel(policy: PolicyUsage): string {
  return LABELS[policy.policyType] ?? policy.policyType;
}

// A value or limit in the policy's own units.
export function formatLimit(policyType: string, value: string | null): string {
  if (value === null) return '—';
  switch (policyType) {
    case 'MAX_POSITION':
    case 'MAX_ORDER_SIZE':
      return formatQty(value);
    case 'MAX_OPEN_ORDERS':
      return value;
    default:
      return formatMoney(value, false).text;
  }
}
