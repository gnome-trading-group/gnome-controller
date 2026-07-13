import React, { useState, useEffect, useMemo } from 'react';
import { Badge } from '@mantine/core';
import ReactTimeAgo from 'react-time-ago';
import { MantineReactTable, useMantineReactTable, type MRT_ColumnDef } from 'mantine-react-table';
import { Event, EventContract } from '../../types';
import { registryApi } from '../../utils/api';

interface EnrichedEvent extends Event {
  contractCount: number;
}

function EventsTab() {
  const [events, setEvents] = useState<EnrichedEvent[]>([]);
  const [loading, setLoading] = useState(false);

  const refresh = async () => {
    setLoading(true);
    try {
      const [fetchedEvents, fetchedContracts] = await Promise.all([
        registryApi.listEvents(),
        registryApi.listEventContracts(),
      ]);
      const countByEvent: Record<number, number> = {};
      for (const ec of fetchedContracts as EventContract[]) {
        countByEvent[ec.eventId] = (countByEvent[ec.eventId] ?? 0) + 1;
      }
      setEvents(
        (fetchedEvents as Event[]).map(e => ({
          ...e,
          contractCount: countByEvent[e.eventId] ?? 0,
        }))
      );
    } catch (err) {
      console.error('Failed to fetch events:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    refresh();
  }, []);

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
      header: 'Resolved',
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
    initialState: {
      sorting: [{ id: 'dateCreated', desc: true }],
      density: 'xs',
    },
  });

  return <MantineReactTable table={table} />;
}

export default React.memo(EventsTab);
