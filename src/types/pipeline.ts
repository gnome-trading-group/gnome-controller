export interface PipelineDefinition {
  pipelineName: string;
  sk: string;
  description: string;
  schedule: string | null;
  scheduleEnabled: boolean;
  parameters: Record<string, unknown>;
  cpu: number;
  memory: number;
  createdAt: string;
  updatedAt: string;
}

export interface PipelineRun {
  pipelineName: string;
  sk: string;
  runId: string;
  status: 'PENDING' | 'RUNNING' | 'SUCCEEDED' | 'FAILED';
  trigger: 'scheduled' | 'manual';
  parameters: Record<string, unknown>;
  queuedAt: string;
  startedAt?: string;
  completedAt?: string;
  outputs?: Record<string, unknown>;
  errorMessage?: string;
  ecsTaskArn?: string;
}

export interface PipelineListResponse {
  pipelines: PipelineDefinition[];
  count: number;
}

export interface PipelineDetailResponse {
  pipeline: PipelineDefinition;
  runs: PipelineRun[];
}
