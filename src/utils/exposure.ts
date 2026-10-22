// The money in an open position. Prices and money are 1e9 per dollar, quantities 1e6 per unit; net quantity is
// signed.
const SIZE = 1_000_000n;
const DOLLAR = 1_000_000_000n;

export interface Exposure {
  // What the position was opened for: its size at its average entry.
  cost: bigint;
  // What it's worth at the mark; null while there's no price.
  notional: bigint | null;
}

export function exposure(netQuantity: string, avgEntryPrice: string, markPrice: string): Exposure | null {
  const net = BigInt(netQuantity);
  if (net === 0n) return null;
  const quantity = net < 0n ? -net : net;
  const mark = BigInt(markPrice);
  return { cost: (BigInt(avgEntryPrice) * quantity) / SIZE, notional: mark === 0n ? null : (mark * quantity) / SIZE };
}

// A long ties up what it paid. A short on a binary contract ties up its collateral: $1 a contract less what selling
// it brought in. The fees paid getting there are spent too.
export function capital(netQuantity: string, avgEntryPrice: string, fees: string, binary: boolean): bigint | null {
  const held = exposure(netQuantity, avgEntryPrice, '0');
  if (!held) return null;
  const net = BigInt(netQuantity);
  const quantity = net < 0n ? -net : net;
  const outlay = net < 0n && binary ? (quantity * DOLLAR) / SIZE - held.cost : held.cost;
  return outlay + BigInt(fees);
}
