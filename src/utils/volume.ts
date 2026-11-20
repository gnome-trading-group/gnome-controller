import { Volume } from '../types';

// The maker part of the volume the venue classified, as a whole percent; null when it classified none.
export function makerPercent(volume: Volume | undefined): number | null {
  if (!volume) return null;
  const classified = BigInt(volume.maker) + BigInt(volume.taker);
  if (classified === 0n) return null;
  return Number((BigInt(volume.maker) * 100n + classified / 2n) / classified);
}

export function volumeSummary(volume: Volume | undefined): string | null {
  if (!volume) return null;
  const maker = makerPercent(volume);
  const fills = `${volume.fills.toLocaleString()} ${volume.fills === 1 ? 'fill' : 'fills'}`;
  return maker === null ? fills : `${fills} · ${maker}% maker`;
}

// Sums volumes, such as a strategy's days.
export function addVolumes(volumes: Volume[]): Volume {
  const sum = (pick: (v: Volume) => string) => volumes.reduce((acc, v) => acc + BigInt(pick(v)), 0n).toString();
  return {
    notional: sum(v => v.notional),
    maker: sum(v => v.maker),
    taker: sum(v => v.taker),
    fills: volumes.reduce((acc, v) => acc + v.fills, 0),
    fees: sum(v => v.fees),
  };
}
