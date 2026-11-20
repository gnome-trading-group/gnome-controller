import { describe, expect, it } from 'vitest';
import { LedgerFill, OrderRole } from '../types';
import { fillTimeMs, summarizeEpisode } from './episodes';

const CENT = 10_000_000n;
const UNIT = 1_000_000n;
const T0 = 1_800_000_000_000n;

function fill(role: OrderRole, listingId: number, side: 0 | 1, qty: bigint, price: bigint, ms: number,
  extra: Partial<LedgerFill> = {}): LedgerFill {
  return {
    fillId: String(ms), source: 'VENUE', sessionId: 's1', originSessionId: null, strategyId: 1, listingId,
    mode: 'paper', clientOidCounter: '1', side, fillQty: String(qty), fillPrice: String(price), fee: String(CENT),
    liquidity: null, netQuantityAfter: '0', realizedPnlAfter: null, actor: null, reason: null,
    eventTimeNs: String((T0 + BigInt(ms)) * 1_000_000n), recordedAt: new Date(Number(T0) + ms + 5_000).toISOString(),
    symbol: `L${listingId}`, exchangeId: 1, priceBands: null, lotSize: null, markPrice: null, slippage: null,
    orderRole: role, orderEpisodeId: '31', ...extra,
  };
}

describe('an episode of a quote fill and its hedges', () => {
  it('says what it paid, what it holds, how fast it hedged and how the hedges did against the mark', () => {
    const summary = summarizeEpisode([
      fill('QUOTE', 1, 0, 20n * UNIT, 45n * CENT, 0),
      fill('QUOTE', 2, 0, 5n * UNIT, 50n * CENT, 3),
      fill('HEDGE', 3, 0, 10n * UNIT, 48n * CENT, 40, { slippage: String(-2n * CENT) }),
      fill('HEDGE', 3, 0, 5n * UNIT, 49n * CENT, 120, { slippage: String(-1n * CENT) }),
    ]);
    expect(summary.quoteFills).toBe(2);
    expect(summary.hedgeFills).toBe(2);
    expect(summary.cash).toBe(-(900n + 250n + 480n + 245n) * CENT);
    expect(summary.fees).toBe(4n * CENT);
    expect(summary.hedgeSlippage).toBe(-3n * CENT);
    expect((summary.lastHedgeFillMs ?? 0) - (summary.firstQuoteFillMs ?? 0)).toBe(120);
    expect(summary.legs.map(l => [l.listingId, l.netQuantity])).toEqual([[1, 20n * UNIT], [2, 5n * UNIT], [3, 15n * UNIT]]);
  });

  it('a hedge that sells nets against what the episode bought there', () => {
    const summary = summarizeEpisode([
      fill('QUOTE', 1, 0, 10n * UNIT, 40n * CENT, 0),
      fill('HEDGE', 1, 1, 4n * UNIT, 42n * CENT, 10),
    ]);
    expect(summary.legs).toEqual([{ listingId: 1, symbol: 'L1', lotSize: null, netQuantity: 6n * UNIT }]);
    expect(summary.cash).toBe(-400n * CENT + 168n * CENT);
  });

  it('times a fill by the venue, falling back to when it was stored', () => {
    const traded = fill('QUOTE', 1, 0, UNIT, CENT, 7);
    expect(fillTimeMs(traded)).toBe(Number(T0) + 7);
    expect(fillTimeMs({ ...traded, eventTimeNs: null })).toBe(Number(T0) + 5_007);
  });

  it('has no hedge slippage when no hedge has a mark', () => {
    expect(summarizeEpisode([fill('QUOTE', 1, 0, UNIT, CENT, 0)]).hedgeSlippage).toBeNull();
  });
});
