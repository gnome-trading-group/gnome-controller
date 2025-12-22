import { useState, useEffect, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { collectorsApi } from '../../utils/api';
import { ApiError } from '../../utils/api';
import {
  Button,
  ActionIcon,
  Group,
  Modal,
  Stack,
  Title,
  Container,
  Badge,
  Notification,
  Text,
  Tooltip,
  Select,
} from '@mantine/core';
import { IconPlus, IconRefresh, IconPlayerStop, IconAB2 } from '@tabler/icons-react';
import ReactTimeAgo from 'react-time-ago';
import { MantineReactTable, useMantineReactTable, type MRT_ColumnDef, type MRT_Row } from 'mantine-react-table';
import { useGlobalState } from '../../context/GlobalStateContext';
import { formatSecurityType } from '../../utils/security-master';

interface Collector {
  listingId: number;
  status: string;
  lastStatusChange: number;
  failureReason: string | null;
  region?: string;
}

function MarketData() {
  const navigate = useNavigate();
  const { listings, exchanges, securities } = useGlobalState();
  const [collectors, setCollectors] = useState<Collector[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [createModalOpen, setCreateModalOpen] = useState(false);
  const [selectedListingId, setSelectedListingId] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  const [stopModalOpen, setStopModalOpen] = useState(false);
  const [collectorToStop, setCollectorToStop] = useState<number | null>(null);
  const [redeployModalOpen, setRedeployModalOpen] = useState(false);
  const [collectorToRedeploy, setCollectorToRedeploy] = useState<number | null>(null);
  const [redeployAllModalOpen, setRedeployAllModalOpen] = useState(false);

  const exchangeRegionMap = useMemo(() => {
    const map = new Map<number, string>();
    exchanges.forEach((exchange) => {
      map.set(exchange.exchangeId, exchange.region);
    });
    return map;
  }, [exchanges]);

  const listingOptions = useMemo(() => {
    return listings
      .map((listing) => {
        const exchange = exchanges.find((e) => e.exchangeId === listing.exchangeId);
        const security = securities.find((s) => s.securityId === listing.securityId);
        return {
          value: String(listing.listingId),
          label: `${listing.listingId} - ${exchange?.exchangeName} - ${security?.symbol} (${formatSecurityType(security?.type || 0)})`,
        }
      });
  }, [listings, securities, exchanges]);

  const selectedListingRegion = useMemo(() => {
    if (!selectedListingId) return null;
    const listing = listings.find((l) => l.listingId === Number(selectedListingId));
    if (!listing) return null;
    return exchangeRegionMap.get(listing.exchangeId) || null;
  }, [selectedListingId, listings, exchangeRegionMap]);

  useEffect(() => {
    loadCollectors();
  }, []);

  useEffect(() => {
    const interval = setInterval(() => {
      loadCollectors(false);
    }, 5000);

    return () => clearInterval(interval);
  }, []);

  const loadCollectors = async (showLoading = true) => {
    try {
      if (showLoading) {
        setLoading(true);
      }
      setError(null);
      const response = await collectorsApi.list();
      setCollectors(response.collectors);
    } catch (err) {
      if (err instanceof ApiError) {
        setError(err.message);
      } else {
        setError('Failed to load collectors');
      }
    } finally {
      if (showLoading) {
        setLoading(false);
      }
    }
  };

  const handleCreateCollector = async () => {
    if (!selectedListingId || !selectedListingRegion) return;

    try {
      setError(null);
      setCreating(true);
      await collectorsApi.create(Number(selectedListingId), selectedListingRegion);
      setCreateModalOpen(false);
      setSelectedListingId(null);
      await loadCollectors();
    } catch (err) {
      if (err instanceof ApiError) {
        setError(err.message);
      } else {
        setError('Failed to create collector');
      }
    } finally {
      setCreating(false);
    }
  };

  const handleStopCollector = async (listingId: number) => {
    try {
      setError(null);
      await collectorsApi.delete(listingId);
      await loadCollectors();
    } catch (err) {
      if (err instanceof ApiError) {
        setError(err.message);
      } else {
        setError('Failed to stop collector');
      }
    } finally {
      setStopModalOpen(false);
      setCollectorToStop(null);
    }
  };

  const handleRedeployCollector = async (listingId?: number) => {
    try {
      setError(null);
      await collectorsApi.redeploy(listingId);
      await loadCollectors();
    } catch (err) {
      if (err instanceof ApiError) {
        setError(err.message);
      } else {
        setError('Failed to redeploy collector');
      }
    } finally {
      setRedeployModalOpen(false);
      setCollectorToRedeploy(null);
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
      accessorKey: 'listingId',
      header: 'Listing ID',
      enableSorting: true,
    },
    {
      accessorKey: 'region',
      header: 'Region',
      enableSorting: true,
      Cell: ({ row }: { row: MRT_Row<Collector> }) => row.original.region || '-',
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
    renderRowActions: ({ row }) => (
      row.original.status === 'ACTIVE' && (
        <Group
          gap={4}
          justify="flex-start"
          wrap="nowrap"
        >
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
      )
    ),
    enablePagination: true,
    enableBottomToolbar: true,
    enableTopToolbar: true,
    initialState: { density: 'xs' },
    state: { isLoading: loading },
    mantineTableBodyRowProps: ({ row }) => ({
      onClick: () => navigate(`/collectors/${row.original.listingId}`),
      style: { cursor: 'pointer' },
    }),
  });

  return (
    <Container size="xl" py="xl">
      <Group justify="space-between" mb="md">
        <Title order={2}>Active Collectors</Title>
        <Group>
          <Tooltip label="Refresh" position="bottom" withArrow openDelay={500}>
            <ActionIcon 
              size="lg" 
              variant="filled" 
              color="green"
              onClick={() => loadCollectors(true)}
            >
              <IconRefresh size={20} />
            </ActionIcon>
          </Tooltip>
          <Tooltip label="Create" position="bottom" withArrow openDelay={500}>
            <ActionIcon 
              size="lg" 
              variant="filled" 
              color="green"
              onClick={() => setCreateModalOpen(true)}
            >
              <IconPlus size={20} />
            </ActionIcon>
          </Tooltip>
          <Tooltip label="Redeploy All" position="bottom" withArrow openDelay={500}>
            <ActionIcon 
              size="lg" 
              variant="filled" 
              color="blue"
              onClick={() => setRedeployAllModalOpen(true)}
            >
              <IconAB2 size={20} />
            </ActionIcon>
          </Tooltip>
        </Group>
      </Group>

      {error && (
        <Notification 
          color="red" 
          title="Error" 
          onClose={() => setError(null)}
          mb="md"
        >
          {error}
        </Notification>
      )}

      <MantineReactTable table={table} />

      <Modal
        opened={createModalOpen}
        onClose={() => setCreateModalOpen(false)}
        title="Create New Collector"
      >
        <Stack>
          <Select
            label="Listing"
            value={selectedListingId}
            onChange={setSelectedListingId}
            data={listingOptions}
            placeholder="Select a listing"
            searchable
            required
          />
          {selectedListingRegion && (
            <Text size="sm" c="dimmed">
              Region: <Badge size="sm">{selectedListingRegion}</Badge>
            </Text>
          )}
          <Button
            onClick={handleCreateCollector}
            loading={creating}
            disabled={creating || !selectedListingId || !selectedListingRegion}
          >
            Create Collector
          </Button>
        </Stack>
      </Modal>

      <Modal
        opened={stopModalOpen}
        onClose={() => {
          setStopModalOpen(false);
          setCollectorToStop(null);
        }}
        title="Stop Collector"
      >
        <Stack>
          <Text>Are you sure you want to stop this collector?</Text>
          <Group justify="flex-end">
            <Button variant="default" onClick={() => {
              setStopModalOpen(false);
              setCollectorToStop(null);
            }}>
              Cancel
            </Button>
            <Button 
              color="red" 
              onClick={() => collectorToStop && handleStopCollector(collectorToStop)}
            >
              Stop Collector
            </Button>
          </Group>
        </Stack>
      </Modal>

      <Modal
        opened={redeployModalOpen}
        onClose={() => {
          setRedeployModalOpen(false);
          setCollectorToRedeploy(null);
        }}
        title="Redeploy Collector"
      >
        <Stack>
          <Text>Are you sure you want to redeploy this collector?</Text>
          <Group justify="flex-end">
            <Button variant="default" onClick={() => {
              setRedeployModalOpen(false);
              setCollectorToRedeploy(null);
            }}>
              Cancel
            </Button>
            <Button 
              color="blue" 
              onClick={() => collectorToRedeploy && handleRedeployCollector(collectorToRedeploy)}
            >
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
            <Button 
              color="blue" 
              onClick={() => {
                setRedeployAllModalOpen(false);
                handleRedeployCollector();
              }}
            >
              Redeploy All
            </Button>
          </Group>
        </Stack>
      </Modal>
    </Container>
  );
}

export default MarketData;