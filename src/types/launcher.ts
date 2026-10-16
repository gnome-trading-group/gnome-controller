import { JsonSchema } from './jsonSchema';
import { ConfigValue } from './strategy-sessions';

// The launcher's own shapes, in its snake_case (launcherApi doesn't camelCase: rule parameters are data).

export interface RuleType {
  type: string;
  display_name: string;
  parameter_schema: JsonSchema;
  data_schema: JsonSchema;
}

export type RuleStatus = 'active' | 'disabled' | 'archived';
export type LaunchPath = 'auto' | 'approval';

export interface LaunchRule {
  rule_id: string;
  name: string;
  description: string | null;
  rule_type: string;
  status: RuleStatus;
  launch_path: LaunchPath;
  shutdown_path: LaunchPath;
  schedule_enabled: boolean;
  max_concurrent_sessions: number | null;
  cooldown_minutes: number;
  dedup_window_minutes: number;
  parameters: Record<string, unknown>;
  revision: number;
  created_by: string;
  modified_by: string;
  date_created: string;
  date_modified: string;
}

export type EditableRule = Pick<LaunchRule,
  'name' | 'description' | 'rule_type' | 'status' | 'launch_path' | 'shutdown_path' | 'schedule_enabled'
  | 'max_concurrent_sessions' | 'cooldown_minutes' | 'dedup_window_minutes' | 'parameters'>;

export interface RuleRevision {
  rule_id: string;
  revision: number;
  rule: LaunchRule;
  actor: string;
  at: string;
  changed: string[];
}

export interface RuleStats {
  days: number;
  launches: Partial<Record<RequestStatus, number>>;
  shutdowns: Partial<Record<RequestStatus, number>>;
  outcomes: Partial<Record<TriggerOutcome, number>>;
  last_launch_at: string | null;
  running_sessions: { session_id: string; status: string; mode: string; started_at: string | null }[];
}

export interface ResolvedStrategyConfig {
  strategy_id: number;
  strategy_type: string;
  strategy_class: string;
  mode: string;
  listings: number[];
  research_commit?: string | null;
  region?: string | null;
  strategy_args: Record<string, ConfigValue>;
  simulation?: Record<string, unknown>;
  instance_type?: string | null;
  latency_profile?: string | null;
  orchestrator_version?: string | null;
  gnomepy_version?: string | null;
  availability_zone?: string | null;
  overrides?: Record<string, string>;
}

export type RequestStatus =
  | 'PENDING_APPROVAL' | 'APPROVED' | 'REJECTED' | 'SCHEDULED' | 'CANCELLED' | 'LAUNCHING' | 'LAUNCHED' | 'FAILED'
  | 'PENDING_SHUTDOWN_APPROVAL' | 'SHUTDOWN_APPROVED' | 'SHUTDOWN_REJECTED' | 'STOPPING' | 'STOPPED' | 'STOP_FAILED';

export interface RequestEvent {
  at: string;
  status: RequestStatus | null;
  actor: string;
  note: string | null;
}

export interface RequestLink {
  label: string;
  url: string;
}

// Worked out by the launcher when the request was made; absent on older requests.
export interface RequestLinks {
  // The titles of the events the listings belong to; empty for listings outside any event.
  titles: string[];
  strategy: RequestLink | null;
  listings: RequestLink[];
  pages: RequestLink[];
}

export interface LaunchRequest {
  request_id: string;
  trigger_id: string | null;
  rule_revision: number | null;
  retry_of: string | null;
  action: 'launch' | 'shutdown';
  status: RequestStatus;
  rule_type: string;
  data: Record<string, unknown>;
  dedup_key: string;
  resolved_config: ResolvedStrategyConfig | Record<string, never>;
  matched_rule_id: string;
  matched_rule_name: string;
  launch_path: LaunchPath;
  slack_message_ts: string | null;
  approved_by: string | null;
  rejected_by: string | null;
  session_id: string | null;
  target_session_ids: string[] | null;
  scheduled_time: string | null;
  launch_error: string | null;
  links?: RequestLinks | null;
  events: RequestEvent[];
  session_status?: string | null;
  session_started_at?: string | null;
  session_stopped_at?: string | null;
  session_failure_reason?: string | null;
  session_stop_reason?: string | null;
  session_stopped_by?: string | null;
  date_created: string;
  date_modified: string;
}

export type TriggerOutcome =
  | 'REQUESTED' | 'DUPLICATE' | 'RATE_LIMITED' | 'NO_MATCH' | 'BLOCKED' | 'ERROR' | 'INVALID' | 'NO_RULES';

export interface TriggerEvaluation {
  trigger_id: string;
  // '-' for an outcome of the trigger as a whole (invalid, or no rule to ask).
  rule_id: string;
  rule_name: string | null;
  rule_type: string;
  action: 'launch' | 'shutdown';
  data: Record<string, unknown>;
  received_at: string;
  evaluated_at: string;
  outcome: TriggerOutcome;
  reason: string | null;
  request_id: string | null;
}

export interface LaunchRequestDetail extends LaunchRequest {
  evaluations: TriggerEvaluation[];
}

export interface Page<T> {
  items: T[];
  next_before: string | null;
}

export interface DryRunResult {
  outcome: TriggerOutcome;
  reason: string | null;
  duplicate?: boolean;
  rate_limit?: string | null;
  blocked_by?: string | null;
  resolved_config?: ResolvedStrategyConfig;
  session_config?: Record<string, ConfigValue>;
  target_session_ids?: string[];
}

export type RequestAction = 'approve' | 'reject' | 'cancel' | 'retry' | 'resend';
