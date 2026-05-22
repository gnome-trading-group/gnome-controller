import React, { useMemo } from 'react';
import { Badge, Group, Paper, Stack, Text } from '@mantine/core';
import ReactTimeAgo from 'react-time-ago';
import { useNavigate } from 'react-router-dom';
import { useGlobalState } from '../../context/GlobalStateContext';
import { formatSecurityType } from '../../utils/security-master';

type ActivityEntry =
  | { kind: 'security'; securityId: number; symbol: string; type: number; dateCreated: string }
  | { kind: 'listing'; listingId: number; exchangeName: string; securitySymbol: string; dateCreated: string };

function ActivityTab() {
  const { securities, listings, exchanges } = useGlobalState();
  const navigate = useNavigate();

  const feed = useMemo<ActivityEntry[]>(() => {
    const exchangeMap = new Map(exchanges.map(e => [e.exchangeId, e]));
    const securityMap = new Map(securities.map(s => [s.securityId, s]));

    const securityEntries: ActivityEntry[] = securities.map(s => ({
      kind: 'security',
      securityId: s.securityId,
      symbol: s.symbol,
      type: s.type,
      dateCreated: s.dateCreated,
    }));

    const listingEntries: ActivityEntry[] = listings.map(l => ({
      kind: 'listing',
      listingId: l.listingId,
      exchangeName: exchangeMap.get(l.exchangeId)?.exchangeName ?? `Exchange ${l.exchangeId}`,
      securitySymbol: securityMap.get(l.securityId)?.symbol ?? `Security ${l.securityId}`,
      dateCreated: l.dateCreated,
    }));

    return [...securityEntries, ...listingEntries].sort(
      (a, b) => new Date(b.dateCreated).getTime() - new Date(a.dateCreated).getTime(),
    );
  }, [securities, listings, exchanges]);

  return (
    <Stack gap="xs" mt="md">
      {feed.map((entry, i) => (
        <Paper
          key={i}
          p="sm"
          withBorder
          style={{ cursor: 'pointer' }}
          onClick={() => {
            if (entry.kind === 'security') {
              navigate(`/security-master/securities/${entry.securityId}`);
            } else {
              navigate(`/security-master/listings/${entry.listingId}`);
            }
          }}
        >
          <Group justify="space-between">
            <Group gap="sm">
              <Badge
                color={entry.kind === 'security' ? 'blue' : 'violet'}
                variant="light"
                size="sm"
              >
                {entry.kind === 'security' ? 'Security' : 'Listing'}
              </Badge>
              {entry.kind === 'security' ? (
                <Text size="sm" fw={500}>{entry.symbol}</Text>
              ) : (
                <Text size="sm" fw={500}>{entry.securitySymbol} <Text span c="dimmed">on</Text> {entry.exchangeName}</Text>
              )}
              {entry.kind === 'security' && (
                <Text size="sm" c="dimmed">{formatSecurityType(entry.type)}</Text>
              )}
            </Group>
            <Text size="xs" c="dimmed">
              <ReactTimeAgo date={new Date(entry.dateCreated)} timeStyle="round" />
            </Text>
          </Group>
        </Paper>
      ))}
      {feed.length === 0 && (
        <Text c="dimmed" size="sm">No activity yet.</Text>
      )}
    </Stack>
  );
}

export default React.memo(ActivityTab);
