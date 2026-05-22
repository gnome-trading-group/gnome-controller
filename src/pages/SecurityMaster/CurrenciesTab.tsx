import React, { useMemo } from 'react';
import ReactTimeAgo from 'react-time-ago';
import { MantineReactTable, useMantineReactTable, type MRT_ColumnDef, type MRT_Row } from 'mantine-react-table';
import { useGlobalState } from '../../context/GlobalStateContext';
import { Currency } from '../../types';

function CurrenciesTab() {
  const { currencies, loading } = useGlobalState();

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
    state: { isLoading: loading.currencies },
    enableColumnFilters: true,
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
      sorting: [{ id: 'symbol', desc: false }],
      density: 'xs',
    },
  });

  return <MantineReactTable table={table} />;
}

export default React.memo(CurrenciesTab);
