import React, { useMemo } from 'react';
import ReactTimeAgo from 'react-time-ago';
import { MantineReactTable, useMantineReactTable, type MRT_ColumnDef, type MRT_Row } from 'mantine-react-table';
import { Currency } from '../../types';
import { registryApi } from '../../utils/api';
import { useServerPaginatedTable } from '../../hooks/useServerPaginatedTable';

function CurrenciesTab() {
  const {
    data: currencies,
    total,
    isLoading,
    pagination,
    sorting,
    globalFilter,
    setPagination,
    setSorting,
    setGlobalFilter,
  } = useServerPaginatedTable<Currency>({
    fetchFn: registryApi.listCurrenciesPaginated,
    countFn: registryApi.countCurrencies,
  });

  const columns = useMemo<MRT_ColumnDef<Currency>[]>(() => [
    {
      accessorKey: 'symbol',
      header: 'Symbol',
      enableSorting: true,
    },
    {
      accessorKey: 'name',
      header: 'Name',
      enableSorting: true,
      Cell: ({ row }: { row: MRT_Row<Currency> }) => row.original.name ?? '-',
    },
    {
      accessorKey: 'decimals',
      header: 'Decimals',
      enableSorting: true,
      size: 100,
    },
    {
      accessorKey: 'dateCreated',
      header: 'Created',
      enableSorting: true,
      Cell: ({ row }: { row: MRT_Row<Currency> }) =>
        row.original.dateCreated ?
          <ReactTimeAgo date={new Date(row.original.dateCreated)} timeStyle="round" /> :
          '-',
    },
  ], []);

  const table = useMantineReactTable({
    columns,
    data: currencies,
    rowCount: total,
    manualPagination: true,
    manualSorting: true,
    manualFiltering: true,
    state: {
      isLoading,
      pagination,
      sorting,
      globalFilter,
    },
    onPaginationChange: setPagination,
    onSortingChange: setSorting,
    onGlobalFilterChange: setGlobalFilter,
    enableColumnFilters: false,
    enableSorting: true,
    enablePagination: true,
    enableBottomToolbar: true,
    enableTopToolbar: true,
    mantineTableProps: {
      striped: true,
      highlightOnHover: true,
      withColumnBorders: true,
    },
    initialState: {
      density: 'xs',
    },
  });

  return <MantineReactTable table={table} />;
}

export default React.memo(CurrenciesTab);
