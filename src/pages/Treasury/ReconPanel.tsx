import { useMemo } from 'react';
import { Alert, Anchor, Badge, Group, Tabs, Text } from '@mantine/core';
import { MantineReactTable, MRT_ColumnDef, useMantineReactTable } from 'mantine-react-table';
import { Link } from 'react-router-dom';
import { PositionCheck, ReconRun } from '../../types/treasury';
import { useRecon } from '../../query/hooks';
import { RECON_COLORS } from '../../utils/treasury';
import { Money, Qty, Time } from '../../components/trading/values';

const RIGHT = { mantineTableHeadCellProps: { align: 'right' as const }, mantineTableBodyCellProps: { align: 'right' as const } };

const TABLE_DEFAULTS = {
  enableTopToolbar: false,
  enableColumnActions: false,
  enableColumnFilters: false,
  enableSorting: false,
  initialState: { density: 'xs' as const, pagination: { pageIndex: 0, pageSize: 15 } },
  mantineTableProps: { striped: true, highlightOnHover: true, withColumnBorders: true },
};

function PositionChecks({ rows, loading }: { rows: PositionCheck[]; loading: boolean }) {
  const columns = useMemo<MRT_ColumnDef<PositionCheck>[]>(() => [
    { id: 'key', header: 'Venue market', size: 220, Cell: ({ row }) => <Text span size="sm" ff="monospace">{row.original.venueKey}</Text> },
    {
      id: 'listings', header: 'Listings', size: 120,
      Cell: ({ row }) => (row.original.listingIds.length === 0 ? <Text span size="sm" c="dimmed">unknown</Text> : (
        <Group gap={6}>
          {row.original.listingIds.map((id) => (
            <Anchor key={id} component={Link} to={`/security-master/listings/${id}`} size="sm">{id}</Anchor>
          ))}
        </Group>
      )),
    },
    { id: 'venue', header: 'Venue', size: 90, ...RIGHT, Cell: ({ row }) => <Qty value={row.original.venueQty} lotSize={null} signed size="sm" /> },
    { id: 'ledger', header: 'Ledger', size: 90, ...RIGHT, Cell: ({ row }) => <Qty value={row.original.ledgerQty} lotSize={null} signed size="sm" /> },
    {
      id: 'status', header: 'Status', size: 130,
      Cell: ({ row }) => <Badge size="sm" variant="light" color={RECON_COLORS[row.original.status]}>{row.original.status.replace(/_/g, ' ')}</Badge>,
    },
    { id: 'seen', header: 'Times seen', size: 90, ...RIGHT, Cell: ({ row }) => row.original.consecutiveMismatches || '—' },
    { id: 'since', header: 'Differs since', size: 150, Cell: ({ row }) => <Time value={row.original.firstMismatchAt} size="sm" /> },
    { id: 'checked', header: 'Checked', size: 150, Cell: ({ row }) => <Time value={row.original.checkedAt} size="sm" /> },
  ], []);
  const table = useMantineReactTable({
    ...TABLE_DEFAULTS,
    columns,
    data: rows,
    state: { isLoading: loading },
    renderEmptyRowsFallback: () => <Text c="dimmed" size="sm" p="md">No positions have been compared yet.</Text>,
  });
  return <MantineReactTable table={table} />;
}

function ReconRuns({ rows, loading }: { rows: ReconRun[]; loading: boolean }) {
  const columns = useMemo<MRT_ColumnDef<ReconRun>[]>(() => [
    { id: 'ran', header: 'Ran', size: 160, Cell: ({ row }) => <Time value={row.original.ranAt} size="sm" /> },
    {
      id: 'status', header: 'Cash', size: 90,
      Cell: ({ row }) => <Badge size="sm" variant="light" color={RECON_COLORS[row.original.cashStatus]}>{row.original.cashStatus}</Badge>,
    },
    { id: 'expected', header: 'Expected', size: 110, ...RIGHT, Cell: ({ row }) => <Money value={row.original.expectedCash} pnl={false} size="sm" /> },
    { id: 'venue', header: 'Venue', size: 110, ...RIGHT, Cell: ({ row }) => <Money value={row.original.venueCash} pnl={false} size="sm" /> },
    {
      id: 'diff', header: 'Difference', size: 110, ...RIGHT,
      Cell: ({ row }) => <Money value={row.original.cashDiff} size="sm"
        c={row.original.cashStatus === 'BREAK' ? 'red' : row.original.cashStatus === 'OK' ? undefined : 'orange'} />,
    },
    { id: 'checked', header: 'Positions', size: 90, ...RIGHT, Cell: ({ row }) => row.original.positionsChecked },
    {
      id: 'breaks', header: 'Breaks', size: 80, ...RIGHT,
      Cell: ({ row }) => <Text span size="sm" c={row.original.positionBreaks > 0 ? 'red' : undefined}>{row.original.positionBreaks}</Text>,
    },
  ], []);
  const table = useMantineReactTable({
    ...TABLE_DEFAULTS,
    columns,
    data: rows,
    state: { isLoading: loading },
    renderEmptyRowsFallback: () => <Text c="dimmed" size="sm" p="md">Never reconciled: it needs a snapshot and an opening balance.</Text>,
  });
  return <MantineReactTable table={table} />;
}

// One account against the ledger: each position the venue or the ledger holds, then the latest reconciliation runs.
export function ReconPanel({ accountId, readingError }: { accountId: number; readingError: string | null }) {
  const recon = useRecon(accountId);
  const positions = recon.data?.positions ?? [];
  const breaks = positions.filter((p) => p.status === 'BREAK' || p.status === 'UNKNOWN_VENUE_POSITION').length;
  return (
    <Tabs defaultValue="positions" keepMounted={false}>
      <Tabs.List mb="sm">
        <Tabs.Tab value="positions" rightSection={breaks > 0 && <Badge size="xs" color="red" circle>{breaks}</Badge>}>
          Positions vs venue
        </Tabs.Tab>
        <Tabs.Tab value="runs">Recent runs</Tabs.Tab>
      </Tabs.List>
      {recon.error && <Text c="red" size="sm" mb="xs">{recon.error.message}</Text>}
      {readingError && (
        <Alert color="red" variant="light" mb="sm" title="The venue poller can't read this account">
          {readingError}. Until it can, reconciliation has nothing to compare; fix the credentials with Update credentials
          in the account&apos;s menu, or enter the balance by hand.
        </Alert>
      )}
      <Tabs.Panel value="positions"><PositionChecks rows={positions} loading={recon.isLoading} /></Tabs.Panel>
      <Tabs.Panel value="runs"><ReconRuns rows={recon.data?.runs ?? []} loading={recon.isLoading} /></Tabs.Panel>
    </Tabs>
  );
}
