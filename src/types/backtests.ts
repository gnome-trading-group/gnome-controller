export type BacktestStatus =
  | 'SUBMITTED'
  | 'PENDING'
  | 'RUNNING'
  | 'COMPLETED'
  | 'PARTIALLY_FAILED'
  | 'FAILED'
  | 'CANCELLED';

export type JobStatus = 'SUBMITTED' | 'PENDING' | 'RUNNING' | 'SUCCEEDED' | 'FAILED';

export interface BacktestJob {
  runId: string;
  sk: string;
  arrayIndex: number;
  status: JobStatus;
  submittedAt: string;
  configParams: Record<string, string>;
  scenario?: string;
  finalPnl?: number;
  sharpe?: number;
  summary?: Record<string, number | string>;
  warnings?: string[];
  reportUrl?: string;
  logUrl?: string;
  batchJobId?: string;
  // Batch's epoch milliseconds.
  startedAt?: number;
  stoppedAt?: number;
  attemptCount?: number;
  exitCode?: number;
  statusReason?: string;
}

export interface BacktestRun {
  runId: string;
  sk: string;
  status: BacktestStatus;
  submittedAt: string;
  submittedBy: string;
  startedAt?: string;
  finishedAt?: string;
  strategy: string;
  jobCount: number;
  completedCount: number;
  failedCount: number;
  sweepParams?: Record<string, string[]>;
  scenarios?: string[];
  researchCommit?: string;
  configYaml?: string;
  jobs?: BacktestJob[];
}

export interface BacktestListResponse {
  runs: BacktestRun[];
  count: number;
}
