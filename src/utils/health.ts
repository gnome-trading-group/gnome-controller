import { SessionHealth } from '../types';
import { formatDuration } from './format';
import { formatBytes } from './system';

// A hot-path agent loops continuously; one that hasn't advanced for this long is stuck. Background agents block on
// network calls for seconds at a time, so only an exited one counts against them.
export const HOT_PATH_STALL_MS = 2_000;
// Each resync drops the feed's connection, and enough gateway errors in a minute end the session.
export const BOOK_RESYNCS_PER_5M = 3;
// The registry's host and journal limits (gnome-registry monitoring/rules/thresholds.ts). Its alerts wait for a
// condition to last; this shows it at once, as it does a stalled agent.
export const HOST_CPU_BUSY_PERMILLE = 900;
export const HOST_CPU_STEAL_PERMILLE = 200;
export const HOST_MEM_AVAILABLE_MIN_PERCENT = 10;
export const DISK_FREE_MIN_BYTES = 1024 ** 3;
export const DISK_FREE_MIN_SEGMENTS = 2;
export const JOURNAL_BACKLOG_SEGMENTS = 3;
export const JOURNAL_BACKLOG_AGE_MS = 5 * 60_000;

export interface HealthProblem {
  part: string;
  detail: string;
}

export function healthProblems(health: SessionHealth | null): HealthProblem[] {
  if (!health) return [];
  const problems: HealthProblem[] = [];
  for (const agent of health.agents) {
    if (agent.exited) problems.push({ part: agent.name, detail: 'exited' });
    else if (agent.hotPath && agent.stalledMs >= HOT_PATH_STALL_MS) {
      problems.push({ part: agent.name, detail: `stalled ${formatDuration(agent.stalledMs)}` });
    }
  }
  for (const gateway of health.gateways) {
    if (gateway.reconnecting) problems.push({ part: gateway.name, detail: 'reconnecting' });
    if ((gateway.resyncsLast5m ?? 0) >= BOOK_RESYNCS_PER_5M) {
      problems.push({ part: gateway.name, detail: `book resynced ${gateway.resyncsLast5m}x in 5m` });
    }
  }
  if (health.risk?.unguarded) problems.push({ part: 'Risk', detail: 'missing required policies: every order refused' });
  else if (health.risk?.stale) problems.push({ part: 'Risk', detail: 'stale: new orders refused' });
  if (health.risk && health.risk.unbuildablePolicies > 0) {
    problems.push({ part: 'Risk', detail: `${health.risk.unbuildablePolicies} policies can't be applied` });
  }
  if (health.risk && health.risk.droppedLatches > 0) {
    problems.push({ part: 'Risk', detail: `${health.risk.droppedLatches} halts never recorded` });
  }
  for (const limiter of health.rateLimit ?? []) {
    if (limiter.throttling) problems.push({ part: limiter.account, detail: 'rate limited' });
  }
  if (health.ledger?.fenced) problems.push({ part: 'Ledger', detail: 'fenced: writes refused' });
  else if (health.ledger && health.ledger.consecutiveFailures > 0) {
    problems.push({ part: 'Ledger', detail: `${health.ledger.consecutiveFailures} failed writes` });
  }
  for (const listing of health.listings) {
    if ((listing.marketDataBadMs ?? 0) > 0) {
      problems.push({ part: `Listing ${listing.listingId}`, detail: `book bad data ${formatDuration(listing.marketDataBadMs!)} (orders refused)` });
    }
  }
  problems.push(...hostProblems(health));
  return problems;
}

/** A permille reading as a percent, or 'n/a' for one the host couldn't give. */
export function formatPermille(permille: number): string {
  return permille < 0 ? 'n/a' : `${Math.round(permille / 10)}%`;
}

function hostProblems(health: SessionHealth): HealthProblem[] {
  const problems: HealthProblem[] = [];
  const { host, journal } = health;
  if (host && (host.cpuBusyPermille >= HOST_CPU_BUSY_PERMILLE || host.cpuStealPermille >= HOST_CPU_STEAL_PERMILLE)) {
    const steal = host.cpuStealPermille > 0 ? `, ${formatPermille(host.cpuStealPermille)} stolen` : '';
    problems.push({ part: 'CPU', detail: `${formatPermille(host.cpuBusyPermille)} busy${steal}` });
  }
  if (host && host.memAvailableBytes >= 0 && host.memTotalBytes > 0
      && host.memAvailableBytes * 100 < host.memTotalBytes * HOST_MEM_AVAILABLE_MIN_PERCENT) {
    problems.push({ part: 'Memory', detail: `${formatBytes(host.memAvailableBytes)} available` });
  }
  const diskMin = Math.max(DISK_FREE_MIN_BYTES, (journal?.segmentBytes ?? 0) * DISK_FREE_MIN_SEGMENTS);
  if (host && host.diskFreeBytes >= 0 && host.diskFreeBytes < diskMin) {
    problems.push({ part: 'Disk', detail: `${formatBytes(host.diskFreeBytes)} free` });
  }
  if (journal && (journal.pendingSegments >= JOURNAL_BACKLOG_SEGMENTS || journal.oldestPendingMs >= JOURNAL_BACKLOG_AGE_MS)) {
    problems.push({
      part: 'Journal',
      detail: `${journal.pendingSegments} segments not shipped, oldest ${formatDuration(journal.oldestPendingMs)}`,
    });
  }
  return problems;
}

