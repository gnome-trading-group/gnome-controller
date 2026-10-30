import { Alert, Anchor, Badge, Group, Skeleton, Stack, Table, Text, Tooltip } from '@mantine/core';
import { Link } from 'react-router-dom';
import { LeasedStream, LeasedStreamState, SessionLease } from '../../types/collection';
import { useSessionLease, useStreamNames } from '../../query/hooks';
import { StreamName } from '../../components/collection/StreamName';

const LEASE_STATE_COLORS: Record<LeasedStreamState, string> = { LIVE: 'teal', WARMING: 'blue', UNPLACED: 'red' };

const LEASE_STATE_HELP: Record<LeasedStreamState, string> = {
  LIVE: 'Its shard collects it and sends it to sessions',
  WARMING: 'On a shard that is not sending it yet: starting, subscribing, or without an endpoint',
  UNPLACED: 'On no shard: none has room, the partition is at max_shards, or the stream has ended',
};

function ShardLink({ shardId }: { shardId: string | null }) {
  if (!shardId) return <Text size="sm" c="dimmed">—</Text>;
  return <Anchor component={Link} to={`/market-data/collection/shards/${encodeURIComponent(shardId)}`} size="sm">{shardId}</Anchor>;
}

function Endpoint({ stream }: { stream: LeasedStream }) {
  return stream.endpoint
    ? <Text size="sm" ff="monospace">{stream.endpoint.privateIp}:{stream.endpoint.port}</Text>
    : <Text size="sm" c="dimmed">—</Text>;
}

const RELEASE_REASONS: Record<NonNullable<SessionLease['releaseReason']>, string> = {
  DELETED: 'the session was stopped',
  SESSION_ENDED: 'the session ended',
  EXPIRED: 'it expired',
};

function LeasedStreams({ lease, names }: { lease: SessionLease; names: Map<number, string> | undefined }) {
  return (
    <Table striped withTableBorder verticalSpacing={6}>
      <Table.Thead>
        <Table.Tr>
          <Table.Th>Stream</Table.Th>
          <Table.Th>State</Table.Th>
          <Table.Th>Shard</Table.Th>
          <Table.Th>Endpoint</Table.Th>
          <Table.Th>Moving to</Table.Th>
        </Table.Tr>
      </Table.Thead>
      <Table.Tbody>
        {lease.streams.map((s) => (
          <Table.Tr key={s.streamId}>
            <Table.Td><Stream streamId={s.streamId} names={names} /></Table.Td>
            <Table.Td>
              <Tooltip label={LEASE_STATE_HELP[s.state]} withArrow multiline w={300}>
                <Badge size="sm" variant="light" color={LEASE_STATE_COLORS[s.state] ?? 'gray'}>{s.state.toLowerCase()}</Badge>
              </Tooltip>
            </Table.Td>
            <Table.Td><ShardLink shardId={s.shardId} /></Table.Td>
            <Table.Td><Endpoint stream={s} /></Table.Td>
            <Table.Td>
              {s.next ? (
                <Group gap={6} wrap="nowrap">
                  <ShardLink shardId={s.next.shardId} />
                  {s.next.state && <Text size="xs" c="dimmed">{s.next.state.toLowerCase()}</Text>}
                </Group>
              ) : <Text size="sm" c="dimmed">—</Text>}
            </Table.Td>
          </Table.Tr>
        ))}
      </Table.Tbody>
    </Table>
  );
}

function Stream({ streamId, names }: { streamId: number; names: Map<number, string> | undefined }) {
  return (
    <Anchor component={Link} to={`/market-data/collection/streams/${streamId}`} underline="never">
      <StreamName streamId={streamId} name={names?.get(streamId)} />
    </Anchor>
  );
}

// Where a paper session reads each of its streams: the shard the market-data lease put it on. Placement is only known
// while the lease is held, so a released lease shows just what it leased.
export function SessionMarketData({ sessionId, live }: { sessionId: string; live: boolean }) {
  const lease = useSessionLease(sessionId, live);
  const names = useStreamNames(lease.data?.streams.map((s) => s.streamId) ?? []);

  if (lease.isLoading) return <Skeleton h={120} />;
  if (lease.error) return <Alert color="red">{lease.error.message}</Alert>;
  if (!lease.data) {
    return (
      <Text c="dimmed" size="sm">
        {live
          ? 'No market-data lease: the session opened its own venue connections.'
          : 'No market-data lease on record. Released leases are kept for 7 days, and sessions before shard-fed market data had none.'}
      </Text>
    );
  }
  const { status, expiresAt, releasedAt, releaseReason, streams } = lease.data;
  const count = `${streams.length} stream${streams.length === 1 ? '' : 's'}`;
  if (status === 'RELEASED') {
    return (
      <Stack gap="sm">
        <Text size="sm" c="dimmed">
          Leased {count} from shards; released
          {releasedAt ? ` at ${new Date(releasedAt * 1000).toLocaleString()}` : ''}
          {releaseReason ? ` because ${RELEASE_REASONS[releaseReason] ?? releaseReason.toLowerCase()}` : ''}.
          Which shard carried each stream isn&apos;t kept.
        </Text>
        <Stack gap={4}>
          {streams.map((s) => <Stream key={s.streamId} streamId={s.streamId} names={names.data} />)}
        </Stack>
      </Stack>
    );
  }
  return (
    <Stack gap="sm">
      <Group gap="xs">
        <Badge variant="light" color="teal">active</Badge>
        <Text size="sm" c="dimmed">
          {count} leased{expiresAt ? `, until ${new Date(expiresAt * 1000).toLocaleString()} unless renewed` : ''}
        </Text>
      </Group>
      <LeasedStreams lease={lease.data} names={names.data} />
    </Stack>
  );
}
