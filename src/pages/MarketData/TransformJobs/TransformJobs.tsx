import { useState, useEffect, useMemo, useCallback } from 'react';
import { useSearchParams } from 'react-router-dom';
import {
  Container,
  Title,
  Group,
  Stack,
  Notification,
  Center,
  Loader,
  ActionIcon,
  Tooltip,
  Badge,
  Select,
  Text,
  Button,
  Tabs,
  Paper,
  SimpleGrid,
} from '@mantine/core';
import { IconRefresh, IconClock, IconCheck, IconX } from '@tabler/icons-react';
import { MantineReactTable, useMantineReactTable, type MRT_ColumnDef } from 'mantine-react-table';
import ReactTimeAgo from 'react-time-ago';
import { marketDataApi, registryApi } from '../../../utils/api';
import { useListingSearch, useListingLabels } from '../../../hooks/useAsyncSearch';
import { TransformJob, TransformJobStatus } from '../../../types/transform-jobs';
import { SchemaType } from '../../../types/schema';

const STATUS_CONFIG: Record<TransformJobStatus, { color: string; icon: React.ReactNode; label: string }> = {
  PENDING: { color: 'blue', icon: <IconClock size={14} />, label: 'Pending' },
  COMPLETE: { color: 'green', icon: <IconCheck size={14} />, label: 'Complete' },
  FAILED: { color: 'red', icon: <IconX size={14} />, label: 'Failed' },
};

const ALL_STATUSES: TransformJobStatus[] = ['PENDING', 'COMPLETE', 'FAILED'];
const ALL_SCHEMA_TYPES: SchemaType[] = Object.values(SchemaType);

interface TableRow extends TransformJob {
  listingLabel: string;
}

function TransformJobs() {
  const [searchParams, setSearchParams] = useSearchParams();
  const [jobs, setJobs] = useState<TransformJob[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [apiError, setApiError] = useState<string | null>(null);

  // Initialize from URL query params
  const initialListingId = searchParams.get('listingId');
  const [selectedStatus, setSelectedStatus] = useState<TransformJobStatus>('PENDING');
  const [selectedListingId, setSelectedListingId] = useState<string | null>(initialListingId);
  const [selectedSchemaType, setSelectedSchemaType] = useState<string | null>(null);
  const [listingSearchValue, setListingSearchValue] = useState('');
  const { options: listingSearchOptions, isLoading: listingSearchLoading } = useListingSearch(listingSearchValue);
  const [selectedListingOption, setSelectedListingOption] = useState<{ value: string; label: string } | null>(null);

  const [lastEvaluatedKey, setLastEvaluatedKey] = useState<string | null>(null);
  const [hasMore, setHasMore] = useState(false);

  // Update URL when listing selection changes
  const handleListingChange = useCallback((listingId: string | null) => {
    setSelectedListingId(listingId);
    if (!listingId) setSelectedListingOption(null);
    if (listingId) {
      setSearchParams({ listingId });
    } else {
      setSearchParams({});
    }
  }, [setSearchParams]);

  useEffect(() => {
    if (!initialListingId) return;
    registryApi.listListingsPaginated({ listingId: parseInt(initialListingId), limit: 1 })
      .then(rows => {
        const l = rows[0];
        if (l) setSelectedListingOption({ value: String(l.listingId), label: `${l.listingId} - ${l.exchangeName} - ${l.securitySymbol}` });
      })
      .catch(() => {});
  }, [initialListingId]);

  const listingOptions = useMemo(() => {
    if (selectedListingOption && !listingSearchOptions.some(o => o.value === selectedListingOption.value)) {
      return [selectedListingOption, ...listingSearchOptions];
    }
    return listingSearchOptions;
  }, [listingSearchOptions, selectedListingOption]);

  const loadJobs = useCallback(async (append = false) => {
    try {
      setLoading(true);
      setError(null);
      setApiError(null);

      let response;
      if (selectedListingId) {
        response = await marketDataApi.searchTransformJobs({
          listingId: Number(selectedListingId),
          schemaType: selectedSchemaType as SchemaType | undefined,
          limit: 100,
          lastEvaluatedKey: append ? lastEvaluatedKey || undefined : undefined,
        });
      } else {
        response = await marketDataApi.listTransformJobs({
          status: selectedStatus,
          limit: 100,
          lastEvaluatedKey: append ? lastEvaluatedKey || undefined : undefined,
        });
      }

      if (response.error) {
        setApiError(response.error);
      }

      if (append) {
        setJobs(prev => [...prev, ...response.jobs]);
      } else {
        setJobs(response.jobs);
      }

      setLastEvaluatedKey(response.lastEvaluatedKey || null);
      setHasMore(!!response.lastEvaluatedKey);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load transform jobs');
    } finally {
      setLoading(false);
    }
  }, [selectedStatus, selectedListingId, selectedSchemaType, lastEvaluatedKey]);

  useEffect(() => {
    setLastEvaluatedKey(null);
    loadJobs(false);
  }, [selectedStatus, selectedListingId, selectedSchemaType]);

  const jobListingIds = useMemo(() => jobs.map(j => j.listingId), [jobs]);
  const listingLabelMap = useListingLabels(jobListingIds);

  const tableData = useMemo((): TableRow[] => {
    return jobs.map(job => ({
      ...job,
      listingLabel: listingLabelMap[job.listingId] || `Listing ${job.listingId}`,
    }));
  }, [jobs, listingLabelMap]);

  const columns = useMemo<MRT_ColumnDef<TableRow>[]>(() => [
    {
      accessorKey: 'listingId',
      header: 'Listing ID',
      size: 100,
    },
    {
      accessorKey: 'listingLabel',
      header: 'Listing',
      size: 200,
    },
    {
      accessorKey: 'schemaType',
      header: 'Schema Type',
      size: 120,
      Cell: ({ cell }) => (
        <Badge size="sm" variant="light">
          {cell.getValue<string>()}
        </Badge>
      ),
    },
    {
      accessorKey: 'timestamp',
      header: 'Timestamp',
      size: 150,
      Cell: ({ cell }) => {
        const ts = cell.getValue<number>();
        if (!ts) return '-';
        const date = new Date(ts * 1000);
        const year = date.getUTCFullYear();
        const month = String(date.getUTCMonth() + 1).padStart(2, '0');
        const day = String(date.getUTCDate()).padStart(2, '0');
        const hours = String(date.getUTCHours()).padStart(2, '0');
        const minutes = String(date.getUTCMinutes()).padStart(2, '0');
        return `${year}-${month}-${day}T${hours}:${minutes}Z`;
      },
    },
    {
      accessorKey: 'status',
      header: 'Status',
      size: 140,
      Cell: ({ cell }) => {
        const status = cell.getValue<TransformJobStatus>();
        const config = STATUS_CONFIG[status];
        return (
          <Badge color={config.color} size="sm" leftSection={config.icon}>
            {config.label}
          </Badge>
        );
      },
    },
    {
      accessorKey: 'createdAt',
      header: 'Created',
      size: 150,
      Cell: ({ cell }) => {
        const timestamp = cell.getValue<number>();
        return timestamp ? <ReactTimeAgo date={timestamp * 1000} timeStyle="round" /> : '-';
      },
    },
    {
      accessorKey: 'processedAt',
      header: 'Processed',
      size: 150,
      Cell: ({ cell }) => {
        const timestamp = cell.getValue<number | null>();
        return timestamp ? <ReactTimeAgo date={timestamp * 1000} timeStyle="round" /> : '-';
      },
    },
    {
      accessorKey: 'errorMessage',
      header: 'Error',
      size: 250,
      Cell: ({ cell }) => {
        const error = cell.getValue<string | null>();
        return error ? (
          <Tooltip label={error} multiline w={300}>
            <Text size="xs" c="red" lineClamp={1}>{error}</Text>
          </Tooltip>
        ) : '-';
      },
    },
  ], []);

  const table = useMantineReactTable({
    columns,
    data: tableData,
    enablePagination: false,
    enableBottomToolbar: false,
    enableTopToolbar: true,
    initialState: { density: 'xs' },
    state: { isLoading: loading },
    mantineTableContainerProps: { style: { maxHeight: '600px' } },
  });

  const statusCounts = useMemo(() => {
    if (selectedListingId) {
      const counts: Record<TransformJobStatus, number> = {
        PENDING: 0,
        COMPLETE: 0,
        FAILED: 0,
      };
      jobs.forEach(job => {
        counts[job.status]++;
      });
      return counts;
    }
    return null;
  }, [jobs, selectedListingId]);

  if (loading && jobs.length === 0) {
    return (
      <Container size="xl" py="xl">
        <Center style={{ minHeight: '60vh' }}>
          <Stack align="center" gap="xl">
            <Loader size="xl" color="green" />
            <Stack align="center" gap="xs">
              <Title order={3} c="dimmed">Loading Transform Jobs</Title>
              <Text size="sm" c="dimmed">Fetching jobs...</Text>
            </Stack>
          </Stack>
        </Center>
      </Container>
    );
  }

  return (
    <Container size="xl" py="xl">
      <Group justify="space-between" mb="md">
        <Title order={2}>Transform Jobs</Title>
        <Tooltip label="Refresh" position="bottom" withArrow openDelay={500}>
          <ActionIcon size="lg" variant="filled" color="green" onClick={() => loadJobs(false)} loading={loading}>
            <IconRefresh size={20} />
          </ActionIcon>
        </Tooltip>
      </Group>

      {error && (
        <Notification color="red" title="Error" onClose={() => setError(null)} mb="md">
          {error}
        </Notification>
      )}

      {apiError && (
        <Notification color="orange" title="API Warning" mb="md" withCloseButton={false}>
          {apiError}
        </Notification>
      )}

      <Paper withBorder p="md" mb="md">
        <Group align="flex-end" gap="md">
          <Select
            label="Filter by Listing"
            placeholder="Search listings..."
            searchable
            clearable
            data={listingOptions}
            value={selectedListingId}
            onChange={(v) => { handleListingChange(v); if (v) { const opt = listingOptions.find(o => o.value === v); if (opt) setSelectedListingOption(opt); } }}
            onSearchChange={setListingSearchValue}
            searchValue={listingSearchValue}
            filter={({ options }) => options}
            rightSection={listingSearchLoading ? <Loader size="xs" /> : undefined}
            style={{ minWidth: 300 }}
          />
          {selectedListingId && (
            <Select
              label="Schema Type"
              placeholder="All types"
              clearable
              data={ALL_SCHEMA_TYPES.map(t => ({ value: t, label: t }))}
              value={selectedSchemaType}
              onChange={setSelectedSchemaType}
              style={{ minWidth: 150 }}
            />
          )}
        </Group>
      </Paper>

      {!selectedListingId && (
        <Tabs value={selectedStatus} onChange={(v) => setSelectedStatus(v as TransformJobStatus)} mb="md">
          <Tabs.List>
            {ALL_STATUSES.map(status => {
              const config = STATUS_CONFIG[status];
              return (
                <Tabs.Tab
                  key={status}
                  value={status}
                  leftSection={config.icon}
                  color={config.color}
                >
                  {config.label}
                </Tabs.Tab>
              );
            })}
          </Tabs.List>
        </Tabs>
      )}

      {selectedListingId && statusCounts && (
        <SimpleGrid cols={{ base: 2, sm: 3, lg: 5 }} mb="md">
          {ALL_STATUSES.map(status => {
            const config = STATUS_CONFIG[status];
            return (
              <Paper key={status} withBorder p="sm" radius="md">
                <Group justify="space-between">
                  <Text size="xs" c="dimmed" tt="uppercase" fw={700}>{config.label}</Text>
                  <Badge color={config.color} size="lg">{statusCounts[status]}</Badge>
                </Group>
              </Paper>
            );
          })}
        </SimpleGrid>
      )}

      <Paper withBorder>
        <MantineReactTable table={table} />

        {hasMore && (
          <Group justify="center" p="md">
            <Button
              variant="light"
              onClick={() => loadJobs(true)}
              loading={loading}
            >
              Load More
            </Button>
          </Group>
        )}
      </Paper>

      <Text size="sm" c="dimmed" mt="sm">
        Showing {jobs.length} job{jobs.length !== 1 ? 's' : ''}
        {hasMore && ' (more available)'}
      </Text>
    </Container>
  );
}

export default TransformJobs;
