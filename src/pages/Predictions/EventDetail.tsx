import { useCallback, useEffect, useMemo, useState } from 'react';
import { useParams } from 'react-router-dom';
import {
  ActionIcon,
  Alert,
  Anchor,
  Badge,
  Box,
  Breadcrumbs,
  Button,
  Container,
  CopyButton,
  Grid,
  Group,
  Modal,
  Paper,
  Skeleton,
  Stack,
  Table,
  Text,
  Title,
  Tooltip,
} from '@mantine/core';
import { useDisclosure } from '@mantine/hooks';
import { IconCheck, IconCopy, IconExternalLink, IconPlus, IconSearch, IconTrash } from '@tabler/icons-react';
import { Link } from 'react-router-dom';
import ReactTimeAgo from 'react-time-ago';
import { MantineReactTable, useMantineReactTable, type MRT_ColumnDef, type MRT_Row } from 'mantine-react-table';
import { ContractRelationship, ContractRelationshipType, DenormalizedListing, Event, EventContract, isActiveSession } from '../../types';
import { SETTLEMENT_COLORS, SettlementBadge } from '../../components/trading/SettlementBadge';
import { formatVolume, settlementState } from '../../utils/format';
import { registryApi } from '../../utils/api';
import { useGlobalState } from '../../context/GlobalStateContext';
import { useLatestRequest } from '../../hooks/useLatestRequest';
import { errorMessage } from '../../utils/kill-switch';
import EventRelationshipViews from './relationships/EventRelationshipViews';
import BulkCreateRelationshipModal from './BulkCreateRelationshipModal';
import { EvidencePanel, FlagBadges } from './PropositionParts';
import { STORED_ROWS_NOTE } from '../../utils/propositions';
import { usePageTitleLabels } from '../../context/PageTitleContext';
import { useTradedSessions } from '../../query/hooks';
import { RunningSessionsBadge, TradedSessionsPanel } from '../../components/TradedSessions';
import { sessionListingIds } from '../../utils/session-config';

const RELATIONSHIP_COLORS: Record<ContractRelationshipType, string> = {
  EQUIVALENT: 'green',
  IMPLIES: 'blue',
};

function getExchangeSearchUrl(exchangeCode: string, query: string): string | null {
  switch (exchangeCode) {
    case 'KALSHI':
      return `https://kalshi.com/search?q=${encodeURIComponent(query)}`;
    case 'POLYMARKET_INTL':
      return `https://polymarket.com/search?_q=${query.toLowerCase().replace(/\s+/g, '-')}`;
    case 'POLYMARKET_US':
      return `https://polymarket.us/search?q=${encodeURIComponent(query)}`;
    default:
      return null;
  }
}

function InfoRow({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <Group justify="space-between" py={4} style={{ borderBottom: '1px solid var(--mantine-color-dark-5)' }}>
      <Text size="sm" c="dimmed">{label}</Text>
      <Text size="sm" component="div">{value}</Text>
    </Group>
  );
}

type EnrichedContract = EventContract;

function SkeletonInfoPaper({ title, rows }: { title: string; rows: number }) {
  return (
    <Paper withBorder p="md" h="100%">
      <Title order={5} mb="sm">{title}</Title>
      {Array.from({ length: rows }, (_, i) => (
        <Group key={i} justify="space-between" py={8} style={{ borderBottom: '1px solid var(--mantine-color-dark-5)' }}>
          <Skeleton h={12} w={80} />
          <Skeleton h={12} w={140} />
        </Group>
      ))}
    </Paper>
  );
}

function EventDetailSkeleton() {
  return (
    <Container size="xl" py="xl">
      <Breadcrumbs mb="md">
        <Anchor component={Link} to="/predictions/events" size="sm">Events</Anchor>
        <Skeleton h={12} w={200} />
      </Breadcrumbs>
      <Group mb="xl" align="flex-start">
        <Stack gap={8} style={{ flex: 1 }}>
          <Skeleton h={28} w="50%" />
          <Skeleton h={14} w={120} />
        </Stack>
        <Skeleton h={26} w={80} radius="xl" />
      </Group>
      <Grid gutter="md" mb="md">
        <Grid.Col span={{ base: 12, md: 6 }}><SkeletonInfoPaper title="Event Info" rows={8} /></Grid.Col>
        <Grid.Col span={{ base: 12, md: 6 }}><SkeletonInfoPaper title="Exchange" rows={3} /></Grid.Col>
      </Grid>
      {['Contracts', 'Relationships'].map(section => (
        <Paper key={section} withBorder p="md" mb="md">
          <Title order={5} mb="sm">{section}</Title>
          <Stack gap={6}>
            {[0, 1, 2, 3].map(i => <Skeleton key={i} h={22} />)}
          </Stack>
        </Paper>
      ))}
    </Container>
  );
}

function EventDetail() {
  const { eventId } = useParams<{ eventId: string }>();
  const { exchanges } = useGlobalState();
  const id = parseInt(eventId ?? '0');

  const [event, setEvent] = useState<Event | null>(null);
  const [contracts, setContracts] = useState<EnrichedContract[]>([]);
  const [relationships, setRelationships] = useState<ContractRelationship[]>([]);
  const [loading, setLoading] = useState(true);
  const [eventError, setEventError] = useState<string | null>(null);
  const [listingsError, setListingsError] = useState<string | null>(null);
  const [relationshipsError, setRelationshipsError] = useState<string | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<ContractRelationship | null>(null);
  const [deletePending, setDeletePending] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);
  const beginRelationshipsRequest = useLatestRequest();
  const [listingsBySecurityId, setListingsBySecurityId] = useState<Record<number, DenormalizedListing[]>>({});
  const [subjectBySecurityId, setSubjectBySecurityId] = useState<Record<number, { subjectId: number; key: string }>>({});
  const [createOpened, { open: openCreate, close: closeCreate }] = useDisclosure(false);


  useEffect(() => {
    if (!id) return;
    let cancelled = false;
    // Invalidates a relationships refresh still in flight for the previous event.
    beginRelationshipsRequest();
    setLoading(true);
    setEventError(null);
    setListingsError(null);
    setRelationshipsError(null);

    Promise.all([
      registryApi.listEvents({ eventId: id }),
      registryApi.listEventContracts({ eventId: id }),
      registryApi.listContractRelationships({ eventId: id }),
    ]).then(async ([evts, ecs, rels]) => {
      if (cancelled) return;
      setEvent((evts as Event[])[0] ?? null);
      setContracts(ecs as EventContract[]);
      setRelationships(rels as ContractRelationship[]);

      const eventContracts = ecs as EventContract[];
      const uniqueSecurityIds = [...new Set(eventContracts.map(c => c.securityId))];
      let failedListingLoads = 0;
      const listingResults = await Promise.all(
        uniqueSecurityIds.map(secId =>
          registryApi.listListingsPaginated({ securityId: secId })
            .then(listings => [secId, listings] as const)
            .catch(() => {
              failedListingLoads++;
              return [secId, []] as const;
            })
        )
      );
      if (cancelled) return;
      setListingsBySecurityId(Object.fromEntries(listingResults));
      if (failedListingLoads > 0) {
        setListingsError(`Failed to load listings for ${failedListingLoads} of ${uniqueSecurityIds.length} securities.`);
      }
    }).catch(e => {
      if (!cancelled) setEventError(errorMessage(e, 'Failed to load event'));
    }).finally(() => {
      if (!cancelled) setLoading(false);
    });
    return () => { cancelled = true; };
  }, [id, beginRelationshipsRequest]);

  const contractSecurityIds = useMemo(() => [...new Set(contracts.map(c => c.securityId))], [contracts]);
  useEffect(() => {
    if (contractSecurityIds.length === 0) return;
    let cancelled = false;
    registryApi.listSecurityPropositions(contractSecurityIds).then(async propositions => {
      const subjectIds = [...new Set(propositions.map(p => p.subjectId))];
      const subjects = subjectIds.length > 0 ? await registryApi.listPropositionSubjects({ subjectIds }) : [];
      const keyOf = Object.fromEntries(subjects.map(s => [s.subjectId, s.key]));
      if (cancelled) return;
      setSubjectBySecurityId(Object.fromEntries(propositions.map(p =>
        [p.securityId, { subjectId: p.subjectId, key: keyOf[p.subjectId] ?? `#${p.subjectId}` }])));
    // The subject column is a pointer, not the page's content: without it the contracts still read fine.
    }).catch(() => { if (!cancelled) setSubjectBySecurityId({}); });
    return () => { cancelled = true; };
  }, [contractSecurityIds]);
  const eventSubjects = useMemo(() => {
    const byId = new Map(Object.values(subjectBySecurityId).map(s => [s.subjectId, s]));
    return [...byId.values()].sort((a, b) => a.key.localeCompare(b.key));
  }, [subjectBySecurityId]);

  const settledCount = contracts.filter(c => c.settlementPrice !== null && c.settlementPrice !== undefined).length;

  const tradedSessions = useTradedSessions({ eventId: id });
  const listingLabels = useMemo(() => Object.fromEntries(contracts.flatMap(c =>
    (listingsBySecurityId[c.securityId] ?? []).map(l => [l.listingId, `${c.outcomeLabel} @ ${l.exchangeName}`]),
  )) as Record<number, string>, [contracts, listingsBySecurityId]);
  const sessionsBySecurityId = useMemo(() => {
    const securityOf = new Map(Object.entries(listingsBySecurityId)
      .flatMap(([securityId, listings]) => listings.map(l => [l.listingId, Number(securityId)] as const)));
    const bySecurity: Record<number, { running: number; total: number }> = {};
    for (const session of tradedSessions.data ?? []) {
      const securities = new Set(sessionListingIds(session).map(l => securityOf.get(l)).filter(s => s !== undefined));
      for (const securityId of securities) {
        const counts = (bySecurity[securityId] ??= { running: 0, total: 0 });
        counts.total += 1;
        if (isActiveSession(session.status)) counts.running += 1;
      }
    }
    return bySecurity;
  }, [tradedSessions.data, listingsBySecurityId]);

  const contractColumns = useMemo<MRT_ColumnDef<EnrichedContract>[]>(() => [
    {
      accessorKey: 'securityId',
      header: 'Security',
      Cell: ({ row }) => {
        const sym = row.original.securitySymbol ?? `#${row.original.securityId}`;
        return (
          <Anchor component={Link} to={`/security-master/securities/${row.original.securityId}`} size="sm">
            {sym}
          </Anchor>
        );
      },
    },
    {
      accessorKey: 'outcomeLabel',
      header: 'Outcome',
    },
    {
      id: 'subject',
      header: 'Subject',
      enableSorting: false,
      Cell: ({ row }) => {
        const subject = subjectBySecurityId[row.original.securityId];
        return subject ? (
          <Anchor component={Link} to={`/predictions/subjects/${subject.subjectId}`} size="sm" ff="monospace">
            {subject.key}
          </Anchor>
        ) : <Text span size="sm" c="dimmed">—</Text>;
      },
    },
    {
      accessorKey: 'settlementPrice',
      header: 'Settlement',
      size: 140,
      Cell: ({ row }) => (
        <SettlementBadge
          settlementPrice={row.original.settlementPrice}
          settledAt={row.original.settledAt}
          exchangeId={event?.exchangeId}
        />
      ),
    },
    {
      id: 'sessions',
      header: 'Sessions',
      size: 110,
      enableSorting: false,
      Cell: ({ row }) => {
        const counts = sessionsBySecurityId[row.original.securityId];
        if (!counts) return <Text span size="sm" c="dimmed">—</Text>;
        return counts.running > 0
          ? <Badge color="green" variant="light" size="sm">{counts.running} running</Badge>
          : <Text span size="sm" c="dimmed">{counts.total} past</Text>;
      },
    },
    {
      accessorKey: 'eventContractId',
      header: 'Contract ID',
      size: 130,
      Cell: ({ row }) => (
        <Group gap={6} wrap="nowrap">
          <Text size="sm">{row.original.eventContractId}</Text>
          <CopyButton value={String(row.original.eventContractId)} timeout={2000}>
            {({ copied, copy }) => (
              <Tooltip label={copied ? 'Copied!' : 'Copy contract ID'} withArrow position="right">
                <ActionIcon size="sm" variant="subtle" color={copied ? 'teal' : 'gray'} onClick={copy} style={{ flexShrink: 0 }}>
                  {copied ? <IconCheck size={13} /> : <IconCopy size={13} />}
                </ActionIcon>
              </Tooltip>
            )}
          </CopyButton>
        </Group>
      ),
    },
    {
      accessorKey: 'dateCreated',
      header: 'Created',
      Cell: ({ row }) =>
        row.original.dateCreated ? (
          <ReactTimeAgo date={new Date(row.original.dateCreated)} timeStyle="round" />
        ) : '-',
    },
  ], [event?.exchangeId, sessionsBySecurityId, subjectBySecurityId]);

  const requestDelete = (relationship: ContractRelationship) => {
    setDeleteError(null);
    setDeleteTarget(relationship);
  };

  const confirmDelete = async () => {
    if (!deleteTarget) return;
    const relationshipId = deleteTarget.relationshipId;
    setDeletePending(true);
    setDeleteError(null);
    try {
      await registryApi.deleteContractRelationship(relationshipId);
      setRelationships(prev => prev.filter(r => r.relationshipId !== relationshipId));
      setDeleteTarget(null);
    } catch (err) {
      setDeleteError(errorMessage(err, 'Failed to delete relationship'));
    } finally {
      setDeletePending(false);
    }
  };

  const refreshRelationships = useCallback(() => {
    const isCurrent = beginRelationshipsRequest();
    setRelationshipsError(null);
    registryApi.listContractRelationships({ eventId: id })
      .then(rels => { if (isCurrent()) setRelationships(rels as ContractRelationship[]); })
      .catch(e => { if (isCurrent()) setRelationshipsError(errorMessage(e, 'Failed to refresh relationships')); });
  }, [id, beginRelationshipsRequest]);


  const relColumns = useMemo<MRT_ColumnDef<ContractRelationship>[]>(() => [
    {
      accessorKey: 'securityIdA',
      header: 'Security A',
      Cell: ({ row }) => {
        const sym = row.original.symbolA ?? `#${row.original.securityIdA}`;
        return (
          <Anchor component={Link} to={`/security-master/securities/${row.original.securityIdA}`} size="sm" onClick={e => e.stopPropagation()}>
            {sym}
          </Anchor>
        );
      },
    },
    {
      accessorKey: 'securityIdB',
      header: 'Security B',
      Cell: ({ row }) => {
        const sym = row.original.symbolB ?? `#${row.original.securityIdB}`;
        return (
          <Anchor component={Link} to={`/security-master/securities/${row.original.securityIdB}`} size="sm" onClick={e => e.stopPropagation()}>
            {sym}
          </Anchor>
        );
      },
    },
    {
      accessorKey: 'relationshipType',
      header: 'Type',
      Cell: ({ row }) => (
        <Badge color={RELATIONSHIP_COLORS[row.original.relationshipType] ?? 'gray'} variant="light" size="sm">
          {row.original.relationshipType.replace(/_/g, ' ')}
        </Badge>
      ),
    },
    {
      accessorKey: 'flags',
      header: 'Flags',
      size: 160,
      Cell: ({ row }) => <FlagBadges flags={row.original.flags} />,
    },
    {
      accessorKey: 'method',
      header: 'Method',
      size: 90,
    },
  ], []);

  const contractTable = useMantineReactTable({
    columns: contractColumns,
    data: contracts,
    enableColumnFilters: false,
    enableSorting: true,
    enablePagination: true,
    enableBottomToolbar: true,
    enableTopToolbar: false,
    mantineTableProps: { striped: true, highlightOnHover: true, withColumnBorders: true },
    // Settled outcomes are tinted by what they paid, so the winner stands out from the losers at a glance.
    mantineTableBodyRowProps: ({ row }) => {
      const state = settlementState(row.original.settlementPrice);
      return state ? { style: { backgroundColor: `var(--mantine-color-${SETTLEMENT_COLORS[state]}-light)` } } : {};
    },
    initialState: { density: 'xs', pagination: { pageIndex: 0, pageSize: 25 } },
    renderDetailPanel: ({ row }: { row: MRT_Row<EnrichedContract> }) => {
      const listings = listingsBySecurityId[row.original.securityId] ?? [];
      if (listings.length === 0) {
        return <Text size="sm" c="dimmed" p="md">No listings found for this security.</Text>;
      }
      return (
        <Table striped highlightOnHover withColumnBorders fz="sm" style={{ maxWidth: 700 }}>
          <Table.Thead>
            <Table.Tr>
              <Table.Th>Exchange</Table.Th>
              <Table.Th>Symbol</Table.Th>
              <Table.Th>Listing ID</Table.Th>
            </Table.Tr>
          </Table.Thead>
          <Table.Tbody>
            {listings.map(listing => (
              <Table.Tr key={listing.listingId}>
                <Table.Td>{listing.exchangeName}</Table.Td>
                <Table.Td>{listing.exchangeSecuritySymbol}</Table.Td>
                <Table.Td>
                  <Group gap={6} wrap="nowrap">
                    <Anchor component={Link} to={`/security-master/listings/${listing.listingId}`} size="sm">
                      {listing.listingId}
                    </Anchor>
                    <CopyButton value={String(listing.listingId)} timeout={2000}>
                      {({ copied, copy }) => (
                        <Tooltip label={copied ? 'Copied!' : 'Copy listing ID'} withArrow position="right">
                          <ActionIcon size="sm" variant="subtle" color={copied ? 'teal' : 'gray'} onClick={copy} style={{ flexShrink: 0 }}>
                            {copied ? <IconCheck size={13} /> : <IconCopy size={13} />}
                          </ActionIcon>
                        </Tooltip>
                      )}
                    </CopyButton>
                  </Group>
                </Table.Td>
              </Table.Tr>
            ))}
          </Table.Tbody>
        </Table>
      );
    },
  });

  const relTable = useMantineReactTable({
    columns: relColumns,
    data: relationships,
    enableColumnFilters: false,
    enableSorting: true,
    enablePagination: true,
    enableBottomToolbar: true,
    enableTopToolbar: false,
    enableRowActions: true,
    positionActionsColumn: 'last',
    mantineTableProps: { striped: true, highlightOnHover: true, withColumnBorders: true },
    initialState: { density: 'xs', sorting: [{ id: 'relationshipType', desc: false }] },
    renderDetailPanel: ({ row }: { row: MRT_Row<ContractRelationship> }) => (
      <EvidencePanel
        evidence={row.original.evidence}
        labelA={row.original.symbolA ?? `#${row.original.securityIdA}`}
        labelB={row.original.symbolB ?? `#${row.original.securityIdB}`}
      />
    ),
    renderRowActions: ({ row }: { row: MRT_Row<ContractRelationship> }) => (
      <Tooltip label="Delete" position="left" withArrow openDelay={500}>
        <ActionIcon variant="subtle" color="red" onClick={e => { e.stopPropagation(); requestDelete(row.original); }}>
          <IconTrash size={16} />
        </ActionIcon>
      </Tooltip>
    ),
  });

  const exchangeById = useMemo(
    () => Object.fromEntries(exchanges.map(e => [e.exchangeId, e.exchangeName])),
    [exchanges],
  );
  const exchangeCodeById = useMemo(
    () => Object.fromEntries(exchanges.map(e => [e.exchangeId, e.exchangeCode])),
    [exchanges],
  );

  usePageTitleLabels([{ segment: eventId, label: event?.title }]);

  if (loading) {
    return <EventDetailSkeleton />;
  }

  if (eventError) {
    return (
      <Container size="xl" py="xl">
        <Alert color="red" title="Error">{eventError}</Alert>
      </Container>
    );
  }

  if (!event) {
    return <Container size="xl" py="xl"><Text>Event not found.</Text></Container>;
  }

  const exchangeSearchUrl = event.exchangeId != null
    ? getExchangeSearchUrl(exchangeCodeById[event.exchangeId] ?? '', event.title)
    : null;

  return (
    <Container size="xl" py="xl">
      <Breadcrumbs mb="md">
        <Anchor component={Link} to="/predictions/events" size="sm">Events</Anchor>
        <Text size="sm">{event.title}</Text>
      </Breadcrumbs>

      <Group mb="xl" align="flex-start">
        <div style={{ flex: 1 }}>
          <Title order={2}>{event.title}</Title>
          {event.category && <Text c="dimmed">{event.category}</Text>}
        </div>
        <RunningSessionsBadge sessions={tradedSessions.data} />
        <Badge color={event.resolved ? 'green' : 'blue'} variant="light" size="lg">
          {event.resolved ? 'Resolved' : 'Active'}
        </Badge>
      </Group>

      <Grid gutter="md" mb="md">
        <Grid.Col span={{ base: 12, md: 6 }}>
          <Paper withBorder p="md" h="100%">
            <Title order={5} mb="sm">Event Info</Title>
            <InfoRow label="Event ID" value={event.eventId} />
            <InfoRow label="Description" value={event.description ?? '-'} />
            <InfoRow label="Category" value={event.category ?? '-'} />
            <InfoRow
              label="Tags"
              value={
                event.tags?.length > 0 ? (
                  <Stack gap={2} align="flex-end">
                    {event.tags.map(tag => (
                      <Anchor
                        key={tag}
                        component={Link}
                        to={`/predictions/events?tag=${encodeURIComponent(tag)}`}
                        style={{ textDecoration: 'none' }}
                      >
                        <Badge size="xs" variant="outline" color="green" style={{ cursor: 'pointer' }}>{tag}</Badge>
                      </Anchor>
                    ))}
                  </Stack>
                ) : '-'
              }
            />
            <InfoRow label="24h Volume" value={formatVolume(event.volume24h)} />
            <InfoRow label="Volume Read" value={event.volumeUpdatedAt ? <ReactTimeAgo date={new Date(event.volumeUpdatedAt)} timeStyle="round" /> : '-'} />
            <InfoRow label="Expiry" value={event.expiry ? <ReactTimeAgo date={new Date(event.expiry)} timeStyle="round" /> : '-'} />
            <InfoRow label="Resolved At" value={event.resolvedAt ? <ReactTimeAgo date={new Date(event.resolvedAt)} timeStyle="round" /> : '-'} />
            <InfoRow label="Created" value={event.dateCreated ? <ReactTimeAgo date={new Date(event.dateCreated)} timeStyle="round" /> : '-'} />
            <InfoRow label="Modified" value={event.dateModified ? <ReactTimeAgo date={new Date(event.dateModified)} timeStyle="round" /> : '-'} />
          </Paper>
        </Grid.Col>

        <Grid.Col span={{ base: 12, md: 6 }}>
          <Paper withBorder p="md" h="100%">
            <Title order={5} mb="sm">Exchange</Title>
            <InfoRow label="Exchange" value={event.exchangeId != null ? (exchangeById[event.exchangeId] ?? `#${event.exchangeId}`) : '-'} />
            <InfoRow
              label="Native ID"
              value={
                event.nativeUrl ? (
                  <Anchor href={event.nativeUrl} target="_blank" rel="noopener noreferrer" size="sm">
                    <Group gap={4} wrap="nowrap">
                      {event.nativeEventId}
                      <IconExternalLink size={14} />
                    </Group>
                  </Anchor>
                ) : (event.nativeEventId ?? '-')
              }
            />
            <InfoRow
              label="Search"
              value={
                exchangeSearchUrl ? (
                  <Tooltip label="Search on exchange" openDelay={500}>
                    <ActionIcon component="a" href={exchangeSearchUrl} target="_blank" rel="noopener noreferrer" variant="subtle" size="sm">
                      <IconSearch size={14} />
                    </ActionIcon>
                  </Tooltip>
                ) : '-'
              }
            />
          </Paper>
        </Grid.Col>
      </Grid>

      <Paper withBorder p="md" mb="md">
        <Group justify="space-between" mb="sm">
          <Group gap="xs">
            <Title order={5}>Contracts ({contracts.length})</Title>
            {settledCount > 0 && (
              <Badge color={settledCount === contracts.length ? 'green' : 'gray'} variant="light" size="sm">
                {settledCount} of {contracts.length} settled
              </Badge>
            )}
          </Group>
          {contracts.length === 2 && (
            <Badge color="teal" variant="light" size="sm">Binary · Contracts are complements</Badge>
          )}
          {contracts.length > 2 && (
            <Badge color="orange" variant="light" size="sm">Multi-Outcome · All mutually exclusive</Badge>
          )}
        </Group>
        {listingsError && <Alert color="red" title="Error" mb="sm">{listingsError}</Alert>}
        <MantineReactTable table={contractTable} />
      </Paper>

      <Box mb="md">
        <TradedSessionsPanel
          sessions={tradedSessions.data}
          isLoading={tradedSessions.isLoading}
          error={tradedSessions.error}
          listingLabels={listingLabels}
        />
      </Box>

      <Paper withBorder p="md" mb="md">
        <Group justify="space-between" mb="sm">
          <Stack gap={2}>
            <Title order={5}>Stored relationships ({relationships.length})</Title>
            <Text size="xs" c="dimmed" maw={640}>{STORED_ROWS_NOTE}</Text>
          </Stack>
          <Tooltip label="Bulk Create Relationships" position="left" withArrow openDelay={500}>
            <ActionIcon size="lg" variant="filled" color="green" onClick={openCreate}>
              <IconPlus size={20} />
            </ActionIcon>
          </Tooltip>
        </Group>
        {relationshipsError && <Alert color="red" title="Error" mb="sm">{relationshipsError}</Alert>}
        {relationships.length === 0 ? (
          <Text size="sm" c="dimmed">No relationships found for this event's contracts.</Text>
        ) : (
          <MantineReactTable table={relTable} />
        )}
      </Paper>

      <BulkCreateRelationshipModal
        opened={createOpened}
        onClose={closeCreate}
        onCreated={refreshRelationships}
        currentEventId={id}
        currentEventTitle={event.title}
        currentContracts={contracts}
      />

      <Modal
        opened={deleteTarget !== null}
        onClose={() => { if (deletePending) return; setDeleteTarget(null); }}
        title="Delete Relationship"
        size="sm"
      >
        <Stack>
          <Text>Are you sure you want to delete this relationship?</Text>
          {deleteTarget && (
            <Text fw={500}>
              {deleteTarget.symbolA ?? `#${deleteTarget.securityIdA}`} {deleteTarget.relationshipType.replace(/_/g, ' ')} {deleteTarget.symbolB ?? `#${deleteTarget.securityIdB}`}
            </Text>
          )}
          {deleteError && <Text c="red" size="sm">{deleteError}</Text>}
          <Group justify="flex-end">
            <Button variant="default" disabled={deletePending} onClick={() => setDeleteTarget(null)}>Cancel</Button>
            <Button color="red" loading={deletePending} onClick={confirmDelete}>Delete</Button>
          </Group>
        </Stack>
      </Modal>

      <Paper withBorder p="md" mb="md">
        <Title order={5} mb="sm">Relationships by unit</Title>
        <EventRelationshipViews subjects={eventSubjects} securityIds={contractSecurityIds} />
      </Paper>

    </Container>
  );
}

export default EventDetail;
