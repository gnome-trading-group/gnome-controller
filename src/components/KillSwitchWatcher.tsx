import { useCallback, useEffect, useRef, useState } from 'react';
import { Anchor, Notification, Stack, Text } from '@mantine/core';
import { IconAlertTriangle } from '@tabler/icons-react';
import { Link } from 'react-router-dom';
import { fetchAuthSession } from 'aws-amplify/auth';
import { RiskPolicy, RiskPolicyHistory } from '../types';
import { registryApi } from '../utils/api';
import { formatActor, KILL_SWITCH_TYPE } from '../utils/kill-switch';
import { ACTIVE_SESSION_STATUSES } from '../types/strategy-sessions';
import { describeTarget, targetPageLink, withoutEndedSessions } from '../utils/policy-target';

const POLL_INTERVAL_MS = 15000;
// Written by the session-stop flow (gnome-registry strategy-session-launcher), which kills the session before
// shutting it down; that's routine, not something to alert on.
const SESSION_STOP_REASON = 'session stop';

interface KillAlert {
  policy: RiskPolicy;
  entry: RiskPolicyHistory | null;
}

// Tells whoever has the controller open that something got halted, typically the OMS tripping a kill on a risk breach.
// Only kills that appear while the page is open are reported; the first load just records what was already on.
// TODO: route these through the planned generic alerting system (PagerDuty, Slack, …) so they reach people with no
// controller tab open.
export function KillSwitchWatcher() {
  const [alerts, setAlerts] = useState<KillAlert[]>([]);
  const known = useRef<Set<number> | null>(null);
  const me = useRef<string | null>(null);

  useEffect(() => {
    fetchAuthSession()
      .then((s) => { me.current = s.tokens?.idToken?.payload['email']?.toString() ?? null; })
      .catch(() => {});
  }, []);

  const check = useCallback(async () => {
    let policies: RiskPolicy[];
    try {
      const [allPolicies, activeSessions] = await Promise.all([
        registryApi.listRiskPolicies(),
        registryApi.listSessions({ status: ACTIVE_SESSION_STATUSES.join(',') }),
      ]);
      // Stopped sessions keep their kill switch on forever; only kills that still block something count.
      policies = withoutEndedSessions(allPolicies, activeSessions);
    } catch {
      return;
    }
    const enabledKills = policies.filter((p) => p.policyType === KILL_SWITCH_TYPE && p.enabled);
    const ids = new Set(enabledKills.map((p) => p.policyId));
    const previous = known.current;
    known.current = ids;
    if (previous === null) return;

    const fresh = enabledKills.filter((p) => !previous.has(p.policyId));
    const withEntries = await Promise.all(fresh.map(async (policy) => {
      const entry = await registryApi.listRiskPolicyHistory(policy.policyId).then((rows) => rows[0] ?? null).catch(() => null);
      return { policy, entry };
    }));
    // The person who flipped the switch already knows.
    const relevant = withEntries.filter((a) =>
      !a.entry || (a.entry.actor !== me.current && a.entry.reason !== SESSION_STOP_REASON));
    if (relevant.length > 0) setAlerts((prev) => [...prev, ...relevant]);
  }, []);

  useEffect(() => {
    check();
    const interval = setInterval(check, POLL_INTERVAL_MS);
    return () => clearInterval(interval);
  }, [check]);

  if (alerts.length === 0) return null;

  return (
    <Stack gap="xs" style={{ position: 'fixed', bottom: 16, right: 16, zIndex: 400, width: 360, maxWidth: 'calc(100vw - 32px)' }}>
      {alerts.map(({ policy, entry }) => (
        <Notification
          key={`${policy.policyId}-${entry?.historyId ?? policy.dateModified}`}
          color="red"
          icon={<IconAlertTriangle size={18} />}
          title="Kill switch turned on"
          onClose={() => setAlerts((prev) => prev.filter((a) => a.policy.policyId !== policy.policyId))}
        >
          <Text size="sm">{describeTarget(policy)}</Text>
          {entry && (
            <Text size="xs" c="dimmed">
              by {formatActor(entry.actor)}{entry.reason ? `: ${entry.reason}` : ''}
            </Text>
          )}
          <Anchor component={Link} to={targetPageLink(policy)} size="xs">View</Anchor>
        </Notification>
      ))}
    </Stack>
  );
}
