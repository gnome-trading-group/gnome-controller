import { useEffect, useState } from 'react';
import { RiskPolicy, RiskPolicyHistory } from '../types';
import { registryApi } from '../utils/api';

// Keyed on enabled/dateModified so the entry refreshes whenever the polled policy row changes.
export function useLatestPolicyHistory(policy: RiskPolicy | undefined): RiskPolicyHistory | null {
  const [latest, setLatest] = useState<RiskPolicyHistory | null>(null);
  const policyId = policy?.policyId;
  const enabled = policy?.enabled;
  const dateModified = policy?.dateModified;

  useEffect(() => {
    if (policyId === undefined) {
      setLatest(null);
      return;
    }
    let cancelled = false;
    registryApi.listRiskPolicyHistory(policyId)
      .then((rows) => { if (!cancelled) setLatest(rows[0] ?? null); })
      .catch((e) => { if (!cancelled) { console.error('Failed to load policy history:', e); setLatest(null); } });
    return () => { cancelled = true; };
  }, [policyId, enabled, dateModified]);

  return latest;
}
