import { useState, useEffect, useMemo, useCallback } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { navigateRowProps } from '../../../utils/navigation';
import { marketDataApi, registryApi, ApiError } from '../../../utils/api';
import { DenormalizedListing, EventContract, ExchangeEvent } from '../../../types';
import {
  Button,
  ActionIcon,
  Group,
  Loader,
  Modal,
  Stack,
  Title,
  Container,
  Badge,
  Notification,
  Text,
  Tooltip,
  Select,
  MultiSelect,
  SegmentedControl,
} from '@mantine/core';
import { IconPlus, IconRefresh, IconPlayerStop, IconPlayerPlay, IconAB2, IconTrash } from '@tabler/icons-react';
import ReactTimeAgo from 'react-time-ago';
import { MantineReactTable, useMantineReactTable, type MRT_ColumnDef, type MRT_Row } from 'mantine-react-table';
import { useGlobalState } from '../../../context/GlobalStateContext';
import { useListingSearch, useEventSearch } from '../../../hooks/useAsyncSearch';

interface Collector {
  listingId: number;
  listingIds: number[];
  status: string;
  lastStatusChange: number;
  failureReason: string | null;
  region?: string;
  cpu?: string;
  memory?: string;
}

const CPU_OPTIONS = ['256', '512', '1024', '2048'];
const MEMORY_OPTIONS_BY_CPU: Record<string, string[]> = {
  '256': ['512', '1024', '2048'],
  '512': ['1024', '2048', '3072', '4096'],
  '1024': ['2048', '3072', '4096', '5120', '6144', '7168', '8192'],
  '2048': ['4096', '5120', '6144', '7168', '8192', '9216', '10240', '11264', '12288', '13312', '14336', '15360', '16384'],
};

function suggestSizing(count: number): { cpu: string; memory: string } {
  if (count <= 3) return { cpu: '256', memory: '512' };
  if (count <= 6) return { cpu: '512', memory: '1024' };
  if (count <= 12) return { cpu: '1024', memory: '2048' };
  return { cpu: '2048', memory: '4096' };
}

function Collectors() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const { exchanges } = useGlobalState();
  const [collectors, setCollectors] = useState<Collector[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [createModalOpen, setCreateModalOpen] = useState(false);
  const [creating, setCreating] = useState(false);

  // Create modal shared state
  const [mode, setMode] = useState<string>('listings');
  const [cpu, setCpu] = useState('256');
  const [memory, setMemory] = useState('512');
  const [sizingUserOverridden, setSizingUserOverridden] = useState(false);

  // Listings mode
  const [selectedListingIds, setSelectedListingIds] = useState<string[]>([]);
  const [selectedListingItems, setSelectedListingItems] = useState<Record<string, string>>({});
  const [listingSearchValue, setListingSearchValue] = useState('');
  const { options: listingSearchOptions, isLoading: listingSearchLoading } = useListingSearch(listingSearchValue);

  // Event mode
  const [eventSearchValue, setEventSearchValue] = useState('');
  const { options: eventSearchOptions, isLoading: eventSearchLoading } = useEventSearch(eventSearchValue);
  const [selectedEventId, setSelectedEventId] = useState<string | null>(null);
  const [selectedExchangeId, setSelectedExchangeId] = useState<string | null>(null);
  const [eventContracts, setEventContracts] = useState<EventContract[]>([]);
  const [exchangeEvents, setExchangeEvents] = useState<ExchangeEvent[]>([]);
  const [eventListings, setEventListings] = useState<DenormalizedListing[]>([]);
  const [loadingEventListings, setLoadingEventListings] = useState(false);
  const [prefilledEvent, setPrefilledEvent] = useState<{ value: string; label: string } | null>(null);

  // Stop/redeploy modals
  const [stopModalOpen, setStopModalOpen] = useState(false);
  const [collectorToStop, setCollectorToStop] = useState<number | null>(null);
  const [redeployModalOpen, setRedeployModalOpen] = useState(false);
  const [collectorToRedeploy, setCollectorToRedeploy] = useState<number | null>(null);
  const [redeployAllModalOpen, setRedeployAllModalOpen] = useState(false);
  const [purgeModalOpen, setPurgeModalOpen] = useState(false);
  const [collectorToPurge, setCollectorToPurge] = useState<number | null>(null);
  const [restartModalOpen, setRestartModalOpen] = useState(false);
  const [collectorToRestart, setCollectorToRestart] = useState<Collector | null>(null);

  const activeListingIds: number[] = useMemo(() => {
    if (mode === 'event') return eventListings.map(l => l.listingId);
    return selectedListingIds.map(Number);
  }, [mode, eventListings, selectedListingIds]);

  // For listings mode: resolve region from first listing's exchange
  const [listingsRegion, setListingsRegion] = useState<string | null>(null);

  useEffect(() => {
    if (mode !== 'listings' || selectedListingIds.length === 0) {
      setListingsRegion(null);
      return;
    }
    const firstId = Number(selectedListingIds[0]);
    registryApi.listListingsPaginated({ listingId: firstId, limit: 1, denormalize: true })
      .then((rows: DenormalizedListing[]) => {
        const listing = rows[0];
        if (!listing) return;
        const exchange = exchanges.find(e => e.exchangeId === listing.exchangeId);
        setListingsRegion(exchange?.region ?? null);
      })
      .catch(() => setListingsRegion(null));
  }, [selectedListingIds[0], mode, exchanges]);

  const effectiveRegion = mode === 'event'
    ? (selectedExchangeId ? exchanges.find(e => e.exchangeId === Number(selectedExchangeId))?.region ?? null : null)
    : listingsRegion;

  // Auto-suggest sizing when listing count changes (unless user overrode)
  useEffect(() => {
    if (sizingUserOverridden) return;
    const suggestion = suggestSizing(activeListingIds.length);
    setCpu(suggestion.cpu);
    setMemory(suggestion.memory);
  }, [activeListingIds.length, sizingUserOverridden]);

  // Fetch event contracts + exchange events when event is selected
  useEffect(() => {
    if (!selectedEventId) {
      setEventContracts([]);
      setExchangeEvents([]);
      setSelectedExchangeId(null);
      setEventListings([]);
      return;
    }
    const id = Number(selectedEventId);
    Promise.all([
      registryApi.listEventContracts({ eventId: id }),
      registryApi.listExchangeEvents({ eventId: id }),
    ]).then(([contracts, exEvts]) => {
      setEventContracts(contracts);
      setExchangeEvents(exEvts);
    }).catch(() => {});
  }, [selectedEventId]);

  // Fetch listings for event + exchange
  useEffect(() => {
    if (!selectedEventId || !selectedExchangeId || eventContracts.length === 0) {
      setEventListings([]);
      return;
    }
    const exchangeId = Number(selectedExchangeId);
    setLoadingEventListings(true);
    Promise.all(
      eventContracts.map(ec =>
        registryApi.listListingsPaginated({ securityId: ec.securityId, exchangeId, limit: 1, denormalize: true })
          .then((rows: DenormalizedListing[]) => rows[0] ?? null)
          .catch(() => null)
      )
    ).then(results => {
      setEventListings(results.filter((l): l is DenormalizedListing => l !== null));
    }).catch(() => setEventListings([]))
      .finally(() => setLoadingEventListings(false));
  }, [selectedExchangeId, eventContracts]);

  const exchangeOptions = useMemo(() => {
    const ids = new Set(exchangeEvents.map(ee => ee.exchangeId));
    return exchanges
      .filter(e => ids.has(e.exchangeId))
      .map(e => ({ value: String(e.exchangeId), label: e.exchangeName }));
  }, [exchangeEvents, exchanges]);

  const eventSelectData = useMemo(() => {
    if (!prefilledEvent) return eventSearchOptions;
    if (eventSearchOptions.some(o => o.value === prefilledEvent.value)) return eventSearchOptions;
    return [prefilledEvent, ...eventSearchOptions];
  }, [eventSearchOptions, prefilledEvent]);

  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => {
    const eventId = searchParams.get('eventId');
    const eventTitle = searchParams.get('eventTitle');
    if (eventId && eventTitle) {
      setMode('event');
      setSelectedEventId(eventId);
      setPrefilledEvent({ value: eventId, label: eventTitle });
      setCreateModalOpen(true);
      window.history.replaceState({}, '', window.location.pathname);
    }
  }, []);

  useEffect(() => {
    if (exchangeOptions.length === 1 && !selectedExchangeId) {
      setSelectedExchangeId(exchangeOptions[0].value);
    }
  }, [exchangeOptions]);

  const listingMergedData = useMemo(() => [
    ...Object.entries(selectedListingItems)
      .filter(([id]) => !listingSearchOptions.some(o => o.value === id))
      .map(([id, label]) => ({ value: id, label })),
    ...listingSearchOptions,
  ], [selectedListingItems, listingSearchOptions]);

  const handleListingMultiSelectChange = useCallback((values: string[]) => {
    setSelectedListingIds(values);
    const updated = { ...selectedListingItems };
    for (const v of values) {
      if (!updated[v]) {
        const opt = listingSearchOptions.find(o => o.value === v);
        if (opt) updated[v] = opt.label;
      }
    }
    for (const key of Object.keys(updated)) {
      if (!values.includes(key)) delete updated[key];
    }
    setSelectedListingItems(updated);
  }, [selectedListingItems, listingSearchOptions]);

  const resetCreateModal = () => {
    setMode('listings');
    setSelectedListingIds([]);
    setSelectedListingItems({});
    setListingSearchValue('');
    setEventSearchValue('');
    setSelectedEventId(null);
    setSelectedExchangeId(null);
    setEventContracts([]);
    setExchangeEvents([]);
    setEventListings([]);
    setPrefilledEvent(null);
    setSizingUserOverridden(false);
    setCpu('256');
    setMemory('512');
    setListingsRegion(null);
  };

  useEffect(() => {
    loadCollectors();
  }, []);

  useEffect(() => {
    const interval = setInterval(() => loadCollectors(false), 5000);
    return () => clearInterval(interval);
  }, []);

  const loadCollectors = async (showLoading = true) => {
    try {
      if (showLoading) setLoading(true);
      setError(null);
      const response = await marketDataApi.listCollectors();
      setCollectors(response.collectors);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Failed to load collectors');
    } finally {
      if (showLoading) setLoading(false);
    }
  };

  const handleCreateCollector = async () => {
    if (activeListingIds.length === 0 || !effectiveRegion) return;
    try {
      setError(null);
      setCreating(true);
      await marketDataApi.createCollector(activeListingIds, effectiveRegion, cpu, memory);
      setCreateModalOpen(false);
      resetCreateModal();
      await loadCollectors();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Failed to create collector');
    } finally {
      setCreating(false);
    }
  };

  const handleStopCollector = async (listingId: number) => {
    try {
      setError(null);
      await marketDataApi.deleteCollector(listingId);
      await loadCollectors();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Failed to stop collector');
    } finally {
      setStopModalOpen(false);
      setCollectorToStop(null);
    }
  };

  const handleRedeployCollector = async (listingId?: number) => {
    try {
      setError(null);
      await marketDataApi.redeployCollector(listingId);
      await loadCollectors();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Failed to redeploy collector');
    } finally {
      setRedeployModalOpen(false);
      setCollectorToRedeploy(null);
    }
  };

  const handleRestartCollector = async (collector: Collector) => {
    try {
      setError(null);
      await marketDataApi.createCollector(collector.listingIds, collector.region!, collector.cpu, collector.memory);
      await loadCollectors();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Failed to restart collector');
    } finally {
      setRestartModalOpen(false);
      setCollectorToRestart(null);
    }
  };

  const handlePurgeCollector = async (listingId: number) => {
    try {
      setError(null);
      await marketDataApi.purgeCollector(listingId);
      await loadCollectors();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Failed to delete collector');
    } finally {
      setPurgeModalOpen(false);
      setCollectorToPurge(null);
    }
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'ACTIVE': return 'green';
      case 'INACTIVE': return 'gray';
      case 'PENDING': return 'blue';
      case 'FAILED': return 'red';
      default: return 'gray';
    }
  };

  const columns: MRT_ColumnDef<Collector>[] = [
    {
      id: 'listings',
      header: 'Listings',
      enableSorting: false,
      Cell: ({ row }: { row: MRT_Row<Collector> }) => {
        const ids = row.original.listingIds ?? [row.original.listingId];
        return (
          <Tooltip label={ids.join(', ')} disabled={ids.length <= 1}>
            <Text size="sm">
              {ids.length === 1 ? ids[0] : `${ids[0]} +${ids.length - 1} more`}
            </Text>
          </Tooltip>
        );
      },
    },
    {
      accessorKey: 'region',
      header: 'Region',
      enableSorting: true,
      Cell: ({ row }: { row: MRT_Row<Collector> }) => row.original.region || '-',
    },
    {
      id: 'sizing',
      header: 'Size',
      enableSorting: false,
      Cell: ({ row }: { row: MRT_Row<Collector> }) => {
        const { cpu: c, memory: m } = row.original;
        if (!c && !m) return <Text size="sm" c="dimmed">-</Text>;
        return <Text size="sm">{c ?? '?'} CPU / {m ?? '?'} MiB</Text>;
      },
    },
    {
      accessorKey: 'status',
      header: 'Status',
      enableSorting: true,
      Cell: ({ row }: { row: MRT_Row<Collector> }) => (
        <Badge color={getStatusColor(row.original.status)}>
          {row.original.status}
        </Badge>
      ),
    },
    {
      accessorKey: 'lastStatusChange',
      header: 'Last Status Change',
      enableSorting: true,
      Cell: ({ row }: { row: MRT_Row<Collector> }) =>
        row.original.lastStatusChange ?
          <ReactTimeAgo date={row.original.lastStatusChange * 1000} timeStyle="round" /> :
          '-',
    },
    {
      accessorKey: 'failureReason',
      header: 'Failure Reason',
      Cell: ({ row }: { row: MRT_Row<Collector> }) => row.original.failureReason || '-',
    },
  ];

  const table = useMantineReactTable({
    columns,
    data: collectors,
    enableColumnFilters: true,
    enableColumnActions: true,
    enableRowActions: true,
    positionActionsColumn: 'last',
    renderRowActions: ({ row }) => {
      if (row.original.status === 'ACTIVE') {
        return (
          <Group gap={4} justify="flex-start" wrap="nowrap">
            <Tooltip label="Stop" position="bottom" withArrow openDelay={500}>
              <ActionIcon
                color="red"
                onClick={(e) => {
                  e.stopPropagation();
                  setCollectorToStop(row.original.listingId);
                  setStopModalOpen(true);
                }}
              >
                <IconPlayerStop size={16} />
              </ActionIcon>
            </Tooltip>
            <Tooltip label="Redeploy" position="bottom" withArrow openDelay={500}>
              <ActionIcon
                color="blue"
                onClick={(e) => {
                  e.stopPropagation();
                  setCollectorToRedeploy(row.original.listingId);
                  setRedeployModalOpen(true);
                }}
              >
                <IconAB2 size={16} />
              </ActionIcon>
            </Tooltip>
          </Group>
        );
      }
      if (row.original.status === 'INACTIVE') {
        return (
          <Group gap={4} justify="flex-start" wrap="nowrap">
            <Tooltip label="Restart" position="bottom" withArrow openDelay={500}>
              <ActionIcon
                color="green"
                onClick={(e) => {
                  e.stopPropagation();
                  setCollectorToRestart(row.original);
                  setRestartModalOpen(true);
                }}
              >
                <IconPlayerPlay size={16} />
              </ActionIcon>
            </Tooltip>
            <Tooltip label="Delete" position="bottom" withArrow openDelay={500}>
              <ActionIcon
                color="red"
                onClick={(e) => {
                  e.stopPropagation();
                  setCollectorToPurge(row.original.listingId);
                  setPurgeModalOpen(true);
                }}
              >
                <IconTrash size={16} />
              </ActionIcon>
            </Tooltip>
          </Group>
        );
      }
      return null;
    },
    enablePagination: true,
    enableBottomToolbar: true,
    enableTopToolbar: true,
    initialState: { density: 'xs' },
    state: { isLoading: loading },
    mantineTableBodyRowProps: ({ row }) => (
      navigateRowProps(navigate, `/market-data/collectors/${row.original.listingId}`)
    ),
  });

  const canCreate = activeListingIds.length > 0 && !!effectiveRegion;

  return (
    <Container size="xl" py="xl">
      <Group justify="space-between" mb="md">
        <Title order={2}>Active Collectors</Title>
        <Group>
          <Tooltip label="Refresh" position="bottom" withArrow openDelay={500}>
            <ActionIcon size="lg" variant="filled" color="green" onClick={() => loadCollectors(true)}>
              <IconRefresh size={20} />
            </ActionIcon>
          </Tooltip>
          <Tooltip label="Create" position="bottom" withArrow openDelay={500}>
            <ActionIcon size="lg" variant="filled" color="green" onClick={() => setCreateModalOpen(true)}>
              <IconPlus size={20} />
            </ActionIcon>
          </Tooltip>
          <Tooltip label="Redeploy All" position="bottom" withArrow openDelay={500}>
            <ActionIcon size="lg" variant="filled" color="blue" onClick={() => setRedeployAllModalOpen(true)}>
              <IconAB2 size={20} />
            </ActionIcon>
          </Tooltip>
        </Group>
      </Group>

      {error && (
        <Notification color="red" title="Error" onClose={() => setError(null)} mb="md">
          {error}
        </Notification>
      )}

      <MantineReactTable table={table} />

      {/* Create Modal */}
      <Modal
        opened={createModalOpen}
        onClose={() => { setCreateModalOpen(false); resetCreateModal(); }}
        title="Create New Collector"
        size="md"
      >
        <Stack>
          <SegmentedControl
            value={mode}
            onChange={setMode}
            data={[
              { label: 'Listings', value: 'listings' },
              { label: 'Event', value: 'event' },
            ]}
            fullWidth
          />

          {mode === 'listings' && (
            <MultiSelect
              label="Listings"
              placeholder="Search listings..."
              data={listingMergedData}
              searchable
              searchValue={listingSearchValue}
              onSearchChange={setListingSearchValue}
              value={selectedListingIds}
              onChange={handleListingMultiSelectChange}
              filter={({ options }) => options}
              rightSection={listingSearchLoading ? <Loader size="xs" /> : undefined}
              nothingFoundMessage="No listings found"
            />
          )}

          {mode === 'event' && (
            <>
              <Select
                label="Event"
                placeholder="Search events..."
                data={eventSelectData}
                searchable
                searchValue={eventSearchValue}
                onSearchChange={setEventSearchValue}
                value={selectedEventId}
                onChange={setSelectedEventId}
                filter={({ options }) => options}
                rightSection={eventSearchLoading ? <Loader size="xs" /> : undefined}
                nothingFoundMessage="No events found"
              />
              {selectedEventId && (
                <Select
                  label="Exchange"
                  placeholder="Select exchange..."
                  data={exchangeOptions}
                  value={selectedExchangeId}
                  onChange={setSelectedExchangeId}
                  disabled={exchangeOptions.length === 0}
                />
              )}
              {loadingEventListings && <Loader size="sm" />}
              {eventListings.length > 0 && (
                <Stack gap="xs">
                  <Text size="sm" fw={500}>
                    {eventListings.length} listings auto-populated:
                  </Text>
                  <Group gap="xs" wrap="wrap">
                    {eventListings.map(l => {
                      const contract = eventContracts.find(ec => ec.securityId === l.securityId);
                      return (
                        <Badge key={l.listingId} variant="light" size="sm">
                          {contract?.outcomeLabel ?? l.securitySymbol} ({l.listingId})
                        </Badge>
                      );
                    })}
                  </Group>
                </Stack>
              )}
            </>
          )}

          <Group grow>
            <Select
              label="CPU (units)"
              data={CPU_OPTIONS}
              value={cpu}
              onChange={v => { if (v) { setCpu(v); setSizingUserOverridden(true); setMemory(MEMORY_OPTIONS_BY_CPU[v][0]); } }}
              description={sizingUserOverridden ? undefined : 'Auto-suggested'}
            />
            <Select
              label="Memory (MiB)"
              data={(MEMORY_OPTIONS_BY_CPU[cpu] ?? ['512']).map(m => ({ value: m, label: m }))}
              value={memory}
              onChange={v => { if (v) { setMemory(v); setSizingUserOverridden(true); } }}
              description={sizingUserOverridden ? undefined : 'Auto-suggested'}
            />
          </Group>

          {effectiveRegion && (
            <Text size="sm" c="dimmed" component="div">
              Region: <Badge size="sm">{effectiveRegion}</Badge>
            </Text>
          )}

          <Button
            onClick={handleCreateCollector}
            loading={creating}
            disabled={creating || !canCreate}
          >
            Create Collector
            {activeListingIds.length > 0 && ` (${activeListingIds.length} listing${activeListingIds.length > 1 ? 's' : ''})`}
          </Button>
        </Stack>
      </Modal>

      <Modal
        opened={stopModalOpen}
        onClose={() => { setStopModalOpen(false); setCollectorToStop(null); }}
        title="Stop Collector"
      >
        <Stack>
          <Text>Are you sure you want to stop this collector?</Text>
          <Group justify="flex-end">
            <Button variant="default" onClick={() => { setStopModalOpen(false); setCollectorToStop(null); }}>
              Cancel
            </Button>
            <Button color="red" onClick={() => collectorToStop && handleStopCollector(collectorToStop)}>
              Stop Collector
            </Button>
          </Group>
        </Stack>
      </Modal>

      <Modal
        opened={redeployModalOpen}
        onClose={() => { setRedeployModalOpen(false); setCollectorToRedeploy(null); }}
        title="Redeploy Collector"
      >
        <Stack>
          <Text>Are you sure you want to redeploy this collector?</Text>
          <Group justify="flex-end">
            <Button variant="default" onClick={() => { setRedeployModalOpen(false); setCollectorToRedeploy(null); }}>
              Cancel
            </Button>
            <Button color="blue" onClick={() => collectorToRedeploy && handleRedeployCollector(collectorToRedeploy)}>
              Redeploy Collector
            </Button>
          </Group>
        </Stack>
      </Modal>

      <Modal
        opened={redeployAllModalOpen}
        onClose={() => setRedeployAllModalOpen(false)}
        title="Redeploy All Collectors"
      >
        <Stack>
          <Text>Are you sure you want to redeploy all active collectors?</Text>
          <Group justify="flex-end">
            <Button variant="default" onClick={() => setRedeployAllModalOpen(false)}>
              Cancel
            </Button>
            <Button color="blue" onClick={() => { setRedeployAllModalOpen(false); handleRedeployCollector(); }}>
              Redeploy All
            </Button>
          </Group>
        </Stack>
      </Modal>

      <Modal
        opened={restartModalOpen}
        onClose={() => { setRestartModalOpen(false); setCollectorToRestart(null); }}
        title="Restart Collector"
      >
        <Stack>
          <Text>Are you sure you want to restart this collector?</Text>
          <Text size="sm" c="dimmed">
            Listings: {collectorToRestart?.listingIds.join(', ')}
          </Text>
          <Group justify="flex-end">
            <Button variant="default" onClick={() => { setRestartModalOpen(false); setCollectorToRestart(null); }}>
              Cancel
            </Button>
            <Button color="green" onClick={() => collectorToRestart && handleRestartCollector(collectorToRestart)}>
              Restart
            </Button>
          </Group>
        </Stack>
      </Modal>

      <Modal
        opened={purgeModalOpen}
        onClose={() => { setPurgeModalOpen(false); setCollectorToPurge(null); }}
        title="Delete Collector Record"
      >
        <Stack>
          <Text>Are you sure you want to permanently delete this collector record?</Text>
          <Text size="sm" c="red" fw={500}>
            This action cannot be undone. The collector metadata will be permanently removed from the database.
          </Text>
          <Group justify="flex-end">
            <Button variant="default" onClick={() => { setPurgeModalOpen(false); setCollectorToPurge(null); }}>
              Cancel
            </Button>
            <Button color="red" onClick={() => collectorToPurge && handlePurgeCollector(collectorToPurge)}>
              Delete Permanently
            </Button>
          </Group>
        </Stack>
      </Modal>
    </Container>
  );
}

export default Collectors;
