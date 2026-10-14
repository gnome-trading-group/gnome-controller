import { useMemo } from 'react';
import { Badge, Text, Tooltip } from '@mantine/core';
import { MantineReactTable, MRT_ColumnDef, useMantineReactTable } from 'mantine-react-table';
import { Transfer } from '../../types/treasury';
import { formatActor } from '../../utils/kill-switch';
import { Money, Time } from '../../components/trading/values';

export function TransfersTable({ rows, loading, showAccount }: { rows: Transfer[]; loading: boolean; showAccount: boolean }) {
  const columns = useMemo<MRT_ColumnDef<Transfer>[]>(() => [
    { id: 'when', header: 'When', size: 150, Cell: ({ row }) => <Time value={row.original.occurredAt} precision="minute" size="sm" /> },
    ...(showAccount ? [{ id: 'account', header: 'Account', size: 150, Cell: ({ row }) => row.original.label } as MRT_ColumnDef<Transfer>] : []),
    { id: 'kind', header: 'Kind', size: 120, Cell: ({ row }) => <Badge size="sm" variant="light" color="gray">{row.original.kind}</Badge> },
    {
      id: 'amount', header: 'Amount', size: 110,
      mantineTableHeadCellProps: { align: 'right' }, mantineTableBodyCellProps: { align: 'right' },
      Cell: ({ row }) => <Money value={row.original.amount} size="sm" />,
    },
    {
      id: 'ref', header: 'Reference', size: 160,
      Cell: ({ row }) => (row.original.externalRef ? (
        <Tooltip label={row.original.externalRef} withArrow openDelay={300}>
          <Text span size="sm" ff="monospace" truncate maw={160} display="inline-block">{row.original.externalRef}</Text>
        </Tooltip>
      ) : <Text span size="sm" c="dimmed">—</Text>),
    },
    { id: 'reason', header: 'Reason', size: 220, Cell: ({ row }) => row.original.reason ?? '—' },
    {
      id: 'by', header: 'Recorded by', size: 170,
      Cell: ({ row }) => (
        <Tooltip label={<Time value={row.original.recordedAt} />} withArrow openDelay={300}>
          <Text span size="sm">{formatActor(row.original.actor)}</Text>
        </Tooltip>
      ),
    },
  ], [showAccount]);
  const table = useMantineReactTable({
    columns,
    data: rows,
    state: { isLoading: loading },
    enableTopToolbar: false,
    enableColumnActions: false,
    enableColumnFilters: false,
    enableSorting: false,
    initialState: { density: 'xs', pagination: { pageIndex: 0, pageSize: 15 } },
    mantineTableProps: { striped: true, highlightOnHover: true, withColumnBorders: true },
    renderEmptyRowsFallback: () => <Text c="dimmed" size="sm" p="md">No transfers recorded.</Text>,
  });
  return <MantineReactTable table={table} />;
}
