import { describe, expect, it } from 'vitest';
import { killsBeyondStrategy, killsCoveringSession } from './kill-coverage';
import { RiskPolicy } from '../types';
import { StrategySession, StrategySessionStatus } from '../types/strategy-sessions';

let nextId = 1;
const kill = (fields: Partial<RiskPolicy>): RiskPolicy => ({
  policyId: nextId++, policyType: 'KILL_SWITCH', sessionId: null, strategyId: null, exchangeId: null,
  listingId: null, accountId: null, parameters: {}, enabled: true, dateCreated: '', dateModified: '', ...fields,
});

const KALSHI = 5;
const PM_US = 6;
const exchangeName = (id: number) => (id === KALSHI ? 'Kalshi' : undefined);

const session = (fields: Partial<StrategySession> = {}): StrategySession => ({
  sessionId: 's1', strategyId: 4, status: StrategySessionStatus.RUNNING, mode: 'live',
  config: { listings: [2676421] }, exchangeIds: [KALSHI],
  venueAccounts: [{ exchangeId: KALSHI, exchangeCode: 'KALSHI', accountId: 1, label: 'steady-heron-01' }],
  ...fields,
} as StrategySession);

const titles = (policies: RiskPolicy[], s = session()) =>
  killsCoveringSession(policies, s, exchangeName).map((k) => k.title);

describe('which kills stop a session', () => {
  it('names a kill at every scope that covers it, widest first', () => {
    expect(titles([
      kill({ sessionId: 's1', strategyId: 4 }),
      kill({ strategyId: 4, listingId: 2676421 }),
      kill({ strategyId: 4, exchangeId: KALSHI }),
      kill({ strategyId: 4 }),
      kill({ accountId: 1 }),
      kill({ exchangeId: KALSHI }),
      kill({}),
    ])).toEqual([
      'All trading is halted',
      'All trading on Kalshi is halted',
      'All trading on account steady-heron-01 is halted',
      'Strategy killed',
      'Strategy halted on Kalshi',
      'Session killed',
      'Listing halted',
    ]);
  });

  it('leaves out kills on what it does not trade', () => {
    expect(titles([
      kill({ sessionId: 'other', strategyId: 4 }),
      kill({ strategyId: 7 }),
      kill({ strategyId: 4, exchangeId: PM_US }),
      kill({ exchangeId: PM_US }),
      kill({ accountId: 2 }),
      kill({ strategyId: 4, listingId: 999 }),
      kill({ listingId: 999 }),
    ])).toEqual([]);
  });

  it('counts only enabled kill switches', () => {
    expect(titles([kill({ enabled: false }), kill({ policyType: 'MAX_POSITION', strategyId: 4 })])).toEqual([]);
  });

  it('keeps an account kill to live sessions, since only the order gateway enforces it', () => {
    expect(titles([kill({ accountId: 1 })], session({ mode: 'paper', venueAccounts: [] }))).toEqual([]);
  });

  it('covers nothing once the session has stopped or is stopping', () => {
    for (const status of [StrategySessionStatus.STOPPING, StrategySessionStatus.STOPPED, StrategySessionStatus.FAILED]) {
      expect(titles([kill({})], session({ status }))).toEqual([]);
    }
  });

  it('marks a listing kill as stopping only that market', () => {
    const [listing, global] = killsCoveringSession(
      [kill({ listingId: 2676421 }), kill({})], session(), exchangeName).reverse();
    expect(listing).toMatchObject({ scope: 'LISTING', wholeSession: false, title: 'Listing halted' });
    expect(global).toMatchObject({ scope: 'GLOBAL', wholeSession: true });
  });

  it('falls back to the venue code when the exchange name has not loaded', () => {
    expect(titles([kill({ exchangeId: KALSHI })], session()).length).toBe(1);
    expect(killsCoveringSession([kill({ exchangeId: KALSHI })], session(), () => undefined)[0].title)
      .toBe('All trading on KALSHI is halted');
  });

  it('reads a registry without exchanges or accounts as none', () => {
    expect(titles([kill({ exchangeId: KALSHI }), kill({ accountId: 1 }), kill({})],
      session({ exchangeIds: undefined, venueAccounts: undefined }))).toEqual(['All trading is halted']);
  });
});

describe('which kills stop a strategy beyond its own', () => {
  const sessions = [
    session(),
    session({ sessionId: 's2' }),
    session({ sessionId: 's3', status: StrategySessionStatus.STOPPED }),
  ];

  it('counts the running sessions an account or exchange kill stops', () => {
    const kills = killsBeyondStrategy([kill({ accountId: 1 }), kill({ exchangeId: KALSHI })], 4, sessions, exchangeName);
    expect(kills.map((k) => [k.title, k.sessionsAffected])).toEqual([
      ['All trading on Kalshi is halted', 2],
      ['All trading on account steady-heron-01 is halted', 2],
    ]);
  });

  it('shows a global kill and its own exchange halt even with nothing running', () => {
    const kills = killsBeyondStrategy([kill({}), kill({ strategyId: 4, exchangeId: KALSHI })], 4, [], exchangeName);
    expect(kills.map((k) => [k.title, k.sessionsAffected])).toEqual([
      ['All trading is halted', null],
      ['Strategy halted on Kalshi', null],
    ]);
  });

  it('leaves its own kill, its listing kills and other strategies to the rest of the page', () => {
    expect(killsBeyondStrategy([
      kill({ strategyId: 4 }),
      kill({ strategyId: 4, listingId: 2676421 }),
      kill({ sessionId: 's1', strategyId: 4 }),
      kill({ strategyId: 7, exchangeId: KALSHI }),
      kill({ accountId: 2 }),
    ], 4, sessions, exchangeName)).toEqual([]);
  });
});
