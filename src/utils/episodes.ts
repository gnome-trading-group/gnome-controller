import { LedgerFill } from '../types';

// Prices and money are 1e9 per dollar, quantities 1e6 per unit.
const SIZE = 1_000_000n;
const NS_PER_MS = 1_000_000n;

export interface EpisodeLeg {
  listingId: number;
  symbol: string | null;
  lotSize: string | null;
  // Signed: what the episode's fills left held on the listing.
  netQuantity: bigint;
}

export interface EpisodeSummary {
  quoteFills: number;
  hedgeFills: number;
  // Sells' proceeds less buys' cost, before fees: what the episode paid (negative) for what it holds.
  cash: bigint;
  fees: bigint;
  // The hedges' fills against the mark when each traded; positive when they beat it.
  hedgeSlippage: bigint | null;
  firstQuoteFillMs: number | null;
  lastHedgeFillMs: number | null;
  legs: EpisodeLeg[];
}

// When the fill traded by the venue's clock, falling back to when it was stored. Stored times trail by the ledger's
// batching, which would swamp a hedge that lands in milliseconds.
export function fillTimeMs(fill: LedgerFill): number {
  if (fill.eventTimeNs && BigInt(fill.eventTimeNs) > 1_000_000_000_000_000_000n) {
    return Number(BigInt(fill.eventTimeNs) / NS_PER_MS);
  }
  return Date.parse(fill.recordedAt);
}

export function summarizeEpisode(fills: LedgerFill[]): EpisodeSummary {
  const legs = new Map<number, EpisodeLeg>();
  let cash = 0n;
  let fees = 0n;
  let hedgeSlippage: bigint | null = null;
  let quoteFills = 0;
  let hedgeFills = 0;
  let firstQuoteFillMs: number | null = null;
  let lastHedgeFillMs: number | null = null;
  for (const fill of fills) {
    if (fill.fillQty === null || fill.fillPrice === null || fill.side === null) continue;
    const qty = BigInt(fill.fillQty);
    const notional = (BigInt(fill.fillPrice) * qty) / SIZE;
    cash += fill.side === 0 ? -notional : notional;
    fees += BigInt(fill.fee ?? '0');
    const leg = legs.get(fill.listingId)
      ?? { listingId: fill.listingId, symbol: fill.symbol, lotSize: fill.lotSize, netQuantity: 0n };
    leg.netQuantity += fill.side === 0 ? qty : -qty;
    legs.set(fill.listingId, leg);
    const at = fillTimeMs(fill);
    if (fill.orderRole === 'HEDGE') {
      hedgeFills += 1;
      lastHedgeFillMs = lastHedgeFillMs === null ? at : Math.max(lastHedgeFillMs, at);
      if (fill.slippage !== null) hedgeSlippage = (hedgeSlippage ?? 0n) + BigInt(fill.slippage);
    } else if (fill.orderRole === 'QUOTE') {
      quoteFills += 1;
      firstQuoteFillMs = firstQuoteFillMs === null ? at : Math.min(firstQuoteFillMs, at);
    }
  }
  return {
    quoteFills, hedgeFills, cash, fees, hedgeSlippage, firstQuoteFillMs, lastHedgeFillMs, legs: [...legs.values()],
  };
}
