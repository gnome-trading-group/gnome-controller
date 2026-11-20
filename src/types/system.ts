// The System page's data (controller /system/health), one section at a time. Every section lists what the account
// actually has, discovered across its regions, plus any regions it couldn't read.

export interface RegionError {
  region: string;
  message: string;
}

interface Section {
  section: string;
  asOf: string;
  errors: RegionError[];
}

export type AlarmState = 'OK' | 'ALARM' | 'INSUFFICIENT_DATA';

export interface AlarmRow {
  name: string;
  service: string;
  state: AlarmState;
  reason: string | null;
  since: string | null;
  description: string | null;
  region: string;
  actionsEnabled: boolean;
}

export interface AlarmsSection extends Section {
  services: { name: string; firing: number; insufficient: number; total: number; alarms: AlarmRow[] }[];
}

export interface JobTarget {
  type: string;
  name: string;
  arn: string;
  input: string | null;
}

export interface JobRow {
  name: string;
  description: string | null;
  schedule: string | null;
  intervalSeconds: number | null;
  enabled: boolean;
  region: string;
  targets: JobTarget[];
  lastRun: string | null;
  lastError: string | null;
  runs24h: number | null;
  errors24h: number | null;
  overdue: boolean;
}

export interface JobsSection extends Section {
  jobs: JobRow[];
}

export interface QueueRow {
  name: string;
  url: string;
  region: string;
  deadLetter: boolean;
  visible: number;
  inFlight: number;
  oldestAgeSeconds: number | null;
}

export interface QueuesSection extends Section {
  queues: QueueRow[];
}

export interface MetricPoints {
  t: number[];
  v: number[];
}

export interface DatabaseRow {
  identifier: string;
  region: string;
  engine: string;
  instanceClass: string;
  status: string;
  multiAz: boolean;
  allocatedGiB: number;
  maxAllocatedGiB: number | null;
  storage: { usedGiB: number | null; capacityGiB: number; growthGiBPerDay: number | null; daysUntilFull: number | null };
  metrics: Record<'cpu' | 'memory' | 'connections' | 'readLatency' | 'writeLatency', MetricPoints>;
}

export interface DatabaseSection extends Section {
  databases: DatabaseRow[];
}

export interface PipelineRow {
  name: string;
  region: string;
  status: string | null;
  // The latest run; a stage whose executionId differs last ran in an earlier run.
  runId: string | null;
  startedAt: string | null;
  updatedAt: string | null;
  stages: { name: string; status: string | null; executionId: string | null }[];
  failedStage: string | null;
  // The action that failed in the failed stage, and the error CodePipeline gave for it.
  failedAction: { stage: string; action: string; message: string | null } | null;
  waitingApprovals: WaitingApproval[];
}

export interface WaitingApproval {
  stage: string;
  action: string;
  since: string | null;
  waitingSeconds: number | null;
  token: string | null;
  executionId: string | null;
  // Whether the stages before it passed in the same run, i.e. this exact change has been through them.
  earlierStagesPassed: boolean;
  revisions: Revision[];
}

export interface Revision {
  source: string | null;
  revision: string | null;
  message: string | null;
  url: string | null;
}

export interface PipelineRun {
  id: string;
  status: string | null;
  statusSummary: string | null;
  startedAt: string | null;
  updatedAt: string | null;
  durationSeconds: number | null;
  // Webhook, StartPipelineExecution, CloudWatchEvent, PutActionRevision, ...
  trigger: string | null;
  triggerDetail: string | null;
  revisions: Revision[];
}

export interface PipelineAction {
  stage: string;
  action: string;
  category: string | null;
  provider: string | null;
  status: string | null;
  startedAt: string | null;
  updatedAt: string | null;
  durationSeconds: number | null;
  summary: string | null;
  error: string | null;
  // The action's page in the AWS console (a build, a stack).
  url: string | null;
  // Set for CodeBuild actions, whose logs the page can show.
  buildId: string | null;
  stackName: string | null;
  region: string | null;
}

// One pipeline, read when it's opened on the page.
export interface PipelineDetail {
  name: string;
  region: string;
  stages: { name: string; actions: { name: string; category: string | null }[] }[];
  runs: PipelineRun[];
  // The run whose actions are listed: the one asked for, else the latest.
  runId: string | null;
  run: PipelineRun | null;
  actions: PipelineAction[];
  // Per stage, the newest run every one of its actions succeeded in, and what that run carried.
  lastSuccesses: Record<string, { runId: string; at: string | null; revisions: Revision[] }>;
  // Stages whose latest attempt failed or stopped, by that attempt's run; only these can be retried, in that run.
  retryable: Record<string, string>;
  // Only the prod controller may retry, release or stop.
  canOperate: boolean;
}

export interface BuildLogs {
  lines: { at: number; message: string }[];
  before: string | null;
  active: boolean;
  consoleUrl: string | null;
}

export type PipelineOperation =
  | { operation: 'retry'; runId: string; stage: string; mode: 'FAILED_ACTIONS' | 'ALL_ACTIONS'; reason: string }
  | { operation: 'release'; reason: string }
  | { operation: 'stop'; runId: string; abandon: boolean; reason: string };

export interface PipelinesSection extends Section {
  pipelines: PipelineRow[];
  // Only the prod controller may approve; elsewhere approvals are shown read-only.
  canApprove: boolean;
}

export interface FleetRow {
  instanceId: string;
  region: string;
  state: string;
  type: string;
  launchedAt: string | null;
  purpose: string | null;
  sessionId: string | null;
  strategyId: string | null;
  checks: string | null;
  cpuPercent: number | null;
  imageName: string | null;
  imageAgeDays: number | null;
}

export interface FleetSection extends Section {
  instances: FleetRow[];
}

// The registry database's largest tables (registry /monitoring/tables).
export interface TableSizes {
  databaseBytes: string;
  tables: { schema: string; name: string; totalBytes: string; tableBytes: string; indexBytes: string; rows: string }[];
}
