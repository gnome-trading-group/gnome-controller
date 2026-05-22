import { AssetClass, ContractType, SecurityType } from "../types";

export const PRICE_SCALING_FACTOR = 1_000_000_000;
export const SIZE_SCALING_FACTOR = 1_000_000;
export const NOTIONAL_SCALING_FACTOR = PRICE_SCALING_FACTOR * SIZE_SCALING_FACTOR;
export const CONTRACT_MULTIPLIER_SCALING_FACTOR = 1_000_000_000;

export function formatSecurityType(type: number): string {
  const securityType = Object.keys(SecurityType).find((key) => SecurityType[key as keyof typeof SecurityType] === type);
  if (!securityType) return 'Unknown';
  return securityType.split('_').map(word => word.charAt(0) + word.slice(1).toLowerCase()).join(' ');
}

export function formatContractType(type: number): string {
  const contractType = Object.keys(ContractType).find((key) => ContractType[key as keyof typeof ContractType] === type);
  if (!contractType) return 'Unknown';
  return contractType.split('_').map(word => word.charAt(0) + word.slice(1).toLowerCase()).join(' ');
}

export function formatAssetClass(cls: number): string {
  const assetClass = Object.keys(AssetClass).find((key) => AssetClass[key as keyof typeof AssetClass] === cls);
  if (!assetClass) return 'Unknown';
  return assetClass.split('_').map(word => word.charAt(0) + word.slice(1).toLowerCase()).join(' ');
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

export function unscaleContractMultiplier(scaledValue: number): number {
  return scaledValue / CONTRACT_MULTIPLIER_SCALING_FACTOR;
}

export function formatUnscaled(value: number): string {
  if (value === 0) return '0';
  const str = value.toPrecision(10);
  return parseFloat(str).toString();
}
