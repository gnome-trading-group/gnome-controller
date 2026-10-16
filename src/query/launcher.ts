import { keepPreviousData, useInfiniteQuery, useQueries, useQuery } from '@tanstack/react-query';
import { LaunchRule, RuleType } from '../types/launcher';
import { editable, lostInRule } from '../utils/rule-form';
import { describePath } from '../utils/round-trip';
import { launcherApi, RequestFilters } from '../utils/api';
import { isMoving } from '../utils/launch-status';

// The launcher acts within seconds of a trigger, and a request's session is followed by its sweeper every five
// minutes; these intervals keep the pages close to both without hammering the API.
export const LAUNCHER_POLL = { lists: 15_000, request: 5_000, stats: 30_000 };
const PAGE = 50;

export const launcherKeys = {
  all: ['launcher'] as const,
  ruleTypes: ['launcher', 'ruleTypes'] as const,
  rules: ['launcher', 'rules'] as const,
  rule: (id: string) => ['launcher', 'rule', id] as const,
  stats: (id: string, days: number) => ['launcher', 'stats', id, days] as const,
  revisions: (id: string) => ['launcher', 'revisions', id] as const,
  activity: (id: string) => ['launcher', 'activity', id] as const,
  requests: (filters: RequestFilters) => ['launcher', 'requests', filters] as const,
  request: (id: string) => ['launcher', 'request', id] as const,
  triggers: (ruleType: string | undefined) => ['launcher', 'triggers', ruleType] as const,
  validation: (id: string, revision: number) => ['launcher', 'validation', id, revision] as const,
};

export function useRuleTypes() {
  return useQuery({ queryKey: launcherKeys.ruleTypes, queryFn: launcherApi.getRuleTypes, staleTime: 10 * 60_000 });
}

export function useRules() {
  return useQuery({ queryKey: launcherKeys.rules, queryFn: launcherApi.listRules, refetchInterval: LAUNCHER_POLL.lists });
}

export function useRule(ruleId: string) {
  return useQuery({ queryKey: launcherKeys.rule(ruleId), queryFn: () => launcherApi.getRule(ruleId), refetchInterval: LAUNCHER_POLL.lists });
}

export function useRuleStats(ruleId: string, days: number, enabled = true) {
  return useQuery({
    queryKey: launcherKeys.stats(ruleId, days),
    queryFn: () => launcherApi.ruleStats(ruleId, days),
    enabled,
    refetchInterval: LAUNCHER_POLL.stats,
    placeholderData: keepPreviousData,
  });
}

export function useRuleRevisions(ruleId: string, enabled: boolean) {
  return useQuery({ queryKey: launcherKeys.revisions(ruleId), queryFn: () => launcherApi.ruleRevisions(ruleId), enabled });
}

// Newest first; each further page continues from the oldest item already loaded.
export function useRuleActivity(ruleId: string, enabled: boolean) {
  return useInfiniteQuery({
    queryKey: launcherKeys.activity(ruleId),
    queryFn: ({ pageParam }) => launcherApi.ruleActivity(ruleId, { before: pageParam, limit: PAGE }),
    initialPageParam: undefined as string | undefined,
    getNextPageParam: page => page.next_before ?? undefined,
    select: data => data.pages.flatMap(p => p.items),
    enabled,
    refetchInterval: LAUNCHER_POLL.lists,
  });
}

export function useRequests(filters: RequestFilters, enabled = true) {
  return useInfiniteQuery({
    queryKey: launcherKeys.requests(filters),
    queryFn: ({ pageParam }) => launcherApi.listRequests({ ...filters, before: pageParam, limit: filters.limit ?? PAGE }),
    initialPageParam: undefined as string | undefined,
    getNextPageParam: page => page.next_before ?? undefined,
    select: data => data.pages.flatMap(p => p.items),
    enabled,
    refetchInterval: LAUNCHER_POLL.lists,
    placeholderData: keepPreviousData,
  });
}

export function useRequest(requestId: string) {
  return useQuery({
    queryKey: launcherKeys.request(requestId),
    queryFn: () => launcherApi.getRequest(requestId),
    refetchInterval: query => (!query.state.data || isMoving(query.state.data) ? LAUNCHER_POLL.request : LAUNCHER_POLL.lists),
  });
}

export function useTriggers(ruleType: string | undefined, enabled: boolean) {
  return useInfiniteQuery({
    queryKey: launcherKeys.triggers(ruleType),
    queryFn: ({ pageParam }) => launcherApi.listTriggers({ rule_type: ruleType, before: pageParam, limit: PAGE }),
    initialPageParam: undefined as string | undefined,
    getNextPageParam: page => page.next_before ?? undefined,
    select: data => data.pages.flatMap(p => p.items),
    enabled,
    refetchInterval: LAUNCHER_POLL.lists,
  });
}

/**
 * Why each rule needs attention, if it does: what the current launcher would refuse in it, and what it holds that the
 * rule editor can't (a format the rule predates). Archived rules never launch, so they aren't checked.
 */
export function useRuleAttention(rules: LaunchRule[], ruleTypes: RuleType[] | undefined): Record<string, string[]> {
  const live = rules.filter(r => r.status !== 'archived');
  const results = useQueries({
    queries: live.map(r => ({
      queryKey: launcherKeys.validation(r.rule_id, r.revision),
      queryFn: () => launcherApi.validateRule(editable(r)),
      staleTime: 10 * 60_000,
    })),
  });
  return Object.fromEntries(live.map((r, i) => {
    const reasons = [...(results[i]?.data?.problems ?? [])];
    if (ruleTypes) {
      const lost = lostInRule(r, ruleTypes);
      if (lost.length) reasons.push(`The editor can't hold: ${lost.map(l => describePath(l.path)).join(', ')}`);
    }
    return [r.rule_id, reasons];
  }));
}
