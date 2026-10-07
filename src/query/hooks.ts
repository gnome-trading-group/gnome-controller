import { keepPreviousData, useInfiniteQuery, useQuery, useQueryClient } from '@tanstack/react-query';
import { registryApi, LedgerFilters, LedgerScope } from '../utils/api';
import { ACTIVE_SESSION_STATUSES, isActiveSession, LedgerFill, LedgerOrder, Mode, PnlSeries, StrategySession } from '../types';
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
};

const PAGE_SIZE = 100;

export const keys = {
  strategies: ['strategies'] as const,
  activeSessions: ['activeSessions'] as const,
  attention: (mode: Mode) => ['attention', mode] as const,
  sparklines: (mode: Mode) => ['sparklines', mode] as const,
  session: (id: string) => ['session', id] as const,
  strategySessions: (strategyId: number) => ['strategySessions', strategyId] as const,
  policies: ['riskPolicies'] as const,
  sessionSummary: (id: string) => ['pnlSummary', 'session', id] as const,
  strategySummary: (id: number, mode: Mode, tz: string) => ['pnlSummary', 'strategy', id, mode, tz] as const,
  firmSummary: (mode: Mode, tz: string) => ['pnlSummary', 'firm', mode, tz] as const,
  sessionsTotals: (ids: string[]) => ['pnlSummary', 'sessions', ids] as const,
  series: (scope: LedgerScope, start: string | undefined) => ['pnlSeries', scope, start] as const,
  fills: (scope: LedgerScope) => ['ledgerFills', scope] as const,
  orders: (scope: LedgerScope, status: string) => ['ledgerOrders', scope, status] as const,
};

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

export function useEventPositions(
  scope: { strategyId: number; mode: Mode } | { sessionId: string }, enabled: boolean, live: boolean,
) {
  return useQuery({
    queryKey: ['eventPositions', scope],
    queryFn: () => registryApi.getEventPositions(scope),
    enabled,
    refetchInterval: live ? POLL.summary : false,
    placeholderData: keepPreviousData,
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

export function useStrategySummary(strategyId: number, mode: Mode, tz: string) {
  return useQuery({
    queryKey: keys.strategySummary(strategyId, mode, tz),
    queryFn: () => registryApi.getStrategySummary(strategyId, mode, tz),
    refetchInterval: POLL.summary,
    placeholderData: keepPreviousData,
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
export function usePnlSeries(scope: LedgerScope | null, start: string | undefined, live: boolean, listingId?: number) {
  const client = useQueryClient();
  const key = [...keys.series(scope ?? { sessionId: '' }, start), listingId] as const;
  return useQuery({
    queryKey: key,
    enabled: scope !== null,
    queryFn: async () => {
      const previous = client.getQueryData<PnlSeries>(key);
      if (!previous || previous.t.length === 0) {
        return registryApi.getPnlSeries(scope as LedgerScope, { start, listingId });
      }
      const tail = await registryApi.getPnlSeries(scope as LedgerScope, {
        start, listingId, resolution: previous.resolutionMs, since: previous.t[previous.t.length - 1],
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

export function isLive(session: StrategySession | null | undefined): boolean {
  return !!session && isActiveSession(session.status);
}
