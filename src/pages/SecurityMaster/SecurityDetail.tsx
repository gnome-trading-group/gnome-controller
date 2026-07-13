import { useEffect, useState } from 'react';
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
import { DenormalizedListing, Security } from '../../types';
import { registryApi } from '../../utils/api';
import {
  formatAssetClass,
  formatContractType,
  formatSecurityType,
} from '../../utils/security-master';

function InfoRow({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <Group justify="space-between" py={4} style={{ borderBottom: '1px solid var(--mantine-color-dark-5)' }}>
      <Text size="sm" c="dimmed">{label}</Text>
      <Text size="sm">{value}</Text>
    </Group>
  );
}

function SecurityDetail() {
  const { securityId } = useParams<{ securityId: string }>();
  const navigate = useNavigate();
  const { exchanges } = useGlobalState();

  const id = parseInt(securityId ?? '0');

  const [security, setSecurity] = useState<Security | null>(null);
  const [listings, setListings] = useState<DenormalizedListing[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!id) return;
    setLoading(true);
    Promise.all([
      registryApi.listSecuritiesPaginated({ securityId: id, limit: 1 }),
      registryApi.listListingsPaginated({ securityId: id, limit: 5000 }),
    ]).then(([secs, lists]) => {
      setSecurity(secs[0] ?? null);
      setListings(lists);
    }).catch(console.error)
      .finally(() => setLoading(false));
  }, [id]);

  if (loading) {
    return <Container size="xl" py="xl"><Loader /></Container>;
  }

  if (!security) {
    return <Container size="xl" py="xl"><Text>Security not found.</Text></Container>;
  }

  return (
    <Container size="xl" py="xl">
      <Breadcrumbs mb="md">
        <Anchor onClick={() => navigate('/security-master')} size="sm">Security Master</Anchor>
        <Text size="sm">{security.symbol}</Text>
      </Breadcrumbs>

      <Group mb="xl">
        <div>
          <Title order={2}>{security.symbol}</Title>
          <Text c="dimmed">{formatSecurityType(security.type)} &mdash; {formatAssetClass(security.assetClass)}</Text>
        </div>
        <Badge color={security.active ? 'green' : 'gray'} variant="light">
          {security.active ? 'Active' : 'Inactive'}
        </Badge>
      </Group>

      <Grid gutter="md">
        <Grid.Col span={{ base: 12, md: 6 }}>
          <Paper p="md" withBorder>
            <Title order={4} mb="md">Security</Title>
            <Stack gap={0}>
              <InfoRow label="Security ID" value={security.securityId} />
              <InfoRow label="Symbol" value={security.symbol} />
              <InfoRow label="Type" value={formatSecurityType(security.type)} />
              <InfoRow label="Contract Type" value={formatContractType(security.contractType)} />
              <InfoRow label="Asset Class" value={formatAssetClass(security.assetClass)} />
              <InfoRow label="Base Currency" value={security.baseCurrency ?? '-'} />
              <InfoRow label="Quote Currency" value={security.quoteCurrency ?? '-'} />
              <InfoRow label="Settle Currency" value={security.settleCurrency ?? '-'} />
              <InfoRow label="Inverse" value={security.inverse ? 'Yes' : 'No'} />
              <InfoRow label="Quanto" value={security.isQuanto ? 'Yes' : 'No'} />
              {security.expiry && <InfoRow label="Expiry" value={security.expiry} />}
              {security.strikePrice !== null && <InfoRow label="Strike Price" value={security.strikePrice} />}
              {security.underlyingSecurityId !== null && (
                <InfoRow label="Underlying" value={
                  <Anchor size="sm" onClick={() => navigate(`/security-master/securities/${security.underlyingSecurityId}`)}>
                    Security {security.underlyingSecurityId}
                  </Anchor>
                } />
              )}
              {security.description && <InfoRow label="Description" value={security.description} />}
              <InfoRow label="Created" value={<ReactTimeAgo date={new Date(security.dateCreated)} timeStyle="round" />} />
              <InfoRow label="Modified" value={<ReactTimeAgo date={new Date(security.dateModified)} timeStyle="round" />} />
            </Stack>
          </Paper>
        </Grid.Col>

        <Grid.Col span={12}>
          <Paper p="md" withBorder>
            <Title order={4} mb="md">Listings</Title>
            {listings.length === 0 ? (
              <Text c="dimmed" size="sm">No listings for this security.</Text>
            ) : (
              <Table striped withColumnBorders highlightOnHover>
                <Table.Thead>
                  <Table.Tr>
                    <Table.Th>Exchange</Table.Th>
                    <Table.Th>Exchange Symbol</Table.Th>
                    <Table.Th>Schema Type</Table.Th>
                    <Table.Th>Created</Table.Th>
                  </Table.Tr>
                </Table.Thead>
                <Table.Tbody>
                  {listings.map(l => {
                    const ex = exchanges.find(e => e.exchangeId === l.exchangeId);
                    return (
                      <Table.Tr
                        key={l.listingId}
                        onClick={() => navigate(`/security-master/listings/${l.listingId}`)}
                        style={{ cursor: 'pointer' }}
                      >
                        <Table.Td>{l.exchangeName}</Table.Td>
                        <Table.Td>{l.exchangeSecuritySymbol}</Table.Td>
                        <Table.Td>{ex?.schemaType ?? '-'}</Table.Td>
                        <Table.Td>
                          <ReactTimeAgo date={new Date(l.dateCreated)} timeStyle="round" />
                        </Table.Td>
                      </Table.Tr>
                    );
                  })}
                </Table.Tbody>
              </Table>
            )}
          </Paper>
        </Grid.Col>
      </Grid>
    </Container>
  );
}

export default SecurityDetail;
