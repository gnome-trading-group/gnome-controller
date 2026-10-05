import { RiskPolicy, RiskPolicyHistory } from '../types';
import { registryApi } from './api';

export const KILL_SWITCH_TYPE = 'KILL_SWITCH';

// A policy applies to exactly the ids it carries: none is global, a strategy covers every session of it, a listing
// covers every strategy on it, a session narrows a strategy to one running instance.
export interface KillSwitchTarget {
  sessionId?: string;
  strategyId?: number;
  listingId?: number;
}

export const GLOBAL_TARGET: KillSwitchTarget = {};

// The registry fills in a session row's strategy, so a session target leaves the strategy out; its listing still
// separates a kill of the whole session from a kill of the session on one listing.
export function isKillSwitch(policy: RiskPolicy, target: KillSwitchTarget): boolean {
  if (policy.policyType !== KILL_SWITCH_TYPE) return false;
  if ((policy.sessionId ?? undefined) !== target.sessionId) return false;
  if ((policy.listingId ?? undefined) !== target.listingId) return false;
  return target.sessionId != null || (policy.strategyId ?? undefined) === target.strategyId;
}

// Enabled kills that stop their strategy or session on one listing only.
export function listingKills(policies: RiskPolicy[]): RiskPolicy[] {
  return policies.filter((p) => p.policyType === KILL_SWITCH_TYPE && p.enabled && p.listingId != null
    && (p.strategyId != null || p.sessionId != null));
}

export function findKillSwitch(policies: RiskPolicy[], target: KillSwitchTarget): RiskPolicy | undefined {
  return policies.find((p) => isKillSwitch(p, target));
}

// The kill-switch row may not exist yet for a target, so the first kill creates it.
export async function setKillSwitch(
  existing: RiskPolicy | undefined,
  target: KillSwitchTarget,
  enabled: boolean,
  reason?: string,
): Promise<void> {
  if (existing) {
    await registryApi.updateRiskPolicy(existing.policyId, { enabled, reason });
    return;
  }
  if (!enabled) return;
  await registryApi.createRiskPolicy({
    policyType: KILL_SWITCH_TYPE,
    sessionId: target.sessionId,
    strategyId: target.strategyId,
    listingId: target.listingId,
    parameters: {},
    enabled: true,
    reason,
  });
}

export const OMS_ACTOR = 'oms';

export function formatActor(actor: string | null): string {
  if (!actor) return 'unknown';
  return actor === OMS_ACTOR ? 'OMS (risk limit)' : actor;
}

export function describeHistoryAction(entry: RiskPolicyHistory): string {
  if (entry.action === 'INSERT') return entry.newEnabled ? 'Created (enabled)' : 'Created (disabled)';
  if (entry.action === 'DELETE') return 'Deleted';
  if (entry.oldEnabled !== entry.newEnabled) return entry.newEnabled ? 'Enabled' : 'Disabled';
  return 'Parameters updated';
}

export function errorMessage(e: unknown, fallback: string): string {
  return e instanceof Error ? e.message : fallback;
}
