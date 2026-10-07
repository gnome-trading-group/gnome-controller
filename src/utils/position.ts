// The registry's applyTrade (and so the OMS's Position.applyFill), for previewing a trade booked by hand before it's
// sent. Prices and money are 1e9 per dollar, quantities 1e6 per unit; net quantity is signed, cost always positive.
const SIZE = 1_000_000n;

const abs = (v: bigint) => (v < 0n ? -v : v);
const notional = (price: bigint, qty: bigint) => (price * qty) / SIZE;

export interface TradeResult {
  netQuantity: bigint;
  totalCost: bigint;
  realized: bigint;
}

export function applyTrade(
  position: { netQuantity: bigint; totalCost: bigint }, side: 0 | 1, qty: bigint, price: bigint,
): TradeResult {
  const signed = side === 0 ? qty : -qty;
  const net = position.netQuantity;
  if (net === 0n) return { netQuantity: signed, totalCost: notional(price, qty), realized: 0n };
  if ((net > 0n) === (signed > 0n)) {
    return { netQuantity: net + signed, totalCost: position.totalCost + notional(price, qty), realized: 0n };
  }
  const closed = abs(net) < qty ? abs(net) : qty;
  const entry = (position.totalCost * SIZE) / abs(net);
  const realized = net > 0n ? notional(price - entry, closed) : notional(entry - price, closed);
  const after = net + signed;
  const totalCost = after === 0n ? 0n
    : (after > 0n) !== (net > 0n) ? notional(price, abs(after))
    : notional(entry, abs(after));
  return { netQuantity: after, totalCost, realized };
}
