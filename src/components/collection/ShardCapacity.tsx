import { Group, Progress, SimpleGrid, Stack, Text, Tooltip } from '@mantine/core';
import { ShardCaps } from '../../types/collection';
import { ShardUsage } from '../../utils/collection';

// Merges and relief leave shards at most this full, so a shard above it takes nothing more from them.
const FILL_TARGET = 0.8;

function fillColor(fill: number): string {
  if (fill > 1) return 'red';
  if (fill >= FILL_TARGET) return 'yellow';
  return 'teal';
}

interface Cap {
  label: string;
  used: number | null;
  max: number | undefined;
  unit?: string;
  help: string;
}

function CapRow({ cap, size }: { cap: Cap; size: 'xs' | 'sm' }) {
  const fill = cap.used != null && cap.max ? cap.used / cap.max : null;
  const used = cap.used == null ? '—' : Math.round(cap.used).toLocaleString();
  const max = cap.max ? Math.round(cap.max).toLocaleString() : '—';
  return (
    <Tooltip withArrow multiline w={300} label={cap.help}>
      <Stack gap={2}>
        <Group justify="space-between" gap="xs" wrap="nowrap">
          <Text size={size} c="dimmed">{cap.label}</Text>
          <Text size={size} c={fill != null && fill > 1 ? 'red' : undefined}>
            {used}/{max}{cap.unit ?? ''}{fill != null ? ` · ${Math.round(fill * 100)}%` : ''}
          </Text>
        </Group>
        <Progress value={fill != null ? Math.min(fill, 1) * 100 : 0} color={fill != null ? fillColor(fill) : 'gray'}
          size={size === 'xs' ? 4 : 8} />
      </Stack>
    </Tooltip>
  );
}

/**
 * How full a shard is against its tier's caps: streams, published streams and records per second, as the reconciler
 * counts them. Yellow from where merges and relief stop filling a shard, red over a cap (relief moves streams off).
 */
export function ShardCapacity({ usage, caps, compact = false }: {
  usage: ShardUsage; caps: ShardCaps | null; compact?: boolean;
}) {
  const rows: Cap[] = [
    {
      label: 'Streams', used: usage.streams, max: caps?.maxStreams,
      help: 'Streams it collects, draining ones included. Placement never puts it past the cap.',
    },
    {
      label: 'Published', used: usage.published, max: caps?.maxPublished,
      help: 'Streams a session leases, which it sends over Aeron. The cap that binds first on most shards.',
    },
    {
      label: 'Rate', used: usage.recordsPerSecond, max: caps?.maxRecordsPerSecond, unit: '/s',
      help: usage.recordsPerSecond == null
        ? 'No rates in its status: its orchestrator release predates them, or it hasn\'t reported twice yet.'
        : 'Records collected per second over the last minute, summed over its streams.',
    },
  ];
  const size = compact ? 'xs' : 'sm';
  return (
    <Stack gap={compact ? 4 : 'xs'}>
      {compact
        ? rows.map((cap) => <CapRow key={cap.label} cap={cap} size={size} />)
        : (
          <SimpleGrid cols={{ base: 1, sm: 3 }}>
            {rows.map((cap) => <CapRow key={cap.label} cap={cap} size={size} />)}
          </SimpleGrid>
        )}
      {!caps && (
        <Text size="xs" c="dimmed">Caps not set: the market-data Service Config has no shard_caps yet.</Text>
      )}
    </Stack>
  );
}
