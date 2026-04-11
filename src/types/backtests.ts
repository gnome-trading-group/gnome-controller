export type BacktestStatus =
  | 'SUBMITTED'
  | 'PENDING'
  | 'RUNNABLE'
  | 'STARTING'
  | 'RUNNING'
  | 'SUCCEEDED'
  | 'FAILED';

export interface BacktestJob {
  jobId: string;
  batchJobId: string;
  status: BacktestStatus;
  presetId: string;
  presetName: string;
  researchCommit: string;
  submittedBy: string;
  submittedAt: string;
  completedAt?: string;
  updatedAt?: string;
  error?: string;
  reportUrl?: string;
}

export interface BacktestPreset {
  presetId: string;
  name: string;
  description: string;
  config: string;
  createdBy: string;
  createdAt: string;
  updatedAt: string;
}

export interface SubmitBacktestRequest {
  presetId?: string;
  config?: string;
  researchCommit?: string;
}

export interface SubmitBacktestResponse {
  jobId: string;
}

export interface ListBacktestsResponse {
  jobs: BacktestJob[];
}

export interface ListPresetsResponse {
  presets: BacktestPreset[];
}

export interface CreatePresetRequest {
  name: string;
  description?: string;
  config: string;
}

export interface UpdatePresetRequest {
  name?: string;
  description?: string;
  config?: string;
}
