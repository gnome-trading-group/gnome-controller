import { useMemo } from 'react';
import { Badge, Code, Text } from '@mantine/core';
import { MantineReactTable, useMantineReactTable, type MRT_ColumnDef } from 'mantine-react-table';
import { useNavigate } from 'react-router-dom';
import ReactTimeAgo from 'react-time-ago';
import { CollectionTarget } from '../../../types/collection';
import { nsToDate } from '../../../utils/collection';
import { navigateRowProps } from '../../../utils/navigation';
import { StreamName } from '../../../components/collection/StreamName';
import { CutProgress } from '../../../components/collection/CutProgress';

interface Row extends CollectionTarget {
  name: string;
  coverage: string;
}

// Every stream collection wants or is retiring: where it is, whether it's handing off, and whether it's covered.
// Searchable and filterable; uncovered streams first. A row opens the stream's coverage history.
export function StreamsTable({ targets, names, loading }: {
  targets: CollectionTarget[]; names: Map<number, string> | undefined; loading: boolean;
}) {
  const navigate = useNavigate();
  const now = Date.now();
  const data = useMemo<Row[]>(() => targets
    .map((t) => ({
      ...t,
      name: names?.get(t.streamId) ?? `${t.source} ${t.streamId}`,
      coverage: !t.shardId ? 'unplaced' : t.uncoveredSinceNs ? (t.uncoveredReason ?? 'uncovered').toLowerCase() : 'covered',
    }))
    .sort((a, b) => Number(b.coverage !== 'covered') - Number(a.coverage !== 'covered') || a.streamId - b.streamId),
  [targets, names]);

  const columns = useMemo<MRT_ColumnDef<Row>[]>(() => [
    {
      accessorKey: 'name', header: 'Stream', size: 320,
      Cell: ({ row }) => <StreamName streamId={row.original.streamId} name={names?.get(row.original.streamId)} />,
    },
    { accessorKey: 'source', header: 'Source', filterVariant: 'select', size: 120 },
    { accessorKey: 'region', header: 'Region', filterVariant: 'select', size: 120 },
    {
      accessorKey: 'state', header: 'State', filterVariant: 'select', size: 110,
      Cell: ({ cell }) => (
        <Badge size="sm" variant="light" color={cell.getValue<string>() === 'DESIRED' ? 'blue' : 'gray'}>
          {cell.getValue<string>().toLowerCase()}
        </Badge>
      ),
    },
    {
      accessorKey: 'shardId', header: 'Shard', size: 130,
      Cell: ({ cell }) => (cell.getValue<string>() ? <Code>{cell.getValue<string>()}</Code> : <Text size="sm" c="dimmed">—</Text>),
    },
    {
      id: 'handoff', header: 'Hand-off', size: 260, enableColumnFilter: false,
      accessorFn: (r) => r.drainingFromShardId ?? '',
      Cell: ({ row }) => <CutProgress target={row.original} nowMs={now} />,
    },
    {
      accessorKey: 'coverage', header: 'Coverage', filterVariant: 'select', size: 200,
      Cell: ({ row }) => {
        const t = row.original;
        if (t.coverage === 'covered') return <Badge size="sm" variant="light" color="teal">covered</Badge>;
        const since = nsToDate(t.uncoveredSinceNs);
        return (
          <Text size="sm" c="red">
            {t.coverage}{since && <> · <ReactTimeAgo date={since} timeStyle="round" /></>}
          </Text>
        );
      },
    },
  ], [names, now]);

  const table = useMantineReactTable({
    columns,
    data,
    state: { isLoading: loading, showColumnFilters: true },
    enableColumnActions: false,
    enableDensityToggle: false,
    enableFullScreenToggle: false,
    enableHiding: false,
    initialState: { density: 'xs', pagination: { pageIndex: 0, pageSize: 25 } },
    mantineTableProps: { striped: true, highlightOnHover: true },
    mantineTableBodyRowProps: ({ row }) => ({
      ...navigateRowProps(navigate, `/market-data/collection/streams/${row.original.streamId}`),
      style: { cursor: 'pointer' },
    }),
    renderEmptyRowsFallback: () => <Text c="dimmed" size="sm" p="md">No streams: add a rule to collect some.</Text>,
  });
  return <MantineReactTable table={table} />;
}
