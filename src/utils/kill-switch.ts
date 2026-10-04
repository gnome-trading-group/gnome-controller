import { RiskPolicy, RiskPolicyHistory } from '../types';
import { registryApi } from './api';

export const KILL_SWITCH_TYPE = 'KILL_SWITCH';

export const RiskScope = {
  GLOBAL: 0,
  STRATEGY: 1,
  LISTING: 2,
} as const;

export type KillSwitchTarget =
  | { scope: typeof RiskScope.GLOBAL }
  | { scope: typeof RiskScope.STRATEGY; strategyId: number }
  | { scope: typeof RiskScope.LISTING; listingId: number };

export function isKillSwitch(policy: RiskPolicy, target: KillSwitchTarget): boolean {
  if (policy.policyType !== KILL_SWITCH_TYPE || policy.scope !== target.scope) return false;
  if (target.scope === RiskScope.STRATEGY) return policy.strategyId === target.strategyId;
  if (target.scope === RiskScope.LISTING) return policy.listingId === target.listingId;
  return true;
}

export function findKillSwitch(policies: RiskPolicy[], target: KillSwitchTarget): RiskPolicy | undefined {
  return policies.find((p) => isKillSwitch(p, target));
}

// The kill-switch row may not exist yet for a strategy/listing, so the first kill creates it.
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
    scope: target.scope,
    strategyId: target.scope === RiskScope.STRATEGY ? target.strategyId : undefined,
    listingId: target.scope === RiskScope.LISTING ? target.listingId : undefined,
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
