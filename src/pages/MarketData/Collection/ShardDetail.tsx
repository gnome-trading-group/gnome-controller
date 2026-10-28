import { useNavigate, useParams } from 'react-router-dom';
import { Alert, Badge, Container, Group, SimpleGrid, Stack, Tabs, Text } from '@mantine/core';
import { IconExternalLink } from '@tabler/icons-react';
import { COLLECTION_POLL, useCollectionShard, useStreamNames } from '../../../query/hooks';
import { currentStatus, isCovered, processLine, shardStreams } from '../../../utils/collection';
import { PageHeader } from '../../../components/PageHeader';
import { LastUpdated } from '../../../components/LastUpdated';
import { Kpi } from '../../../components/trading/layout';
import { ShardHealth } from '../../../components/collection/ShardHealth';
import { StateBar } from '../../../components/collection/StateBar';
import { ShardStreamsTab } from './shard/ShardStreamsTab';
import { ShardConnectionsTab } from './shard/ShardConnectionsTab';
import { ShardActivityTab } from './shard/ShardActivityTab';
import { ShardLogsTab } from './shard/ShardLogsTab';
import { ShardTasksTab } from './shard/ShardTasksTab';

function ecsUrl(region: string, shardId: string): string {
  return `https://${region}.console.aws.amazon.com/ecs/v2/clusters/CollectionCluster-${region}/services/shard-${shardId}/health?region=${region}`;
}

// One shard: whether it's alive, what it was assigned and how each stream is doing, its connections, recent state
// changes, logs and tasks. Its newest task's status drives the page.
function ShardDetail() {
  const { shardId = '' } = useParams();
  const navigate = useNavigate();
  const detail = useCollectionShard(shardId);
  const shard = detail.data?.shard;
  const statuses = [...(detail.data?.statuses ?? [])].sort((a, b) => b.writtenAtNs - a.writtenAtNs);
  const status = currentStatus(statuses);
  const names = useStreamNames(shard ? [...shard.streams, ...shard.draining] : []);
  const rows = shard ? shardStreams(shard, status) : [];
  const p = processLine(status);
  const covered = rows.filter((r) => isCovered(r.state)).length;
  const reconnecting = (status?.connections ?? []).filter((c) => c.reconnecting).length;
  const handoffs = rows.filter((r) => r.role !== 'owned').length;

  return (
    <Container size="xl" py="xl">
      <PageHeader
        onBack={() => navigate('/market-data/collection')}
        title={<Text span ff="monospace" fw={700} size="xl">{shardId}</Text>}
        badges={shard && (
          <Group gap="xs" wrap="nowrap">
            <Badge variant="light" color={shard.state === 'ACTIVE' ? 'teal' : 'yellow'}>{shard.state.toLowerCase()}</Badge>
            <ShardHealth status={status} createdAtNs={shard.createdAtNs} asOfMs={detail.dataUpdatedAt} />
            <LastUpdated at={detail.dataUpdatedAt ? new Date(detail.dataUpdatedAt) : null} intervalMs={COLLECTION_POLL}
              failing={detail.isError} compact />
          </Group>
        )}
        menu={shard ? [{
          label: 'Open service in ECS',
          icon: <IconExternalLink size={14} />,
          onClick: () => window.open(ecsUrl(shard.region, shard.shardId), '_blank'),
        }] : []}
        meta={shard ? [
          shard.region,
          `${shard.priority.toLowerCase()} · ${shard.tier}`,
          `orchestrator ${shard.version}`,
          `generation ${shard.generation}${status && status.appliedGeneration < shard.generation ? ` (applied ${status.appliedGeneration})` : ''}`,
          Object.entries(shard.accounts).map(([src, label]) => `${src} ${label}`).join(' · ') || null,
        ] : []}
      />
      {detail.error && <Alert color="red" mb="md">{detail.error.message}</Alert>}
      {shard && (
        <Stack gap="lg" mt="md">
          <SimpleGrid cols={{ base: 2, sm: 3, lg: 6 }}>
            <Kpi label="Streams" value={rows.length} footer={shard.draining.length ? `${shard.draining.length} draining` : undefined} />
            <Kpi label="Covered" value={<Text span inherit c={covered < rows.length ? 'orange' : undefined}>{covered}</Text>}
              footer={`of ${rows.length}`} hint="Live, suspect or empty: collected and trusted" />
            <Kpi label="Hand-offs" value={handoffs} hint="Streams warming, taking over or handing off at a cut" />
            <Kpi label="Connections" value={status?.connections.length ?? '—'}
              footer={reconnecting ? <Text span size="xs" c="red">{reconnecting} reconnecting</Text> : undefined} />
            <Kpi label="Uploads queued" value={p.uploads_queued ?? '—'}
              footer={p.uploads_failed ? <Text span size="xs" c="red">{p.uploads_failed} failed</Text> : undefined} />
            <Kpi label="CPU · heap"
              value={p.cpu_busy_permille != null ? `${(p.cpu_busy_permille / 10).toFixed(0)}%` : '—'}
              footer={p.heap_used_mb != null ? `heap ${p.heap_used_mb} of ${p.heap_max_mb} MB` : undefined} />
          </SimpleGrid>
          <StateBar states={rows.map((r) => r.state)} height={10} />
          {!status && (
            <Alert color="gray" variant="light">
              No status yet: its task hasn&apos;t started (a host is launching, or the image is downloading), or it can&apos;t
              write to the metadata bucket.
            </Alert>
          )}
          <Tabs defaultValue="streams" keepMounted={false}>
            <Tabs.List mb="md">
              <Tabs.Tab value="streams">Streams</Tabs.Tab>
              <Tabs.Tab value="connections">Connections</Tabs.Tab>
              <Tabs.Tab value="activity">Activity</Tabs.Tab>
              <Tabs.Tab value="logs">Logs</Tabs.Tab>
              <Tabs.Tab value="tasks">Tasks{statuses.length > 1 ? ` (${statuses.length})` : ''}</Tabs.Tab>
            </Tabs.List>
            <Tabs.Panel value="streams"><ShardStreamsTab rows={rows} names={names.data} /></Tabs.Panel>
            <Tabs.Panel value="connections"><ShardConnectionsTab connections={status?.connections ?? []} /></Tabs.Panel>
            <Tabs.Panel value="activity">
              <ShardActivityTab transitions={status?.transitions ?? []} recorded={status?.transitionsRecorded ?? 0} names={names.data} />
            </Tabs.Panel>
            <Tabs.Panel value="logs"><ShardLogsTab shard={shard} status={status} /></Tabs.Panel>
            <Tabs.Panel value="tasks"><ShardTasksTab statuses={statuses} generation={shard.generation} /></Tabs.Panel>
          </Tabs>
        </Stack>
      )}
    </Container>
  );
}

export default ShardDetail;
