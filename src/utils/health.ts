import { SessionHealth } from '../types';
import { formatDuration } from './format';

// A hot-path agent loops continuously; one that hasn't advanced for this long is stuck. Background agents block on
// network calls for seconds at a time, so only an exited one counts against them.
export const HOT_PATH_STALL_MS = 2_000;

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
  }
  if (health.ledger?.fenced) problems.push({ part: 'Ledger', detail: 'fenced: writes refused' });
  else if (health.ledger && health.ledger.consecutiveFailures > 0) {
    problems.push({ part: 'Ledger', detail: `${health.ledger.consecutiveFailures} failed writes` });
  }
  return problems;
}

