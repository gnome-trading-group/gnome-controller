import { Badge, Stack, Text, Tooltip } from '@mantine/core';
import { RiskPolicy } from '../../types';
import { StrategySession } from '../../types/strategy-sessions';
import { ExchangeName, killsCoveringSession } from '../../utils/kill-coverage';

// Beside a session's status in a list: red when a kill stops it outright, orange when only some of its listings are
// halted, nothing otherwise. The tooltip names each kill as its alert does.
export function SessionKillBadge({ session, policies, exchangeName, size = 'sm' }: {
  session: StrategySession;
  policies: RiskPolicy[] | undefined;
  exchangeName: ExchangeName;
  size?: 'xs' | 'sm';
}) {
  if (!policies) return null;
  const kills = killsCoveringSession(policies, session, exchangeName);
  if (kills.length === 0) return null;
  const halted = kills.some((k) => k.wholeSession);
  return (
    <Tooltip
      withArrow
      multiline
      label={<Stack gap={2}>{kills.map((k) => <Text key={k.policy.policyId} size="xs">{k.title}</Text>)}</Stack>}
    >
      <Badge size={size} variant="light" color={halted ? 'red' : 'orange'}>
        {halted ? 'Halted' : 'Listing halted'}
      </Badge>
    </Tooltip>
  );
}
