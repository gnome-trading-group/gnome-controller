import { useState, useEffect, useMemo } from 'react';
import { ActionIcon, Badge, CloseButton, Container, Group, Input, Select, Switch, Title, Tooltip } from '@mantine/core';
import { IconRefresh, IconTag } from '@tabler/icons-react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import ReactTimeAgo from 'react-time-ago';
import { MantineReactTable, useMantineReactTable, type MRT_ColumnDef } from 'mantine-react-table';
import { Event, EventContract } from '../../types';
import { registryApi } from '../../utils/api';

interface EnrichedEvent extends Event {
  contractCount: number;
}

function EventsList() {
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const tagFilter = searchParams.get('tag') ?? '';

  const [allEvents, setAllEvents] = useState<EnrichedEvent[]>([]);
  const [loading, setLoading] = useState(false);
  const [categoryFilter, setCategoryFilter] = useState<string | null>(null);
  const [showResolved, setShowResolved] = useState(false);
  const [categories, setCategories] = useState<string[]>([]);

  const refresh = async () => {
    setLoading(true);
    try {
      const params: { category?: string; resolved?: boolean } = {};
      if (categoryFilter) params.category = categoryFilter;
      if (!showResolved) params.resolved = false;

      const [fetchedEvents, fetchedContracts] = await Promise.all([
        registryApi.listEvents(params),
        registryApi.listEventContracts(),
      ]);
      const countByEvent: Record<number, number> = {};
      for (const ec of fetchedContracts as EventContract[]) {
        countByEvent[ec.eventId] = (countByEvent[ec.eventId] ?? 0) + 1;
      }
      const enriched = (fetchedEvents as Event[]).map(e => ({
        ...e,
        contractCount: countByEvent[e.eventId] ?? 0,
      }));
      setAllEvents(enriched);

      const cats = [...new Set(enriched.map(e => e.category).filter(Boolean) as string[])].sort();
      setCategories(cats);
    } catch (err) {
      console.error('Failed to fetch events:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    refresh();
  }, [categoryFilter, showResolved]);

  const events = useMemo(() => {
    if (!tagFilter) return allEvents;
    return allEvents.filter(e => e.tags?.includes(tagFilter));
  }, [allEvents, tagFilter]);

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
      enableGrouping: true,
      Cell: ({ row }) => row.original.category ?? '-',
    },
    {
      accessorKey: 'contractCount',
      header: 'Contracts',
      enableSorting: true,
      size: 90,
    },
    {
      accessorKey: 'resolved',
      header: 'Status',
      enableSorting: true,
      enableGrouping: true,
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
    state: { isLoading: loading },
    enableColumnFilters: true,
    enableSorting: true,
    enablePagination: true,
    enableBottomToolbar: true,
    enableTopToolbar: true,
    enableGrouping: true,
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
            <ActionIcon size="lg" variant="filled" color="green" onClick={refresh} loading={loading}>
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
