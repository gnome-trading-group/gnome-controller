import { describe, expect, it } from 'vitest';
import { attentionLink } from './attention';
import { AttentionItem } from '../types';

const item = (fields: Partial<AttentionItem>): AttentionItem => ({
  severity: 'warning', kind: 'NEEDS_REVIEW', title: '', detail: null, strategyId: null, strategyName: null,
  sessionId: null, listingId: null, symbol: null, exchangeId: null, exchangeName: null, accountId: null,
  accountLabel: null, actor: null, subject: null, since: null, ...fields,
});

describe('where an attention item is dealt with', () => {
  it('is its session, else its strategy on the tab it concerns, else the risk page', () => {
    expect(attentionLink(item({ sessionId: 's1', strategyId: 4, kind: 'SILENT' }), 'live')).toBe('/sessions/s1');
    expect(attentionLink(item({ strategyId: 4, listingId: 9 }), 'paper')).toBe('/strategies/4/listings/9?mode=paper');
    expect(attentionLink(item({ strategyId: 4, listingId: 9, kind: 'LISTING_HALT' }), 'live')).toBe('/strategies/4?mode=live&tab=risk');
    expect(attentionLink(item({ strategyId: 4, kind: 'STRATEGY_HALT' }), 'live')).toBe('/strategies/4?mode=live&tab=risk');
    expect(attentionLink(item({ kind: 'GLOBAL_HALT' }), 'live')).toBe('/risk/policies');
  });

  it('sends a venue-wide halt to the treasury page and a strategy halted on a venue to its risk tab', () => {
    expect(attentionLink(item({ kind: 'EXCHANGE_HALT', exchangeId: 3 }), 'live')).toBe('/treasury');
    expect(attentionLink(item({ kind: 'STRATEGY_EXCHANGE_HALT', strategyId: 4, exchangeId: 3 }), 'live'))
      .toBe('/strategies/4?mode=live&tab=risk');
  });

  it("sends an account's own problems to that account on the treasury page, even when they name a listing", () => {
    for (const kind of ['RECON_STALE', 'BALANCE_LOW', 'SHARD_BALANCE_LOW', 'ALLOCATION_EXCEEDS_BALANCE', 'ACCOUNT_DUE_FOR_ROTATION', 'ACCOUNT_READY_TO_RETIRE']) {
      expect(attentionLink(item({ kind, accountId: 7, exchangeId: 3 }), 'live')).toBe('/treasury?account=7');
    }
    expect(attentionLink(item({ kind: 'RECON_MISMATCH', accountId: 7, listingId: 9 }), 'live')).toBe('/treasury?account=7');
  });

  it("keeps a strategy's position on an account at that position", () => {
    expect(attentionLink(item({ kind: 'DRAINING_EXPOSURE', strategyId: 4, listingId: 9, accountId: 7 }), 'live'))
      .toBe('/strategies/4/listings/9?mode=live');
    expect(attentionLink(item({ strategyId: 4, listingId: 9, accountId: 7 }), 'live')).toBe('/strategies/4/listings/9?mode=live');
  });
});
