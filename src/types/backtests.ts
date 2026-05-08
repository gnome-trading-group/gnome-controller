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
  summary?: Record<string, number | string>;
  warnings?: string[];
  reportUrl?: string;
  logUrl?: string;
  batchJobId?: string;
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
  sweepParams?: Record<string, string[]>;
  researchCommit?: string;
  jobs?: BacktestJob[];
}

export interface BacktestListResponse {
  runs: BacktestRun[];
  count: number;
}
