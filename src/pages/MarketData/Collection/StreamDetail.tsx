import { useNavigate, useParams } from 'react-router-dom';
import { Badge, Container, Group, Stack, Text } from '@mantine/core';
import { COLLECTION_POLL, useCollectionRules, useCollectionTargets, useStreamNames } from '../../../query/hooks';
import { PageHeader } from '../../../components/PageHeader';
import { LastUpdated } from '../../../components/LastUpdated';
import { StreamCoverage } from '../../../components/collection/StreamCoverage';

// One stream's collection: whether collection wants it now and where, and its coverage over a range.
function StreamDetail() {
  const streamId = Number(useParams().streamId);
  const navigate = useNavigate();
  const targets = useCollectionTargets();
  const rules = useCollectionRules();
  const names = useStreamNames([streamId]);
  const target = targets.data?.find(t => t.streamId === streamId);
  const ruleNames = (target?.wantedBy ?? []).map(id => rules.data?.find(r => r.ruleId === id)?.name ?? id);

  return (
    <Container size="xl" py="xl">
      <PageHeader
        onBack={() => navigate('/market-data/collection')}
        title={<Text span fw={700} size="xl">{names.data?.get(streamId) ?? `Stream ${streamId}`}</Text>}
        badges={(
          <Group gap="xs" wrap="nowrap">
            {target
              ? <Badge variant="light" color={target.state === 'DESIRED' ? 'blue' : 'gray'}>{target.state.toLowerCase()}</Badge>
              : <Badge variant="light" color="gray">not collected</Badge>}
            <LastUpdated at={targets.dataUpdatedAt ? new Date(targets.dataUpdatedAt) : null} intervalMs={COLLECTION_POLL}
              failing={targets.isError} compact />
          </Group>
        )}
        meta={[
          `stream ${streamId}`,
          target ? `${target.source} · ${target.region}` : null,
          target?.shardId ? `shard ${target.shardId}` : null,
          ruleNames.length ? `wanted by ${ruleNames.join(', ')}` : null,
        ]}
      />
      <Stack mt="md">
        <StreamCoverage streamId={streamId} />
      </Stack>
    </Container>
  );
}

export default StreamDetail;
