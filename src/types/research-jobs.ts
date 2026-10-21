export type ResearchJobStatus =
  | 'SUBMITTED'
  | 'RUNNING'
  | 'COMPLETED'
  | 'PARTIALLY_FAILED'
  | 'FAILED'
  | 'CANCELLED';

export type ResearchTaskStatus = 'SUBMITTED' | 'PENDING' | 'RUNNING' | 'SUCCEEDED' | 'FAILED';

export interface ResearchTask {
  arrayIndex: number;
  status: ResearchTaskStatus;
  args: string[];
  batchJobId?: string;
  attemptCount?: number;
  exitCode?: number;
  statusReason?: string;
  startedAt?: number;
  stoppedAt?: number;
  outputPrefix: string;
  logS3Uri: string;
  s3ConsoleUrl: string;
  logUrl?: string;
}

export interface ResearchJob {
  runId: string;
  status: ResearchJobStatus;
  submittedAt: string;
  submittedBy: string;
  module: string;
  researchCommit: string;
  researchRef?: string;
  description?: string;
  taskCount: number;
  succeededCount: number;
  failedCount: number;
  cpu?: number;
  memoryGib?: number;
  // Input name -> sha256 of its uploaded set (research-jobs/inputs/<sha256>/).
  inputs?: Record<string, string>;
  batchJobId?: string;
  outputPrefix: string;
  s3ConsoleUrl?: string;
  error?: string;
  tasks?: ResearchTask[];
}
