import { PRICE_SCALING_FACTOR, SIZE_SCALING_FACTOR, formatUnscaled } from './security-master';

// The OMS compares limits against scaled integers, so each limit is stored at its field's scale while
// operators read and type dollars and units.
const PARAMETER_SCALES: Record<string, { factor: number; unit: 'dollars' | 'units' }> = {
  maxNotionalValue: { factor: PRICE_SCALING_FACTOR, unit: 'dollars' },
  maxLoss: { factor: PRICE_SCALING_FACTOR, unit: 'dollars' },
  maxDeviation: { factor: PRICE_SCALING_FACTOR, unit: 'dollars' },
  maxOrderSize: { factor: SIZE_SCALING_FACTOR, unit: 'units' },
  maxPosition: { factor: SIZE_SCALING_FACTOR, unit: 'units' },
};

/** Converts limits typed in dollars and units into the scaled integers the OMS reads. */
export function scaleRiskParameters(parameters: Record<string, unknown>): Record<string, unknown> {
  const scaled: Record<string, unknown> = { ...parameters };
  for (const [key, value] of Object.entries(parameters)) {
    const scale = PARAMETER_SCALES[key];
    if (!scale) continue;
    if (typeof value !== 'number' || !Number.isFinite(value) || value < 0) {
      throw new Error(`${key} must be a non-negative number of ${scale.unit}`);
    }
    scaled[key] = Math.round(value * scale.factor);
  }
  return scaled;
}

/** Shows stored limits as dollars and units, e.g. "maxNotionalValue: $5000". */
export function formatRiskParameters(parameters: Record<string, unknown>): string {
  const entries = Object.entries(parameters ?? {});
  if (entries.length === 0) return '-';
  return entries
    .map(([key, value]) => {
      const scale = PARAMETER_SCALES[key];
      if (!scale) return `${key}: ${String(value)}`;
      const unscaled = formatUnscaled(Number(value) / scale.factor);
      return scale.unit === 'dollars' ? `${key}: $${unscaled}` : `${key}: ${unscaled}`;
    })
    .join(', ');
}
