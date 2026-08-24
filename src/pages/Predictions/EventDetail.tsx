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
  CopyButton,
  Grid,
  Group,
  Loader,
  Notification,
  Paper,
  SimpleGrid,
  Stack,
  Table,
  Text,
  ThemeIcon,
  Title,
  Tooltip,
} from '@mantine/core';
import { DateTimePicker } from '@mantine/dates';
import { useDisclosure } from '@mantine/hooks';
import { IconCheck, IconChartLine, IconCopy, IconExternalLink, IconPlayerPlay, IconPlus, IconSearch, IconTrash } from '@tabler/icons-react';
import { Link } from 'react-router-dom';
import ReactTimeAgo from 'react-time-ago';
import { MantineReactTable, useMantineReactTable, type MRT_ColumnDef, type MRT_Row } from 'mantine-react-table';
import {
  ComposedChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip as RechartsTooltip,
  ResponsiveContainer,
  ReferenceLine,
  ReferenceArea,
  Legend,
} from 'recharts';
import { ContractRelationship, ContractRelationshipType, DenormalizedListing, Event, EventContract, ExchangeEvent } from '../../types';
import { BboDataPoint } from '../../types/bbo-timeline';
import { marketDataApi, registryApi } from '../../utils/api';
import { useGlobalState } from '../../context/GlobalStateContext';
import RelationshipGraph from './RelationshipGraph';
import BulkCreateRelationshipModal from './BulkCreateRelationshipModal';

const RELATIONSHIP_COLORS: Record<ContractRelationshipType, string> = {
  EQUIVALENT: 'green',
  IMPLIES: 'blue',
  MUTUALLY_EXCLUSIVE: 'orange',
  HEDGEABLE_WITH: 'violet',
};

const CHART_COLORS = ['#4c6ef5', '#f76707', '#2f9e44', '#ae3ec9', '#e03131', '#1098ad', '#f59f00', '#74c0fc'];

function formatUtcFull(epochSeconds: number): string {
  return new Date(epochSeconds * 1000).toISOString().replace('T', ' ').replace(/\.\d+Z$/, 'Z');
}

function formatUtcShort(epochSeconds: number): string {
  const d = new Date(epochSeconds * 1000);
  return `${d.toISOString().slice(0, 10)} ${d.toISOString().slice(11, 16)}`;
}

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
  const [listingsBySecurityId, setListingsBySecurityId] = useState<Record<number, DenormalizedListing[]>>({});
  const [showGraph, setShowGraph] = useState(false);
  const [createOpened, { open: openCreate, close: closeCreate }] = useDisclosure(false);

  // Price timeline state
  const yesterday = new Date(Date.now() - 86_400_000);
  const today = new Date();
  const [timelineStart, setTimelineStart] = useState<Date | null>(yesterday);
  const [timelineEnd, setTimelineEnd] = useState<Date | null>(today);
  const [timelineData, setTimelineData] = useState<Record<number, BboDataPoint[]>>({});
  const [timelineLabels, setTimelineLabels] = useState<Record<number, string>>({});
  const [timelineLoading, setTimelineLoading] = useState(false);
  const [timelineError, setTimelineError] = useState<string | null>(null);
  const [boundsStart, setBoundsStart] = useState<number | null>(null);
  const [boundsEnd, setBoundsEnd] = useState<number | null>(null);
  const [activeBound, setActiveBound] = useState<'start' | 'end'>('start');

  useEffect(() => {
    if (!id) return;
    setLoading(true);

    Promise.all([
      registryApi.listEvents({ eventId: id }),
      registryApi.listEventContracts({ eventId: id }),
      registryApi.listExchangeEvents({ eventId: id }),
      registryApi.listContractRelationships({ eventId: id }),
    ]).then(async ([evts, ecs, exEvts, rels]) => {
      setEvent((evts as Event[])[0] ?? null);
      setExchangeEvents(exEvts as ExchangeEvent[]);
      setContracts(ecs as EventContract[]);
      setRelationships(rels as ContractRelationship[]);

      const eventContracts = ecs as EventContract[];
      const uniqueSecurityIds = [...new Set(eventContracts.map(c => c.securityId))];
      const listingResults = await Promise.all(
        uniqueSecurityIds.map(secId =>
          registryApi.listListingsPaginated({ securityId: secId })
            .then(listings => [secId, listings] as const)
            .catch(() => [secId, []] as const)
        )
      );
      setListingsBySecurityId(Object.fromEntries(listingResults));
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

  const handleLoadTimeline = useCallback(async () => {
    if (!timelineStart || !timelineEnd) return;
    const startTs = Math.floor(timelineStart.getTime() / 1000);
    const endTs = Math.floor(timelineEnd.getTime() / 1000);
    if (endTs <= startTs) {
      setTimelineError('End date must be after start date.');
      return;
    }

    const allListings = Object.values(listingsBySecurityId).flat();
    if (allListings.length === 0) {
      setTimelineError('No listings found for this event.');
      return;
    }

    setTimelineLoading(true);
    setTimelineError(null);
    setTimelineData({});
    setBoundsStart(null);
    setBoundsEnd(null);

    try {
      const results = await Promise.allSettled(
        allListings.map(l => marketDataApi.getBboTimeline(l.listingId, startTs, endTs))
      );
      const data: Record<number, BboDataPoint[]> = {};
      const labels: Record<number, string> = {};
      results.forEach((result, idx) => {
        const listing = allListings[idx];
        if (result.status === 'fulfilled' && result.value.dataPoints.length > 0) {
          data[listing.listingId] = result.value.dataPoints;
          labels[listing.listingId] = `${listing.exchangeSecuritySymbol ?? listing.listingId} (${listing.exchangeName})`;
        }
      });
      if (Object.keys(data).length === 0) {
        setTimelineError('No BBO data found for any listing in this date range.');
      }
      setTimelineData(data);
      setTimelineLabels(labels);
    } catch (err) {
      setTimelineError(err instanceof Error ? err.message : 'Failed to load timeline data.');
    } finally {
      setTimelineLoading(false);
    }
  }, [timelineStart, timelineEnd, listingsBySecurityId]);

  const mergedChartData = useMemo(() => {
    const tsMap = new Map<number, Record<string, number>>();
    const listingIds = Object.keys(timelineData);
    for (const [listingId, points] of Object.entries(timelineData)) {
      for (const p of points) {
        if (!tsMap.has(p.timestamp)) tsMap.set(p.timestamp, {});
        tsMap.get(p.timestamp)![listingId] = p.midPrice;
      }
    }
    const sorted = Array.from(tsMap.entries())
      .sort(([a], [b]) => a - b)
      .map(([ts, values]) => ({ ts, ...values } as Record<string, number>));

    const last: Record<string, number> = {};
    for (const row of sorted) {
      for (const id of listingIds) {
        if (id in row) {
          last[id] = row[id];
        } else if (id in last) {
          row[id] = last[id];
        }
      }
    }
    return sorted;
  }, [timelineData]);

  const handleChartClick = useCallback((chartData: any) => {
    if (!chartData || chartData.activeLabel === undefined) return;
    const ts = Number(chartData.activeLabel);
    if (activeBound === 'start') {
      setBoundsStart(ts);
      setActiveBound('end');
    } else {
      setBoundsEnd(ts);
      setActiveBound('start');
    }
  }, [activeBound]);

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
        <Group justify="space-between" mb="sm">
          <Title order={5}>Price Timeline</Title>
          {Object.keys(timelineData).length > 0 && (
            <Text size="xs" c="dimmed">
              Click chart to set{' '}
              <Text span c={activeBound === 'start' ? 'green' : 'red'} fw={600}>{activeBound}</Text>
              {' '}bound
            </Text>
          )}
        </Group>

        <Group mb="md" align="flex-end">
          <DateTimePicker
            label="From"
            value={timelineStart}
            onChange={setTimelineStart}
            maxDate={timelineEnd ?? undefined}
            valueFormat="YYYY-MM-DD HH:mm"
            size="sm"
            style={{ width: 220 }}
          />
          <DateTimePicker
            label="To"
            value={timelineEnd}
            onChange={setTimelineEnd}
            minDate={timelineStart ?? undefined}
            valueFormat="YYYY-MM-DD HH:mm"
            size="sm"
            style={{ width: 220 }}
          />
          <Button
            leftSection={<IconChartLine size={16} />}
            onClick={handleLoadTimeline}
            loading={timelineLoading}
            size="sm"
          >
            Load BBO
          </Button>
          {Object.keys(timelineData).length > 0 && (
            <Button
              variant="subtle"
              size="sm"
              color="gray"
              onClick={() => { setBoundsStart(null); setBoundsEnd(null); setActiveBound('start'); }}
            >
              Clear Bounds
            </Button>
          )}
        </Group>

        {timelineError && (
          <Notification color="red" onClose={() => setTimelineError(null)} mb="sm">
            {timelineError}
          </Notification>
        )}

        {Object.keys(timelineData).length > 0 && (
          <>
            <ResponsiveContainer width="100%" height={300}>
              <ComposedChart data={mergedChartData} onClick={handleChartClick} style={{ cursor: 'crosshair' }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#333" />
                <XAxis
                  dataKey="ts"
                  tickFormatter={formatUtcShort}
                  tick={{ fontSize: 10, fill: '#aaa' }}
                  interval="preserveStartEnd"
                  type="number"
                  domain={['dataMin', 'dataMax']}
                  scale="time"
                />
                <YAxis
                  tick={{ fontSize: 10, fill: '#aaa' }}
                  tickFormatter={(v: number) => v.toFixed(3)}
                  domain={['auto', 'auto']}
                  width={55}
                />
                <RechartsTooltip
                  content={({ active, payload, label }) => {
                    if (!active || !payload?.length) return null;
                    return (
                      <div style={{ background: '#1a1a1a', border: '1px solid #444', borderRadius: 4, padding: '6px 10px', fontSize: 12 }}>
                        <div style={{ color: '#aaa', marginBottom: 4 }}>{formatUtcFull(Number(label))}</div>
                        {payload.map((entry: any) => (
                          <div key={entry.dataKey} style={{ color: entry.color }}>
                            {timelineLabels[entry.dataKey] ?? entry.dataKey}: {Number(entry.value).toFixed(4)}
                          </div>
                        ))}
                      </div>
                    );
                  }}
                />
                <Legend
                  formatter={(value) => timelineLabels[Number(value)] ?? value}
                  wrapperStyle={{ fontSize: 12, color: '#aaa' }}
                />
                {Object.keys(timelineData).map((listingId, idx) => (
                  <Line
                    key={listingId}
                    type="monotone"
                    dataKey={listingId}
                    stroke={CHART_COLORS[idx % CHART_COLORS.length]}
                    dot={false}
                    strokeWidth={1.5}
                    connectNulls={false}
                    isAnimationActive={false}
                  />
                ))}
                {boundsStart !== null && (
                  <ReferenceLine
                    x={boundsStart}
                    stroke="#2f9e44"
                    strokeWidth={2}
                    strokeDasharray="5 3"
                    label={{ value: 'Start', position: 'top', fill: '#2f9e44', fontSize: 11 }}
                  />
                )}
                {boundsEnd !== null && (
                  <ReferenceLine
                    x={boundsEnd}
                    stroke="#e03131"
                    strokeWidth={2}
                    strokeDasharray="5 3"
                    label={{ value: 'End', position: 'top', fill: '#e03131', fontSize: 11 }}
                  />
                )}
                {boundsStart !== null && boundsEnd !== null && (
                  <ReferenceArea
                    x1={Math.min(boundsStart, boundsEnd)}
                    x2={Math.max(boundsStart, boundsEnd)}
                    fill="white"
                    fillOpacity={0.05}
                  />
                )}
              </ComposedChart>
            </ResponsiveContainer>

            <Group mt="md" gap="xl">
              <Stack gap={4}>
                <Text size="xs" c="dimmed">Start</Text>
                <Group gap={6}>
                  <Text size="sm" ff="monospace">
                    {boundsStart !== null ? formatUtcFull(boundsStart) : '—'}
                  </Text>
                  {boundsStart !== null && (
                    <>
                      <CopyButton value={String(boundsStart)} timeout={2000}>
                        {({ copied, copy }) => (
                          <Tooltip label={copied ? 'Copied!' : 'Copy epoch seconds'} withArrow position="right">
                            <ActionIcon size="sm" variant="subtle" color={copied ? 'teal' : 'gray'} onClick={copy}>
                              {copied ? <IconCheck size={13} /> : <IconCopy size={13} />}
                            </ActionIcon>
                          </Tooltip>
                        )}
                      </CopyButton>
                      <CopyButton value={formatUtcFull(boundsStart)} timeout={2000}>
                        {({ copied, copy }) => (
                          <Tooltip label={copied ? 'Copied!' : 'Copy UTC string'} withArrow position="right">
                            <ActionIcon size="sm" variant="subtle" color={copied ? 'teal' : 'blue'} onClick={copy}>
                              {copied ? <IconCheck size={13} /> : <IconCopy size={13} />}
                            </ActionIcon>
                          </Tooltip>
                        )}
                      </CopyButton>
                    </>
                  )}
                </Group>
              </Stack>

              <Stack gap={4}>
                <Text size="xs" c="dimmed">End</Text>
                <Group gap={6}>
                  <Text size="sm" ff="monospace">
                    {boundsEnd !== null ? formatUtcFull(boundsEnd) : '—'}
                  </Text>
                  {boundsEnd !== null && (
                    <>
                      <CopyButton value={String(boundsEnd)} timeout={2000}>
                        {({ copied, copy }) => (
                          <Tooltip label={copied ? 'Copied!' : 'Copy epoch seconds'} withArrow position="right">
                            <ActionIcon size="sm" variant="subtle" color={copied ? 'teal' : 'gray'} onClick={copy}>
                              {copied ? <IconCheck size={13} /> : <IconCopy size={13} />}
                            </ActionIcon>
                          </Tooltip>
                        )}
                      </CopyButton>
                      <CopyButton value={formatUtcFull(boundsEnd)} timeout={2000}>
                        {({ copied, copy }) => (
                          <Tooltip label={copied ? 'Copied!' : 'Copy UTC string'} withArrow position="right">
                            <ActionIcon size="sm" variant="subtle" color={copied ? 'teal' : 'blue'} onClick={copy}>
                              {copied ? <IconCheck size={13} /> : <IconCopy size={13} />}
                            </ActionIcon>
                          </Tooltip>
                        )}
                      </CopyButton>
                    </>
                  )}
                </Group>
              </Stack>

              {boundsStart !== null && boundsEnd !== null && (
                <Stack gap={4}>
                  <Text size="xs" c="dimmed">Duration</Text>
                  <Text size="sm">
                    {(() => {
                      const secs = Math.abs(boundsEnd - boundsStart);
                      const h = Math.floor(secs / 3600);
                      const m = Math.floor((secs % 3600) / 60);
                      const s = secs % 60;
                      return h > 0 ? `${h}h ${m}m ${s}s` : m > 0 ? `${m}m ${s}s` : `${s}s`;
                    })()}
                  </Text>
                </Stack>
              )}
            </Group>
          </>
        )}
      </Paper>

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
