import { SessionHealth } from './pnl';

export type ConfigValue = string | number | boolean | Record<string, unknown> | unknown[];

export enum StrategySessionStatus {
  SUBMITTED = 'SUBMITTED',
  STARTING = 'STARTING',
  RUNNING = 'RUNNING',
  STOPPING = 'STOPPING',
  STOPPED = 'STOPPED',
  FAILED = 'FAILED',
}

export interface StrategySession {
  sessionId: string;
  strategyId: number;
  status: StrategySessionStatus;
  mode: string;
  config: Record<string, ConfigValue>;
  researchCommit: string | null;
  instanceId: string | null;
  instanceType: string | null;
  launchRegion: string | null;
  availabilityZone: string | null;
  orchestratorVersion: string | null;
  gnomepyVersion: string | null;
  failureReason: string | null;
  // The session's latest heartbeat and the health it reported; null until its process first reports.
  lastHeartbeatAt: string | null;
  health: SessionHealth | null;
  startedAt: string | null;
  stoppedAt: string | null;
  dateCreated: string;
  dateModified: string;
}

export interface CreateStrategySessionRequest {
  sessionId: string;
  strategyId: number;
  mode: string;
  config: Record<string, ConfigValue>;
  researchCommit?: string;
  region?: string;
  availabilityZone?: string;
  instanceType: string;
  // Blank means the latest release; the launcher records the exact version it resolved.
  orchestratorVersion?: string;
  gnomepyVersion?: string;
}

// A session holds its strategy's slot from the moment it is requested until its stop finishes, so it can be listed,
// and its stop retried, while STOPPING. Whether its risk policies still matter is a separate question; see
// isActiveSessionStatus in utils/policy-target.
export const ACTIVE_SESSION_STATUSES: StrategySessionStatus[] = [
  StrategySessionStatus.SUBMITTED,
  StrategySessionStatus.STARTING,
  StrategySessionStatus.RUNNING,
  StrategySessionStatus.STOPPING,
];

export function isActiveSession(status: StrategySessionStatus): boolean {
  return ACTIVE_SESSION_STATUSES.includes(status);
}
