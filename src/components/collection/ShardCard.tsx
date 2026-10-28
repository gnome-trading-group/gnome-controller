import { Badge, Card, Group, Stack, Text } from '@mantine/core';
import { Link } from 'react-router-dom';
import { CollectionShard, ShardTaskStatus } from '../../types/collection';
import { shardStreams } from '../../utils/collection';
import { ShardHealth } from './ShardHealth';
import { StateBar } from './StateBar';

// One shard at a glance: what it is, whether it's alive, and how its streams are doing. Links to the shard.
export function ShardCard({ shard, status, asOfMs }: {
  shard: CollectionShard; status: ShardTaskStatus | null | undefined; asOfMs: number;
}) {
  const rows = shardStreams(shard, status ?? null);
  const reconnecting = (status?.connections ?? []).filter((c) => c.reconnecting).length;
  return (
    <Card withBorder padding="sm" radius="md" component={Link} to={`/market-data/collection/shards/${shard.shardId}`}
      style={{ color: 'inherit', textDecoration: 'none' }}>
      <Stack gap={6}>
        <Group justify="space-between" wrap="nowrap">
          <Text fw={600} ff="monospace" size="sm">{shard.shardId}</Text>
          <Group gap={4}>
            <Badge size="xs" variant="light" color={shard.priority === 'PRODUCTION' ? 'grape' : 'gray'}>{shard.priority.toLowerCase()}</Badge>
            {shard.tier !== 'standard' && <Badge size="xs" variant="light">{shard.tier}</Badge>}
            {shard.state !== 'ACTIVE' && <Badge size="xs" variant="light" color="yellow">{shard.state.toLowerCase()}</Badge>}
          </Group>
        </Group>
        <ShardHealth status={status} createdAtNs={shard.createdAtNs} asOfMs={asOfMs} />
        <StateBar states={rows.map((r) => r.state)} />
        <Group justify="space-between">
          <Text size="xs" c="dimmed">
            {shard.streams.length} streams{shard.draining.length ? ` · ${shard.draining.length} draining` : ''}
          </Text>
          <Text size="xs" c={reconnecting ? 'red' : 'dimmed'}>
            {status ? `${status.connections.length} connections${reconnecting ? ` · ${reconnecting} reconnecting` : ''}` : ''}
          </Text>
        </Group>
        <Text size="xs" c="dimmed">orchestrator {shard.version}</Text>
      </Stack>
    </Card>
  );
}
