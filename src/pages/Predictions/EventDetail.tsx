import { useCallback, useEffect, useMemo, useState } from 'react';
import { useParams } from 'react-router-dom';
import {
  ActionIcon,
  Anchor,
  Badge,
  Breadcrumbs,
  Button,
  Card,
  Container,
  Grid,
  Group,
  Loader,
  Paper,
  SimpleGrid,
  Stack,
  Table,
  Text,
  ThemeIcon,
  Title,
  Tooltip,
} from '@mantine/core';
import { useDisclosure } from '@mantine/hooks';
import { IconExternalLink, IconPlayerPlay, IconPlus, IconSearch, IconTrash } from '@tabler/icons-react';
import { Link } from 'react-router-dom';
import ReactTimeAgo from 'react-time-ago';
import { MantineReactTable, useMantineReactTable, type MRT_ColumnDef, type MRT_Row } from 'mantine-react-table';
import { ContractRelationship, ContractRelationshipType, Event, EventContract, ExchangeEvent } from '../../types';
import { registryApi } from '../../utils/api';
import { useGlobalState } from '../../context/GlobalStateContext';
import RelationshipGraph from './RelationshipGraph';
import BulkCreateRelationshipModal from './BulkCreateRelationshipModal';

const RELATIONSHIP_COLORS: Record<ContractRelationshipType, string> = {
  EQUIVALENT: 'green',
  IMPLIES: 'blue',
  MUTUALLY_EXCLUSIVE: 'orange',
  HEDGEABLE_WITH: 'violet',
};

function getExchangeSearchUrl(exchangeName: string, query: string): string | null {
  switch (exchangeName.toLowerCase()) {
    case 'kalshi':
      return `https://kalshi.com/search?q=${encodeURIComponent(query)}`;
    case 'polymarket':
      return `https://polymarket.com/search?_q=${query.toLowerCase().replace(/\s+/g, '-')}`;
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

function EventDetail() {
  const { eventId } = useParams<{ eventId: string }>();
  const { exchanges } = useGlobalState();
  const id = parseInt(eventId ?? '0');

  const [event, setEvent] = useState<Event | null>(null);
  const [contracts, setContracts] = useState<EnrichedContract[]>([]);
  const [exchangeEvents, setExchangeEvents] = useState<ExchangeEvent[]>([]);
  const [relationships, setRelationships] = useState<ContractRelationship[]>([]);
  const [loading, setLoading] = useState(true);
  const [showGraph, setShowGraph] = useState(false);
  const [createOpened, { open: openCreate, close: closeCreate }] = useDisclosure(false);

  useEffect(() => {
    if (!id) return;
    setLoading(true);

    Promise.all([
      registryApi.listEvents({ eventId: id }),
      registryApi.listEventContracts({ eventId: id }),
      registryApi.listExchangeEvents({ eventId: id }),
      registryApi.listContractRelationships({ eventId: id }),
    ]).then(([evts, ecs, exEvts, rels]) => {
      setEvent((evts as Event[])[0] ?? null);
      setExchangeEvents(exEvts as ExchangeEvent[]);
      setContracts(ecs as EventContract[]);
      setRelationships(rels as ContractRelationship[]);
    }).catch(console.error).finally(() => setLoading(false));
  }, [id]);

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
      accessorKey: 'eventContractId',
      header: 'Contract ID',
      size: 100,
    },
    {
      accessorKey: 'dateCreated',
      header: 'Created',
      Cell: ({ row }) =>
        row.original.dateCreated ? (
          <ReactTimeAgo date={new Date(row.original.dateCreated)} timeStyle="round" />
        ) : '-',
    },
  ], []);

  const handleDelete = useCallback(async (relationshipId: number) => {
    try {
      await registryApi.deleteContractRelationship(relationshipId);
      setRelationships(prev => prev.filter(r => r.relationshipId !== relationshipId));
    } catch (err) {
      console.error('Failed to delete:', err);
    }
  }, []);

  const refreshRelationships = useCallback(() => {
    registryApi.listContractRelationships({ eventId: id })
      .then(rels => setRelationships(rels as ContractRelationship[]))
      .catch(console.error);
  }, [id]);

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
      accessorKey: 'confidence',
      header: 'Confidence',
      size: 100,
      Cell: ({ row }) => `${(row.original.confidence * 100).toFixed(0)}%`,
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
    initialState: { density: 'xs', pagination: { pageIndex: 0, pageSize: 25 } },
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
    initialState: { density: 'xs', sorting: [{ id: 'confidence', desc: true }] },
    renderRowActions: ({ row }: { row: MRT_Row<ContractRelationship> }) => (
      <Tooltip label="Delete" position="left" withArrow openDelay={500}>
        <ActionIcon variant="subtle" color="red" onClick={e => { e.stopPropagation(); handleDelete(row.original.relationshipId); }}>
          <IconTrash size={16} />
        </ActionIcon>
      </Tooltip>
    ),
  });

  const exchangeById = useMemo(
    () => Object.fromEntries(exchanges.map(e => [e.exchangeId, e.exchangeName])),
    [exchanges],
  );

  const securitySymbolMap = useMemo(() => {
    const map: Record<number, string> = {};
    for (const c of contracts) {
      if (c.securitySymbol) map[c.securityId] = c.securitySymbol;
    }
    for (const r of relationships) {
      if (r.symbolA) map[r.securityIdA] = r.symbolA;
      if (r.symbolB) map[r.securityIdB] = r.symbolB;
    }
    return map;
  }, [contracts, relationships]);

  if (loading) {
    return <Container size="xl" py="xl"><Loader /></Container>;
  }

  if (!event) {
    return <Container size="xl" py="xl"><Text>Event not found.</Text></Container>;
  }

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
            <InfoRow label="Expiry" value={event.expiry ? <ReactTimeAgo date={new Date(event.expiry)} timeStyle="round" /> : '-'} />
            <InfoRow label="Resolved At" value={event.resolvedAt ? <ReactTimeAgo date={new Date(event.resolvedAt)} timeStyle="round" /> : '-'} />
            <InfoRow label="Created" value={event.dateCreated ? <ReactTimeAgo date={new Date(event.dateCreated)} timeStyle="round" /> : '-'} />
            <InfoRow label="Modified" value={event.dateModified ? <ReactTimeAgo date={new Date(event.dateModified)} timeStyle="round" /> : '-'} />
          </Paper>
        </Grid.Col>

        <Grid.Col span={{ base: 12, md: 6 }}>
          <Paper withBorder p="md" h="100%">
            <Title order={5} mb="sm">Exchange Mappings ({exchangeEvents.length})</Title>
            {exchangeEvents.length === 0 ? (
              <Text size="sm" c="dimmed">No exchange mappings.</Text>
            ) : (
              <Table striped highlightOnHover withColumnBorders fz="sm" style={{ tableLayout: 'fixed', width: '100%' }}>
                <Table.Thead>
                  <Table.Tr>
                    <Table.Th>Exchange</Table.Th>
                    <Table.Th>Native ID</Table.Th>
                    <Table.Th>Raw Title</Table.Th>
                    <Table.Th style={{ width: 60 }}>Search</Table.Th>
                  </Table.Tr>
                </Table.Thead>
                <Table.Tbody>
                  {exchangeEvents.map(xe => {
                    const exchangeName = exchangeById[xe.exchangeId] ?? '';
                    const nativeIdCell = xe.nativeUrl ? (
                      <Anchor href={xe.nativeUrl} target="_blank" rel="noopener noreferrer" size="sm">
                        <Group gap={4} wrap="nowrap">
                          {xe.nativeEventId}
                          <IconExternalLink size={14} />
                        </Group>
                      </Anchor>
                    ) : xe.nativeEventId;
                    const searchUrl = getExchangeSearchUrl(exchangeName, xe.rawTitle);
                    return (
                      <Table.Tr key={xe.exchangeEventId}>
                        <Table.Td>{exchangeName || `#${xe.exchangeId}`}</Table.Td>
                        <Table.Td style={{ maxWidth: 180, wordBreak: 'break-all' }}>{nativeIdCell}</Table.Td>
                        <Table.Td style={{ maxWidth: 200, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                          {xe.rawTitle}
                        </Table.Td>
                        <Table.Td style={{ textAlign: 'center' }}>
                          {searchUrl && (
                            <Tooltip label="Search on exchange" openDelay={500}>
                              <ActionIcon
                                component="a"
                                href={searchUrl}
                                target="_blank"
                                rel="noopener noreferrer"
                                variant="subtle"
                                size="sm"
                              >
                                <IconSearch size={14} />
                              </ActionIcon>
                            </Tooltip>
                          )}
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

      <Paper withBorder p="md" mb="md">
        <Group justify="space-between" mb="sm">
          <Title order={5}>Contracts ({contracts.length})</Title>
          {contracts.length === 2 && (
            <Badge color="teal" variant="light" size="sm">Binary · Contracts are complements</Badge>
          )}
          {contracts.length > 2 && (
            <Badge color="orange" variant="light" size="sm">Multi-Outcome · All mutually exclusive</Badge>
          )}
        </Group>
        <MantineReactTable table={contractTable} />
      </Paper>

      <Paper withBorder p="md" mb="md">
        <Group justify="space-between" mb="sm">
          <Title order={5}>Relationships ({relationships.length})</Title>
          <Tooltip label="Bulk Create Relationships" position="left" withArrow openDelay={500}>
            <ActionIcon size="lg" variant="filled" color="green" onClick={openCreate}>
              <IconPlus size={20} />
            </ActionIcon>
          </Tooltip>
        </Group>
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

      {relationships.length > 0 && (
        <Paper withBorder p="md" mb="md">
          <Group justify="space-between" mb={showGraph ? 'sm' : undefined}>
            <Title order={5}>Relationship Graph</Title>
            <Button variant="subtle" size="xs" onClick={() => setShowGraph(v => !v)}>
              {showGraph ? 'Hide Graph' : 'Show Graph'}
            </Button>
          </Group>
          {showGraph && (
            <RelationshipGraph
              relationships={relationships}
              securitySymbols={securitySymbolMap}
              eventContracts={contracts}
              events={[event]}
              height={400}
              onDelete={handleDelete}
            />
          )}
        </Paper>
      )}

      <Paper withBorder p="md" mb="md">
        <Title order={5} mb="sm">Tools</Title>
        <SimpleGrid cols={{ base: 1, sm: 2, md: 3 }}>
          <Card
            component={Link}
            to={`/market-data/collectors?eventId=${event.eventId}&eventTitle=${encodeURIComponent(event.title)}`}
            withBorder
            padding="sm"
            style={{ cursor: 'pointer', textDecoration: 'none' }}
          >
            <Group wrap="nowrap">
              <ThemeIcon variant="light" color="green" size="lg" radius="md">
                <IconPlayerPlay size={18} />
              </ThemeIcon>
              <div>
                <Text size="sm" fw={500}>Launch Collector</Text>
                <Text size="xs" c="dimmed">Collect market data for all {contracts.length} contracts</Text>
              </div>
            </Group>
          </Card>
        </SimpleGrid>
      </Paper>
    </Container>
  );
}

export default EventDetail;
