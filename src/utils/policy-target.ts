import { RiskPolicy } from '../types';
import { StrategySession, StrategySessionStatus } from '../types/strategy-sessions';

const ACTIVE_SESSION_STATUSES = new Set<StrategySessionStatus>([
  StrategySessionStatus.SUBMITTED,
  StrategySessionStatus.STARTING,
  StrategySessionStatus.RUNNING,
]);

export function isActiveSessionStatus(status: StrategySessionStatus): boolean {
  return ACTIVE_SESSION_STATUSES.has(status);
}

// Names what a policy applies to, from exactly the ids it carries.
export function targetPageLink(policy: Pick<RiskPolicy, 'sessionId' | 'strategyId' | 'listingId'>): string {
  if (policy.sessionId != null) return `/sessions/${policy.sessionId}`;
  if (policy.strategyId != null) return `/strategies/${policy.strategyId}`;
  if (policy.listingId != null) return `/security-master/listings/${policy.listingId}`;
  return '/risk/policies';
}

export function describeTarget(
  policy: Pick<RiskPolicy, 'sessionId' | 'strategyId' | 'listingId'>,
  strategyName?: (strategyId: number) => string | undefined,
  listingLabel?: (listingId: number) => string | undefined,
): string {
  const strategy = policy.strategyId != null
    ? (strategyName?.(policy.strategyId) ?? `Strategy ${policy.strategyId}`)
    : undefined;
  const listing = policy.listingId != null
    ? (listingLabel?.(policy.listingId) ?? `Listing ${policy.listingId}`)
    : undefined;
  const subject = policy.sessionId != null ? `Session ${policy.sessionId}` : strategy;
  if (subject && listing) return `${subject} on ${listing}`;
  if (subject) return subject;
  if (listing) return `${listing} (all strategies)`;
  return 'Global';
}


// Every Stop leaves a kill row for its session; once the session has ended that row can never apply again.
export function withoutEndedSessions(policies: RiskPolicy[], sessions: StrategySession[]): RiskPolicy[] {
  const active = new Set(sessions.filter((s) => isActiveSessionStatus(s.status)).map((s) => s.sessionId));
  return policies.filter((p) => p.sessionId == null || active.has(p.sessionId));
}

export interface PolicyLevel {
  label: 'Global' | 'Listing' | 'Strategy' | 'Session';
  color: string;
}

// How wide a policy reaches, read from the ids it carries.
export function policyLevel(policy: Pick<RiskPolicy, 'sessionId' | 'strategyId' | 'listingId'>): PolicyLevel {
  if (policy.sessionId != null) return { label: 'Session', color: 'violet' };
  if (policy.strategyId != null) return { label: 'Strategy', color: 'blue' };
  if (policy.listingId != null) return { label: 'Listing', color: 'orange' };
  return { label: 'Global', color: 'gray' };
}

// Every policy that can restrict this strategy: global and listing-wide rows, its own, and its running sessions'.
// A global kill switch only matters while it's on, so the always-present off row is left out.
export function policiesForStrategy(policies: RiskPolicy[], strategyId: number): RiskPolicy[] {
  return policies.filter((p) =>
    (p.strategyId === strategyId || (p.strategyId == null && p.sessionId == null)) && !isIdleGlobalKill(p));
}

// Every policy that can restrict this session: global and listing-wide rows, its strategy's, and its own.
export function policiesForSession(policies: RiskPolicy[], sessionId: string, strategyId: number): RiskPolicy[] {
  return policies.filter((p) =>
    (p.sessionId == null ? p.strategyId == null || p.strategyId === strategyId : p.sessionId === sessionId)
    && !isIdleGlobalKill(p));
}

function isIdleGlobalKill(policy: RiskPolicy): boolean {
  return policy.policyType === 'KILL_SWITCH' && !policy.enabled && policy.strategyId == null
    && policy.listingId == null && policy.sessionId == null;
}

// The listings these sessions trade, as recorded in their launch config.
export function configuredListings(sessions: StrategySession[]): Set<number> {
  const listings = new Set<number>();
  for (const session of sessions) {
    const configured = session.config?.listings;
    if (!Array.isArray(configured)) continue;
    for (const id of configured) {
      const listingId = Number(id);
      if (Number.isInteger(listingId)) listings.add(listingId);
    }
  }
  return listings;
}

// A listing-wide policy (every strategy on one listing) only matters here if that listing is traded. Display only:
// the OMS still applies every row.
export function isUnrelatedListingPolicy(policy: RiskPolicy, tradedListings: Set<number>): boolean {
  return policy.sessionId == null && policy.strategyId == null && policy.listingId != null
    && !tradedListings.has(policy.listingId);
}
