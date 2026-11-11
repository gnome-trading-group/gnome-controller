import { RiskPolicy } from '../types';
import { SessionVenueAccount, StrategySession } from '../types/strategy-sessions';
import { configuredListings, isActiveSessionStatus } from './policy-target';

const KILL_SWITCH = 'KILL_SWITCH';

// How wide a kill reaches. The order is widest first, which is how covering kills are listed.
export type KillScope = 'GLOBAL' | 'EXCHANGE' | 'ACCOUNT' | 'STRATEGY' | 'STRATEGY_EXCHANGE' | 'SESSION' | 'LISTING';

const SCOPE_ORDER: KillScope[] = ['GLOBAL', 'EXCHANGE', 'ACCOUNT', 'STRATEGY', 'STRATEGY_EXCHANGE', 'SESSION', 'LISTING'];

export interface CoveringKill {
  policy: RiskPolicy;
  scope: KillScope;
  // Worded as the registry's halt findings are, so the page, the attention list and the alert say the same thing.
  title: string;
  // A listing kill stops only that market; every other scope stops the session outright.
  wholeSession: boolean;
}

export type ExchangeName = (exchangeId: number) => string | undefined;

type CoveredSession = Pick<StrategySession, 'sessionId' | 'strategyId' | 'mode' | 'status' | 'config'
  | 'exchangeIds' | 'venueAccounts'>;

function exchangeLabel(exchangeId: number, exchangeName: ExchangeName, accounts: SessionVenueAccount[]): string {
  return exchangeName(exchangeId) ?? accounts.find((a) => a.exchangeId === exchangeId)?.exchangeCode
    ?? `exchange ${exchangeId}`;
}

function scopeOf(policy: RiskPolicy, session: CoveredSession): KillScope | null {
  const accounts = session.venueAccounts ?? [];
  const exchanges = session.exchangeIds ?? [];
  const listings = configuredListings([session as StrategySession]);
  if (policy.accountId != null) {
    return session.mode === 'live' && accounts.some((a) => a.accountId === policy.accountId) ? 'ACCOUNT' : null;
  }
  if (policy.listingId != null && !listings.has(policy.listingId)) return null;
  if (policy.exchangeId != null && !exchanges.includes(policy.exchangeId)) return null;
  if (policy.sessionId != null) {
    if (policy.sessionId !== session.sessionId) return null;
    return policy.listingId != null ? 'LISTING' : 'SESSION';
  }
  if (policy.strategyId != null) {
    if (policy.strategyId !== session.strategyId) return null;
    if (policy.listingId != null) return 'LISTING';
    return policy.exchangeId != null ? 'STRATEGY_EXCHANGE' : 'STRATEGY';
  }
  if (policy.listingId != null) return 'LISTING';
  return policy.exchangeId != null ? 'EXCHANGE' : 'GLOBAL';
}

export function killTitle(scope: KillScope, policy: RiskPolicy, exchangeName: ExchangeName,
  accounts: SessionVenueAccount[] = [], accountLabel?: string): string {
  const exchange = () => exchangeLabel(policy.exchangeId as number, exchangeName, accounts);
  switch (scope) {
    case 'GLOBAL': return 'All trading is halted';
    case 'EXCHANGE': return `All trading on ${exchange()} is halted`;
    case 'ACCOUNT': return `All trading on account ${accountLabel
      ?? accounts.find((a) => a.accountId === policy.accountId)?.label ?? policy.accountId} is halted`;
    case 'STRATEGY_EXCHANGE': return `Strategy halted on ${exchange()}`;
    case 'STRATEGY': return 'Strategy killed';
    case 'SESSION': return 'Session killed';
    case 'LISTING': return 'Listing halted';
  }
}

/**
 * Every enabled kill switch that stops this session, widest first. Only a session that can still trade is covered:
 * an ended or stopping one has nothing left to stop. An account kill covers only a live session bound to that
 * account, since only the order gateway enforces it.
 */
export function killsCoveringSession(
  policies: RiskPolicy[], session: CoveredSession, exchangeName: ExchangeName,
): CoveringKill[] {
  if (!isActiveSessionStatus(session.status)) return [];
  const kills: CoveringKill[] = [];
  for (const policy of policies) {
    if (policy.policyType !== KILL_SWITCH || !policy.enabled) continue;
    const scope = scopeOf(policy, session);
    if (scope === null) continue;
    kills.push({
      policy, scope, wholeSession: scope !== 'LISTING',
      title: killTitle(scope, policy, exchangeName, session.venueAccounts ?? []),
    });
  }
  return kills.sort((a, b) => SCOPE_ORDER.indexOf(a.scope) - SCOPE_ORDER.indexOf(b.scope)
    || a.policy.policyId - b.policy.policyId);
}

export interface StrategyKill extends CoveringKill {
  // How many of the strategy's running sessions it stops; null for one that applies to the strategy as a whole.
  sessionsAffected: number | null;
}

/**
 * The kills that stop the strategy beyond its own kill switch and its listing kills (which the strategy page shows
 * already): a global kill, the strategy halted on an exchange, and exchange and account kills that stop any of its
 * running sessions.
 */
export function killsBeyondStrategy(
  policies: RiskPolicy[], strategyId: number, sessions: CoveredSession[], exchangeName: ExchangeName,
): StrategyKill[] {
  const byPolicy = new Map<number, StrategyKill>();
  for (const policy of policies) {
    if (policy.policyType !== KILL_SWITCH || !policy.enabled) continue;
    const ids = policy.sessionId == null && policy.listingId == null && policy.accountId == null;
    if (ids && policy.strategyId == null && policy.exchangeId == null) {
      byPolicy.set(policy.policyId, { policy, scope: 'GLOBAL', wholeSession: true, sessionsAffected: null,
        title: killTitle('GLOBAL', policy, exchangeName) });
    } else if (ids && policy.strategyId === strategyId && policy.exchangeId != null) {
      byPolicy.set(policy.policyId, { policy, scope: 'STRATEGY_EXCHANGE', wholeSession: true, sessionsAffected: null,
        title: killTitle('STRATEGY_EXCHANGE', policy, exchangeName) });
    }
  }
  for (const session of sessions) {
    if (session.strategyId !== strategyId) continue;
    for (const kill of killsCoveringSession(policies, session, exchangeName)) {
      if (kill.scope !== 'EXCHANGE' && kill.scope !== 'ACCOUNT') continue;
      const seen = byPolicy.get(kill.policy.policyId);
      byPolicy.set(kill.policy.policyId, { ...kill, sessionsAffected: (seen?.sessionsAffected ?? 0) + 1 });
    }
  }
  return [...byPolicy.values()].sort((a, b) => SCOPE_ORDER.indexOf(a.scope) - SCOPE_ORDER.indexOf(b.scope)
    || a.policy.policyId - b.policy.policyId);
}
