import { useEffect, useMemo, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import {
  Anchor,
  Badge,
  Breadcrumbs,
  Container,
  Grid,
  Group,
  Loader,
  Paper,
  Stack,
  Table,
  Text,
  Title,
} from '@mantine/core';
import ReactTimeAgo from 'react-time-ago';
import { useGlobalState } from '../../context/GlobalStateContext';
import { registryApi } from '../../utils/api';
import { ListingSpec } from '../../types';
import {
  formatAssetClass,
  formatContractType,
  formatSecurityType,
  formatUnscaled,
  unscaleContractMultiplier,
  unscaleNotional,
  unscalePrice,
  unscaleSize,
} from '../../utils/security-master';

function InfoRow({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <Group justify="space-between" py={4} style={{ borderBottom: '1px solid var(--mantine-color-dark-5)' }}>
      <Text size="sm" c="dimmed">{label}</Text>
      <Text size="sm">{value}</Text>
    </Group>
  );
}

function ListingDetail() {
  const { listingId } = useParams<{ listingId: string }>();
  const navigate = useNavigate();
  const { listings, exchanges, securities } = useGlobalState();

  const [specs, setSpecs] = useState<ListingSpec[]>([]);
  const [loadingSpecs, setLoadingSpecs] = useState(true);

  const id = parseInt(listingId ?? '0');

  const listing = useMemo(() => listings.find(l => l.listingId === id), [listings, id]);
  const exchange = useMemo(() => exchanges.find(e => e.exchangeId === listing?.exchangeId), [exchanges, listing]);
  const security = useMemo(() => securities.find(s => s.securityId === listing?.securityId), [securities, listing]);

  const relatedListings = useMemo(() =>
    listings.filter(l => l.securityId === listing?.securityId && l.listingId !== id),
    [listings, listing, id],
  );

  useEffect(() => {
    if (!id) return;
    setLoadingSpecs(true);
    registryApi.listListingSpecs(id, true)
      .then(setSpecs)
      .catch(() => setSpecs([]))
      .finally(() => setLoadingSpecs(false));
  }, [id]);

  if (!listing) {
    return (
      <Container size="xl" py="xl">
        <Text>Listing not found.</Text>
      </Container>
    );
  }

  return (
    <Container size="xl" py="xl">
      <Breadcrumbs mb="md">
        <Anchor onClick={() => navigate('/security-master')} size="sm">Security Master</Anchor>
        <Text size="sm">Listing {id}</Text>
      </Breadcrumbs>

      <Group mb="xl">
        <div>
          <Title order={2}>{security?.symbol ?? `Security ${listing.securityId}`}</Title>
          <Text c="dimmed">{exchange?.exchangeName ?? `Exchange ${listing.exchangeId}`} &mdash; {listing.exchangeSecuritySymbol}</Text>
        </div>
      </Group>

      <Grid gutter="md">
        <Grid.Col span={{ base: 12, md: 4 }}>
          <Paper p="md" withBorder h="100%">
            <Title order={4} mb="md">Listing</Title>
            <Stack gap={0}>
              <InfoRow label="Listing ID" value={listing.listingId} />
              <InfoRow label="Exchange Security ID" value={listing.exchangeSecurityId} />
              <InfoRow label="Exchange Symbol" value={listing.exchangeSecuritySymbol} />
              <InfoRow label="Created" value={
                <ReactTimeAgo date={new Date(listing.dateCreated)} timeStyle="round" />
              } />
              <InfoRow label="Modified" value={
                <ReactTimeAgo date={new Date(listing.dateModified)} timeStyle="round" />
              } />
            </Stack>
          </Paper>
        </Grid.Col>

        {security && (
          <Grid.Col span={{ base: 12, md: 4 }}>
            <Paper p="md" withBorder h="100%">
              <Title order={4} mb="md">Security</Title>
              <Stack gap={0}>
                <InfoRow label="Symbol" value={
                  <Anchor size="sm" onClick={() => navigate(`/security-master/securities/${security.securityId}`)}>
                    {security.symbol}
                  </Anchor>
                } />
                <InfoRow label="Type" value={formatSecurityType(security.type)} />
                <InfoRow label="Contract Type" value={formatContractType(security.contractType)} />
                <InfoRow label="Asset Class" value={formatAssetClass(security.assetClass)} />
                <InfoRow label="Base Currency" value={security.baseCurrency ?? '-'} />
                <InfoRow label="Quote Currency" value={security.quoteCurrency ?? '-'} />
                <InfoRow label="Settle Currency" value={security.settleCurrency ?? '-'} />
                <InfoRow label="Inverse" value={security.inverse ? 'Yes' : 'No'} />
                <InfoRow label="Quanto" value={security.isQuanto ? 'Yes' : 'No'} />
                <InfoRow label="Active" value={
                  <Badge color={security.active ? 'green' : 'gray'} variant="light" size="sm">
                    {security.active ? 'Active' : 'Inactive'}
                  </Badge>
                } />
                {security.expiry && <InfoRow label="Expiry" value={security.expiry} />}
                {security.strikePrice !== null && <InfoRow label="Strike Price" value={security.strikePrice} />}
                {security.description && <InfoRow label="Description" value={security.description} />}
              </Stack>
            </Paper>
          </Grid.Col>
        )}

        <Grid.Col span={{ base: 12, md: 4 }}>
          <Paper p="md" withBorder h="100%">
            <Title order={4} mb="md">Exchange</Title>
            <Stack gap={0}>
              <InfoRow label="Exchange ID" value={exchange?.exchangeId ?? listing.exchangeId} />
              <InfoRow label="Name" value={exchange?.exchangeName ?? '-'} />
              <InfoRow label="Region" value={exchange?.region ?? '-'} />
              <InfoRow label="Schema Type" value={exchange?.schemaType ?? '-'} />
            </Stack>
          </Paper>
        </Grid.Col>

        <Grid.Col span={12}>
          <Paper p="md" withBorder>
            <Title order={4} mb="md">Spec History</Title>
            {loadingSpecs ? (
              <Loader size="sm" />
            ) : specs.length === 0 ? (
              <Text c="dimmed" size="sm">No specs recorded.</Text>
            ) : (
              <Table striped withColumnBorders highlightOnHover>
                <Table.Thead>
                  <Table.Tr>
                    <Table.Th>Tick Size</Table.Th>
                    <Table.Th>Lot Size</Table.Th>
                    <Table.Th>Min Notional</Table.Th>
                    <Table.Th>Contract Multiplier</Table.Th>
                    <Table.Th>Recorded At</Table.Th>
                  </Table.Tr>
                </Table.Thead>
                <Table.Tbody>
                  {specs.map((spec, i) => (
                    <Table.Tr key={i}>
                      <Table.Td>{formatUnscaled(unscalePrice(spec.tickSize))}</Table.Td>
                      <Table.Td>{formatUnscaled(unscaleSize(spec.lotSize))}</Table.Td>
                      <Table.Td>{formatUnscaled(unscaleNotional(spec.minNotional))}</Table.Td>
                      <Table.Td>{formatUnscaled(unscaleContractMultiplier(spec.contractMultiplier))}</Table.Td>
                      <Table.Td>
                        <ReactTimeAgo date={new Date(spec.recordedAt)} timeStyle="round" />
                      </Table.Td>
                    </Table.Tr>
                  ))}
                </Table.Tbody>
              </Table>
            )}
          </Paper>
        </Grid.Col>

        {relatedListings.length > 0 && (
          <Grid.Col span={12}>
            <Paper p="md" withBorder>
              <Title order={4} mb="md">Related Listings</Title>
              <Table striped withColumnBorders highlightOnHover>
                <Table.Thead>
                  <Table.Tr>
                    <Table.Th>Exchange</Table.Th>
                    <Table.Th>Exchange Symbol</Table.Th>
                    <Table.Th>Created</Table.Th>
                  </Table.Tr>
                </Table.Thead>
                <Table.Tbody>
                  {relatedListings.map(l => {
                    const ex = exchanges.find(e => e.exchangeId === l.exchangeId);
                    return (
                      <Table.Tr
                        key={l.listingId}
                        onClick={() => navigate(`/security-master/listings/${l.listingId}`)}
                        style={{ cursor: 'pointer' }}
                      >
                        <Table.Td>{ex?.exchangeName ?? l.exchangeId}</Table.Td>
                        <Table.Td>{l.exchangeSecuritySymbol}</Table.Td>
                        <Table.Td>
                          <ReactTimeAgo date={new Date(l.dateCreated)} timeStyle="round" />
                        </Table.Td>
                      </Table.Tr>
                    );
                  })}
                </Table.Tbody>
              </Table>
            </Paper>
          </Grid.Col>
        )}
      </Grid>
    </Container>
  );
}

export default ListingDetail;
