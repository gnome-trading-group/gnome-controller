export interface JsonSchemaProperty {
  type: string;
  enum?: string[];
  items?: { type: string };
  additionalProperties?: { type: string };
  default?: unknown;
  description?: string;
}

export interface JsonSchema {
  type: string;
  properties?: Record<string, JsonSchemaProperty>;
  required?: string[];
}

export interface RuleType {
  type: string;
  display_name: string;
  parameter_schema: JsonSchema;
  data_schema: JsonSchema;
}

export interface LaunchRule {
  rule_id: string;
  name: string;
  description?: string;
  rule_type: string;
  status: 'active' | 'disabled';
  launch_path: 'auto' | 'approval';
  max_concurrent_sessions?: number;
  cooldown_minutes: number;
  dedup_window_minutes: number;
  parameters: Record<string, unknown>;
  date_created: string;
  date_modified: string;
}

export interface ResolvedStrategyConfig {
  strategy_id: number;
  strategy_type: string;
  strategy_class: string;
  mode: string;
  listings: string;
  research_commit?: string;
  region?: string;
  strategy_args: Record<string, string>;
  simulation_config: Record<string, string>;
}

export interface LaunchRequest {
  request_id: string;
  status: 'PENDING_APPROVAL' | 'APPROVED' | 'REJECTED' | 'LAUNCHING' | 'LAUNCHED' | 'FAILED';
  rule_type: string;
  data: Record<string, unknown>;
  dedup_key: string;
  resolved_config: ResolvedStrategyConfig;
  matched_rule_id: string;
  matched_rule_name: string;
  launch_path: 'auto' | 'approval';
  slack_message_ts?: string;
  slack_channel?: string;
  approved_by?: string;
  rejected_by?: string;
  session_id?: string;
  launch_error?: string;
  date_created: string;
  date_modified: string;
}
