import { useEffect, useMemo, useState } from 'react';
import { useParams } from 'react-router-dom';
import {
  ActionIcon,
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
  Tooltip,
} from '@mantine/core';
import { IconTrash } from '@tabler/icons-react';
import { Link } from 'react-router-dom';
import ReactTimeAgo from 'react-time-ago';
import { MantineReactTable, useMantineReactTable, type MRT_ColumnDef, type MRT_Row } from 'mantine-react-table';
import { ContractRelationship, ContractRelationshipType, Event, EventContract, ExchangeEvent } from '../../types';
import { registryApi } from '../../utils/api';
import { useGlobalState } from '../../context/GlobalStateContext';
import RelationshipGraph from './RelationshipGraph';

const RELATIONSHIP_COLORS: Record<ContractRelationshipType, string> = {
  EQUIVALENT: 'green',
  COMPLEMENT: 'teal',
  IMPLIES: 'blue',
  MUTUALLY_EXCLUSIVE: 'orange',
  CORRELATED: 'gray',
  HEDGEABLE_WITH: 'violet',
};

function InfoRow({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <Group justify="space-between" py={4} style={{ borderBottom: '1px solid var(--mantine-color-dark-5)' }}>
      <Text size="sm" c="dimmed">{label}</Text>
      <Text size="sm">{value}</Text>
    </Group>
  );
}

type EnrichedContract = EventContract;

function EventDetail() {
  const { eventId } = useParams<{ eventId: string }>();
  const { exchanges, securitySymbols } = useGlobalState();
  const id = parseInt(eventId ?? '0');

  const [event, setEvent] = useState<Event | null>(null);
  const [contracts, setContracts] = useState<EnrichedContract[]>([]);
  const [exchangeEvents, setExchangeEvents] = useState<ExchangeEvent[]>([]);
  const [relationships, setRelationships] = useState<ContractRelationship[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!id) return;
    setLoading(true);

    Promise.all([
      registryApi.listEvents({ eventId: id }),
      registryApi.listEventContracts({ eventId: id }),
      registryApi.listExchangeEvents({ eventId: id }),
    ]).then(async ([evts, ecs, exEvts]) => {
      const ev = (evts as Event[])[0] ?? null;
      setEvent(ev);
      setExchangeEvents(exEvts as ExchangeEvent[]);

      const ecList = ecs as EventContract[];
      const eventSecIds = [...new Set(ecList.map(ec => ec.securityId))];

      const relResults = await Promise.allSettled(
        eventSecIds.map(sid => registryApi.listContractRelationships({ securityId: sid })),
      );

      const allRels = relResults
        .filter(r => r.status === 'fulfilled')
        .flatMap(r => (r as PromiseFulfilledResult<ContractRelationship[]>).value);
      const seen = new Set<number>();
      const deduped = allRels.filter(r => {
        if (seen.has(r.relationshipId)) return false;
        seen.add(r.relationshipId);
        return true;
      });
      setRelationships(deduped);
      setContracts(ecList);
    }).catch(console.error).finally(() => setLoading(false));
  }, [id]);

  const contractColumns = useMemo<MRT_ColumnDef<EnrichedContract>[]>(() => [
    {
      accessorKey: 'securityId',
      header: 'Security',
      Cell: ({ row }) => {
        const sym = securitySymbols[row.original.securityId] ?? `#${row.original.securityId}`;
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
  ], [securitySymbols]);

  const handleDelete = async (relationshipId: number) => {
    try {
      await registryApi.deleteContractRelationship(relationshipId);
      setRelationships(prev => prev.filter(r => r.relationshipId !== relationshipId));
    } catch (err) {
      console.error('Failed to delete:', err);
    }
  };

  const relColumns = useMemo<MRT_ColumnDef<ContractRelationship>[]>(() => [
    {
      accessorKey: 'securityIdA',
      header: 'Security A',
      Cell: ({ row }) => {
        const sym = securitySymbols[row.original.securityIdA] ?? `#${row.original.securityIdA}`;
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
        const sym = securitySymbols[row.original.securityIdB] ?? `#${row.original.securityIdB}`;
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
  ], [securitySymbols]);

  const contractTable = useMantineReactTable({
    columns: contractColumns,
    data: contracts,
    enableColumnFilters: false,
    enableSorting: true,
    enablePagination: false,
    enableBottomToolbar: false,
    enableTopToolbar: false,
    mantineTableProps: { striped: true, highlightOnHover: true, withColumnBorders: true },
    initialState: { density: 'xs' },
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
              <Table striped highlightOnHover withColumnBorders fz="sm">
                <Table.Thead>
                  <Table.Tr>
                    <Table.Th>Exchange</Table.Th>
                    <Table.Th>Native ID</Table.Th>
                    <Table.Th>Raw Title</Table.Th>
                  </Table.Tr>
                </Table.Thead>
                <Table.Tbody>
                  {exchangeEvents.map(xe => (
                    <Table.Tr key={xe.exchangeEventId}>
                      <Table.Td>{exchangeById[xe.exchangeId] ?? `#${xe.exchangeId}`}</Table.Td>
                      <Table.Td>{xe.nativeEventId}</Table.Td>
                      <Table.Td style={{ maxWidth: 200, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        {xe.rawTitle}
                      </Table.Td>
                    </Table.Tr>
                  ))}
                </Table.Tbody>
              </Table>
            )}
          </Paper>
        </Grid.Col>
      </Grid>

      <Paper withBorder p="md" mb="md">
        <Title order={5} mb="sm">Contracts ({contracts.length})</Title>
        <MantineReactTable table={contractTable} />
      </Paper>

      <Paper withBorder p="md" mb="md">
        <Title order={5} mb="sm">Relationships ({relationships.length})</Title>
        {relationships.length === 0 ? (
          <Text size="sm" c="dimmed">No relationships found for this event's contracts.</Text>
        ) : (
          <MantineReactTable table={relTable} />
        )}
      </Paper>

      {relationships.length > 0 && (
        <Paper withBorder p="md" mb="md">
          <Title order={5} mb="sm">Relationship Graph</Title>
          <RelationshipGraph
            relationships={relationships}
            securitySymbols={securitySymbols}
            eventContracts={contracts}
            events={[event]}
            height={400}
            onDelete={handleDelete}
          />
        </Paper>
      )}
    </Container>
  );
}

export default EventDetail;
