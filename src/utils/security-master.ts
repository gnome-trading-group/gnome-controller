import { SecurityType } from "../types";

export function formatSecurityType(type: number): string {
  const securityType = Object.keys(SecurityType).find((key) => SecurityType[key as keyof typeof SecurityType] === type);
  if (!securityType) return 'Unknown';
  return securityType.split('_').map(word => word.charAt(0) + word.slice(1).toLowerCase()).join(' ');
}
