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
  revisions: { source: string | null; revision: string | null; message: string | null; url: string | null }[];
}

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
