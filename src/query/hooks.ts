import { useCallback, useMemo, useState } from 'react';
import { keepPreviousData, useInfiniteQuery, useQueries, useQuery, useQueryClient } from '@tanstack/react-query';
import { collectionApi, controllerApi, registryApi, EventScope, LedgerFilters, LedgerScope } from '../utils/api';
import { ACTIVE_SESSION_STATUSES, AlertFilters, isActiveSession, LedgerFill, LedgerOrder, Mode, PnlSeries, StrategySession } from '../types';
import { mergeSeries } from './series';

// How often each kind of data is re-read while it can still change; nothing polls once a session has ended.
export const POLL = {
  status: 5_000,
  summary: 5_000,
  series: 5_000,
  ledger: 3_000,
  policies: 5_000,
  sessions: 10_000,
  attention: 10_000,
  alerts: 30_000,
  treasury: 30_000,
};

const PAGE_SIZE = 100;

export const keys = {
  strategies: ['strategies'] as const,
  activeSessions: ['activeSessions'] as const,
  attention: (mode: Mode) => ['attention', mode] as const,
  alerts: (filters: AlertFilters) => ['alerts', filters] as const,
  alertFacets: (filters: AlertFilters) => ['alertFacets', filters] as const,
  sparklines: (mode: Mode) => ['sparklines', mode] as const,
  session: (id: string) => ['session', id] as const,
  strategySessions: (strategyId: number) => ['strategySessions', strategyId] as const,
  tradedSessions: (scope: TradedScope) => ['tradedSessions', scope] as const,
  policies: ['riskPolicies'] as const,
  sessionSummary: (id: string) => ['pnlSummary', 'session', id] as const,
  strategySummary: (id: number, mode: Mode, tz: string, listingId?: number) =>
    ['pnlSummary', 'strategy', id, mode, tz, listingId ?? null] as const,
  flatPositions: (id: number, mode: Mode, tz: string) => ['pnlSummary', 'flat', id, mode, tz] as const,
  firmSummary: (mode: Mode, tz: string) => ['pnlSummary', 'firm', mode, tz] as const,
  sessionsTotals: (ids: string[]) => ['pnlSummary', 'sessions', ids] as const,
  series: (scope: LedgerScope, start: string | undefined) => ['pnlSeries', scope, start] as const,
  fills: (scope: LedgerScope) => ['ledgerFills', scope] as const,
  orders: (scope: LedgerScope, status: string) => ['ledgerOrders', scope, status] as const,
  venueAccounts: ['venueAccounts'] as const,
  treasury: ['treasury'] as const,
  marketDataKeys: ['marketDataKeys'] as const,
  marketDataAccounts: ['marketDataAccounts'] as const,
  collectionRules: ['collection', 'rules'] as const,
  collectionTargets: ['collection', 'targets'] as const,
  collectionShards: (includeDeleted: boolean) => ['collection', 'shards', includeDeleted] as const,
  collectionShard: (shardId: string) => ['collection', 'shard', shardId] as const,
  shardLogs: (shardId: string, taskId: string) => ['collection', 'logs', shardId, taskId] as const,
  transfers: (accountId: number | null) => ['treasury', 'transfers', accountId] as const,
  recon: (accountId: number) => ['treasury', 'recon', accountId] as const,
  sessionAccounts: (sessionId: string) => ['sessionAccounts', sessionId] as const,
  // All under one prefix, so recording new parameters refreshes every view of them; each shape has its own key.
  simulationParameters: (knownAsOf?: string) => ['simulationParameters', 'byExchange', knownAsOf ?? 'now'] as const,
  simulationParameterRows: (history: boolean) => ['simulationParameters', 'rows', history ? 'history' : 'now'] as const,
  simulationParametersOf: (exchangeId: number | null) => ['simulationParameters', 'exchange', exchangeId] as const,
};

// Each exchange's simulation parameters in force at knownAsOf (default now), by exchange id.
export function useSimulationParameters(knownAsOf?: string) {
  return useQuery({
    queryKey: keys.simulationParameters(knownAsOf),
    queryFn: async () => new Map((await registryApi.listSimulationParameters({ knownAsOf })).map(r => [r.exchange_id, r])),
    staleTime: 60_000,
  });
}

export function useActiveSessions() {
  return useQuery({
    queryKey: keys.activeSessions,
    queryFn: () => registryApi.listSessions({ status: ACTIVE_SESSION_STATUSES.join(',') }),
    refetchInterval: POLL.sessions,
  });
}

export function useAttention(mode: Mode) {
  return useQuery({ queryKey: keys.attention(mode), queryFn: () => registryApi.getAttention(mode), refetchInterval: POLL.attention });
}

// Each strategy's last week, for the overview's sparklines: coarse, and re-read whole every minute.
export function useWeekSparklines(mode: Mode) {
  return useQuery({
    queryKey: keys.sparklines(mode),
    queryFn: () => registryApi.getPnlSeries({ mode }, {
      start: new Date(Date.now() - 7 * 86_400_000).toISOString(), resolution: 3_600_000,
    }),
    refetchInterval: 60_000,
    placeholderData: keepPreviousData,
  });
}

// A listing's prices over a window, re-read whole while live: it is bounded to a chart's worth of points.
export function useMarks(listingId: number, start: string | undefined, live: boolean) {
  return useQuery({
    queryKey: ['marks', listingId, start],
    queryFn: () => registryApi.getMarks(listingId, start),
    refetchInterval: live ? POLL.series * 2 : false,
    placeholderData: keepPreviousData,
  });
}

// Every fill on one listing in a window, for marking them on its price chart.
export function useListingFills(scope: LedgerScope, listingId: number, start: string | undefined, live: boolean) {
  return useQuery({
    queryKey: ['listingFills', scope, listingId, start],
    queryFn: async () => (await registryApi.listFills(scope, { listingId, start, limit: 1000 })).rows,
    refetchInterval: live ? POLL.ledger : false,
    placeholderData: keepPreviousData,
  });
}

export function useOrderFills(order: LedgerOrder | null) {
  return useQuery({
    queryKey: ['orderFills', order?.sessionId, order?.clientOidCounter],
    queryFn: async () => (await registryApi.listOrderFills(order!.sessionId, order!.clientOidCounter)).rows,
    enabled: !!order,
    refetchInterval: order?.status === 'OPEN' ? POLL.ledger : false,
  });
}

export function useDailyPnl(scope: { strategyId?: number; mode: Mode }, tz: string, days: number) {
  return useQuery({
    queryKey: ['dailyPnl', scope, tz, days],
    queryFn: () => registryApi.getDailyPnl(scope, tz, days),
    refetchInterval: 60_000,
    placeholderData: keepPreviousData,
  });
}

export function useRiskUsage(sessionId: string | undefined, live: boolean) {
  return useQuery({
    queryKey: ['riskUsage', sessionId],
    queryFn: () => registryApi.getRiskUsage(sessionId as string),
    enabled: !!sessionId && live,
    refetchInterval: POLL.summary,
  });
}

export function useEventPositions(scope: EventScope, enabled: boolean, live: boolean) {
  return useQuery({
    queryKey: ['eventPositions', scope],
    queryFn: () => registryApi.getEventPositions(scope),
    enabled,
    refetchInterval: live ? POLL.summary : false,
    placeholderData: keepPreviousData,
  });
}

const EVENT_HISTORY_PAGE_SIZE = 50;

// Events that are over for the scope don't change, so they aren't polled: they load when shown and refresh on request.
export function useEventHistory(scope: EventScope, enabled: boolean) {
  return useInfiniteQuery({
    enabled,
    queryKey: ['eventHistory', scope],
    queryFn: ({ pageParam }) => registryApi.getEventPositions(scope, { before: pageParam, limit: EVENT_HISTORY_PAGE_SIZE }),
    initialPageParam: undefined as string | undefined,
    getNextPageParam: last => last.nextBefore ?? undefined,
    select: data => ({
      events: data.pages.flatMap(page => page.events),
      other: data.pages[0]?.other ?? [],
      flatOther: data.pages[0]?.counts.flatOther ?? 0,
    }),
  });
}

// System health changes slowly and its reads scan every region, so once a minute is plenty. refresh() reads the
// section fresh, past the backend's one-minute cache, for a section's refresh button or after an approval.
export function useSystemHealth<T>(section: string) {
  const client = useQueryClient();
  const [refreshing, setRefreshing] = useState(false);
  const query = useQuery({
    queryKey: ['systemHealth', section],
    queryFn: () => controllerApi.getSystemHealth<T>(section),
    refetchInterval: 60_000,
  });
  const refresh = useCallback(async () => {
    setRefreshing(true);
    try {
      client.setQueryData(['systemHealth', section], await controllerApi.getSystemHealth<T>(section, true));
    } finally {
      setRefreshing(false);
    }
  }, [client, section]);
  return { ...query, refresh, refreshing };
}

// The latest sessions of every strategy, newest first: enough for each strategy's last run and a week's timeline.
const RECENT_SESSIONS = 300;

export function useRecentSessions() {
  return useQuery({
    queryKey: ['recentSessions'],
    queryFn: () => registryApi.listSessionsPaginated({
      limit: RECENT_SESSIONS, offset: 0, sortBy: 'startedAt', sortOrder: 'desc',
    }),
    refetchInterval: POLL.sessions,
  });
}

// Every strategy's daily PnL in a mode, for win rates and drawdowns across the strategies page.
export function useDailyByStrategy(mode: Mode, tz: string, days: number) {
  return useQuery({
    queryKey: ['dailyByStrategy', mode, tz, days],
    queryFn: () => registryApi.getDailyPnl({ mode }, tz, days, true),
    refetchInterval: 300_000,
    placeholderData: keepPreviousData,
  });
}

// Each running session's limit usage; a page of them at once.
export function useRiskUsages(sessionIds: string[]) {
  return useQueries({
    queries: sessionIds.map(sessionId => ({
      queryKey: ['riskUsage', sessionId],
      queryFn: () => registryApi.getRiskUsage(sessionId),
      refetchInterval: POLL.summary,
    })),
  });
}

export function useStrategies() {
  return useQuery({ queryKey: keys.strategies, queryFn: () => registryApi.listStrategies(), staleTime: 60_000 });
}

export function useStrategyName(strategyId: number | undefined): string | undefined {
  const { data } = useStrategies();
  return data?.find(s => s.strategyId === strategyId)?.name;
}

export function useSession(sessionId: string | undefined) {
  return useQuery({
    queryKey: keys.session(sessionId ?? ''),
    queryFn: async () => (await registryApi.listSessions({ sessionId }))[0] ?? null,
    enabled: !!sessionId,
    refetchInterval: query => (isLive(query.state.data) ? POLL.status : false),
  });
}

export function useStrategySessions(strategyId: number) {
  return useQuery({
    queryKey: keys.strategySessions(strategyId),
    queryFn: () => registryApi.listSessions({ strategyId }),
    refetchInterval: POLL.sessions,
  });
}

export type TradedScope = { listingId: number } | { eventId: number };

// Every session that has traded the listing, or any of the event's listings, whether or not it still runs.
export function useTradedSessions(scope: TradedScope) {
  return useQuery({
    queryKey: keys.tradedSessions(scope),
    queryFn: () => registryApi.listSessions(scope),
    refetchInterval: POLL.sessions,
  });
}

export function useRiskPolicies() {
  return useQuery({ queryKey: keys.policies, queryFn: () => registryApi.listRiskPolicies(), refetchInterval: POLL.policies });
}

export function useSessionSummary(sessionId: string | undefined, live: boolean) {
  return useQuery({
    queryKey: keys.sessionSummary(sessionId ?? ''),
    queryFn: () => registryApi.getSessionSummary(sessionId as string),
    enabled: !!sessionId,
    refetchInterval: live ? POLL.summary : false,
  });
}

export function useStrategySummary(strategyId: number, mode: Mode, tz: string, listingId?: number) {
  return useQuery({
    queryKey: keys.strategySummary(strategyId, mode, tz, listingId),
    queryFn: () => registryApi.getStrategySummary(strategyId, mode, tz, listingId),
    refetchInterval: POLL.summary,
    placeholderData: keepPreviousData,
  });
}

const FLAT_PAGE_SIZE = 100;

// Closed positions don't move, so they aren't polled: they load once their tab opens, and refresh on request.
export function useFlatPositions(scope: { strategyId: number; mode: Mode; tz: string } | null, enabled: boolean) {
  const { strategyId = 0, mode = 'paper', tz = 'UTC' } = scope ?? {};
  return useInfiniteQuery({
    enabled: enabled && scope !== null,
    queryKey: keys.flatPositions(strategyId, mode, tz),
    queryFn: ({ pageParam }) => registryApi.listFlatPositions(strategyId, mode, tz, { before: pageParam, limit: FLAT_PAGE_SIZE }),
    initialPageParam: undefined as string | undefined,
    getNextPageParam: last => last.nextBefore ?? undefined,
    select: data => data.pages.flatMap(page => page.rows),
  });
}

export function useFirmSummary(mode: Mode, tz: string, refetchInterval: number) {
  return useQuery({
    queryKey: keys.firmSummary(mode, tz),
    queryFn: () => registryApi.getFirmSummary(mode, tz),
    refetchInterval,
  });
}

export function useSessionsTotals(sessionIds: string[], live: boolean) {
  return useQuery({
    queryKey: keys.sessionsTotals(sessionIds),
    queryFn: () => registryApi.getSessionsTotals(sessionIds),
    enabled: sessionIds.length > 0,
    refetchInterval: live ? POLL.sessions : false,
    placeholderData: keepPreviousData,
  });
}

// The first read loads the whole window; each poll after it asks only for points from the newest one on, and merges.
// Each listing's own line comes only with byListing (or for one listingId): it is as long as the series per listing.
export function usePnlSeries(
  scope: LedgerScope | null, start: string | undefined, live: boolean, listingId?: number, byListing = false,
) {
  const client = useQueryClient();
  const key = [...keys.series(scope ?? { sessionId: '' }, start), listingId, byListing] as const;
  return useQuery({
    queryKey: key,
    enabled: scope !== null,
    queryFn: async () => {
      const previous = client.getQueryData<PnlSeries>(key);
      if (!previous || previous.t.length === 0) {
        return registryApi.getPnlSeries(scope as LedgerScope, { start, listingId, byListing });
      }
      const tail = await registryApi.getPnlSeries(scope as LedgerScope, {
        start, listingId, byListing, resolution: previous.resolutionMs, since: previous.t[previous.t.length - 1],
        // The lines already drawn, so a poll never swaps one listing for another mid-chart; a reload re-ranks them.
        listingIds: byListing && previous.listings.length > 0 ? previous.listings.map(l => l.listingId) : undefined,
      });
      return mergeSeries(previous, tail);
    },
    refetchInterval: live ? POLL.series : false,
    placeholderData: keepPreviousData,
  });
}

// Newest first; older pages load on demand. While live, refetching re-reads the loaded pages, so new rows appear at
// the top and rows that changed (an order that filled) update in place.
interface LedgerListOptions {
  live: boolean;
  // Lists load only once their tab is opened.
  enabled: boolean;
}

export function useFills(scope: LedgerScope, { live, enabled }: LedgerListOptions, filters: LedgerFilters = {}) {
  return useInfiniteQuery({
    enabled,
    queryKey: [...keys.fills(scope), filters],
    queryFn: ({ pageParam }) => registryApi.listFills(scope, { ...filters, before: pageParam, limit: PAGE_SIZE }),
    initialPageParam: undefined as string | undefined,
    getNextPageParam: last => (last.rows.length === PAGE_SIZE ? last.nextBefore ?? undefined : undefined),
    select: data => data.pages.flatMap(page => page.rows) as LedgerFill[],
    refetchInterval: live ? POLL.ledger : false,
  });
}

export function useOrders(
  scope: LedgerScope, { live, enabled }: LedgerListOptions, status: 'OPEN' | 'CLOSED' | 'ANY', filters: LedgerFilters = {},
) {
  return useInfiniteQuery({
    enabled,
    queryKey: [...keys.orders(scope, status), filters],
    queryFn: ({ pageParam }) => registryApi.listOrders(scope, { ...filters, status, before: pageParam, limit: PAGE_SIZE }),
    initialPageParam: undefined as string | undefined,
    getNextPageParam: last => (last.rows.length === PAGE_SIZE ? last.nextBefore ?? undefined : undefined),
    select: data => data.pages.flatMap(page => page.rows) as LedgerOrder[],
    refetchInterval: live ? POLL.ledger : false,
  });
}

// Every venue account in any status; the treasury summary leaves retired ones out.
export function useVenueAccounts() {
  return useQuery({ queryKey: keys.venueAccounts, queryFn: () => registryApi.listVenueAccounts(), refetchInterval: POLL.treasury });
}

// Balances move with the venue poller's snapshots, every few minutes.
export function useMarketDataAccounts() {
  return useQuery({
    queryKey: keys.marketDataAccounts, queryFn: () => registryApi.listMarketDataAccounts(), refetchInterval: 60_000,
  });
}

// Shards report every 15 s and the reconciler ticks every minute; reading more often shows nothing new.
export const COLLECTION_POLL = 10_000;

export function useCollectionRules() {
  return useQuery({ queryKey: keys.collectionRules, queryFn: collectionApi.listRules, refetchInterval: COLLECTION_POLL });
}

export function useCollectionTargets() {
  return useQuery({ queryKey: keys.collectionTargets, queryFn: collectionApi.listTargets, refetchInterval: COLLECTION_POLL });
}

export function useCollectionShards(includeDeleted = false) {
  return useQuery({
    queryKey: keys.collectionShards(includeDeleted),
    queryFn: () => collectionApi.listShards(includeDeleted),
    refetchInterval: COLLECTION_POLL,
  });
}

export function useCollectionShard(shardId: string) {
  return useQuery({
    queryKey: keys.collectionShard(shardId), queryFn: () => collectionApi.getShard(shardId), refetchInterval: COLLECTION_POLL,
  });
}

/** Each shard's detail (item and statuses), for the overview's cards; a shard is a few kB, read every poll. */
export function useCollectionShardDetails(shardIds: string[]) {
  return useQueries({
    queries: shardIds.map((shardId) => ({
      queryKey: keys.collectionShard(shardId),
      queryFn: () => collectionApi.getShard(shardId),
      refetchInterval: COLLECTION_POLL,
    })),
  });
}

export function useShardLogs(shardId: string, region: string, taskId: string | null) {
  return useQuery({
    queryKey: keys.shardLogs(shardId, taskId ?? ''),
    queryFn: () => collectionApi.getShardLogs(shardId, region, taskId!),
    enabled: taskId != null,
    refetchInterval: 15_000,
  });
}

const STREAM_LOOKUP_CHUNK = 200;

/** Each stream's source and venue id, for showing streams by name rather than number. */
export function useStreamNames(ids: number[]) {
  const sorted = useMemo(() => [...new Set(ids)].sort((a, b) => a - b), [ids]);
  return useQuery({
    queryKey: ['collection', 'streamNames', sorted],
    queryFn: async () => {
      const names = new Map<number, string>();
      for (let i = 0; i < sorted.length; i += STREAM_LOOKUP_CHUNK) {
        const rows = await registryApi.listStreamsByIds(sorted.slice(i, i + STREAM_LOOKUP_CHUNK));
        rows.forEach((s) => names.set(s.streamId, `${s.sourceCode} ${s.nativeSubjectId}`));
      }
      return names;
    },
    enabled: sorted.length > 0,
    staleTime: 10 * 60_000,
  });
}

export function useMarketDataKeys() {
  return useQuery({ queryKey: keys.marketDataKeys, queryFn: () => registryApi.listMarketDataKeys(), refetchInterval: 60_000 });
}

export function useTreasurySummary() {
  return useQuery({ queryKey: keys.treasury, queryFn: () => registryApi.getTreasurySummary(), refetchInterval: POLL.treasury });
}

export function useTransfers(accountId: number | null) {
  return useQuery({
    queryKey: keys.transfers(accountId),
    queryFn: () => registryApi.listTransfers(accountId ?? undefined),
    refetchInterval: POLL.treasury,
  });
}

export function useRecon(accountId: number | null) {
  return useQuery({
    queryKey: keys.recon(accountId ?? 0),
    queryFn: () => registryApi.getRecon(accountId as number),
    enabled: accountId !== null,
    refetchInterval: POLL.treasury,
  });
}

// A live session's accounts are bound once, at launch.
export function useSessionAccounts(sessionId: string, enabled: boolean) {
  return useQuery({
    queryKey: keys.sessionAccounts(sessionId),
    queryFn: () => registryApi.getSessionAccounts(sessionId),
    enabled,
    staleTime: 60_000,
  });
}

export function isLive(session: StrategySession | null | undefined): boolean {
  return !!session && isActiveSession(session.status);
}

// Alerts, newest first. Open ones (FIRING) are what the System page and the navbar show.
export function useAlerts(filters: AlertFilters) {
  return useQuery({
    queryKey: keys.alerts(filters),
    queryFn: () => registryApi.listAlerts(filters),
    refetchInterval: POLL.alerts,
    placeholderData: keepPreviousData,
  });
}

// All of them, so the System page and the navbar count and group from the whole set.
export function useOpenAlerts() {
  return useAlerts({ status: ['FIRING'], limit: 500 });
}

export function useAlertFacets(filters: AlertFilters) {
  return useQuery({
    queryKey: keys.alertFacets(filters),
    queryFn: () => registryApi.getAlertFacets(filters),
    refetchInterval: POLL.alerts,
    placeholderData: keepPreviousData,
  });
}

/** @return acknowledges (or closes) each alert; throws naming how many failed, after the ones that worked are in */
export function useAcknowledgeAlerts() {
  const client = useQueryClient();
  return useCallback(async (alertIds: number[], reason?: string) => {
    const results = await Promise.allSettled(alertIds.map(id => registryApi.acknowledgeAlert(id, reason)));
    await client.invalidateQueries({ queryKey: ['alerts'] });
    await client.invalidateQueries({ queryKey: ['alertFacets'] });
    await client.invalidateQueries({ queryKey: ['attention'] });
    const failed = results.filter((r): r is PromiseRejectedResult => r.status === 'rejected');
    if (failed.length === 1 && alertIds.length === 1) throw failed[0].reason;
    if (failed.length > 0) throw new Error(`${failed.length} of ${alertIds.length} failed`);
  }, [client]);
}
