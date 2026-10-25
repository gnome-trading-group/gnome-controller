import React, { useEffect, useMemo, useState } from 'react';
import { Alert, Group, Select, Switch } from '@mantine/core';
import { MantineReactTable, useMantineReactTable, type MRT_ColumnDef, type MRT_Row } from 'mantine-react-table';
import { useNavigate } from 'react-router-dom';
import { Source, Stream } from '../../types';
import { registryApi } from '../../utils/api';
import { navigateRowProps } from '../../utils/navigation';
import { useServerPaginatedTable } from '../../hooks/useServerPaginatedTable';
import { useUrlTableState } from '../../hooks/useUrlTableState';

function StreamsTab() {
  const navigate = useNavigate();
  const urlState = useUrlTableState();
  const [sources, setSources] = useState<Source[]>([]);
  const [sourceId, setSourceId] = useState<string | null>(null);
  const [activeOnly, setActiveOnly] = useState(true);

  useEffect(() => {
    registryApi.listSources().then(setSources).catch(() => setSources([]));
  }, []);

  const extraParams = useMemo(() => {
    const params: Record<string, string | number | boolean> = {};
    if (sourceId) params.sourceId = Number(sourceId);
    if (activeOnly) params.active = true;
    return params;
  }, [sourceId, activeOnly]);

  const {
    data: streams,
    total,
    isLoading,
    error,
    pagination,
    sorting,
    setPagination,
    setSorting,
  } = useServerPaginatedTable<Stream>({
    fetchFn: registryApi.listStreamsPaginated,
    countFn: registryApi.countStreams,
    extraParams,
    controlledState: {
      pagination: urlState.pagination,
      sorting: urlState.sorting,
      globalFilter: '',
      setPagination: urlState.setPagination,
      setSorting: urlState.setSorting,
      setGlobalFilter: () => {},
    },
  });

  const columns = useMemo<MRT_ColumnDef<Stream>[]>(() => [
    { accessorKey: 'streamId', header: 'Stream', size: 90, enableSorting: true },
    { accessorKey: 'sourceCode', header: 'Source', enableSorting: false },
    { accessorKey: 'subjectKind', header: 'Subject', size: 100, enableSorting: false },
    {
      accessorKey: 'listingId',
      header: 'Listing',
      size: 90,
      enableSorting: true,
      Cell: ({ row }: { row: MRT_Row<Stream> }) => row.original.listingId ?? '-',
    },
    { accessorKey: 'nativeSubjectId', header: 'Venue / vendor id', enableSorting: false },
    { accessorKey: 'family', header: 'Family', size: 100, enableSorting: true },
    { accessorKey: 'resolvedRegion', header: 'Collected in', enableSorting: false },
    {
      accessorKey: 'active',
      header: 'Active',
      size: 90,
      enableSorting: false,
      Cell: ({ row }: { row: MRT_Row<Stream> }) => (row.original.active ? 'Yes' : 'No'),
    },
  ], []);

  const table = useMantineReactTable({
    columns,
    data: streams,
    rowCount: total,
    manualPagination: true,
    manualSorting: true,
    state: { isLoading, pagination, sorting },
    onPaginationChange: setPagination,
    onSortingChange: setSorting,
    enableColumnFilters: false,
    enableGlobalFilter: false,
    enableSorting: true,
    renderTopToolbarCustomActions: () => (
      <Group gap="md">
        <Select
          id="streams-source"
          placeholder="All sources"
          size="xs"
          clearable
          data={sources.map(s => ({ value: String(s.sourceId), label: s.code }))}
          value={sourceId}
          onChange={setSourceId}
        />
        <Switch
          id="streams-active-only"
          size="xs"
          label="Active only"
          checked={activeOnly}
          onChange={e => setActiveOnly(e.currentTarget.checked)}
        />
      </Group>
    ),
    mantineTableBodyRowProps: ({ row }) => (
      row.original.listingId != null
        ? navigateRowProps(navigate, `/security-master/listings/${row.original.listingId}`)
        : {}
    ),
    mantineTableProps: { striped: true, highlightOnHover: true, withColumnBorders: true },
    initialState: { density: 'xs' },
  });

  return (
    <>
      {error && <Alert color="red" title="Error" mb="md">{error}</Alert>}
      <MantineReactTable table={table} />
    </>
  );
}

export default React.memo(StreamsTab);
