import { describe, expect, it } from 'vitest';
import { attentionLink } from './attention';
import { AttentionItem } from '../types';

const item = (fields: Partial<AttentionItem>): AttentionItem => ({
  severity: 'warning', kind: 'NEEDS_REVIEW', title: '', detail: null, strategyId: null, strategyName: null,
  sessionId: null, listingId: null, symbol: null, since: null, ...fields,
});

describe('where an attention item is dealt with', () => {
  it('is its session, else its strategy on the tab it concerns, else the risk page', () => {
    expect(attentionLink(item({ sessionId: 's1', strategyId: 4, kind: 'SILENT' }), 'live')).toBe('/sessions/s1');
    expect(attentionLink(item({ strategyId: 4, listingId: 9 }), 'paper')).toBe('/strategies/4/listings/9?mode=paper');
    expect(attentionLink(item({ strategyId: 4, listingId: 9, kind: 'LISTING_HALT' }), 'live')).toBe('/strategies/4?mode=live&tab=risk');
    expect(attentionLink(item({ strategyId: 4, kind: 'STRATEGY_HALT' }), 'live')).toBe('/strategies/4?mode=live&tab=risk');
    expect(attentionLink(item({ kind: 'GLOBAL_HALT' }), 'live')).toBe('/risk/policies');
  });
});
