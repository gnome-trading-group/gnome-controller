import { useMemo, useState } from 'react';
import {
  ActionIcon, Anchor, Badge, Button, Card, Group, SegmentedControl, Skeleton, Stack, Table, Text, TextInput, Tooltip,
} from '@mantine/core';
import { IconChevronDown, IconChevronRight, IconRefresh, IconSearch } from '@tabler/icons-react';
import { SkeletonRows } from '../SkeletonRows';
import { Link, useSearchParams } from 'react-router-dom';
import { GroupPositions as Groups, HeldPosition, Mode, RiskGroup } from '../../types';
import { formatQty } from '../../utils/format';
import { capital, exposure } from '../../utils/exposure';
import { groupStatus, GroupStatus, lockedReturn } from '../../utils/groups';
import { GroupScope } from '../../utils/api';
import { useGroupHistory, useStrategies } from '../../query/hooks';
import { useGlobalState } from '../../context/GlobalStateContext';
import { Money, Price, Qty, Time } from './values';

// In the order they're shown: a resolved group still holding contracts is waiting on the settlement sweeper, which is
// worth noticing before anything else. Exited and settled groups are history, loaded a page at a time.
const ACTIVE: GroupStatus[] = ['awaiting', 'open'];
const HISTORY: GroupStatus[] = ['exited', 'settled'];
type Filter = 'all' | 'awaiting' | 'open' | 'history';
const FILTERS: Filter[] = ['awaiting', 'open', 'history'];

const STATUS_LABELS: Record<GroupStatus, string> = {
  awaiting: 'Awaiting settlement',
  open: 'Open',
  exited: 'Exited',
  settled: 'Settled',
};

// What each relationship flag means for how the group's contracts settle.
const FLAG_NOTES: Record<string, string> = {
  VOID_RULES_DIFFER: 'Venues pay differently when the market is voided (cancelled, walkover, postponed)',
  RESOLUTION_SOURCE_DIFFERS: 'Venues resolve from different sources, which can disagree',
  RESOLUTION_SOURCE_UNKNOWN: "A venue doesn't say what it resolves from",
  DEADLINE_DIFFERS: 'Venues have different deadlines',
  DEADLINE_TIMEZONE_DIFFERS: 'Venues state their deadlines in different time zones',
  OBSERVATION_TIME_DIFFERS: 'Venues observe the result at different times',
  VOTE_SCOPE_ASSUMED: 'Which vote counts was assumed',
};

export type Basis = 'lifetime' | 'session' | 'firm';

function positionHref(strategyId: number, mode: Mode, listingId: number) {
  return `/strategies/${strategyId}/listings/${listingId}?mode=${mode}`;
}

function abs(value: bigint) {
  return value < 0n ? -value : value;
}

function HeldCells({ held }: { held: HeldPosition }) {
  const price = { exchangeId: held.exchangeId, tickSize: held.tickSize, derived: true, size: 'sm' as const };
  const money = exposure(held.netQuantity, held.avgEntryPrice, held.markPrice);
  const dash = <Text span size="sm" c="dimmed">—</Text>;
  return (
    <>
      <Table.Td ta="right"><Qty value={held.netQuantity} lotSize={held.lotSize} signed size="sm" /></Table.Td>
      <Table.Td ta="right"><Price value={held.avgEntryPrice} {...price} /></Table.Td>
      <Table.Td ta="right"><Price value={held.markPrice} {...price} /></Table.Td>
      <Table.Td ta="right">{money ? <Money value={money.cost} pnl={false} size="sm" /> : dash}</Table.Td>
      <Table.Td ta="right">{money?.notional != null ? <Money value={money.notional} pnl={false} size="sm" /> : dash}</Table.Td>
      <Table.Td ta="right"><Money value={held.unrealized} size="sm" /></Table.Td>
    </>
  );
}

function matches(query: string, ...texts: (string | null | undefined)[]) {
  return texts.some(t => t?.toLowerCase().includes(query));
}

function groupMatches(group: RiskGroup, query: string) {
  return matches(query, group.title) || group.legs.some(l => matches(query, l.outcome, l.eventTitle, l.held.symbol));
}

function GroupsSkeleton() {
  return (
    <Card withBorder p="sm">
      <Group justify="space-between" mb="xs" wrap="nowrap">
        <Skeleton h={16} w="45%" />
        <Skeleton h={12} w={110} />
      </Group>
      <Table withRowBorders={false} verticalSpacing={4} fz="sm">
        <Table.Tbody><SkeletonRows cols={5} rows={2} /></Table.Tbody>
      </Table>
    </Card>
  );
}

function useNames() {
  const { exchanges } = useGlobalState();
  const strategies = useStrategies();
  return {
    venue: (exchangeId: number | null) => exchanges.find(e => e.exchangeId === exchangeId)?.exchangeName ?? (exchangeId === null ? '—' : `#${exchangeId}`),
    strategy: (strategyId: number) => strategies.data?.find(s => s.strategyId === strategyId)?.name ?? `#${strategyId}`,
  };
}

function capitalOf(group: RiskGroup) {
  return group.legs.reduce((sum, l) => sum + (capital(l.held.netQuantity, l.held.avgEntryPrice, '0', true) ?? 0n), 0n);
}

function GroupHeader({ group, basis }: { group: RiskGroup; basis: Basis }) {
  const names = useNames();
  return (
    <Group justify="space-between" mb="xs" wrap="nowrap" align="flex-start">
      <Stack gap={4}>
        <Text fw={600} lineClamp={2}>{group.title}</Text>
        <Group gap={4} wrap="wrap">
          {group.exchangeIds.map(id => <Badge key={id} size="xs" variant="light" color="gray">{names.venue(id)}</Badge>)}
          {basis === 'firm' && (group.strategyIds ?? []).map(id => (
            <Badge key={`s${id}`} size="xs" variant="light" component={Link} to={`/strategies/${id}`} style={{ cursor: 'pointer' }}>
              {names.strategy(id)}
            </Badge>
          ))}
          {group.flags.map(flag => (
            <Tooltip key={flag} label={FLAG_NOTES[flag] ?? flag} withArrow>
              <Badge size="xs" variant="outline" color="orange">{flag.replace(/_/g, ' ').toLowerCase()}</Badge>
            </Tooltip>
          ))}
        </Group>
      </Stack>
      <Group gap="xs" wrap="nowrap">
        {group.resolved && <Badge color="gray" variant="light">resolved</Badge>}
        {group.expiry && !group.resolved && <Text size="xs" c="dimmed">closes <Time value={group.expiry} precision="minute" size="xs" /></Text>}
      </Group>
    </Group>
  );
}

function LegsTable({ group, mode, basis }: { group: RiskGroup; mode: Mode; basis: Basis }) {
  const names = useNames();
  return (
    <Table withRowBorders={false} verticalSpacing={4} fz="sm">
      <Table.Thead>
        <Table.Tr>
          <Table.Th>Contract</Table.Th>
          <Table.Th>Venue</Table.Th>
          {basis === 'firm' && <Table.Th>Strategy</Table.Th>}
          <Table.Th ta="right">Position</Table.Th>
          <Table.Th ta="right">Avg entry</Table.Th>
          <Table.Th ta="right">Mark</Table.Th>
          <Table.Th ta="right">Cost</Table.Th>
          <Table.Th ta="right">Notional</Table.Th>
          <Table.Th ta="right">Unrealized</Table.Th>
        </Table.Tr>
      </Table.Thead>
      <Table.Tbody>
        {group.legs.map(l => (
          <Table.Tr key={`${l.strategyId}/${l.held.listingId}`}>
            <Table.Td>
              <Tooltip label={l.eventTitle} withArrow disabled={l.eventTitle === l.outcome}>
                <Anchor component={Link} to={positionHref(l.strategyId, mode, l.held.listingId)} size="sm">{l.outcome}</Anchor>
              </Tooltip>
            </Table.Td>
            <Table.Td><Text size="sm" c="dimmed">{names.venue(l.held.exchangeId)}</Text></Table.Td>
            {basis === 'firm' && <Table.Td><Text size="sm">{names.strategy(l.strategyId)}</Text></Table.Td>}
            <HeldCells held={l.held} />
          </Table.Tr>
        ))}
      </Table.Tbody>
    </Table>
  );
}

function Stat({ label, tip, children }: { label: string; tip: string; children: React.ReactNode }) {
  return (
    <Tooltip label={tip} withArrow multiline w={280}>
      <Stack gap={0}>
        <Text size="xs" c="dimmed">{label}</Text>
        {children}
      </Stack>
    </Tooltip>
  );
}

function OpenGroup({ group, mode, basis }: { group: RiskGroup; mode: Mode; basis: Basis }) {
  const worst = group.worst === null ? null : BigInt(group.worst);
  const committed = capitalOf(group);
  const ret = lockedReturn(group, committed, new Date());
  const pnlLabel = basis === 'session' ? 'Session PnL' : 'Lifetime PnL';
  return (
    <Stack gap="xs">
      <LegsTable group={group} mode={mode} basis={basis} />
      <Group gap="xl" wrap="wrap" style={{ paddingLeft: 9 }}>
        <Stat label="Now" tip={`${pnlLabel} on these contracts at current marks`}>
          <Money value={group.current} size="sm" fw={600} />
        </Stat>
        <Stat label="Locked" tip="The worst outcome world: what the group makes however it settles, if every venue settles it alike">
          {group.locked === null ? <Text size="sm" c="dimmed">—</Text> : <Money value={group.locked} size="sm" fw={600} />}
        </Stat>
        <Stat label="Worst case" tip="The lower of locked and the void scenario">
          {group.worst === null ? <Text size="sm" c="dimmed">—</Text> : <Money value={group.worst} size="sm" fw={600} />}
        </Stat>
        <Stat label="Unhedged" tip="How far the contracts paying out differ between worlds: 0 means every world pays the same">
          <Text size="sm" fw={600}>{group.gap === null ? '—' : formatQty(abs(BigInt(group.gap)))}</Text>
        </Stat>
        <Stat label="Capital" tip="What the positions tie up: a long its cost, a short the rest of the dollar">
          <Money value={committed} pnl={false} size="sm" fw={600} />
        </Stat>
        {ret && (
          <Stat label="Locked return" tip="Locked PnL over capital, and per year to the group's close">
            <Text size="sm" fw={600}>
              {(ret.simple * 100).toFixed(1)}%{ret.annualized !== null ? ` · ${(ret.annualized * 100).toFixed(0)}%/yr` : ''}
            </Text>
          </Stat>
        )}
      </Group>
      {group.tooLarge ? (
        <Text size="xs" c="dimmed">Too many related contracts to list every way they can settle.</Text>
      ) : (
        <Table withRowBorders={false} verticalSpacing={2} fz="sm">
          <Table.Thead>
            <Table.Tr>
              <Table.Th>If it settles as</Table.Th>
              <Table.Th ta="right">Net paying</Table.Th>
              <Table.Th ta="right">{pnlLabel}</Table.Th>
              <Table.Th ta="right">vs now</Table.Th>
            </Table.Tr>
          </Table.Thead>
          <Table.Tbody>
            {group.worlds.map(w => {
              const isWorst = worst !== null && BigInt(w.pnl) === worst && group.worlds.length > 1;
              return (
                <Table.Tr key={w.label} style={isWorst ? { boxShadow: 'inset 3px 0 0 var(--mantine-color-red-6)' } : undefined}>
                  <Table.Td><Text size="sm" lineClamp={2}>{w.label}</Text></Table.Td>
                  <Table.Td ta="right"><Qty value={w.paying} lotSize={null} signed size="sm" /></Table.Td>
                  <Table.Td ta="right"><Money value={w.pnl} size="sm" fw={600} /></Table.Td>
                  <Table.Td ta="right"><Money value={w.change} size="sm" /></Table.Td>
                </Table.Tr>
              );
            })}
            {group.void && (
              <Table.Tr style={worst !== null && BigInt(group.void.pnl) === worst ? { boxShadow: 'inset 3px 0 0 var(--mantine-color-red-6)' } : undefined}>
                <Table.Td>
                  <Tooltip label="Every venue pays its void rule: Polymarket Intl 50/50; Kalshi and Polymarket US the last fair price (the current mark stands in)" withArrow multiline w={300}>
                    <Text size="sm" fs="italic">Voided</Text>
                  </Tooltip>
                </Table.Td>
                <Table.Td ta="right"><Text size="sm" c="dimmed">—</Text></Table.Td>
                <Table.Td ta="right"><Money value={group.void.pnl} size="sm" fw={600} /></Table.Td>
                <Table.Td ta="right"><Money value={group.void.change} size="sm" /></Table.Td>
              </Table.Tr>
            )}
          </Table.Tbody>
        </Table>
      )}
    </Stack>
  );
}

function SettledGroup({ group, mode, basis }: { group: RiskGroup; mode: Mode; basis: Basis }) {
  const names = useNames();
  return (
    <Table withRowBorders={false} verticalSpacing={4} fz="sm">
      <Table.Thead>
        <Table.Tr>
          <Table.Th>Contract</Table.Th>
          <Table.Th>Venue</Table.Th>
          {basis === 'firm' && <Table.Th>Strategy</Table.Th>}
          <Table.Th ta="right">{basis === 'session' ? 'Session PnL' : 'Lifetime PnL'}</Table.Th>
        </Table.Tr>
      </Table.Thead>
      <Table.Tbody>
        {group.legs.map(l => (
          <Table.Tr key={`${l.strategyId}/${l.held.listingId}`}>
            <Table.Td>
              <Anchor component={Link} to={positionHref(l.strategyId, mode, l.held.listingId)} size="sm">{l.outcome}</Anchor>
            </Table.Td>
            <Table.Td><Text size="sm" c="dimmed">{names.venue(l.held.exchangeId)}</Text></Table.Td>
            {basis === 'firm' && <Table.Td><Text size="sm">{names.strategy(l.strategyId)}</Text></Table.Td>}
            <Table.Td ta="right"><Money value={l.held.total} size="sm" /></Table.Td>
          </Table.Tr>
        ))}
      </Table.Tbody>
    </Table>
  );
}

function GroupCard({ group, mode, basis }: { group: RiskGroup; mode: Mode; basis: Basis }) {
  return (
    <Card withBorder p="sm">
      <GroupHeader group={group} basis={basis} />
      <OpenGroup group={group} mode={mode} basis={basis} />
    </Card>
  );
}

// Settled groups only have a final PnL left to show, so they're one row each; a row expands to its contracts.
function SettledTable({ groups, mode, basis }: { groups: RiskGroup[]; mode: Mode; basis: Basis }) {
  const [expanded, setExpanded] = useState<Set<number>>(new Set());
  const toggle = (key: number) => setExpanded(current => {
    const next = new Set(current);
    if (!next.delete(key)) next.add(key);
    return next;
  });
  return (
    <Card withBorder p={0}>
      <Table verticalSpacing={4} fz="sm" highlightOnHover>
        <Table.Thead>
          <Table.Tr>
            <Table.Th w={32} />
            <Table.Th>Group</Table.Th>
            <Table.Th>Resolved</Table.Th>
            <Table.Th>Contracts</Table.Th>
            <Table.Th ta="right">Realized</Table.Th>
          </Table.Tr>
        </Table.Thead>
        <Table.Tbody>
          {groups.map(group => {
            const open = expanded.has(group.key);
            const at = group.resolvedAt ?? group.expiry;
            return [
              <Table.Tr key={group.key} style={{ cursor: 'pointer' }} onClick={() => toggle(group.key)}>
                <Table.Td>
                  <ActionIcon variant="subtle" color="gray" size="sm" aria-label={open ? 'Collapse' : 'Expand'}>
                    {open ? <IconChevronDown size={14} /> : <IconChevronRight size={14} />}
                  </ActionIcon>
                </Table.Td>
                <Table.Td><Text size="sm" lineClamp={1}>{group.title}</Text></Table.Td>
                <Table.Td style={{ whiteSpace: 'nowrap' }}>
                  {at ? <Time value={at} precision="minute" size="sm" /> : <Text span size="sm" c="dimmed">—</Text>}
                </Table.Td>
                <Table.Td><Text size="sm">{group.legs.length}</Text></Table.Td>
                <Table.Td ta="right"><Money value={group.current} size="sm" /></Table.Td>
              </Table.Tr>,
              open && (
                <Table.Tr key={`${group.key}/detail`}>
                  <Table.Td />
                  <Table.Td colSpan={4}><SettledGroup group={group} mode={mode} basis={basis} /></Table.Td>
                </Table.Tr>
              ),
            ];
          })}
        </Table.Tbody>
      </Table>
    </Card>
  );
}

function OtherCard({ rows, mode, basis }: { rows: Groups['other']; mode: Mode; basis: Basis }) {
  const names = useNames();
  return (
    <Card withBorder p="sm">
      <Text fw={600} mb="xs">Not an event contract</Text>
      <Table withRowBorders={false} verticalSpacing={4} fz="sm">
        <Table.Thead>
          <Table.Tr>
            <Table.Th>Listing</Table.Th>
            {basis === 'firm' && <Table.Th>Strategy</Table.Th>}
            <Table.Th ta="right">Position</Table.Th>
            <Table.Th ta="right">Avg entry</Table.Th>
            <Table.Th ta="right">Mark</Table.Th>
            <Table.Th ta="right">Cost</Table.Th>
            <Table.Th ta="right">Notional</Table.Th>
            <Table.Th ta="right">Unrealized</Table.Th>
            <Table.Th ta="right">{basis === 'session' ? 'Session PnL' : 'Lifetime PnL'}</Table.Th>
          </Table.Tr>
        </Table.Thead>
        <Table.Tbody>
          {rows.map(p => (
            <Table.Tr key={`${p.strategyId}/${p.listingId}`}>
              <Table.Td>
                <Anchor component={Link} to={positionHref(p.strategyId, mode, p.listingId)} size="sm">{p.symbol ?? p.listingId}</Anchor>
              </Table.Td>
              {basis === 'firm' && <Table.Td><Text size="sm">{names.strategy(p.strategyId)}</Text></Table.Td>}
              <HeldCells held={p} />
              <Table.Td ta="right"><Money value={p.total} size="sm" /></Table.Td>
            </Table.Tr>
          ))}
        </Table.Tbody>
      </Table>
    </Card>
  );
}

function StatusSection({ status, groups, mode, basis }: { status: GroupStatus; groups: RiskGroup[]; mode: Mode; basis: Basis }) {
  return (
    <Stack gap="xs">
      <Group gap="xs">
        <Text fw={600} size="sm">{STATUS_LABELS[status]} ({groups.length})</Text>
        {status === 'settled' && (
          <Text size="sm" c="dimmed" component="div">
            Realized <Money value={groups.reduce((sum, g) => sum + BigInt(g.current), 0n).toString()} size="sm" />
          </Text>
        )}
      </Group>
      {status === 'settled'
        ? <SettledTable groups={groups} mode={mode} basis={basis} />
        : groups.map(group => <GroupCard key={group.key} group={group} mode={mode} basis={basis} />)}
    </Stack>
  );
}

function byStatus(groups: RiskGroup[], statuses: GroupStatus[]) {
  const out = Object.fromEntries(statuses.map(s => [s, [] as RiskGroup[]])) as Record<GroupStatus, RiskGroup[]>;
  for (const group of groups) out[groupStatus(group)]?.push(group);
  return out;
}

// Prediction-market positions grouped by what offsets what, with every way each group can settle.
// basis: the strategy's lifetime PnL, one session's PnL (from $0 at its start), or every strategy's (firm).
export function GroupPositions({ data, scope, mode, loading, basis }: {
  data: Groups | undefined; scope: GroupScope; mode: Mode; loading: boolean; basis: Basis;
}) {
  const [params, setParams] = useSearchParams();
  const filter: Filter = FILTERS.includes(params.get('status') as Filter) ? params.get('status') as Filter : 'all';
  const search = params.get('q') ?? '';
  const setParam = (key: string, value: string | null) => setParams(current => {
    const updated = new URLSearchParams(current);
    if (value) updated.set(key, value);
    else updated.delete(key);
    return updated;
  }, { replace: true });
  const [historyOpen, setHistoryOpen] = useState(false);
  const firm = basis === 'firm';
  const showHistory = !firm && (filter === 'history' || (filter === 'all' && historyOpen));
  const history = useGroupHistory(scope, showHistory);

  const grouped = useMemo(() => byStatus(data?.groups ?? [], ACTIVE), [data]);
  const past = useMemo(() => byStatus(history.data?.groups ?? [], HISTORY), [history.data]);

  // Across every open group, not just those shown, so it doesn't move with the search. Groups are independent by
  // construction, so their worst cases add.
  const summary = useMemo(() => {
    let unrealized = 0n;
    let worst = 0n;
    let locked = 0n;
    let committed = 0n;
    for (const group of [...grouped.awaiting, ...grouped.open]) {
      for (const l of group.legs) unrealized += BigInt(l.held.unrealized);
      if (group.worst !== null) worst += BigInt(group.worst);
      if (group.locked !== null) locked += BigInt(group.locked);
      committed += capitalOf(group);
    }
    for (const p of data?.other ?? []) if (p.netQuantity !== '0') unrealized += BigInt(p.unrealized);
    return { unrealized, worst, locked, committed };
  }, [grouped, data]);

  if (loading && !data) return <GroupsSkeleton />;
  const counts = data?.counts ?? { active: 0, flatContracts: 0, flatOther: 0 };
  const hasHistory = !firm && (counts.flatContracts > 0 || counts.flatOther > 0);
  if (!data || (data.groups.length === 0 && data.other.length === 0 && !hasHistory)) {
    return <Text size="sm" c="dimmed">No positions in this mode.</Text>;
  }

  const query = search.trim().toLowerCase();
  const found = (groups: RiskGroup[]) => groups.filter(g => !query || groupMatches(g, query));
  const otherFound = (rows: Groups['other']) => rows.filter(p => !query || matches(query, p.symbol, String(p.listingId)));
  const sections = ACTIVE
    .filter(status => filter === 'all' || filter === status)
    .map(status => ({ status, groups: found(grouped[status]) }))
    .filter(s => s.groups.length > 0);
  const other = filter === 'all' || filter === 'open' ? otherFound(data.other) : [];
  const pastSections = HISTORY.map(status => ({ status, groups: found(past[status]) })).filter(s => s.groups.length > 0);
  const pastOther = otherFound(history.data?.other ?? []);
  const loaded = history.data?.groups.length ?? 0;
  const historyEmpty = !history.isLoading && pastSections.length === 0 && pastOther.length === 0;

  return (
    <Stack gap="md">
      <Group justify="space-between" wrap="wrap" gap="xs">
        <Group gap="xs" wrap="wrap">
          <SegmentedControl
            size="xs"
            value={filter}
            onChange={v => setParam('status', v === 'all' ? null : v)}
            data={[
              { value: 'all', label: 'All' },
              ...ACTIVE.map(s => ({ value: s, label: `${STATUS_LABELS[s]} (${grouped[s].length})` })),
              ...(firm ? [] : [{ value: 'history', label: `Exited & settled (${counts.flatContracts} contracts)` }]),
            ]}
          />
          <TextInput
            size="xs"
            w={240}
            placeholder="Search groups, contracts, symbols"
            leftSection={<IconSearch size={14} />}
            value={search}
            onChange={e => setParam('q', e.currentTarget.value)}
          />
        </Group>
        <Group gap="md" wrap="nowrap">
          <Text size="sm" component="div">Capital <Money value={summary.committed} pnl={false} size="sm" fw={600} /></Text>
          <Text size="sm" component="div">Unrealized <Money value={summary.unrealized.toString()} size="sm" fw={600} /></Text>
          <Text size="sm" component="div">Locked <Money value={summary.locked.toString()} size="sm" fw={600} /></Text>
          <Text size="sm" component="div">Worst case <Money value={summary.worst.toString()} size="sm" fw={600} /></Text>
        </Group>
      </Group>
      {filter !== 'history' && sections.length === 0 && other.length === 0 && (
        <Text size="sm" c="dimmed">{query ? 'No groups match.' : 'Nothing held.'}</Text>
      )}
      {sections.map(({ status, groups }) => (
        <StatusSection key={status} status={status} groups={groups} mode={mode} basis={basis} />
      ))}
      {other.length > 0 && <OtherCard rows={other} mode={mode} basis={basis} />}
      <Text size="xs" c="dimmed">
        A group is the contracts its relationships, binary complements and multi-outcome events tie together, across
        venues{firm ? ' and strategies' : ''}. Each row is one way they can settle together, at $1 or $0 a contract.
        Listings that aren't event contracts (a perp hedge) pay the same in every row and aren't in it.
      </Text>

      {filter === 'all' && hasHistory && (
        <Group gap="xs">
          <ActionIcon variant="subtle" color="gray" size="sm" onClick={() => setHistoryOpen(open => !open)}
            aria-label={historyOpen ? 'Hide exited and settled' : 'Show exited and settled'}>
            {historyOpen ? <IconChevronDown size={14} /> : <IconChevronRight size={14} />}
          </ActionIcon>
          <Text fw={600} size="sm" style={{ cursor: 'pointer' }} onClick={() => setHistoryOpen(open => !open)}>
            Exited & settled ({counts.flatContracts} contracts)
          </Text>
        </Group>
      )}
      {showHistory && (
        <Stack gap="md">
          <Group gap="xs">
            <Text size="xs" c="dimmed">
              {loaded} exited or settled groups loaded, most recently resolved first
              {history.hasNextPage && query ? '; search covers only those' : ''}. They don't change, so they aren't refreshed on their own.
            </Text>
            <Tooltip label="Reload exited and settled groups" withArrow>
              <ActionIcon variant="subtle" color="gray" size="sm" loading={history.isFetching} onClick={() => history.refetch()}>
                <IconRefresh size={14} />
              </ActionIcon>
            </Tooltip>
          </Group>
          {history.isLoading && <GroupsSkeleton />}
          {historyEmpty && <Text size="sm" c="dimmed">{query ? 'No groups match.' : 'No exited or settled groups.'}</Text>}
          {pastSections.map(({ status, groups }) => (
            <StatusSection key={status} status={status} groups={groups} mode={mode} basis={basis} />
          ))}
          {history.hasNextPage && (
            <Group justify="center">
              <Button size="xs" variant="subtle" loading={history.isFetchingNextPage} onClick={() => history.fetchNextPage()}>
                Load older
              </Button>
            </Group>
          )}
          {pastOther.length > 0 && (
            <Stack gap={4}>
              <OtherCard rows={pastOther} mode={mode} basis={basis} />
              {(history.data?.flatOther ?? 0) > pastOther.length && !query && (
                <Text size="xs" c="dimmed">
                  The {pastOther.length} most recently traded of {history.data?.flatOther} flat listings that aren't event
                  contracts; the By listing view has them all.
                </Text>
              )}
            </Stack>
          )}
        </Stack>
      )}
    </Stack>
  );
}
