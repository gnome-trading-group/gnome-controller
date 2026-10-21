import { ResearchJobStatus, ResearchTaskStatus } from '../../../types/research-jobs';

export const RUN_STATUS_COLORS: Record<ResearchJobStatus, string> = {
  SUBMITTED: 'blue',
  RUNNING: 'yellow',
  COMPLETED: 'green',
  PARTIALLY_FAILED: 'orange',
  FAILED: 'red',
  CANCELLED: 'gray',
};

export const TASK_STATUS_COLORS: Record<ResearchTaskStatus, string> = {
  SUBMITTED: 'blue',
  PENDING: 'gray',
  RUNNING: 'yellow',
  SUCCEEDED: 'green',
  FAILED: 'red',
};
