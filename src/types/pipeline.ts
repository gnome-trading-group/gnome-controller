import { JsonSchema } from './jsonSchema';

// A pipeline, its parameters and its schedules are declared in gnome-pipelines' code; only runs and whether a
// schedule is on change here.

export interface PipelineSchedule {
  name: string;
  expression: string;
  description: string;
  params: Record<string, unknown>;
  enabled: boolean;
  synced: boolean;
  // When a switched-on cron schedule fires next; null when it's off (or a rate(...) expression).
  nextRun: string | null;
}

export type RunStatus = 'PENDING' | 'RUNNING' | 'SUCCEEDED' | 'FAILED' | 'CANCELLED';

export interface PipelineRun {
  pipelineName: string;
  runId: string;
  status: RunStatus;
  trigger: 'scheduled' | 'manual';
  schedule?: string;
  parameters: Record<string, unknown>;
  queuedAt: string;
  startedAt?: string;
  completedAt?: string;
  codeVersion?: string;
  outputs?: Record<string, unknown>;
  errorMessage?: string;
  ecsTaskArn?: string;
}

export interface Pipeline {
  name: string;
  description: string;
  paramsSchema: JsonSchema;
  resources: { cpu: number; memory: number };
  schedules: PipelineSchedule[];
  codeVersion: string;
  lastRun?: PipelineRun | null;
}

export interface PipelineListResponse {
  pipelines: Pipeline[];
  count: number;
}

export interface PipelineDetailResponse {
  pipeline: Pipeline;
  runs: PipelineRun[];
}

export interface RunLogLine {
  at: number;
  message: string;
}

export interface RunLogsResponse {
  lines: RunLogLine[];
  before: string | null;
}
