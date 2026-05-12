import { SecurityType } from "../types";

export const PRICE_SCALING_FACTOR = 1_000_000_000;
export const SIZE_SCALING_FACTOR = 1_000_000;
export const NOTIONAL_SCALING_FACTOR = PRICE_SCALING_FACTOR * SIZE_SCALING_FACTOR;

export function formatSecurityType(type: number): string {
  const securityType = Object.keys(SecurityType).find((key) => SecurityType[key as keyof typeof SecurityType] === type);
  if (!securityType) return 'Unknown';
  return securityType.split('_').map(word => word.charAt(0) + word.slice(1).toLowerCase()).join(' ');
}

export function unscalePrice(scaledValue: number): number {
  return scaledValue / PRICE_SCALING_FACTOR;
}

export function unscaleSize(scaledValue: number): number {
  return scaledValue / SIZE_SCALING_FACTOR;
}

export function unscaleNotional(scaledValue: number): number {
  return scaledValue / NOTIONAL_SCALING_FACTOR;
}

export function formatUnscaled(value: number): string {
  if (value === 0) return '0';
  const str = value.toPrecision(10);
  return parseFloat(str).toString();
}
