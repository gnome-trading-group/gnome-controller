import { useMemo, useState } from 'react';
import {
  ActionIcon, Anchor, Badge, Card, Group, SegmentedControl, Skeleton, Stack, Table, Text, TextInput,
} from '@mantine/core';
import { IconChevronDown, IconChevronRight, IconSearch } from '@tabler/icons-react';
import { SkeletonRows } from '../SkeletonRows';
import { Link, useSearchParams } from 'react-router-dom';
import { EventPositions as Events, HeldPosition, Mode } from '../../types';
import { formatQty } from '../../utils/format';
import { Money, Price, Qty, Time } from './values';

type Event = Events['events'][number];
type Market = Event['markets'][number];

// In the order they're shown: a resolved event still holding contracts is waiting on the settlement sweeper, which
// is worth noticing before anything else.
const STATUSES = ['awaiting', 'open', 'exited', 'settled'] as const;
type Status = typeof STATUSES[number];

const STATUS_LABELS: Record<Status, string> = {
  awaiting: 'Awaiting settlement',
  open: 'Open',
  exited: 'Exited',
  settled: 'Settled',
};

function positionHref(strategyId: number, mode: Mode, listingId: number) {
  return `/strategies/${strategyId}/listings/${listingId}?mode=${mode}`;
}

function HeldCells({ held }: { held: HeldPosition | null }) {
  if (!held) return <Table.Td colSpan={4}><Text size="sm" c="dimmed">not held</Text></Table.Td>;
  const price = { exchangeId: held.exchangeId, tickSize: held.tickSize, derived: true, size: 'sm' as const };
  return (
    <>
      <Table.Td ta="right"><Qty value={held.netQuantity} lotSize={held.lotSize} signed size="sm" /></Table.Td>
      <Table.Td ta="right"><Price value={held.avgEntryPrice} {...price} /></Table.Td>
      <Table.Td ta="right"><Price value={held.markPrice} {...price} /></Table.Td>
      <Table.Td ta="right"><Money value={held.unrealized} size="sm" /></Table.Td>
    </>
  );
}

function isFlat(held: HeldPosition) {
  return held.netQuantity === '0';
}

// Once the settlement sweeper books a resolved market, every position on it is flat and its PnL is final, so the
// outcome scenarios would all show the same number.
function isSettled(resolved: boolean, market: Market) {
  const held = market.outcomes.filter(o => o.held);
  return resolved && held.length > 0 && held.every(o => o.held && isFlat(o.held));
}

function statusOf(event: Event): Status {
  const flat = event.markets.every(m => m.outcomes.every(o => !o.held || isFlat(o.held)));
  if (event.resolved) return flat ? 'settled' : 'awaiting';
  return flat ? 'exited' : 'open';
}

function realizedOf(event: Event) {
  return event.markets.reduce((sum, m) => sum + BigInt(m.current), 0n);
}

function matches(query: string, ...texts: (string | null | undefined)[]) {
  return texts.some(t => t?.toLowerCase().includes(query));
}

function eventMatches(event: Event, query: string) {
  return matches(query, event.title) || event.markets.some(m => m.outcomes.some(o =>
    matches(query, o.outcome, o.symbol, o.held?.symbol)));
}

// Expiry is only the venue's expected resolution time, so once an event has resolved, when it actually did is the
// better date. Events resolved before resolved_at was recorded fall back to their expiry.
function resolvedTime(event: Event) {
  return event.resolvedAt ?? event.expiry;
}

// Open events by what closes next; settled ones most recently resolved first. Undated events go last either way.
function byTime(time: (event: Event) => string | null, descending: boolean) {
  return (a: Event, b: Event) => {
    const at = time(a);
    const bt = time(b);
    if (at === bt) return a.eventId - b.eventId;
    if (at === null) return 1;
    if (bt === null) return -1;
    return (Date.parse(at) - Date.parse(bt)) * (descending ? -1 : 1);
  };
}

function EventPositionsSkeleton() {
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

function SettledMarket({ market, strategyId, mode, basis }: {
  market: Market; strategyId: number; mode: Mode; basis: 'lifetime' | 'session';
}) {
  return (
    <Stack gap="xs" mb="sm">
      <Table withRowBorders={false} verticalSpacing={4} fz="sm">
        <Table.Thead>
          <Table.Tr>
            <Table.Th>Outcome</Table.Th>
            <Table.Th ta="right">{basis === 'lifetime' ? 'Lifetime PnL' : 'Session PnL'}</Table.Th>
          </Table.Tr>
        </Table.Thead>
        <Table.Tbody>
          {market.outcomes.filter(o => o.held).map(o => (
            <Table.Tr key={`${o.outcome}/${o.listingId}`}>
              <Table.Td>
                <Anchor component={Link} to={positionHref(strategyId, mode, o.listingId as number)} size="sm">{o.outcome}</Anchor>
              </Table.Td>
              <Table.Td ta="right"><Money value={o.held?.total ?? '0'} size="sm" /></Table.Td>
            </Table.Tr>
          ))}
        </Table.Tbody>
      </Table>
      <Stack gap={0} style={{ paddingLeft: 9 }}>
        <Text size="xs" c="dimmed">Realized PnL</Text>
        <Money value={market.current} size="sm" fw={600} />
      </Stack>
    </Stack>
  );
}

function OpenMarket({ market, strategyId, mode }: { market: Market; strategyId: number; mode: Mode }) {
  const worst = market.worst === null ? null : BigInt(market.worst);
  return (
    <Stack gap="xs" mb="sm">
      <Table withRowBorders={false} verticalSpacing={4} fz="sm">
        <Table.Thead>
          <Table.Tr>
            <Table.Th>Outcome</Table.Th>
            <Table.Th ta="right">Position</Table.Th>
            <Table.Th ta="right">Avg entry</Table.Th>
            <Table.Th ta="right">Mark</Table.Th>
            <Table.Th ta="right">Unrealized</Table.Th>
          </Table.Tr>
        </Table.Thead>
        <Table.Tbody>
          {market.outcomes.map(o => (
            <Table.Tr key={`${o.outcome}/${o.listingId}`}>
              <Table.Td>
                {o.listingId !== null && o.held
                  ? <Anchor component={Link} to={positionHref(strategyId, mode, o.listingId)} size="sm">{o.outcome}</Anchor>
                  : <Text span size="sm">{o.outcome}</Text>}
              </Table.Td>
              <HeldCells held={o.held} />
            </Table.Tr>
          ))}
        </Table.Tbody>
      </Table>
      {market.netExposure && market.netExposure.quantity !== '0' && (
        <Text size="xs" c="dimmed">
          Net: {BigInt(market.netExposure.quantity) > 0n ? 'long' : 'short'}{' '}
          {formatQty(BigInt(market.netExposure.quantity) < 0n ? -BigInt(market.netExposure.quantity) : BigInt(market.netExposure.quantity))}{' '}
          {market.netExposure.outcome} (holding the other side counts against it)
        </Text>
      )}
      <Group gap="lg" wrap="wrap">
        {market.scenarios.map(s => (
          <Stack key={s.label} gap={0}
            style={worst !== null && BigInt(s.pnl) === worst && market.scenarios.length > 1
              ? { borderLeft: '3px solid var(--mantine-color-red-6)', paddingLeft: 6 } : { paddingLeft: 9 }}>
            <Text size="xs" c="dimmed">If {s.label} wins</Text>
            <Money value={s.pnl} size="sm" fw={600} />
            <Text size="xs" c="dimmed" component="div">vs now <Money value={s.change} size="xs" /></Text>
          </Stack>
        ))}
      </Group>
    </Stack>
  );
}

function EventCard({ event, strategyId, mode, basis }: {
  event: Event; strategyId: number; mode: Mode; basis: 'lifetime' | 'session';
}) {
  return (
    <Card withBorder p="sm">
      <Group justify="space-between" mb="xs" wrap="nowrap">
        <Text fw={600} lineClamp={2}>{event.title}</Text>
        <Group gap="xs" wrap="nowrap">
          {event.resolved && <Badge color="gray" variant="light">resolved</Badge>}
          {event.expiry && !event.resolved && <Text size="xs" c="dimmed">closes <Time value={event.expiry} precision="minute" size="xs" /></Text>}
        </Group>
      </Group>
      {event.markets.map(market => (isSettled(event.resolved, market)
        ? <SettledMarket key={market.key} market={market} strategyId={strategyId} mode={mode} basis={basis} />
        : <OpenMarket key={market.key} market={market} strategyId={strategyId} mode={mode} />))}
      <Text size="xs" c="dimmed">
        {basis === 'lifetime' ? 'Lifetime' : 'Session'} PnL on this market's contracts if each outcome wins
        (contracts settle at $1 or $0). Hedges on other listings aren't included.
      </Text>
    </Card>
  );
}

// Settled events only have a final PnL left to show, so they're one row each; a row expands to its outcomes.
function SettledTable({ events, strategyId, mode, basis }: {
  events: Event[]; strategyId: number; mode: Mode; basis: 'lifetime' | 'session';
}) {
  const [expanded, setExpanded] = useState<Set<number>>(new Set());
  const toggle = (eventId: number) => setExpanded(current => {
    const next = new Set(current);
    if (!next.delete(eventId)) next.add(eventId);
    return next;
  });
  return (
    <Card withBorder p={0}>
      <Table verticalSpacing={4} fz="sm" highlightOnHover>
        <Table.Thead>
          <Table.Tr>
            <Table.Th w={32} />
            <Table.Th>Event</Table.Th>
            <Table.Th>Resolved</Table.Th>
            <Table.Th>Held</Table.Th>
            <Table.Th ta="right">Realized</Table.Th>
          </Table.Tr>
        </Table.Thead>
        <Table.Tbody>
          {events.map(event => {
            const open = expanded.has(event.eventId);
            const held = event.markets.flatMap(m => m.outcomes.filter(o => o.held));
            return [
              <Table.Tr key={event.eventId} style={{ cursor: 'pointer' }} onClick={() => toggle(event.eventId)}>
                <Table.Td>
                  <ActionIcon variant="subtle" color="gray" size="sm" aria-label={open ? 'Collapse' : 'Expand'}>
                    {open ? <IconChevronDown size={14} /> : <IconChevronRight size={14} />}
                  </ActionIcon>
                </Table.Td>
                <Table.Td><Text size="sm" lineClamp={1}>{event.title}</Text></Table.Td>
                <Table.Td style={{ whiteSpace: 'nowrap' }}>
                  {resolvedTime(event)
                    ? <Time value={resolvedTime(event) as string} precision="minute" size="sm" />
                    : <Text span size="sm" c="dimmed">—</Text>}
                </Table.Td>
                <Table.Td>
                  <Text size="sm" lineClamp={1}>
                    {held.map((o, i) => (
                      <span key={`${o.outcome}/${o.listingId}`}>
                        {i > 0 && ', '}
                        <Anchor component={Link} to={positionHref(strategyId, mode, o.listingId as number)} size="sm"
                          onClick={e => e.stopPropagation()}>{o.outcome}</Anchor>
                      </span>
                    ))}
                  </Text>
                </Table.Td>
                <Table.Td ta="right"><Money value={realizedOf(event).toString()} size="sm" /></Table.Td>
              </Table.Tr>,
              open && (
                <Table.Tr key={`${event.eventId}/detail`}>
                  <Table.Td />
                  <Table.Td colSpan={4}>
                    {event.markets.map(market => (
                      <SettledMarket key={market.key} market={market} strategyId={strategyId} mode={mode} basis={basis} />
                    ))}
                  </Table.Td>
                </Table.Tr>
              ),
            ];
          })}
        </Table.Tbody>
      </Table>
    </Card>
  );
}

function OtherCard({ rows, strategyId, mode, basis }: {
  rows: HeldPosition[]; strategyId: number; mode: Mode; basis: 'lifetime' | 'session';
}) {
  return (
    <Card withBorder p="sm">
      <Text fw={600} mb="xs">Not part of an event</Text>
      <Table withRowBorders={false} verticalSpacing={4} fz="sm">
        <Table.Thead>
          <Table.Tr>
            <Table.Th>Listing</Table.Th>
            <Table.Th ta="right">Position</Table.Th>
            <Table.Th ta="right">Avg entry</Table.Th>
            <Table.Th ta="right">Mark</Table.Th>
            <Table.Th ta="right">Unrealized</Table.Th>
            <Table.Th ta="right">{basis === 'lifetime' ? 'Lifetime PnL' : 'Session PnL'}</Table.Th>
          </Table.Tr>
        </Table.Thead>
        <Table.Tbody>
          {rows.map(p => (
            <Table.Tr key={p.listingId}>
              <Table.Td>
                <Anchor component={Link} to={positionHref(strategyId, mode, p.listingId)} size="sm">{p.symbol ?? p.listingId}</Anchor>
              </Table.Td>
              <HeldCells held={p} />
              <Table.Td ta="right"><Money value={p.total} size="sm" /></Table.Td>
            </Table.Tr>
          ))}
        </Table.Tbody>
      </Table>
    </Card>
  );
}

// Prediction-market positions grouped by event, with each market's outcome scenarios.
// basis: the strategy's lifetime PnL, or one session's PnL (from $0 at its start).
export function EventPositions({ data, strategyId, mode, loading, basis }: {
  data: Events | undefined; strategyId: number; mode: Mode; loading: boolean; basis: 'lifetime' | 'session';
}) {
  const [params, setParams] = useSearchParams();
  const filter: Status | 'all' = STATUSES.includes(params.get('status') as Status) ? params.get('status') as Status : 'all';
  const search = params.get('q') ?? '';
  const setParam = (key: string, value: string | null) => setParams(current => {
    const updated = new URLSearchParams(current);
    if (value) updated.set(key, value);
    else updated.delete(key);
    return updated;
  }, { replace: true });

  const grouped = useMemo(() => {
    const groups: Record<Status, Event[]> = { awaiting: [], open: [], exited: [], settled: [] };
    for (const event of data?.events ?? []) groups[statusOf(event)].push(event);
    for (const status of STATUSES) groups[status].sort(status === 'settled' ? byTime(resolvedTime, true) : byTime(e => e.expiry, false));
    return groups;
  }, [data]);

  // Across every unsettled market, not just those shown, so it doesn't move with the search.
  const summary = useMemo(() => {
    let unrealized = 0n;
    let worst = 0n;
    for (const event of [...grouped.awaiting, ...grouped.open]) {
      for (const market of event.markets) {
        if (isSettled(event.resolved, market)) continue;
        for (const o of market.outcomes) if (o.held) unrealized += BigInt(o.held.unrealized);
        if (market.worst !== null) worst += BigInt(market.worst);
      }
    }
    for (const p of data?.other ?? []) if (!isFlat(p)) unrealized += BigInt(p.unrealized);
    return { unrealized, worst };
  }, [grouped, data]);

  if (loading && !data) return <EventPositionsSkeleton />;
  if (!data || (data.events.length === 0 && data.other.length === 0)) {
    return <Text size="sm" c="dimmed">No positions in this mode.</Text>;
  }

  const query = search.trim().toLowerCase();
  const shown = (status: Status) => (filter === 'all' || filter === status
    ? grouped[status].filter(e => !query || eventMatches(e, query)) : []);
  const other = data.other.filter(p => {
    if (query && !matches(query, p.symbol, String(p.listingId))) return false;
    if (filter === 'all') return true;
    if (filter === 'open') return !isFlat(p);
    return filter === 'exited' && isFlat(p);
  });
  const sections = STATUSES.map(status => ({ status, events: shown(status) })).filter(s => s.events.length > 0);

  return (
    <Stack gap="md">
      <Group justify="space-between" wrap="wrap" gap="xs">
        <Group gap="xs" wrap="wrap">
          <SegmentedControl
            size="xs"
            value={filter}
            onChange={v => setParam('status', v === 'all' ? null : v)}
            data={[
              { value: 'all', label: `All (${data.events.length})` },
              ...STATUSES.map(s => ({ value: s, label: `${STATUS_LABELS[s]} (${grouped[s].length})` })),
            ]}
          />
          <TextInput
            size="xs"
            w={240}
            placeholder="Search events, outcomes, symbols"
            leftSection={<IconSearch size={14} />}
            value={search}
            onChange={e => setParam('q', e.currentTarget.value)}
          />
        </Group>
        <Group gap="md" wrap="nowrap">
          <Text size="sm" component="div">Unrealized <Money value={summary.unrealized.toString()} size="sm" fw={600} /></Text>
          <Text size="sm" component="div">Worst case <Money value={summary.worst.toString()} size="sm" fw={600} /></Text>
        </Group>
      </Group>
      {sections.length === 0 && other.length === 0 && (
        <Text size="sm" c="dimmed">No events match.</Text>
      )}
      {sections.map(({ status, events }) => (
        <Stack key={status} gap="xs">
          <Group gap="xs">
            <Text fw={600} size="sm">{STATUS_LABELS[status]} ({events.length})</Text>
            {status === 'settled' && (
              <Text size="sm" c="dimmed" component="div">
                Realized <Money value={events.reduce((sum, e) => sum + realizedOf(e), 0n).toString()} size="sm" />
              </Text>
            )}
          </Group>
          {status === 'settled'
            ? <SettledTable events={events} strategyId={strategyId} mode={mode} basis={basis} />
            : events.map(event => <EventCard key={event.eventId} event={event} strategyId={strategyId} mode={mode} basis={basis} />)}
        </Stack>
      ))}
      {other.length > 0 && <OtherCard rows={other} strategyId={strategyId} mode={mode} basis={basis} />}
    </Stack>
  );
}
