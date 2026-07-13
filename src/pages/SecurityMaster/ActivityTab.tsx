import React, { useEffect, useState } from 'react';
import { Badge, Button, Group, Paper, Stack, Text } from '@mantine/core';
import ReactTimeAgo from 'react-time-ago';
import { useNavigate } from 'react-router-dom';
import { DenormalizedListing, Security } from '../../types';
import { registryApi } from '../../utils/api';
import { formatSecurityType } from '../../utils/security-master';

const PAGE_SIZE = 50;

type ActivityEntry =
  | { kind: 'security'; securityId: number; symbol: string; type: number; dateCreated: string }
  | { kind: 'listing'; listingId: number; exchangeName: string; securitySymbol: string; dateCreated: string };

function mergeAndSort(securities: Security[], listings: DenormalizedListing[]): ActivityEntry[] {
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
    exchangeName: l.exchangeName,
    securitySymbol: l.securitySymbol,
    dateCreated: l.dateCreated,
  }));
  return [...securityEntries, ...listingEntries].sort(
    (a, b) => new Date(b.dateCreated).getTime() - new Date(a.dateCreated).getTime(),
  );
}

function ActivityTab() {
  const navigate = useNavigate();
  const [securities, setSecurities] = useState<Security[]>([]);

  const [listings, setListings] = useState<DenormalizedListing[]>([]);
  const [securityOffset, setSecurityOffset] = useState(PAGE_SIZE);
  const [listingOffset, setListingOffset] = useState(PAGE_SIZE);
  const [hasMoreSecurities, setHasMoreSecurities] = useState(false);
  const [hasMoreListings, setHasMoreListings] = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    Promise.all([
      registryApi.listSecuritiesPaginated({ limit: PAGE_SIZE, sortBy: 'date_created', sortOrder: 'desc' }),
      registryApi.listListingsPaginated({ limit: PAGE_SIZE, sortBy: 'date_created', sortOrder: 'desc' }),
    ]).then(([secs, lists]) => {
      setSecurities(secs);
      setListings(lists);
      setHasMoreSecurities(secs.length === PAGE_SIZE);
      setHasMoreListings(lists.length === PAGE_SIZE);
    }).catch(console.error)
      .finally(() => setLoading(false));
  }, []);

  const loadMore = async () => {
    const promises: Promise<void>[] = [];
    if (hasMoreSecurities) {
      promises.push(
        registryApi.listSecuritiesPaginated({ limit: PAGE_SIZE, offset: securityOffset, sortBy: 'date_created', sortOrder: 'desc' })
          .then(secs => {
            setSecurities(prev => [...prev, ...secs]);
            setSecurityOffset(o => o + PAGE_SIZE);
            setHasMoreSecurities(secs.length === PAGE_SIZE);
          })
      );
    }
    if (hasMoreListings) {
      promises.push(
        registryApi.listListingsPaginated({ limit: PAGE_SIZE, offset: listingOffset, sortBy: 'date_created', sortOrder: 'desc' })
          .then(lists => {
            setListings(prev => [...prev, ...lists]);
            setListingOffset(o => o + PAGE_SIZE);
            setHasMoreListings(lists.length === PAGE_SIZE);
          })
      );
    }
    await Promise.all(promises);
  };

  const feed = mergeAndSort(securities, listings);
  const hasMore = hasMoreSecurities || hasMoreListings;

  return (
    <Stack gap="xs" mt="md">
      {loading && <Text c="dimmed" size="sm">Loading activity...</Text>}
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
              <Badge color={entry.kind === 'security' ? 'blue' : 'violet'} variant="light" size="sm">
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
      {!loading && feed.length === 0 && (
        <Text c="dimmed" size="sm">No activity yet.</Text>
      )}
      {hasMore && (
        <Button variant="subtle" onClick={loadMore}>
          Load more
        </Button>
      )}
    </Stack>
  );
}

export default React.memo(ActivityTab);
