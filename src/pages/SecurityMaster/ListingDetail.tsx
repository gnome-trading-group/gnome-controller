import { useCallback, useEffect, useMemo, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import {
  Alert,
  Anchor,
  Badge,
  Breadcrumbs,
  Button,
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
import { IconAlertTriangle, IconHistory, IconPlayerPlay, IconPlayerStop } from '@tabler/icons-react';
import { useGlobalState } from '../../context/GlobalStateContext';
import { DenormalizedListing, Event, EventContract, Listing, ListingSpec, RiskPolicy, Security, SecurityType } from '../../types';
import { registryApi } from '../../utils/api';
import {
  formatAssetClass,
  formatContractType,
  formatSecurityType,
  formatUnscaled,
  unscaleContractMultiplier,
  unscalePrice,
  unscaleSize,
} from '../../utils/security-master';
import { errorMessage, findKillSwitch, setKillSwitch } from '../../utils/kill-switch';
import { useLatestPolicyHistory } from '../../hooks/useLatestPolicyHistory';
import { ReasonConfirmModal } from '../../components/ReasonConfirmModal';
import { RiskPolicyHistoryModal } from '../../components/RiskPolicyHistoryModal';
import { KillSwitchLatestEntry } from '../../components/KillSwitchLatestEntry';

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
  const { exchanges } = useGlobalState();

  const id = parseInt(listingId ?? '0');

  const [listing, setListing] = useState<DenormalizedListing | null>(null);
  const [security, setSecurity] = useState<Security | null>(null);
  const [relatedListings, setRelatedListings] = useState<Listing[]>([]);
  const [specs, setSpecs] = useState<ListingSpec[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadingSpecs, setLoadingSpecs] = useState(true);
  const [eventContract, setEventContract] = useState<EventContract | null>(null);
  const [event, setEvent] = useState<Event | null>(null);
  const [policies, setPolicies] = useState<RiskPolicy[]>([]);
  const [policiesError, setPoliciesError] = useState<string | null>(null);
  const [killAction, setKillAction] = useState<'kill' | 'resume' | null>(null);
  const [historyTarget, setHistoryTarget] = useState<RiskPolicy | null>(null);

  const killSwitchTarget = useMemo(() => ({ listingId: id }), [id]);
  const killSwitch = findKillSwitch(policies, killSwitchTarget);
  const listingKilled = killSwitch?.enabled ?? false;
  const latestKillSwitchEntry = useLatestPolicyHistory(killSwitch);

  const loadPolicies = useCallback(async () => {
    try {
      setPolicies(await registryApi.listRiskPolicies());
      setPoliciesError(null);
    } catch (e) {
      setPoliciesError(errorMessage(e, 'Failed to load risk policies'));
    }
  }, []);

  useEffect(() => { loadPolicies(); }, [loadPolicies]);

  const confirmKillAction = async (reason: string | undefined) => {
    await setKillSwitch(killSwitch, killSwitchTarget, killAction === 'kill', reason);
    await loadPolicies();
  };

  useEffect(() => {
    if (!id) return;
    setLoading(true);
    registryApi.listListingsPaginated({ listingId: id, limit: 1 })
      .then(async rows => {
        const l = rows[0] ?? null;
        setListing(l);
        if (l) {
          const [secs, related] = await Promise.all([
            registryApi.listSecuritiesPaginated({ securityId: l.securityId, limit: 1 }),
            registryApi.listListings().then(all => all.filter((r: Listing) => r.securityId === l.securityId && r.listingId !== id)),
          ]);
          setSecurity(secs[0] ?? null);
          setRelatedListings(related);
        }
      })
      .catch(console.error)
      .finally(() => setLoading(false));
  }, [id]);

  useEffect(() => {
    if (!security || security.type !== SecurityType.EVENT_CONTRACT) return;
    registryApi.listEventContracts({ securityId: security.securityId })
      .then(async (contracts: EventContract[]) => {
        const ec = contracts[0] ?? null;
        setEventContract(ec);
        if (ec) {
          const events = await registryApi.listEvents({ eventId: ec.eventId });
          setEvent((events as Event[])[0] ?? null);
        }
      })
      .catch(console.error);
  }, [security]);

  useEffect(() => {
    if (!id) return;
    setLoadingSpecs(true);
    registryApi.listListingSpecs(id, true)
      .then(setSpecs)
      .catch(() => setSpecs([]))
      .finally(() => setLoadingSpecs(false));
  }, [id]);

  if (loading) {
    return <Container size="xl" py="xl"><Loader /></Container>;
  }

  if (!listing) {
    return <Container size="xl" py="xl"><Text>Listing not found.</Text></Container>;
  }

  const exchange = exchanges.find(e => e.exchangeId === listing.exchangeId);

  return (
    <Container size="xl" py="xl">
      <Breadcrumbs mb="md">
        <Anchor onClick={() => navigate('/security-master')} size="sm">Security Master</Anchor>
        <Text size="sm">Listing {id}</Text>
      </Breadcrumbs>

      <Group mb="xl" justify="space-between">
        <div>
          <Title order={2}>{listing.securitySymbol}</Title>
          <Text c="dimmed">{listing.exchangeName} &mdash; {listing.exchangeSecuritySymbol}</Text>
        </div>
        <Button
          color={listingKilled ? 'green' : 'red'}
          leftSection={listingKilled ? <IconPlayerPlay size={16} /> : <IconPlayerStop size={16} />}
          onClick={() => setKillAction(listingKilled ? 'resume' : 'kill')}
        >
          {listingKilled ? 'Resume listing' : 'Kill listing'}
        </Button>
      </Group>

      {policiesError && <Alert mb="md" color="red" title="Error">{policiesError}</Alert>}

      {listingKilled && (
        <Alert mb="xl" color="red" title="Listing Killed" icon={<IconAlertTriangle size={20} />}>
          <Group justify="space-between" align="center">
            <Stack gap={4}>
              <Text size="sm">
                Kill switch is ACTIVE — all open orders on this listing were cancelled and no strategy can send orders to it until it is resumed.
              </Text>
              <KillSwitchLatestEntry entry={latestKillSwitchEntry} enabled />
            </Stack>
            {killSwitch && (
              <Button variant="outline" size="sm" leftSection={<IconHistory size={16} />} onClick={() => setHistoryTarget(killSwitch)}>
                History
              </Button>
            )}
          </Group>
        </Alert>
      )}

      <Grid gutter="md">
        <Grid.Col span={{ base: 12, md: 4 }}>
          <Paper p="md" withBorder h="100%">
            <Title order={4} mb="md">Listing</Title>
            <Stack gap={0}>
              <InfoRow label="Listing ID" value={listing.listingId} />
              <InfoRow label="Exchange Security ID" value={listing.exchangeSecurityId} />
              <InfoRow label="Exchange Symbol" value={listing.exchangeSecuritySymbol} />
              <InfoRow label="Created" value={<ReactTimeAgo date={new Date(listing.dateCreated)} timeStyle="round" />} />
              <InfoRow label="Modified" value={<ReactTimeAgo date={new Date(listing.dateModified)} timeStyle="round" />} />
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
                {eventContract && event && (
                  <>
                    <InfoRow label="Event" value={
                      <Anchor size="sm" onClick={() => navigate(`/predictions/events/${event.eventId}`)}>
                        {event.title}
                      </Anchor>
                    } />
                    <InfoRow label="Outcome" value={eventContract.outcomeLabel} />
                  </>
                )}
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
              <InfoRow label="Name" value={listing.exchangeName} />
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
                    <Table.Th>Min Size</Table.Th>
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
                      <Table.Td>{formatUnscaled(unscaleSize(spec.minSize))}</Table.Td>
                      <Table.Td>{formatUnscaled(unscalePrice(spec.minNotional))}</Table.Td>
                      <Table.Td>{formatUnscaled(unscaleContractMultiplier(spec.contractMultiplier))}</Table.Td>
                      <Table.Td><ReactTimeAgo date={new Date(spec.recordedAt)} timeStyle="round" /></Table.Td>
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
                        <Table.Td><ReactTimeAgo date={new Date(l.dateCreated)} timeStyle="round" /></Table.Td>
                      </Table.Tr>
                    );
                  })}
                </Table.Tbody>
              </Table>
            </Paper>
          </Grid.Col>
        )}
      </Grid>

      <ReasonConfirmModal
        opened={killAction === 'kill'}
        onClose={() => setKillAction(null)}
        title="Kill Listing"
        message={`This will immediately cancel all open orders on ${listing.exchangeSecuritySymbol} (listing ${id}) across every strategy and block new orders to it. The listing stays killed until resumed. Are you sure?`}
        confirmLabel="Kill listing"
        onConfirm={confirmKillAction}
      />

      <ReasonConfirmModal
        opened={killAction === 'resume'}
        onClose={() => setKillAction(null)}
        title="Resume Listing"
        message={`This will turn off the kill switch for ${listing.exchangeSecuritySymbol} (listing ${id}) and allow strategies to send orders to it again. Are you sure?`}
        confirmLabel="Resume listing"
        confirmColor="green"
        onConfirm={confirmKillAction}
      />

      <RiskPolicyHistoryModal policy={historyTarget} onClose={() => setHistoryTarget(null)} />
    </Container>
  );
}

export default ListingDetail;
