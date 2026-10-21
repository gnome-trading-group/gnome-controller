import { BacktestStatus, JobStatus } from '../../types/backtests';
import { ResearchJobStatus, ResearchTaskStatus } from '../../types/research-jobs';

// Research jobs and backtests are both runs of AWS Batch tasks; their statuses differ only in backtests' PENDING.
export type BatchRunStatus = ResearchJobStatus | BacktestStatus;
export type BatchTaskStatus = ResearchTaskStatus | JobStatus;

export const RUN_STATUS_COLORS: Record<BatchRunStatus, string> = {
  SUBMITTED: 'blue',
  PENDING: 'gray',
  RUNNING: 'yellow',
  COMPLETED: 'green',
  PARTIALLY_FAILED: 'orange',
  FAILED: 'red',
  CANCELLED: 'gray',
};

export const TASK_STATUS_COLORS: Record<BatchTaskStatus, string> = {
  SUBMITTED: 'blue',
  PENDING: 'gray',
  RUNNING: 'yellow',
  SUCCEEDED: 'green',
  FAILED: 'red',
};

const ACTIVE_RUN = new Set<BatchRunStatus>(['SUBMITTED', 'PENDING', 'RUNNING']);
const FINISHED_TASK = new Set<BatchTaskStatus>(['SUCCEEDED', 'FAILED']);

export function isRunActive(status: BatchRunStatus): boolean {
  return ACTIVE_RUN.has(status);
}

export function isTaskFinished(status: BatchTaskStatus): boolean {
  return FINISHED_TASK.has(status);
}

export type TaskFilter = 'all' | 'failed' | 'running' | 'waiting' | 'succeeded';

export function taskMatches(filter: TaskFilter, status: BatchTaskStatus): boolean {
  switch (filter) {
    case 'all': return true;
    case 'failed': return status === 'FAILED';
    case 'running': return status === 'RUNNING';
    case 'waiting': return status === 'SUBMITTED' || status === 'PENDING';
    case 'succeeded': return status === 'SUCCEEDED';
  }
}

export type RunFilter = 'all' | 'active' | 'COMPLETED' | 'PARTIALLY_FAILED' | 'FAILED' | 'CANCELLED';

export function runMatches(filter: RunFilter, status: BatchRunStatus): boolean {
  if (filter === 'all') return true;
  if (filter === 'active') return isRunActive(status);
  return status === filter;
}

// A run in progress counts up to now; one recorded before run times were kept has none.
export function runElapsedMs(run: { startedAt?: string; finishedAt?: string }, now = Date.now()): number | null {
  if (!run.startedAt) return null;
  return (run.finishedAt ? new Date(run.finishedAt).getTime() : now) - new Date(run.startedAt).getTime();
}

export function taskElapsedMs(task: { startedAt?: number; stoppedAt?: number }, now = Date.now()): number | null {
  if (!task.startedAt) return null;
  return (task.stoppedAt ?? now) - task.startedAt;
}
