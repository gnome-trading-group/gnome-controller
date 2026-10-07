import { useEffect, useState } from 'react';
import { Box, Divider, Group, HoverCard, Stack, Text } from '@mantine/core';
import { isActiveSession, SessionHealth, StrategySession } from '../../types';
import { formatDuration } from '../../utils/format';
import { healthProblems, HealthProblem } from '../../utils/health';

// Whether a running session is alive, from the heartbeat its process sends every few seconds whatever the market is
// doing. A quiet market reads as quiet, not dead: a listing whose price hasn't moved is information, not a fault.
const AMBER_AFTER_MS = 15_000;
const RED_AFTER_MS = 60_000;
const TICK_MS = 1_000;
function useNow(): number {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), TICK_MS);
    return () => clearInterval(id);
  }, []);
  return now;
}

export function Heartbeat({ session }: { session: StrategySession }) {
  const now = useNow();
  if (!isActiveSession(session.status)) return null;
  const at = session.lastHeartbeatAt ? new Date(session.lastHeartbeatAt).getTime() : null;
  const age = at === null ? null : Math.max(0, now - at);
  const problems = healthProblems(session.health);

  let color = 'green';
  let label = `Heard ${formatDuration(age)} ago`;
  if (age === null) {
    color = 'gray';
    label = 'No heartbeat yet';
  } else if (age > RED_AFTER_MS) {
    color = 'red';
    label = `Silent ${formatDuration(age)}`;
  } else if (age > AMBER_AFTER_MS || problems.length > 0) {
    color = 'orange';
    if (problems.length > 0 && age <= AMBER_AFTER_MS) label = `${problems.length} issue${problems.length > 1 ? 's' : ''}`;
  }

  return (
    <HoverCard width={340} withArrow openDelay={150} position="bottom">
      <HoverCard.Target>
        <Group gap={6} wrap="nowrap" style={{ cursor: 'default' }}>
          <Box w={8} h={8} style={{ borderRadius: '50%', background: `var(--mantine-color-${color}-6)` }} />
          <Text span size="sm" c={color === 'green' || color === 'gray' ? 'dimmed' : color}>{label.charAt(0).toLowerCase() + label.slice(1)}</Text>
        </Group>
      </HoverCard.Target>
      <HoverCard.Dropdown>
        <HealthDetail health={session.health} problems={problems} />
      </HoverCard.Dropdown>
    </HoverCard>
  );
}

function Row({ name, value, warn }: { name: string; value: string; warn?: boolean }) {
  return (
    <Group justify="space-between" gap="xs" wrap="nowrap">
      <Text size="xs" truncate>{name}</Text>
      <Text size="xs" c={warn ? 'orange' : 'dimmed'} style={{ whiteSpace: 'nowrap' }}>{value}</Text>
    </Group>
  );
}

function HealthDetail({ health, problems }: { health: SessionHealth | null; problems: HealthProblem[] }) {
  if (!health) {
    return <Text size="xs" c="dimmed">The session hasn't reported yet; it starts once its agents are running.</Text>;
  }
  const flagged = new Set(problems.map(p => p.part));
  return (
    <Stack gap={4}>
      <Text size="xs" fw={600}>Up {formatDuration(health.uptimeMs)}</Text>
      <Divider label="Agents" labelPosition="left" />
      {health.agents.map(agent => (
        <Row
          key={agent.name}
          name={`${agent.name}${agent.hotPath ? ' (hot path)' : ''}`}
          value={agent.exited ? 'exited' : agent.stalledMs < 2_000 ? 'running' : `idle ${formatDuration(agent.stalledMs)}`}
          warn={flagged.has(agent.name)}
        />
      ))}
      {health.gateways.length > 0 && <Divider label="Gateways" labelPosition="left" />}
      {health.gateways.map(gateway => (
        <Row key={gateway.name} name={gateway.name} value={gateway.reconnecting ? 'reconnecting' : 'connected'} warn={gateway.reconnecting} />
      ))}
      {health.ledger && (
        <>
          <Divider label="Ledger" labelPosition="left" />
          <Row
            name="Last stored write"
            value={health.ledger.lastAcceptedAgoMs === null ? 'none yet' : `${formatDuration(health.ledger.lastAcceptedAgoMs)} ago`}
          />
          {health.ledger.consecutiveFailures > 0 && (
            <Row name="Failed writes" value={String(health.ledger.consecutiveFailures)} warn />
          )}
          {health.ledger.fenced && <Row name="Fenced" value="writes refused" warn />}
        </>
      )}
      <Divider label="Prices (quiet is normal)" labelPosition="left" />
      {health.listings.map(listing => (
        <Row key={listing.listingId} name={`Listing ${listing.listingId}`} value={`unchanged ${formatDuration(listing.priceUnchangedMs)}`} />
      ))}
    </Stack>
  );
}
