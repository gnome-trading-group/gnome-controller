import { useState } from 'react';
import { Anchor, Badge, Button, Card, Container, Group, SegmentedControl, Table, Tabs, Text, Tooltip } from '@mantine/core';
import { IconAdjustments, IconRefresh } from '@tabler/icons-react';
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { useQueryClient } from '@tanstack/react-query';
import { isActiveSession, StrategyListingPnl } from '../../types';
import { useDayZone } from '../../context/PreferencesContext';
import { useModeParam } from '../../hooks/useModeParam';
import { useCents } from '../../hooks/useCents';
import {
  POLL, useFills, useListingFills, useMarks, useOrders, usePnlSeries, useStrategies, useStrategySessions,
  useStrategySummary,
} from '../../query/hooks';
import { PageHeader } from '../../components/PageHeader';
import { LastUpdated } from '../../components/LastUpdated';
import { Kpi, KpiStrip, ModeBand, ModeSwitch } from '../../components/trading/layout';
import { Money, Price, Qty } from '../../components/trading/values';
import { PriceChart } from '../../components/trading/PriceChart';
import { FillsTable, OrdersTable } from '../../components/trading/LedgerTables';
import { AdjustPositionModal } from '../../components/trading/AdjustPositionModal';
import { formatDuration } from '../../utils/format';
import { treasuryLink } from '../../utils/attention';

const RANGES: Record<string, number | null> = { '1h': 3_600_000, '1d': 86_400_000, '7d': 7 * 86_400_000, All: null };

function rangeStart(range: string): string | undefined {
  const span = RANGES[range];
  return span === null ? undefined : new Date(Date.now() - span).toISOString();
}

// One strategy on one listing: the price, where it traded, what it held and made. The place to answer "what
// happened on this market?"
function PositionDetail() {
  const params = useParams<{ strategyId: string; listingId: string }>();
  const strategyId = parseInt(params.strategyId ?? '0');
  const listingId = parseInt(params.listingId ?? '0');
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const tz = useDayZone();

  const strategies = useStrategies();
  const strategy = strategies.data?.find(s => s.strategyId === strategyId);
  const sessions = useStrategySessions(strategyId);
  const modesWithData = sessions.data ? [...new Set(sessions.data.map(s => s.mode as 'paper' | 'live'))] : undefined;
  const [mode, setMode] = useModeParam(modesWithData);
  // Live while a session of the strategy is trading this listing.
  const live = (sessions.data ?? []).some(s => s.mode === mode && isActiveSession(s.status)
    && Array.isArray(s.config.listings) && (s.config.listings as unknown[]).map(Number).includes(listingId));
  const summary = useStrategySummary(strategyId, mode, tz);
  // Live, the strategy may hold the listing on several venue accounts (one it was relaunched off, still draining):
  // the figures are one account's, picked in the URL, else the one with a position.
  const [search, setSearch] = useSearchParams();
  const accountRows = summary.data?.listings.filter(l => l.listingId === listingId) ?? [];
  const row = accountRows.find(l => String(l.accountId) === search.get('account'))
    ?? accountRows.find(l => BigInt(l.netQuantity) !== 0n) ?? accountRows[0] ?? null;
  const selectAccount = (r: StrategyListingPnl) => setSearch(current => {
    const updated = new URLSearchParams(current);
    if (r.accountId === null) updated.delete('account');
    else updated.set('account', String(r.accountId));
    return updated;
  }, { replace: true });
  const cents = useCents(row?.exchangeId);

  const [range, setRange] = useState('1d');
  const [start, setStart] = useState(() => rangeStart('1d'));
  const scope = { strategyId, mode };
  const prices = useMarks(listingId, start, live);
  const series = usePnlSeries(scope, start, live, listingId);
  const chartFills = useListingFills(scope, listingId, start, live);
  const [tab, setTab] = useState<string | null>('fills');
  const fills = useFills(scope, { live, enabled: tab === 'fills' }, { listingId });
  const orders = useOrders(scope, { live, enabled: tab === 'orders' }, 'ANY', { listingId });
  const [adjustOpen, setAdjustOpen] = useState(false);

  const refreshAll = () => {
    for (const key of ['pnlSummary', 'pnlSeries', 'marks', 'listingFills', 'ledgerFills', 'ledgerOrders']) {
      queryClient.invalidateQueries({ queryKey: [key] });
    }
  };
  const markAge = row?.markTime ? Date.now() - Date.parse(row.markTime) : null;

  return (
    <Container size="xl" py="xl">
      <PageHeader
        onBack={() => navigate(`/strategies/${strategyId}?mode=${mode}&tab=positions`)}
        title={row?.symbol ?? `Listing ${listingId}`}
        badges={
          <LastUpdated at={summary.dataUpdatedAt ? new Date(summary.dataUpdatedAt) : null} intervalMs={POLL.summary}
            failing={!!summary.error} compact />
        }
        actions={
          <>
            <ModeSwitch mode={mode} onChange={setMode} />
            {row && (
              <Tooltip label={live ? 'Stop the sessions trading this listing first' : 'Set what the strategy holds here'} withArrow>
                <Button variant="light" color="orange" leftSection={<IconAdjustments size={16} />} disabled={live}
                  onClick={() => setAdjustOpen(true)}>
                  Adjust
                </Button>
              </Tooltip>
            )}
          </>
        }
        menu={[{ label: 'Refresh', icon: <IconRefresh size={16} />, onClick: refreshAll }]}
        meta={[
          <Anchor component={Link} to={`/strategies/${strategyId}?mode=${mode}`} size="sm">{strategy?.name ?? `Strategy ${strategyId}`}</Anchor>,
          <Anchor component={Link} to={`/security-master/listings/${listingId}`} size="sm">listing {listingId}</Anchor>,
          row?.tickSize && <>tick <Price value={row.tickSize} exchangeId={row.exchangeId} tickSize={row.tickSize} size="sm" /></>,
          row?.accountLabel && (
            <>account <Anchor component={Link} to={treasuryLink(row.accountId)} size="sm" ff="monospace">{row.accountLabel}</Anchor></>
          ),
          live ? 'trading now' : 'no session trading it',
        ]}
      />
      <ModeBand mode={mode} />

      <KpiStrip>
        <Kpi label="Position" value={row ? <Qty value={row.netQuantity} lotSize={row.lotSize} signed /> : '—'}
          footer={row && BigInt(row.netQuantity) !== 0n && <>avg <Price value={row.avgEntryPrice} exchangeId={row.exchangeId} tickSize={row.tickSize} derived size="xs" /></>} />
        <Kpi label="Mark" value={row ? <Price value={row.markPrice} exchangeId={row.exchangeId} tickSize={row.tickSize} derived /> : '—'}
          footer={markAge !== null && `updated ${formatDuration(markAge)} ago`} />
        <Kpi label="Unrealized" value={<Money value={row?.unrealized} />} />
        <Kpi label="Realized" value={<Money value={row?.realized} />} />
        <Kpi label="Lifetime PnL" value={<Money value={row?.total} arrow />} footer={row && <>fees <Money value={row.fees} pnl={false} size="xs" /></>} />
        <Kpi label="Today" value={<Money value={row?.today} arrow />} />
      </KpiStrip>
      {accountRows.length > 1 && (
        <Card withBorder mb="md" p="sm">
          <Text fw={600} mb="xs">By venue account</Text>
          <Table highlightOnHover>
            <Table.Thead>
              <Table.Tr>
                <Table.Th>Account</Table.Th>
                <Table.Th ta="right">Position</Table.Th>
                <Table.Th ta="right">Avg entry</Table.Th>
                <Table.Th ta="right">Unrealized</Table.Th>
                <Table.Th ta="right">Lifetime PnL</Table.Th>
              </Table.Tr>
            </Table.Thead>
            <Table.Tbody>
              {accountRows.map(r => (
                <Table.Tr key={r.accountId ?? 'none'} onClick={() => selectAccount(r)} style={{ cursor: 'pointer' }}
                  bg={r === row ? 'var(--mantine-color-blue-light)' : undefined}>
                  <Table.Td>
                    <Group gap={6}>
                      <Text span size="sm" ff="monospace">{r.accountLabel ?? '—'}</Text>
                      {r.needsReview && <Badge color="red" size="xs">review</Badge>}
                    </Group>
                  </Table.Td>
                  <Table.Td ta="right"><Qty value={r.netQuantity} lotSize={r.lotSize} signed size="sm" /></Table.Td>
                  <Table.Td ta="right"><Price value={r.avgEntryPrice} exchangeId={r.exchangeId} tickSize={r.tickSize} derived size="sm" /></Table.Td>
                  <Table.Td ta="right"><Money value={r.unrealized} size="sm" /></Table.Td>
                  <Table.Td ta="right"><Money value={r.total} size="sm" /></Table.Td>
                </Table.Tr>
              ))}
            </Table.Tbody>
          </Table>
        </Card>
      )}
      {!summary.isLoading && !row && (
        <Text c="dimmed" size="sm" mb="md">The strategy has never traded this listing in {mode}.</Text>
      )}

      <Card withBorder mb="md">
        <Group justify="space-between" mb="xs">
          <Text fw={600}>Price, position and PnL</Text>
          <SegmentedControl size="xs" value={range} onChange={next => { setRange(next); setStart(rangeStart(next)); }}
            data={Object.keys(RANGES)} />
        </Group>
        <PriceChart
          prices={prices.data}
          series={series.data}
          fills={chartFills.data}
          tickSize={row?.tickSize ?? null}
          lotSize={row?.lotSize ?? null}
          cents={cents}
          loading={prices.isLoading}
        />
      </Card>

      <Tabs value={tab} onChange={setTab} keepMounted={false}>
        <Tabs.List mb="sm">
          <Tabs.Tab value="fills">Fills</Tabs.Tab>
          <Tabs.Tab value="orders">Orders</Tabs.Tab>
        </Tabs.List>
        <Tabs.Panel value="fills">
          <FillsTable rows={fills.data ?? []} loading={fills.isLoading} showSession
            hasMore={!!fills.hasNextPage} loadingMore={fills.isFetchingNextPage} onLoadMore={() => fills.fetchNextPage()} />
        </Tabs.Panel>
        <Tabs.Panel value="orders">
          <OrdersTable rows={orders.data ?? []} loading={orders.isLoading} showSession
            hasMore={!!orders.hasNextPage} loadingMore={orders.isFetchingNextPage} onLoadMore={() => orders.fetchNextPage()} />
        </Tabs.Panel>
      </Tabs>

      <AdjustPositionModal strategyId={strategyId} mode={mode} position={adjustOpen ? row : null}
        onClose={() => setAdjustOpen(false)} onAdjusted={refreshAll} />
    </Container>
  );
}

export default PositionDetail;
