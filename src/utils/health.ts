import { SessionHealth } from '../types';
import { formatDuration } from './format';

// A hot-path agent loops continuously; one that hasn't advanced for this long is stuck. Background agents block on
// network calls for seconds at a time, so only an exited one counts against them.
export const HOT_PATH_STALL_MS = 2_000;
// Each resync drops the feed's connection, and enough gateway errors in a minute end the session.
export const BOOK_RESYNCS_PER_5M = 3;

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
  return problems;
}

