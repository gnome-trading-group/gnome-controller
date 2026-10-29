import { useEffect, useState } from 'react';
import { Box, Divider, Group, HoverCard, ScrollArea, Stack, Text } from '@mantine/core';
import { isActiveSession, SessionHealth, StrategySession } from '../../types';
import { formatDuration } from '../../utils/format';
import { formatPermille, healthProblems, HealthProblem } from '../../utils/health';
import { formatBytes } from '../../utils/system';

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
      <ScrollArea.Autosize mah="min(60vh, 480px)" type="auto" offsetScrollbars>
        <Stack gap={4}>
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
          {health.host && <HostDetail host={health.host} flagged={flagged} />}
          {health.journal !== undefined && (
            <>
              <Divider label="Journal" labelPosition="left" />
              {health.journal === null ? (
                <Row name="Journal" value="off" />
              ) : (
                <Row
                  name="Waiting to ship"
                  value={health.journal.pendingSegments === 0
                    ? 'none'
                    : `${health.journal.pendingSegments}, oldest ${formatDuration(health.journal.oldestPendingMs)}`}
                  warn={flagged.has('Journal')}
                />
              )}
            </>
          )}
          <PricesSummary listings={health.listings} />
        </Stack>
      </ScrollArea.Autosize>
    </Stack>
  );
}

// One row, not one per listing: a quiet price is normal, so per-listing rows only made the card long.
function PricesSummary({ listings }: { listings: SessionHealth['listings'] }) {
  if (listings.length === 0) return null;
  const bad = listings.filter(l => (l.marketDataBadMs ?? 0) > 0);
  const quietest = listings.reduce((a, b) => (b.priceUnchangedMs > a.priceUnchangedMs ? b : a));
  return (
    <>
      <Divider label="Prices (quiet is normal)" labelPosition="left" />
      <Row
        name={`${listings.length} listing${listings.length > 1 ? 's' : ''}`}
        value={`longest unchanged ${formatDuration(quietest.priceUnchangedMs)} (${quietest.listingId})`}
      />
      {bad.map(l => (
        <Row key={l.listingId} name={`Listing ${l.listingId}`} value={`book bad data ${formatDuration(l.marketDataBadMs!)} (orders refused)`} warn />
      ))}
    </>
  );
}

// -1 is a reading the host couldn't give: no /proc off Linux, or no CPU share before the second heartbeat.
function bytesOrNa(bytes: number): string {
  return bytes < 0 ? 'n/a' : formatBytes(bytes);
}

function HostDetail({ host, flagged }: { host: NonNullable<SessionHealth['host']>; flagged: Set<string> }) {
  const steal = host.cpuStealPermille > 0 ? `, ${formatPermille(host.cpuStealPermille)} stolen` : '';
  return (
    <>
      <Divider label="Host" labelPosition="left" />
      <Row name="CPU" value={`${formatPermille(host.cpuBusyPermille)} busy${steal}`} warn={flagged.has('CPU')} />
      <Row
        name="Memory available"
        value={host.memTotalBytes < 0 ? 'n/a' : `${bytesOrNa(host.memAvailableBytes)} of ${bytesOrNa(host.memTotalBytes)}`}
        warn={flagged.has('Memory')}
      />
      <Row name="Process memory (RSS)" value={bytesOrNa(host.processRssBytes)} />
      <Row name="JVM heap" value={`${formatBytes(host.heapUsedBytes)} of ${formatBytes(host.heapMaxBytes)}`} />
      <Row name="Disk free" value={bytesOrNa(host.diskFreeBytes)} warn={flagged.has('Disk')} />
    </>
  );
}
