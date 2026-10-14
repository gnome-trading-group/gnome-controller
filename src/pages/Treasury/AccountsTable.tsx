import { useMemo } from 'react';
import { ActionIcon, Badge, Group, Menu, Text, Tooltip } from '@mantine/core';
import {
  IconArrowsExchange, IconDots, IconKey, IconKeyOff, IconPlayerPause, IconPlayerPlay, IconReceipt, IconSettings, IconTrash,
} from '@tabler/icons-react';
import { MantineReactTable, MRT_ColumnDef, useMantineReactTable } from 'mantine-react-table';
import ReactTimeAgo from 'react-time-ago';
import { AccountStatus, AccountTreasury } from '../../types/treasury';
import { formatDuration, formatMoney } from '../../utils/format';
import { ACCOUNT_STATUS_COLORS, ACCOUNT_TRANSITIONS, RECON_COLORS } from '../../utils/treasury';
import { Money } from '../../components/trading/values';
import { AccountRow } from './types';

export type AccountAction =
  | { kind: 'status'; status: AccountStatus }
  | { kind: 'transfer' }
  | { kind: 'settings' }
  | { kind: 'snapshot' }
  | { kind: 'deleteSecrets' }
  | { kind: 'credentials' };

const RIGHT = { mantineTableHeadCellProps: { align: 'right' as const }, mantineTableBodyCellProps: { align: 'right' as const } };

// Kalshi's cash only backs orders on its own shard's markets, so where the venue splits it the split is shown too.
function cashTooltip(t: AccountTreasury): string {
  const available = `${formatMoney(t.cashAvailable, false).text} available for new orders`;
  if (!t.cashByPartition) return available;
  const shards = Object.entries(t.cashByPartition)
    .sort(([a], [b]) => Number(a) - Number(b))
    .map(([shard, cash]) => `shard ${shard}: ${formatMoney(cash, false).text}`)
    .join(', ');
  return `${available}. By shard: ${shards}`;
}

function money(header: string, field: 'cashTotal' | 'redeemable' | 'committed' | 'base' | 'allocated', hint: string): MRT_ColumnDef<AccountRow> {
  return {
    id: field, header, size: 105, ...RIGHT,
    Header: () => <Tooltip label={hint} multiline w={260} withArrow><span>{header}</span></Tooltip>,
    Cell: ({ row }) => <Money value={row.original.treasury?.[field]} pnl={false} size="sm" />,
  };
}

// Why Retire is greyed out; the registry also refuses while any order is open, which the account list doesn't count.
function retireBlocker(row: AccountRow): string | null {
  const { activeSessions, openPositions } = row.account;
  if (activeSessions > 0) return `${activeSessions} session${activeSessions === 1 ? '' : 's'} still run on it`;
  if (openPositions > 0) return `It still holds ${openPositions} position${openPositions === 1 ? '' : 's'}`;
  return null;
}

function ActionsMenu({ row, onAction }: { row: AccountRow; onAction: (row: AccountRow, action: AccountAction) => void }) {
  const next = ACCOUNT_TRANSITIONS[row.account.status];
  const retired = row.account.status === 'RETIRED';
  const blocker = retireBlocker(row);
  return (
    <Menu position="bottom-end" withinPortal>
      <Menu.Target>
        <ActionIcon variant="subtle" color="gray" onClick={(e) => e.stopPropagation()} aria-label="Account actions">
          <IconDots size={16} />
        </ActionIcon>
      </Menu.Target>
      <Menu.Dropdown onClick={(e) => e.stopPropagation()}>
        {next.includes('ACTIVE') && (
          <Menu.Item leftSection={<IconPlayerPlay size={14} />} color="teal" onClick={() => onAction(row, { kind: 'status', status: 'ACTIVE' })}>
            Activate
          </Menu.Item>
        )}
        {next.includes('DRAINING') && (
          <Menu.Item leftSection={<IconPlayerPause size={14} />} color="orange" onClick={() => onAction(row, { kind: 'status', status: 'DRAINING' })}>
            Drain
          </Menu.Item>
        )}
        {next.includes('RETIRED') && (
          <Tooltip label={blocker} disabled={!blocker} withArrow position="left">
            <div>
              <Menu.Item leftSection={<IconTrash size={14} />} color="red" disabled={!!blocker}
                onClick={() => onAction(row, { kind: 'status', status: 'RETIRED' })}>
                Retire
              </Menu.Item>
            </div>
          </Tooltip>
        )}
        {retired && (
          <Menu.Item leftSection={<IconKeyOff size={14} />} color="red" onClick={() => onAction(row, { kind: 'deleteSecrets' })}>
            Delete secrets
          </Menu.Item>
        )}
        {!retired && (
          <>
            {next.length > 0 && <Menu.Divider />}
            <Menu.Item leftSection={<IconArrowsExchange size={14} />} onClick={() => onAction(row, { kind: 'transfer' })}>
              Record transfer
            </Menu.Item>
            <Menu.Item leftSection={<IconReceipt size={14} />} onClick={() => onAction(row, { kind: 'snapshot' })}>
              Enter balance by hand
            </Menu.Item>
            <Menu.Item leftSection={<IconSettings size={14} />} onClick={() => onAction(row, { kind: 'settings' })}>
              Settings
            </Menu.Item>
            <Menu.Item leftSection={<IconKey size={14} />} onClick={() => onAction(row, { kind: 'credentials' })}>
              Update credentials
            </Menu.Item>
          </>
        )}
      </Menu.Dropdown>
    </Menu>
  );
}

interface AccountsTableProps {
  rows: AccountRow[];
  loading: boolean;
  selectedId: number | null;
  onSelect: (accountId: number) => void;
  onAction: (row: AccountRow, action: AccountAction) => void;
}

// One venue's accounts: what each holds, what is promised out of it, and whether it agrees with the ledger.
export function AccountsTable({ rows, loading, selectedId, onSelect, onAction }: AccountsTableProps) {
  const columns = useMemo<MRT_ColumnDef<AccountRow>[]>(() => [
    {
      id: 'label', header: 'Account', size: 170,
      Cell: ({ row }) => (
        <Tooltip label={`${row.original.account.activeSessions} active session(s), ${row.original.account.openPositions} open position(s)`} withArrow openDelay={300}>
          <Text span size="sm" fw={600} ff="monospace">{row.original.account.label}</Text>
        </Tooltip>
      ),
    },
    {
      id: 'status', header: 'Status', size: 110,
      Cell: ({ row }) => (
        <Badge size="sm" variant="light" color={ACCOUNT_STATUS_COLORS[row.original.account.status]}>{row.original.account.status}</Badge>
      ),
    },
    {
      id: 'age', header: 'Age', size: 80,
      Cell: ({ row }) => {
        const { activatedAt, createdAt } = row.original.account;
        const since = activatedAt ?? createdAt;
        return (
          <Tooltip label={activatedAt ? 'Since it was activated' : 'Since it was registered (never activated)'} withArrow openDelay={300}>
            <Text span size="sm">{formatDuration(Date.now() - Date.parse(since)).split(' ')[0]}</Text>
          </Tooltip>
        );
      },
    },
    {
      id: 'cash', header: 'Cash', size: 105, ...RIGHT,
      Header: () => <Tooltip label="All the account's cash, including what resting orders hold" withArrow><span>Cash</span></Tooltip>,
      Cell: ({ row }) => {
        const t = row.original.treasury;
        return (
          <Tooltip label={t ? cashTooltip(t) : 'No balance read yet'} multiline w={260} withArrow openDelay={300}>
            <span><Money value={t?.cashTotal} pnl={false} size="sm" /></span>
          </Tooltip>
        );
      },
    },
    money('Redeemable', 'redeemable', 'Resolved Polymarket positions waiting to be redeemed, at their payout'),
    money('Committed', 'committed', 'What positions and working orders tie up now'),
    money('Equity at cost', 'base', 'Cash, redeemable payouts and positions at what they cost: the money behind the allocations'),
    money('Allocated', 'allocated', "Each active live session's committed-capital budget on this account, plus positions no session holds"),
    {
      id: 'free', header: 'Free', size: 105, ...RIGHT,
      Header: () => (
        <Tooltip label="Equity at cost less the minimum buffer and what is allocated; a launch that would take it below zero is refused" multiline w={260} withArrow>
          <span>Free</span>
        </Tooltip>
      ),
      Cell: ({ row }) => {
        const free = row.original.treasury?.free;
        return <Money value={free} pnl={false} size="sm" c={free !== undefined && BigInt(free) < 0n ? 'red' : undefined} fw={600} />;
      },
    },
    {
      id: 'recon', header: 'Recon', size: 150,
      Cell: ({ row }) => {
        const recon = row.original.treasury?.recon;
        if (!recon) return <Text span size="sm" c="dimmed">never run</Text>;
        const unread = row.original.treasury?.lastReadingError;
        return (
          <Tooltip
            withArrow multiline w={280} openDelay={300}
            label={recon.cashStatus === 'ERROR' && unread ? <>Can&apos;t read the venue: {unread}</> : <>Expected {formatMoney(recon.expectedCash, false).text}, venue {formatMoney(recon.venueCash, false).text};{' '}
              {recon.positionsChecked} positions checked, {recon.positionBreaks} break{recon.positionBreaks === 1 ? '' : 's'};{' '}
              ran <ReactTimeAgo date={new Date(recon.ranAt)} timeStyle="round" /></>}
          >
            <Group gap={6} wrap="nowrap">
              <Badge size="sm" variant="light" color={RECON_COLORS[recon.cashStatus]}>{recon.cashStatus}</Badge>
              {recon.cashDiff !== null && recon.cashStatus !== 'OK' && <Money value={recon.cashDiff} pnl={false} size="xs" />}
              {recon.positionBreaks > 0 && <Badge size="sm" variant="light" color="red">{recon.positionBreaks} pos</Badge>}
            </Group>
          </Tooltip>
        );
      },
    },
    {
      id: 'snapshot', header: 'Balance read', size: 120,
      Cell: ({ row }) => {
        const t = row.original.treasury;
        if (t?.lastReadingError) {
          return (
            <Tooltip withArrow multiline w={280} openDelay={300}
              label={<>The latest reading failed: {t.lastReadingError}.{' '}
                {t.snapshotAt ? <>Last good one <ReactTimeAgo date={new Date(t.snapshotAt)} timeStyle="round" />.</> : 'It has never been read.'}</>}>
              <Badge size="sm" variant="light" color="red">failing</Badge>
            </Tooltip>
          );
        }
        if (!t?.snapshotAt) return <Text span size="sm" c={row.original.account.status === 'RETIRED' ? 'dimmed' : 'orange'}>never</Text>;
        return (
          <Tooltip label={t.snapshotFresh ? 'Fresh' : 'Stale: check the venue poller, or enter the balance by hand'} withArrow openDelay={300}>
            <Text span size="sm" c={t.snapshotFresh ? undefined : 'orange'}>
              <ReactTimeAgo date={new Date(t.snapshotAt)} timeStyle="round" />
            </Text>
          </Tooltip>
        );
      },
    },
  ], []);

  const table = useMantineReactTable({
    columns,
    data: rows,
    state: { isLoading: loading },
    getRowId: (row) => String(row.account.accountId),
    enableTopToolbar: false,
    enableBottomToolbar: false,
    enableColumnActions: false,
    enableColumnFilters: false,
    enableSorting: false,
    enablePagination: false,
    enableRowActions: true,
    positionActionsColumn: 'last',
    renderRowActions: ({ row }) => <ActionsMenu row={row.original} onAction={onAction} />,
    initialState: { density: 'xs' },
    mantineTableProps: { striped: true, highlightOnHover: true, withColumnBorders: true },
    mantineTableBodyRowProps: ({ row }) => ({
      onClick: () => onSelect(row.original.account.accountId),
      style: {
        cursor: 'pointer',
        outline: row.original.account.accountId === selectedId ? '2px solid var(--mantine-color-blue-5)' : undefined,
        outlineOffset: -2,
      },
    }),
    renderEmptyRowsFallback: () => <Text c="dimmed" size="sm" p="md">No accounts.</Text>,
  });
  return <MantineReactTable table={table} />;
}
