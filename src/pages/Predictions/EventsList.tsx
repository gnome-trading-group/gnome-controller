import { useState, useEffect, useRef, useMemo } from 'react';
import { ActionIcon, Badge, CloseButton, Container, Group, Input, Select, Switch, Title, Tooltip } from '@mantine/core';
import { IconRefresh, IconTag } from '@tabler/icons-react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import ReactTimeAgo from 'react-time-ago';
import { MantineReactTable, useMantineReactTable, type MRT_ColumnDef } from 'mantine-react-table';
import { Event, EventContract } from '../../types';
import { registryApi } from '../../utils/api';
import { useServerPaginatedTable } from '../../hooks/useServerPaginatedTable';

interface EnrichedEvent extends Event {
  contractCount: number;
}

function EventsList() {
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const tagFilter = searchParams.get('tag') ?? '';

  const [categoryFilter, setCategoryFilter] = useState<string | null>(null);
  const [showResolved, setShowResolved] = useState(false);
  const [categories, setCategories] = useState<string[]>([]);
  const [contractCounts, setContractCounts] = useState<Record<number, number>>({});
  const [filterKey, setFilterKey] = useState(0);
  const isFirstFilterRun = useRef(true);

  const extraParams = useMemo(() => {
    const p: Record<string, string | number | boolean> = {};
    if (categoryFilter) p.category = categoryFilter;
    if (!showResolved) p.resolved = false;
    if (tagFilter) p.tag = tagFilter;
    return p;
  }, [categoryFilter, showResolved, tagFilter]);

  const {
    data: rawEvents,
    total,
    isLoading,
    pagination,
    sorting,
    setPagination,
    setSorting,
    refresh,
  } = useServerPaginatedTable<Event>({
    fetchFn: registryApi.listEventsPaginated,
    countFn: registryApi.countEvents,
    defaultPageSize: 50,
    extraParams,
    externalRefreshKey: filterKey,
  });

  // When filters change, reset to page 0 and trigger a re-fetch via filterKey.
  // Skip on mount — the initial fetch is already handled by the hook.
  useEffect(() => {
    if (isFirstFilterRun.current) {
      isFirstFilterRun.current = false;
      return;
    }
    setPagination(prev => ({ ...prev, pageIndex: 0 }));
    setFilterKey(k => k + 1);
  }, [categoryFilter, showResolved, tagFilter]);

  useEffect(() => {
    registryApi.listEventContracts().then(ecs => {
      const counts: Record<number, number> = {};
      for (const ec of ecs as EventContract[]) {
        counts[ec.eventId] = (counts[ec.eventId] ?? 0) + 1;
      }
      setContractCounts(counts);
    }).catch(console.error);
  }, []);

  useEffect(() => {
    if (rawEvents.length > 0) {
      const cats = [...new Set(rawEvents.map(e => e.category).filter(Boolean) as string[])].sort();
      setCategories(prev => [...new Set([...prev, ...cats])].sort());
    }
  }, [rawEvents]);

  const events = useMemo<EnrichedEvent[]>(
    () => rawEvents.map(e => ({ ...e, contractCount: contractCounts[e.eventId] ?? 0 })),
    [rawEvents, contractCounts],
  );

  const setTagFilter = (tag: string) => {
    if (tag) setSearchParams({ tag });
    else setSearchParams({});
  };

  const columns = useMemo<MRT_ColumnDef<EnrichedEvent>[]>(() => [
    {
      accessorKey: 'title',
      header: 'Title',
      enableSorting: true,
      size: 350,
    },
    {
      accessorKey: 'category',
      header: 'Category',
      enableSorting: true,
      Cell: ({ row }) => row.original.category ?? '-',
    },
    {
      accessorKey: 'contractCount',
      header: 'Contracts',
      enableSorting: false,
      size: 90,
    },
    {
      accessorKey: 'resolved',
      header: 'Status',
      enableSorting: true,
      size: 100,
      Cell: ({ row }) => (
        <Badge color={row.original.resolved ? 'green' : 'blue'} variant="light" size="sm">
          {row.original.resolved ? 'Resolved' : 'Active'}
        </Badge>
      ),
    },
    {
      accessorKey: 'resolutionSource',
      header: 'Resolution Source',
      enableSorting: true,
      Cell: ({ row }) => row.original.resolutionSource ?? '-',
    },
    {
      accessorKey: 'expiry',
      header: 'Expiry',
      enableSorting: true,
      Cell: ({ row }) =>
        row.original.expiry ? (
          <ReactTimeAgo date={new Date(row.original.expiry)} timeStyle="round" />
        ) : '-',
    },
    {
      accessorKey: 'dateCreated',
      header: 'Created',
      enableSorting: true,
      Cell: ({ row }) =>
        row.original.dateCreated ? (
          <ReactTimeAgo date={new Date(row.original.dateCreated)} timeStyle="round" />
        ) : '-',
    },
  ], []);

  const table = useMantineReactTable({
    columns,
    data: events,
    rowCount: total,
    manualPagination: true,
    manualSorting: true,
    manualFiltering: true,
    state: { isLoading, pagination, sorting },
    onPaginationChange: setPagination,
    onSortingChange: setSorting,
    enableColumnFilters: false,
    enableSorting: true,
    enablePagination: true,
    enableBottomToolbar: true,
    enableTopToolbar: true,
    enableGrouping: false,
    mantineTableProps: {
      striped: true,
      highlightOnHover: true,
      withColumnBorders: true,
    },
    mantineTableBodyRowProps: ({ row }) => ({
      onClick: () => navigate(`/predictions/events/${row.original.eventId}`),
      style: { cursor: 'pointer' },
    }),
    initialState: {
      sorting: [{ id: 'dateCreated', desc: true }],
      density: 'xs',
    },
  });

  return (
    <Container size="xl" py="xl">
      <Group justify="space-between" mb="md">
        <Title order={2}>Events</Title>
        <Group>
          <Switch
            label="Show Resolved"
            checked={showResolved}
            onChange={e => setShowResolved(e.currentTarget.checked)}
          />
          <Select
            placeholder="All Categories"
            data={categories}
            value={categoryFilter}
            onChange={setCategoryFilter}
            clearable
            size="sm"
            style={{ width: 180 }}
          />
          <Input
            placeholder="Filter by tag"
            leftSection={<IconTag size={14} />}
            rightSection={tagFilter ? <CloseButton size="sm" onClick={() => setTagFilter('')} /> : undefined}
            value={tagFilter}
            onChange={e => setTagFilter(e.currentTarget.value)}
            size="sm"
            style={{ width: 160 }}
          />
          <Tooltip label="Refresh" position="bottom" withArrow openDelay={500}>
            <ActionIcon size="lg" variant="filled" color="green" onClick={refresh} loading={isLoading}>
              <IconRefresh size={20} />
            </ActionIcon>
          </Tooltip>
        </Group>
      </Group>
      {tagFilter && (
        <Group mb="sm" gap="xs">
          <Badge
            size="sm"
            variant="light"
            color="green"
            leftSection={<IconTag size={10} />}
            rightSection={<CloseButton size="xs" onClick={() => setTagFilter('')} />}
          >
            {tagFilter}
          </Badge>
        </Group>
      )}
      <MantineReactTable table={table} />
    </Container>
  );
}

export default EventsList;
