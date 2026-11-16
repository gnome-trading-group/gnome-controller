import { SimpleGrid, Stack, Text } from '@mantine/core';
import { Cap, CapacityRow } from '../CapacityRow';
import { ShardCaps } from '../../types/collection';
import { ShardUsage } from '../../utils/collection';

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
        ? rows.map((cap) => <CapacityRow key={cap.label} cap={cap} size={size} />)
        : (
          <SimpleGrid cols={{ base: 1, sm: 3 }}>
            {rows.map((cap) => <CapacityRow key={cap.label} cap={cap} size={size} />)}
          </SimpleGrid>
        )}
      {!caps && (
        <Text size="xs" c="dimmed">Caps not set: the market-data Service Config has no shard_caps yet.</Text>
      )}
    </Stack>
  );
}
