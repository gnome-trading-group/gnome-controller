import { Anchor, Badge, Card, Group, Skeleton, Stack, Table, Text } from '@mantine/core';
import { SkeletonRows } from '../SkeletonRows';
import { Link } from 'react-router-dom';
import { EventPositions as Events, HeldPosition, Mode } from '../../types';

type Market = Events['events'][number]['markets'][number];
import { formatQty } from '../../utils/format';
import { Money, Price, Qty, Time } from './values';

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

// Once the settlement sweeper books a resolved market, every position on it is flat and its PnL is final, so the
// outcome scenarios would all show the same number.
function isSettled(resolved: boolean, market: Market) {
  const held = market.outcomes.filter(o => o.held);
  return resolved && held.length > 0 && held.every(o => o.held?.netQuantity === '0');
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

// Prediction-market positions grouped by event, with each market's outcome scenarios.
// basis: the strategy's lifetime PnL, or one session's PnL (from $0 at its start).
export function EventPositions({ data, strategyId, mode, loading, basis }: {
  data: Events | undefined; strategyId: number; mode: Mode; loading: boolean; basis: 'lifetime' | 'session';
}) {
  if (loading && !data) return <EventPositionsSkeleton />;
  if (!data || (data.events.length === 0 && data.other.length === 0)) {
    return <Text size="sm" c="dimmed">No positions in this mode.</Text>;
  }
  return (
    <Stack gap="md">
      {data.events.map(event => {
        const allSettled = event.markets.length > 0 && event.markets.every(m => isSettled(event.resolved, m));
        const realized = event.markets.reduce((sum, m) => sum + BigInt(m.current), 0n);
        return (
          <Card key={event.eventId} withBorder p="sm">
            <Group justify="space-between" mb="xs" wrap="nowrap">
              <Text fw={600} lineClamp={2}>{event.title}</Text>
              <Group gap="xs" wrap="nowrap">
                {event.resolved && <Badge color="gray" variant="light">resolved</Badge>}
                {allSettled && <Text size="sm" component="div">Realized <Money value={realized.toString()} size="sm" fw={600} /></Text>}
                {event.expiry && !event.resolved && <Text size="xs" c="dimmed">closes <Time value={event.expiry} precision="minute" size="xs" /></Text>}
              </Group>
            </Group>
            {event.markets.map(market => {
              if (isSettled(event.resolved, market)) {
                return (
                  <Stack key={market.key} gap="xs" mb="sm">
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
              const worst = market.worst === null ? null : BigInt(market.worst);
              return (
                <Stack key={market.key} gap="xs" mb="sm">
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
            })}
            {!allSettled && (
              <Text size="xs" c="dimmed">
                {basis === 'lifetime' ? 'Lifetime' : 'Session'} PnL on this market's contracts if each outcome wins
                (contracts settle at $1 or $0). Hedges on other listings aren't included.
              </Text>
            )}
          </Card>
        );
      })}
      {data.other.length > 0 && (
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
              {data.other.map(p => (
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
      )}
    </Stack>
  );
}
