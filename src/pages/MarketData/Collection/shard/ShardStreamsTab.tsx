import { useMemo } from 'react';
import { Badge, Text, Tooltip } from '@mantine/core';
import { MantineReactTable, useMantineReactTable, type MRT_ColumnDef } from 'mantine-react-table';
import ReactTimeAgo from 'react-time-ago';
import { nsToDate, ShardStreamRow, stateColor, StreamRole } from '../../../../utils/collection';
import { StreamName } from '../../../../components/collection/StreamName';

const ROLE_HELP: Record<StreamRole, string> = {
  owned: 'Collected and written every minute',
  warming: 'Taking over: collects, writes nothing until the cut is set',
  'taking over': 'Writes from the cut minute on',
  'handing off': 'Writes up to the cut minute, then lets the stream go',
  draining: 'Leaving: still written until the cut is set',
};

function Ago({ ns }: { ns: number | undefined }) {
  const date = nsToDate(ns);
  return date ? <ReactTimeAgo date={date} timeStyle="round" /> : <Text span size="sm" c="dimmed">—</Text>;
}

// What the shard sent a leased stream's sessions over Aeron, and what it couldn't (lapped or back-pressured).
function Sent({ row }: { row: ShardStreamRow }) {
  if (!row.leased) return <Text size="sm" c="dimmed">—</Text>;
  const s = row.status;
  if (!s?.published) {
    return (
      <Tooltip label="Leased, but the shard's newest status doesn't say it is sending it yet" withArrow>
        <Badge size="sm" variant="light" color="blue">starting</Badge>
      </Tooltip>
    );
  }
  return (
    <Tooltip label="Records sent to sessions · records dropped (sessions see drops as bad data)" withArrow>
      <Text size="sm">
        {(s.offered ?? 0).toLocaleString()}
        {s.dropped ? <Text span size="sm" c="red"> · {s.dropped.toLocaleString()} dropped</Text> : null}
      </Text>
    </Tooltip>
  );
}

interface Row extends ShardStreamRow {
  name: string;
}

// Every stream on the shard: what the reconciler assigned it (its role and cut) beside what the shard reports of it.
export function ShardStreamsTab({ rows, names }: { rows: ShardStreamRow[]; names: Map<number, string> | undefined }) {
  const data = useMemo<Row[]>(() => rows.map((r) => ({ ...r, name: names?.get(r.streamId) ?? String(r.streamId) })), [rows, names]);
  const columns = useMemo<MRT_ColumnDef<Row>[]>(() => [
    {
      accessorKey: 'name', header: 'Stream', size: 320,
      Cell: ({ row }) => <StreamName streamId={row.original.streamId} name={names?.get(row.original.streamId)} />,
    },
    {
      accessorKey: 'state', header: 'State', filterVariant: 'select', size: 150,
      Cell: ({ row }) => (
        <Tooltip label={row.original.status?.failure} disabled={!row.original.status?.failure} multiline w={400} withArrow>
          <Badge size="sm" variant="light" color={stateColor(row.original.state)}>{row.original.state.toLowerCase()}</Badge>
        </Tooltip>
      ),
    },
    {
      accessorKey: 'role', header: 'Role', filterVariant: 'select', size: 170,
      Cell: ({ row }) => (
        <Tooltip label={ROLE_HELP[row.original.role]} withArrow>
          <Text size="sm">{row.original.role}{row.original.cut ? ` · ${row.original.cut}` : ''}</Text>
        </Tooltip>
      ),
    },
    {
      id: 'lastEvent', header: 'Last event', size: 130, enableColumnFilter: false,
      accessorFn: (r) => r.status?.lastEventNs ?? 0, Cell: ({ row }) => <Ago ns={row.original.status?.lastEventNs} />,
    },
    {
      id: 'verified', header: 'Verified', size: 130, enableColumnFilter: false,
      accessorFn: (r) => r.status?.lastVerifiedNs ?? 0, Cell: ({ row }) => <Ago ns={row.original.status?.lastVerifiedNs} />,
    },
    {
      id: 'resyncs', header: 'Resyncs', size: 90, enableColumnFilter: false, mantineTableBodyCellProps: { ta: 'right' },
      accessorFn: (r) => r.status?.resyncs ?? 0,
      Cell: ({ cell }) => <Text size="sm" c={cell.getValue<number>() ? 'orange' : undefined}>{cell.getValue<number>()}</Text>,
    },
    {
      id: 'sessions', header: 'To sessions', size: 150, enableColumnFilter: false, mantineTableBodyCellProps: { ta: 'right' },
      accessorFn: (r) => (r.leased ? r.status?.offered ?? 0 : -1),
      Cell: ({ row }) => <Sent row={row.original} />,
    },
    {
      id: 'records', header: 'Records', size: 110, enableColumnFilter: false, mantineTableBodyCellProps: { ta: 'right' },
      accessorFn: (r) => r.status?.records ?? 0, Cell: ({ cell }) => cell.getValue<number>().toLocaleString(),
    },
  ], [names]);

  const table = useMantineReactTable({
    columns,
    data,
    state: { showColumnFilters: true },
    enableColumnActions: false,
    enableDensityToggle: false,
    enableFullScreenToggle: false,
    enableHiding: false,
    initialState: { density: 'xs', pagination: { pageIndex: 0, pageSize: 50 } },
    mantineTableProps: { striped: true, highlightOnHover: true },
    renderEmptyRowsFallback: () => <Text c="dimmed" size="sm" p="md">No streams on this shard.</Text>,
  });
  return <MantineReactTable table={table} />;
}
