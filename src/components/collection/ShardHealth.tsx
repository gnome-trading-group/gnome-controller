import { useEffect, useState } from 'react';
import { Box, Divider, Group, HoverCard, Stack, Text } from '@mantine/core';
import { ShardTaskStatus } from '../../types/collection';
import { formatDuration } from '../../utils/format';
import { HEALTH_COLORS, processLine, shardHealth } from '../../utils/collection';
import { COLLECTION_POLL } from '../../query/hooks';

const TICK_MS = 1_000;

function useNow(): number {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), TICK_MS);
    return () => clearInterval(id);
  }, []);
  return now;
}

function Row({ name, value, warn }: { name: string; value: string; warn?: boolean }) {
  return (
    <Group justify="space-between" gap="xs" wrap="nowrap">
      <Text size="xs">{name}</Text>
      <Text size="xs" c={warn ? 'orange' : 'dimmed'} style={{ whiteSpace: 'nowrap' }}>{value}</Text>
    </Group>
  );
}

const pct = (permille: number | undefined) => (permille == null || permille < 0 ? '—' : `${(permille / 10).toFixed(1)}%`);
const mb = (value: number | undefined) => (value == null || value < 0 ? '—' : value >= 1024 ? `${(value / 1024).toFixed(1)} GB` : `${value} MB`);

// Whether a shard is alive, from how long ago its newest task wrote its status (every 15 s), with its process line
// (CPU, memory, GC, uploads, scheduling latency) on hover, as a session's heartbeat shows its own.
//
// Judged as of when the status was read (asOfMs), never more than one poll past it: a page back from a background
// tab holds statuses minutes old until its refresh lands, and that is the page being stale, which its live dot shows,
// not the shard. Undefined status means not read yet.
export function ShardHealth({ status, createdAtNs, asOfMs }: {
  status: ShardTaskStatus | null | undefined; createdAtNs: number; asOfMs: number;
}) {
  const now = Math.min(useNow(), asOfMs + COLLECTION_POLL);
  if (status === undefined) {
    return (
      <Group gap={6} wrap="nowrap">
        <Box w={8} h={8} style={{ borderRadius: '50%', background: 'var(--mantine-color-gray-4)' }} />
        <Text span size="sm" c="dimmed">checking</Text>
      </Group>
    );
  }
  const health = shardHealth(status, createdAtNs, now);
  const color = HEALTH_COLORS[health];
  const age = status ? Math.max(0, now - status.writtenAtNs / 1e6) : null;
  const label = age == null ? (health === 'down' ? 'never reported' : 'starting') : `reported ${formatDuration(age)} ago`;
  const p = processLine(status);
  const gc = Object.entries(p.gc ?? {});
  const latency = p.sched_latency;

  return (
    <HoverCard width={300} withArrow openDelay={150} position="bottom" disabled={!status}>
      <HoverCard.Target>
        <Group gap={6} wrap="nowrap" style={{ cursor: status ? 'default' : undefined }}>
          <Box w={8} h={8} style={{ borderRadius: '50%', background: `var(--mantine-color-${color}-6)` }} />
          <Text span size="sm" c={health === 'healthy' || health === 'starting' ? 'dimmed' : color}>{label}</Text>
        </Group>
      </HoverCard.Target>
      <HoverCard.Dropdown>
        {status && (
          <Stack gap={4}>
            <Text size="xs" fw={600}>Task {status.taskId} · {status.version}</Text>
            <Divider label="Host" labelPosition="left" />
            <Row name="CPU busy" value={pct(p.cpu_busy_permille)} warn={(p.cpu_busy_permille ?? 0) > 800} />
            <Row name="CPU steal" value={pct(p.cpu_steal_permille)} warn={(p.cpu_steal_permille ?? 0) > 100} />
            <Row name="Heap" value={`${mb(p.heap_used_mb)} of ${mb(p.heap_max_mb)}`} />
            <Row name="RSS" value={mb(p.rss_mb)} />
            {gc.map(([name, g]) => <Row key={name} name={`GC ${name}`} value={`${g.count} · ${g.ms} ms`} />)}
            <Divider label="Work" labelPosition="left" />
            <Row name="Uploads queued" value={String(p.uploads_queued ?? '—')} warn={(p.uploads_queued ?? 0) > 100} />
            <Row name="Uploads failed" value={String(p.uploads_failed ?? '—')} warn={(p.uploads_failed ?? 0) > 0} />
            <Row name="Probes" value={`${p.probes ?? '—'} (${p.probe_mismatches ?? 0} mismatched)`} />
            {latency && (
              <Row name="Scheduling p99.9 / max"
                value={`${latency.p999_us ?? '—'} / ${latency.max_us ?? '—'} µs`} warn={(latency.over5ms ?? 0) > 0} />
            )}
          </Stack>
        )}
      </HoverCard.Dropdown>
    </HoverCard>
  );
}
