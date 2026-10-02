import { useEffect, useMemo } from 'react';
import { ActionIcon, Badge, CloseButton, Container, Group, Input, Select, Switch, Title, Tooltip } from '@mantine/core';
import { IconRefresh, IconTag } from '@tabler/icons-react';
import { useNavigate } from 'react-router-dom';
import { navigateRowProps } from '../../utils/navigation';
import ReactTimeAgo from 'react-time-ago';
import { MantineReactTable, useMantineReactTable, type MRT_ColumnDef } from 'mantine-react-table';
import { Event } from '../../types';
import { registryApi } from '../../utils/api';
import { useGlobalState } from '../../context/GlobalStateContext';
import { useServerPaginatedTable } from '../../hooks/useServerPaginatedTable';
import { useUrlTableState } from '../../hooks/useUrlTableState';
import { useState } from 'react';

function EventsList() {
  const navigate = useNavigate();
  const { exchanges } = useGlobalState();
  const [categories, setCategories] = useState<string[]>([]);

  const urlState = useUrlTableState({ defaultSort: { id: 'dateCreated', desc: true } });
  const tag = urlState.getParam('tag');
  const category = urlState.getParam('category');
  const exchangeId = urlState.getParam('exchange');
  const showResolved = urlState.getParam('resolved') === 'true';

  const setTag = (value: string) => urlState.setParam('tag', value);
  const setCategory = (value: string | null) => urlState.setParam('category', value ?? '');
  const setExchangeId = (value: string | null) => urlState.setParam('exchange', value ?? '');
  const setShowResolved = (value: boolean) => urlState.setParam('resolved', value ? 'true' : '');

  const extraParams = useMemo(() => {
    const p: Record<string, string | number | boolean> = {};
    if (category) p.category = category;
    if (exchangeId) p.exchangeId = Number(exchangeId);
    if (!showResolved) p.resolved = false;
    if (tag) p.tag = tag;
    return p;
  }, [category, exchangeId, showResolved, tag]);

  const {
    data: rawEvents,
    total,
    isLoading,
    pagination,
    sorting,
    globalFilter,
    setPagination,
    setSorting,
    setGlobalFilter,
    refresh,
  } = useServerPaginatedTable<Event>({
    fetchFn: registryApi.listEventsPaginated,
    countFn: registryApi.countEvents,
    defaultPageSize: 50,
    extraParams,
    controlledState: {
      pagination: urlState.pagination,
      sorting: urlState.sorting,
      globalFilter: urlState.globalFilter,
      setPagination: urlState.setPagination,
      setSorting: urlState.setSorting,
      setGlobalFilter: urlState.setGlobalFilter,
    },
  });

  useEffect(() => {
    if (rawEvents.length > 0) {
      const cats = [...new Set(rawEvents.map(e => e.category).filter(Boolean) as string[])].sort();
      setCategories(prev => [...new Set([...prev, ...cats])].sort());
    }
  }, [rawEvents]);

  const exchangeNameById = useMemo(
    () => Object.fromEntries(exchanges.map(e => [e.exchangeId, e.exchangeName])),
    [exchanges],
  );
  const exchangeOptions = useMemo(
    () => exchanges.map(e => ({ value: String(e.exchangeId), label: e.exchangeName })),
    [exchanges],
  );

  const columns = useMemo<MRT_ColumnDef<Event>[]>(() => [
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
      accessorKey: 'exchangeId',
      header: 'Exchange',
      enableSorting: false,
      size: 160,
      Cell: ({ row }) => {
        const exchangeId = row.original.exchangeId;
        return exchangeId != null ? (exchangeNameById[exchangeId] ?? `#${exchangeId}`) : '-';
      },
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
  ], [exchangeNameById]);

  const table = useMantineReactTable({
    columns,
    data: rawEvents,
    rowCount: total,
    manualPagination: true,
    manualSorting: true,
    manualFiltering: true,
    state: { isLoading, pagination, sorting, globalFilter },
    onPaginationChange: setPagination,
    onSortingChange: setSorting,
    onGlobalFilterChange: setGlobalFilter,
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
    mantineTableBodyRowProps: ({ row }) => (
      navigateRowProps(navigate, `/predictions/events/${row.original.eventId}`)
    ),
    initialState: {
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
            placeholder="All Exchanges"
            data={exchangeOptions}
            value={exchangeId || null}
            onChange={setExchangeId}
            clearable
            size="sm"
            style={{ width: 200 }}
          />
          <Select
            placeholder="All Categories"
            data={categories}
            value={category || null}
            onChange={setCategory}
            clearable
            size="sm"
            style={{ width: 180 }}
          />
          <Input
            placeholder="Filter by tag"
            leftSection={<IconTag size={14} />}
            rightSection={tag ? <CloseButton size="sm" onClick={() => setTag('')} /> : undefined}
            value={tag}
            onChange={e => setTag(e.currentTarget.value)}
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
      {tag && (
        <Group mb="sm" gap="xs">
          <Badge
            size="sm"
            variant="light"
            color="green"
            leftSection={<IconTag size={10} />}
            rightSection={<CloseButton size="xs" onClick={() => setTag('')} />}
          >
            {tag}
          </Badge>
        </Group>
      )}
      <MantineReactTable table={table} />
    </Container>
  );
}

export default EventsList;
