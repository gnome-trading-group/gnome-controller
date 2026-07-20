export enum StrategySessionStatus {
  SUBMITTED = 'SUBMITTED',
  RUNNING = 'RUNNING',
  STOPPED = 'STOPPED',
  FAILED = 'FAILED',
}

export interface StrategySession {
  sessionId: string;
  strategyId: number;
  status: StrategySessionStatus;
  mode: string;
  config: Record<string, string>;
  researchCommit: string | null;
  taskArn: string | null;
  taskDefinitionArn: string | null;
  failureReason: string | null;
  startedAt: string | null;
  stoppedAt: string | null;
  dateCreated: string;
  dateModified: string;
}

export interface CreateStrategySessionRequest {
  sessionId: string;
  strategyId: number;
  mode: string;
  config: Record<string, string>;
  researchCommit?: string;
  region?: string;
}
