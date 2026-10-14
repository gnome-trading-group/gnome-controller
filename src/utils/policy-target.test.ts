import { describe, expect, it } from 'vitest';
import {
  describeTarget, isIdleGlobalKill, policiesForSession, policiesForStrategy, policyLevel, targetPageLink,
} from './policy-target';
import { isKillSwitch } from './kill-switch';
import { RiskPolicy } from '../types';

let nextId = 1;
const policy = (fields: Partial<RiskPolicy>): RiskPolicy => ({
  policyId: nextId++, policyType: 'MAX_COMMITTED_CAPITAL', sessionId: null, strategyId: null, exchangeId: null,
  listingId: null, parameters: {}, enabled: true, dateCreated: '', dateModified: '', ...fields,
});

const names = {
  strategy: (id: number) => (id === 4 ? 'momentum' : undefined),
  listing: (id: number) => (id === 9 ? 'KXBTC' : undefined),
  exchange: (id: number) => (id === 3 ? 'Kalshi' : undefined),
};

describe('what a policy applies to', () => {
  it('names an exchange the way it names a listing', () => {
    const describe = (p: RiskPolicy) => describeTarget(p, names.strategy, names.listing, names.exchange);
    expect(describe(policy({ exchangeId: 3 }))).toBe('Kalshi (all strategies)');
    expect(describe(policy({ strategyId: 4, exchangeId: 3 }))).toBe('momentum on Kalshi');
    expect(describe(policy({ sessionId: 's1', strategyId: 4, exchangeId: 3 }))).toBe('Session s1 on Kalshi');
    expect(describe(policy({ strategyId: 4, listingId: 9 }))).toBe('momentum on KXBTC');
    expect(describe(policy({}))).toBe('Global');
    expect(describeTarget(policy({ exchangeId: 5 }))).toBe('Exchange 5 (all strategies)');
  });

  it('reaches as wide as its widest id', () => {
    expect(policyLevel(policy({ exchangeId: 3 })).label).toBe('Exchange');
    expect(policyLevel(policy({ strategyId: 4, exchangeId: 3 })).label).toBe('Strategy');
    expect(policyLevel(policy({ listingId: 9 })).label).toBe('Listing');
    expect(policyLevel(policy({})).label).toBe('Global');
  });

  it('links a venue-wide row to the treasury page', () => {
    expect(targetPageLink(policy({ exchangeId: 3 }))).toBe('/treasury');
    expect(targetPageLink(policy({ strategyId: 4, exchangeId: 3 }))).toBe('/strategies/4');
    expect(targetPageLink(policy({}))).toBe('/risk/policies');
  });
});

describe('which policies restrict a strategy or session', () => {
  const venueBudget = policy({ exchangeId: 3 });
  const ownOnVenue = policy({ strategyId: 4, exchangeId: 3 });
  const othersOnVenue = policy({ strategyId: 5, exchangeId: 3 });
  const idleGlobalKill = policy({ policyType: 'KILL_SWITCH', enabled: false });
  const idleVenueKill = policy({ policyType: 'KILL_SWITCH', enabled: false, exchangeId: 3 });
  const all = [venueBudget, ownOnVenue, othersOnVenue, idleGlobalKill, idleVenueKill];

  it('includes exchange-wide rows and its own exchange rows, never another strategy\'s', () => {
    expect(policiesForStrategy(all, 4)).toEqual([venueBudget, ownOnVenue, idleVenueKill]);
    expect(policiesForSession(all, 's1', 4)).toEqual([venueBudget, ownOnVenue, idleVenueKill]);
  });

  it('only treats the global kill row as idle, not a venue kill that is off', () => {
    expect(isIdleGlobalKill(idleGlobalKill)).toBe(true);
    expect(isIdleGlobalKill(idleVenueKill)).toBe(false);
  });
});

describe('kill switch targets', () => {
  it('tell a venue halt from the global and strategy kills', () => {
    const venueKill = policy({ policyType: 'KILL_SWITCH', exchangeId: 3 });
    const strategyVenueKill = policy({ policyType: 'KILL_SWITCH', strategyId: 4, exchangeId: 3 });
    expect(isKillSwitch(venueKill, {})).toBe(false);
    expect(isKillSwitch(venueKill, { exchangeId: 3 })).toBe(true);
    expect(isKillSwitch(strategyVenueKill, { strategyId: 4 })).toBe(false);
    expect(isKillSwitch(strategyVenueKill, { strategyId: 4, exchangeId: 3 })).toBe(true);
  });
});
