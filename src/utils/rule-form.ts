import { Overrides, toOverrides } from './orchestrator-overrides';
import {
  ArgRow, argsToRows, defaultLaunchSettings, LaunchSettings, launchSettingsFrom, launchSettingsToParams, rowsToArgs,
} from './launch-settings';
import { compactSimulation, SessionSimulation, toSessionSimulation } from './simulation';
import { LostField, lostFields } from './round-trip';
import { EditableRule, LaunchRule, RuleType } from '../types/launcher';

// The launch settings every rule type shares (gnome-launcher's STRATEGY_PARAMS_SCHEMA): edited with the same fields as a
// strategy's defaults and a deploy, rather than as generic schema fields.
export const SHARED_KEYS = new Set(['strategy_id', 'strategy_type', 'strategy_class', 'mode', 'research_commit',
  'instance_type', 'latency_profile', 'orchestrator_version', 'gnomepy_version', 'availability_zone', 'strategy_args',
  'simulation', 'overrides']);

// A rule's parameters as the rule editor edits them: its type's own, and the shared launch settings.
export interface RuleParamsForm {
  typeParameters: Record<string, unknown>;
  strategyId: number | null;
  launch: LaunchSettings;
  args: ArgRow[];
  overrides: Overrides;
  simulation: SessionSimulation;
}

export function ruleFormFrom(parameters: Record<string, unknown>): RuleParamsForm {
  return {
    typeParameters: Object.fromEntries(Object.entries(parameters).filter(([k]) => !SHARED_KEYS.has(k))),
    strategyId: parameters.strategy_id != null ? Number(parameters.strategy_id) : null,
    launch: { ...defaultLaunchSettings(), ...launchSettingsFrom(parameters) },
    args: argsToRows(parameters.strategy_args),
    overrides: toOverrides(parameters.overrides),
    simulation: toSessionSimulation(parameters.simulation),
  };
}

// The parameters the editor saves. A rule type whose triggers carry the whole launch (direct launch) has no shared
// settings of its own.
export function ruleParametersFrom(form: RuleParamsForm, takesLaunchSettings: boolean): Record<string, unknown> {
  const parameters: Record<string, unknown> = { ...form.typeParameters };
  if (!takesLaunchSettings) return parameters;
  if (form.strategyId != null) parameters.strategy_id = form.strategyId;
  Object.assign(parameters, launchSettingsToParams(form.launch, { region: false }));
  const args = rowsToArgs(form.args);
  if (Object.keys(args).length) parameters.strategy_args = args;
  if (Object.keys(form.overrides).length) parameters.overrides = form.overrides;
  const simulation = compactSimulation(form.simulation);
  if (form.launch.mode === 'paper' && Object.keys(simulation).length) parameters.simulation = simulation;
  return parameters;
}

/**
 * What saving this rule through the editor would lose: anything the round trip drops or changes, and parameters its
 * rule type no longer declares, which the editor has no field for.
 */
export function ruleLostFields(parameters: Record<string, unknown>, declared: string[] | undefined): LostField[] {
  const takesLaunchSettings = !!declared?.includes('strategy_id');
  let saved: Record<string, unknown>;
  try {
    saved = ruleParametersFrom(ruleFormFrom(parameters), takesLaunchSettings);
  } catch {
    return [{ path: ['strategy_args'], stored: parameters.strategy_args, saved: undefined }];
  }
  const lost = lostFields(parameters, saved);
  if (declared) {
    for (const key of Object.keys(parameters)) {
      if (!declared.includes(key) && !lost.some(l => l.path[0] === key)) {
        lost.push({ path: [key], stored: parameters[key], saved: undefined });
      }
    }
  }
  return lost;
}

// What of a rule only JSON can hold, with paths as they appear in the rule's JSON.
export function lostInRule(rule: Pick<EditableRule, 'rule_type' | 'parameters'>, ruleTypes: RuleType[]): LostField[] {
  const ruleType = ruleTypes.find(t => t.type === rule.rule_type);
  const declared = ruleType ? Object.keys(ruleType.parameter_schema.properties ?? {}) : undefined;
  return ruleLostFields(rule.parameters ?? {}, declared).map(l => ({ ...l, path: ['parameters', ...l.path] }));
}

// The fields a rule is created and edited with; the launcher keeps the rest (ids, revision, who and when) itself and
// refuses them in a rule it is asked to check or save.
export function editable(rule: LaunchRule | EditableRule): EditableRule {
  const { name, description, rule_type, status, launch_path, shutdown_path, schedule_enabled, max_concurrent_sessions,
    cooldown_minutes, dedup_window_minutes, parameters } = rule;
  return { name, description, rule_type, status, launch_path, shutdown_path, schedule_enabled, max_concurrent_sessions,
    cooldown_minutes, dedup_window_minutes, parameters };
}
