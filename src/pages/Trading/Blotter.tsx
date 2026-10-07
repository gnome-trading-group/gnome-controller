import { useMemo, useState } from 'react';
import { Button, Card, Container, Group, Select, Tabs, Text, Title } from '@mantine/core';
import { useSearchParams } from 'react-router-dom';
import { LedgerFilters } from '../../utils/api';
import { useModeParam } from '../../hooks/useModeParam';
import { useListingLabels, useListingSearch } from '../../hooks/useAsyncSearch';
import { useActiveSessions, useFills, useOrders, useStrategies } from '../../query/hooks';
import { ModeBand, ModeSwitch } from '../../components/trading/layout';
import { FillsTable, OrdersTable } from '../../components/trading/LedgerTables';

const RANGES: Record<string, number | null> = { '1h': 3_600_000, '24h': 86_400_000, '7d': 7 * 86_400_000, '30d': 30 * 86_400_000, all: null };
const SOURCES = [
  { value: 'VENUE', label: 'Venue fills' },
  { value: 'RECOVERY', label: 'Recovered' },
  { value: 'RESET', label: 'Resets' },
  { value: 'ADJUSTMENT', label: 'Corrections' },
  { value: 'MANUAL', label: 'Manual trades' },
  { value: 'GAP', label: 'Gaps' },
];

// Every strategy's fills and orders in one mode, filtered by what's in the URL, so a link shows the same view.
function Blotter() {
  const [params, setParams] = useSearchParams();
  const [mode, setMode] = useModeParam(undefined);
  const strategies = useStrategies();
  const active = useActiveSessions();
  const [listingSearch, setListingSearch] = useState('');
  const listingOptions = useListingSearch(listingSearch);

  const tab = params.get('tab') === 'orders' ? 'orders' : 'fills';
  const strategyId = params.get('strategy') ? Number(params.get('strategy')) : undefined;
  const listingId = params.get('listing') ? Number(params.get('listing')) : undefined;
  const side = params.get('side') === 'buy' ? 0 : params.get('side') === 'sell' ? 1 : undefined;
  const source = params.get('source') ?? undefined;
  const status = params.get('status') === 'open' ? 'OPEN' : params.get('status') === 'closed' ? 'CLOSED' : 'ANY';
  const range = params.get('range') && params.get('range')! in RANGES ? params.get('range')! : '24h';
  const listingLabels = useListingLabels(listingId ? [listingId] : []);

  const set = (key: string, value: string | null) => setParams(current => {
    const updated = new URLSearchParams(current);
    if (value === null || value === '') updated.delete(key);
    else updated.set(key, value);
    return updated;
  }, { replace: true });

  // Fixed when the range is chosen, so polling keeps asking for the same window.
  const start = useMemo(() => {
    const span = RANGES[range];
    return span === null ? undefined : new Date(Date.now() - span).toISOString();
  }, [range]);
  const filters: LedgerFilters = { listingId, side, start, ...(tab === 'fills' && source ? { source } : {}) };
  const scope = strategyId ? { strategyId, mode } : { mode };
  // Refreshes while anything in the mode is trading.
  const live = (active.data ?? []).some(s => s.mode === mode);
  const fills = useFills(scope, { live, enabled: tab === 'fills' }, filters);
  const orders = useOrders(scope, { live, enabled: tab === 'orders' }, status, filters);

  const strategyOptions = (strategies.data ?? []).map(s => ({ value: String(s.strategyId), label: s.name }));
  const listingData = useMemo(() => {
    const options = [...listingOptions.options];
    if (listingId && !options.some(o => o.value === String(listingId))) {
      options.unshift({ value: String(listingId), label: listingLabels[listingId] ?? `Listing ${listingId}` });
    }
    return options;
  }, [listingOptions.options, listingId, listingLabels]);
  const filtered = [strategyId, listingId, side, source, params.get('status')].some(v => v !== undefined && v !== null);

  return (
    <Container size="xl" py="xl">
      <Group justify="space-between" mb="xs">
        <Title order={2}>Fills & orders</Title>
        <ModeSwitch mode={mode} onChange={setMode} />
      </Group>
      <ModeBand mode={mode} />

      <Card withBorder p="sm" mb="md">
        <Group gap="sm" align="flex-end" wrap="wrap">
          <Select label="Strategy" placeholder="All strategies" size="xs" w={200} clearable searchable
            data={strategyOptions} value={strategyId ? String(strategyId) : null} onChange={v => set('strategy', v)} />
          <Select label="Listing" placeholder="All listings" size="xs" w={220} clearable searchable
            data={listingData} value={listingId ? String(listingId) : null} onChange={v => set('listing', v)}
            searchValue={listingSearch} onSearchChange={setListingSearch}
            nothingFoundMessage={listingOptions.isLoading ? 'Loading...' : 'Type to search listings'} />
          <Select label="Side" placeholder="Both" size="xs" w={110} clearable
            data={[{ value: 'buy', label: 'Buy' }, { value: 'sell', label: 'Sell' }]}
            value={params.get('side')} onChange={v => set('side', v)} />
          {tab === 'fills' ? (
            <Select label="Source" placeholder="Any" size="xs" w={150} clearable data={SOURCES}
              value={source ?? null} onChange={v => set('source', v)} />
          ) : (
            <Select label="Status" size="xs" w={120}
              data={[{ value: 'any', label: 'Any' }, { value: 'open', label: 'Open' }, { value: 'closed', label: 'Closed' }]}
              value={params.get('status') ?? 'any'} onChange={v => set('status', v === 'any' ? null : v)} />
          )}
          <Select label="Since" size="xs" w={100}
            data={Object.keys(RANGES).map(r => ({ value: r, label: r === 'all' ? 'All time' : `Last ${r}` }))}
            value={range} onChange={v => set('range', v)} />
          {filtered && (
            <Button size="xs" variant="subtle" onClick={() => setParams(current => {
              const kept = new URLSearchParams();
              for (const key of ['mode', 'tab', 'range']) if (current.get(key)) kept.set(key, current.get(key)!);
              return kept;
            }, { replace: true })}>
              Clear filters
            </Button>
          )}
        </Group>
      </Card>

      <Tabs value={tab} onChange={v => set('tab', v === 'orders' ? 'orders' : null)} keepMounted={false}>
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
      {live && <Text size="xs" c="dimmed" mt="xs">Refreshing every few seconds while {mode} sessions are running.</Text>}
    </Container>
  );
}

export default Blotter;
