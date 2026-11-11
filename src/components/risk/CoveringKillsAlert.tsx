import { useState } from 'react';
import { Alert, Anchor, Button, Divider, Group, Stack, Text } from '@mantine/core';
import { IconAlertTriangle, IconHistory } from '@tabler/icons-react';
import { Link } from 'react-router-dom';
import { RiskPolicy } from '../../types';
import { CoveringKill, KillScope, StrategyKill } from '../../utils/kill-coverage';
import { targetPageLink } from '../../utils/policy-target';
import { useLatestPolicyHistory } from '../../hooks/useLatestPolicyHistory';
import { KillSwitchLatestEntry } from '../KillSwitchLatestEntry';
import { RiskPolicyHistoryModal } from '../RiskPolicyHistoryModal';

type Subject = 'session' | 'strategy';

function effect(scope: KillScope, subject: Subject, sessionsAffected: number | null): string {
  const running = sessionsAffected != null
    ? ` ${sessionsAffected} running session${sessionsAffected === 1 ? '' : 's'} of this strategy ${sessionsAffected === 1 ? 'is' : 'are'} affected.`
    : '';
  switch (scope) {
    case 'GLOBAL':
      return `Every session, including ${subject === 'session' ? 'this one' : "this strategy's"}, is blocked from sending orders.`;
    case 'EXCHANGE':
      return `Every session is blocked from sending orders on this exchange, and its open orders there were cancelled.${running}`;
    case 'ACCOUNT':
      return `The order gateway refuses every order on this account, whichever strategy's, and cancelled the ones working there.${running}`;
    case 'STRATEGY_EXCHANGE':
      return subject === 'session'
        ? 'Every session of the strategy, including this one, is blocked from sending orders on this exchange.'
        : "This strategy's sessions are blocked from sending orders on this exchange, and its open orders there were cancelled.";
    case 'STRATEGY':
      return 'The strategy is killed, so every session of it, including this one, is blocked from sending orders.';
    case 'SESSION':
      return 'This session cannot send orders and its open orders have been cancelled. Other sessions of the strategy are unaffected.';
    case 'LISTING':
      return 'Orders on this listing are refused and its open orders were cancelled.';
  }
}

function releasedOn(scope: KillScope, policy: RiskPolicy): { label: string; to: string } | null {
  if (scope === 'SESSION' || scope === 'STRATEGY') return null;
  const to = targetPageLink(policy);
  if (to === '/treasury') return { label: 'Treasury', to };
  if (to === '/risk/policies') return { label: 'Risk policies', to };
  return scope === 'STRATEGY_EXCHANGE' ? { label: 'Strategy', to } : null;
}

function KillLine({ kill, subject, onHistory, showTitle }: {
  kill: CoveringKill | StrategyKill;
  subject: Subject;
  onHistory: (policy: RiskPolicy) => void;
  showTitle: boolean;
}) {
  const latest = useLatestPolicyHistory(kill.policy);
  const sessionsAffected = 'sessionsAffected' in kill ? kill.sessionsAffected : null;
  const release = subject === 'strategy' && kill.scope === 'STRATEGY_EXCHANGE' ? null : releasedOn(kill.scope, kill.policy);
  return (
    <Group justify="space-between" align="center" wrap="nowrap">
      <Stack gap={4}>
        {showTitle && <Text size="sm" fw={600}>{kill.title}</Text>}
        <Text size="sm">
          {effect(kill.scope, subject, sessionsAffected)}
          {release && (
            <>
              {' '}Released on{' '}
              <Anchor component={Link} to={release.to} size="sm">{release.label}</Anchor>.
            </>
          )}
        </Text>
        <KillSwitchLatestEntry entry={latest} enabled />
      </Stack>
      <Button variant="outline" size="sm" leftSection={<IconHistory size={16} />} onClick={() => onHistory(kill.policy)}>
        History
      </Button>
    </Group>
  );
}

// The red banner for every kill that stops a session or strategy outright, in the strategy page's kill style: the
// widest kill titles it, and with several each gets its own line.
export function CoveringKillsAlert({ kills, subject }: { kills: (CoveringKill | StrategyKill)[]; subject: Subject }) {
  const [history, setHistory] = useState<RiskPolicy | null>(null);
  if (kills.length === 0) return null;
  const title = kills.length === 1 ? kills[0].title : `${kills[0].title} (+${kills.length - 1} more)`;
  return (
    <>
      <Alert mb="md" color="red" title={title} icon={<IconAlertTriangle size={20} />}>
        <Stack gap="sm">
          {kills.map((kill, i) => (
            <Stack key={kill.policy.policyId} gap="sm">
              {i > 0 && <Divider color="red.2" />}
              <KillLine kill={kill} subject={subject} onHistory={setHistory} showTitle={kills.length > 1} />
            </Stack>
          ))}
        </Stack>
      </Alert>
      <RiskPolicyHistoryModal policy={history} onClose={() => setHistory(null)} />
    </>
  );
}
