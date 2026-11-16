import { SimpleGrid, Stack, Text } from '@mantine/core';
import { Cap, CapacityRow } from '../CapacityRow';
import { ShardCaps } from '../../types/collection';
import { shardLoad, ShardUsage } from '../../utils/collection';

/**
 * How full a shard is against its tier's caps, as the reconciler counts it: its load (published streams and records per
 * second together, each against its cap; placement keeps it at most 100%, relief moves streams off a shard over it),
 * the two parts of that load, and its streams against their own cap. Yellow from where merges and relief stop filling
 * a shard, red over.
 */
export function ShardCapacity({ usage, caps, compact = false }: {
  usage: ShardUsage; caps: ShardCaps | null; compact?: boolean;
}) {
  const rows: Cap[] = [
    {
      label: 'Load', used: caps ? shardLoad(usage, caps) * 100 : null, max: 100, unit: '%',
      help: 'Published streams and records per second count together: published/max published + records per second/max records per second. Placement keeps a shard at most 100%; relief moves streams off one over it.',
    },
    {
      label: 'Published', used: usage.published, max: caps?.maxPublished,
      help: 'Streams a session leases, which it sends over Aeron: one part of the load. Its cap is the most a shard takes publishing alone.',
    },
    {
      label: 'Rate', used: usage.recordsPerSecond, max: caps?.maxRecordsPerSecond, unit: '/s',
      help: usage.recordsPerSecond == null
        ? 'No rates in its status: its orchestrator release predates them, or it hasn\'t reported twice yet.'
        : 'Records collected per second over the last minute, summed over its streams: the other part of the load. Its cap is the most a shard takes collecting alone.',
    },
    {
      label: 'Streams', used: usage.streams, max: caps?.maxStreams,
      help: 'Streams it collects, draining ones included. A cap of its own: placement never puts it past this.',
    },
  ];
  const size = compact ? 'xs' : 'sm';
  return (
    <Stack gap={compact ? 4 : 'xs'}>
      {compact
        ? rows.map((cap) => <CapacityRow key={cap.label} cap={cap} size={size} />)
        : (
          <SimpleGrid cols={{ base: 1, sm: 2, lg: 4 }}>
            {rows.map((cap) => <CapacityRow key={cap.label} cap={cap} size={size} />)}
          </SimpleGrid>
        )}
      {!caps && (
        <Text size="xs" c="dimmed">Caps not set: the market-data Service Config has no shard_caps yet.</Text>
      )}
    </Stack>
  );
}
