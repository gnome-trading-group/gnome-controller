export type BacktestStatus =
  | 'SUBMITTED'
  | 'PENDING'
  | 'RUNNING'
  | 'COMPLETED'
  | 'PARTIALLY_FAILED'
  | 'FAILED'
  | 'CANCELLED';

export type JobStatus = 'PENDING' | 'RUNNING' | 'SUCCEEDED' | 'FAILED';

export interface BacktestJob {
  runId: string;
  sk: string;
  arrayIndex: number;
  status: JobStatus;
  submittedAt: string;
  configParams: Record<string, string>;
  finalPnl?: number;
  sharpe?: number;
  reportUrl?: string;
  batchChildJobId?: string;
}

export interface BacktestRun {
  runId: string;
  sk: string;
  status: BacktestStatus;
  submittedAt: string;
  submittedBy: string;
  strategy: string;
  jobCount: number;
  completedCount: number;
  failedCount: number;
  batchJobId?: string;
  sweepParams?: Record<string, string[]>;
  researchCommit?: string;
  jobs?: BacktestJob[];
}

export interface BacktestListResponse {
  runs: BacktestRun[];
  count: number;
}
