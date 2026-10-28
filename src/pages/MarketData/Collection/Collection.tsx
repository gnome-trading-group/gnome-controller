import { useState } from 'react';
import { Alert, Button, Card, Container, Group, SimpleGrid, Stack, Tabs, Text, Title, Tooltip } from '@mantine/core';
import { IconAlertTriangle, IconPlus, IconRefresh } from '@tabler/icons-react';
import { useQueryClient } from '@tanstack/react-query';
import {
  COLLECTION_POLL, keys, useCollectionShardDetails, useCollectionShards, useCollectionTargets, useStreamNames,
} from '../../../query/hooks';
import { CollectionRule, CollectionShard, ShardTaskStatus } from '../../../types/collection';
import { collectionApi } from '../../../utils/api';
import { attentionItems, collectionCounts, currentStatus, shardHealth, ShardHealthLevel } from '../../../utils/collection';
import { LastUpdated } from '../../../components/LastUpdated';
import { Kpi } from '../../../components/trading/layout';
import { ShardCard } from '../../../components/collection/ShardCard';
import { RuleModal } from './RuleModal';
import { RulesTable } from './RulesTable';
import { StreamsTable } from './StreamsTable';

interface ShardRead {
  status: ShardTaskStatus | null | undefined;
  asOfMs: number;
}

function ShardGrid({ shards, reads }: { shards: CollectionShard[]; reads: Map<string, ShardRead> }) {
  const byRegion = new Map<string, CollectionShard[]>();
  shards.forEach((s) => byRegion.set(s.region, [...(byRegion.get(s.region) ?? []), s]));
  if (shards.length === 0) {
    return <Text size="sm" c="dimmed">No shards: nothing is wanted. Add a rule to start collecting.</Text>;
  }
  return (
    <Stack gap="md">
      {[...byRegion.entries()].sort(([a], [b]) => a.localeCompare(b)).map(([region, list]) => (
        <Stack key={region} gap="xs">
          <Text size="sm" fw={600} c="dimmed">{region}</Text>
          <SimpleGrid cols={{ base: 1, sm: 2, lg: 3, xl: 4 }}>
            {list.map((s) => (
              <ShardCard key={s.shardId} shard={s} status={reads.get(s.shardId)?.status} asOfMs={reads.get(s.shardId)?.asOfMs ?? 0} />
            ))}
          </SimpleGrid>
        </Stack>
      ))}
    </Stack>
  );
}

// What collection is doing: what needs attention, the shards by region, and the streams and rules behind them. The
// reconciler changes all of it on its 1-minute tick; rule changes and "Reconcile now" run it at once.
function Collection() {
  const queryClient = useQueryClient();
  const targets = useCollectionTargets();
  const shards = useCollectionShards();
  const liveShards = (shards.data ?? []).filter((s) => s.state !== 'DELETED');
  const details = useCollectionShardDetails(liveShards.map((s) => s.shardId));
  const names = useStreamNames((targets.data ?? []).map((t) => t.streamId));
  const [editing, setEditing] = useState<CollectionRule | null>(null);
  const [creating, setCreating] = useState(false);
  const [triggering, setTriggering] = useState(false);

  const now = Date.now();
  // Undefined until a shard's detail is first read, so a loading card isn't taken for a shard that never reported.
  const reads = new Map<string, ShardRead>(liveShards.map((s, i) => [s.shardId, {
    status: details[i]?.data ? currentStatus(details[i].data.statuses) : undefined,
    asOfMs: details[i]?.dataUpdatedAt ?? 0,
  }]));
  // Shards not read yet count as healthy here: attention is for what the reads show, not for what is still loading.
  const health = new Map<string, ShardHealthLevel>(liveShards.map((s) => {
    const read = reads.get(s.shardId)!;
    return [s.shardId, read.status === undefined
      ? 'healthy'
      : shardHealth(read.status, s.createdAtNs, Math.min(now, read.asOfMs + COLLECTION_POLL))];
  }));
  const counts = collectionCounts(targets.data ?? [], shards.data ?? []);
  const attention = attentionItems(targets.data ?? [], liveShards, health, now);
  const loaded = targets.data != null && shards.data != null;
  // The older of the two reads: the page is only as fresh as its stalest table.
  const updatedAt = Math.min(targets.dataUpdatedAt, shards.dataUpdatedAt);

  const reconcileNow = async () => {
    setTriggering(true);
    try {
      await collectionApi.reconcileNow();
    } finally {
      setTriggering(false);
    }
  };

  return (
    <Container size="xl" py="xl">
      <Group justify="space-between" mb="md">
        <Group gap="sm">
          <Title order={2}>Collection</Title>
          <LastUpdated at={updatedAt ? new Date(updatedAt) : null} intervalMs={COLLECTION_POLL}
            failing={targets.isError || shards.isError} compact />
        </Group>
        <Group gap="xs">
          <Tooltip label="Runs the reconciler now instead of at its next minute" withArrow>
            <Button variant="default" leftSection={<IconRefresh size={16} />} loading={triggering} onClick={reconcileNow}>
              Reconcile now
            </Button>
          </Tooltip>
          <Button leftSection={<IconPlus size={16} />} onClick={() => setCreating(true)}>New rule</Button>
        </Group>
      </Group>

      {(targets.error || shards.error) && (
        <Alert color="red" mb="md">{targets.error?.message ?? shards.error?.message}</Alert>
      )}

      <SimpleGrid cols={{ base: 2, sm: 3, lg: 6 }} mb="lg">
        <Kpi label="Streams wanted" value={loaded ? counts.wanted : '—'} />
        <Kpi label="Covered" value={loaded && counts.wanted ? `${Math.round((counts.covered / counts.wanted) * 100)}%` : '—'}
          footer={loaded ? `${counts.covered} of ${counts.wanted}` : undefined} />
        <Kpi label="Uncovered" value={loaded ? <Text span inherit c={counts.uncovered ? 'red' : undefined}>{counts.uncovered}</Text> : '—'}
          footer={counts.unplaced ? `${counts.unplaced} unplaced` : undefined} />
        <Kpi label="Hand-offs" value={loaded ? counts.handingOff : '—'} hint="Streams moving between shards, cut at a minute boundary" />
        <Kpi label="Retiring" value={loaded ? counts.retiring : '—'} hint="No rule wants them; they stop after their grace" />
        <Kpi label="Shards" value={loaded ? counts.shards : '—'} footer={counts.draining ? `${counts.draining} draining` : undefined} />
      </SimpleGrid>

      {attention.length > 0 && (
        <Card withBorder mb="lg" p="sm">
          <Group gap="xs" mb={6}>
            <IconAlertTriangle size={16} color="var(--mantine-color-orange-6)" />
            <Text fw={600} size="sm">Needs attention</Text>
          </Group>
          <Stack gap={2}>
            {attention.map((a) => <Text key={a.key} size="sm" c={a.color === 'yellow' ? 'yellow.8' : a.color}>{a.text}</Text>)}
          </Stack>
        </Card>
      )}

      <Title order={4} mb="sm">Shards</Title>
      <ShardGrid shards={liveShards} reads={reads} />

      <Tabs defaultValue="streams" keepMounted={false} mt="xl">
        <Tabs.List mb="md">
          <Tabs.Tab value="streams">Streams</Tabs.Tab>
          <Tabs.Tab value="rules">Rules</Tabs.Tab>
        </Tabs.List>
        <Tabs.Panel value="streams">
          <StreamsTable targets={targets.data ?? []} names={names.data} loading={targets.isLoading} />
        </Tabs.Panel>
        <Tabs.Panel value="rules"><RulesTable onEdit={setEditing} /></Tabs.Panel>
      </Tabs>

      <RuleModal rule={editing} opened={creating || editing != null}
        onClose={() => { setCreating(false); setEditing(null); }}
        onSaved={() => queryClient.invalidateQueries({ queryKey: keys.collectionRules })} />
    </Container>
  );
}

export default Collection;
