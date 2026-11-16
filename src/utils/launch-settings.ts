import { ConfigValue } from '../types';
import { AUTO_INSTANCE_TYPE, DEFAULT_TIER, profileForTier, Tier, tierFrom } from './sizing';

// How a session is started, wherever it is chosen: a strategy's saved defaults, a deploy, a launch rule. One shape
// so every form edits it with the same fields (components/launch/LaunchSettingsFields).
export interface LaunchSettings {
  mode: string;
  strategyType: string | null;
  strategyClass: string;
  region: string;
  availabilityZone: string;
  tier: Tier;
  // Unchosen, the tier is left to the registry's default and the instance type (AUTO_INSTANCE_TYPE) to the registry's
  // sizing for the tier and the session's listings; once chosen, each sticks.
  tierChosen: boolean;
  instanceType: string;
  instanceTypeChosen: boolean;
  // The commit the session runs, by language: gnomepy-research for python, gnome-strategies for java. It also pins
  // the orchestrator and gnomepy releases, which the registry reads from it at launch.
  researchCommit: string;
  strategyCommit: string;
}

export function defaultLaunchSettings(): LaunchSettings {
  return {
    mode: 'paper', strategyType: null, strategyClass: '', region: '', availabilityZone: '',
    tier: DEFAULT_TIER, tierChosen: false,
    instanceType: AUTO_INSTANCE_TYPE, instanceTypeChosen: false,
    researchCommit: '', strategyCommit: '',
  };
}

function str(v: unknown): string {
  return v === undefined || v === null ? '' : String(v);
}

// Saved settings, keyed camelCase (a registry strategy's parameters) or snake_case (a launch rule's parameters).
// Only what is set is returned, so it can be laid over defaults or over what a form already holds.
export function launchSettingsFrom(raw: Record<string, unknown>): Partial<LaunchSettings> {
  const get = (camel: string, snake: string) => raw[camel] ?? raw[snake];
  const out: Partial<LaunchSettings> = {};
  const set = <K extends keyof LaunchSettings>(key: K, value: LaunchSettings[K] | undefined) => {
    if (value !== undefined && value !== '') out[key] = value;
  };
  set('mode', str(get('mode', 'mode')) || undefined);
  set('strategyType', str(get('strategyType', 'strategy_type')) || undefined);
  set('strategyClass', str(get('strategyClass', 'strategy_class')));
  set('region', str(get('region', 'region')));
  set('availabilityZone', str(get('availabilityZone', 'availability_zone')));
  set('researchCommit', str(get('researchCommit', 'research_commit')));
  set('strategyCommit', str(get('strategyCommit', 'strategy_commit')));
  // A tier, or the latency profile settings saved before tiers held (standard or low_latency, the same names).
  const tier = tierFrom(get('sizingTier', 'sizing_tier')) ?? tierFrom(get('latencyProfile', 'latency_profile'));
  if (tier) {
    out.tier = tier;
    out.tierChosen = true;
  }
  const instanceType = str(get('instanceType', 'instance_type'));
  if (instanceType) {
    out.instanceType = instanceType;
    out.instanceTypeChosen = true;
  }
  return out;
}

// The settings as a launch rule's (or a strategy's) snake_case parameters. An unchosen tier and an automatic instance
// type are left out, so the registry sizes each session from its own listings when it launches.
export function launchSettingsToParams(s: LaunchSettings, opts: { region?: boolean } = {}): Record<string, ConfigValue> {
  const out: Record<string, ConfigValue> = { mode: s.mode, strategy_class: s.strategyClass.trim() };
  if (s.instanceType !== AUTO_INSTANCE_TYPE) out.instance_type = s.instanceType;
  if (s.strategyType) out.strategy_type = s.strategyType;
  // The profile with the tier: it is what rules saved before tiers carry, and what a launcher that predates tiers reads.
  if (s.tierChosen) {
    out.sizing_tier = s.tier;
    out.latency_profile = profileForTier(s.tier);
  }
  if (opts.region !== false && s.region.trim()) out.region = s.region.trim();
  if (s.availabilityZone.trim()) out.availability_zone = s.availabilityZone.trim();
  const commit = launchCommit(s);
  if (commit) out[commit.key] = commit.value;
  return out;
}

// Only the commit of the session's own language: the other names code it never runs.
export function launchCommit(s: LaunchSettings): { key: 'research_commit' | 'strategy_commit'; value: string } | null {
  const value = (s.strategyType === 'python' ? s.researchCommit : s.strategyType === 'java' ? s.strategyCommit : '').trim();
  if (!value) return null;
  return { key: s.strategyType === 'python' ? 'research_commit' : 'strategy_commit', value };
}

export type ArgType = 'string' | 'number' | 'boolean' | 'json';

export interface ArgRow {
  key: string;
  value: string | number | boolean;
  type: ArgType;
}

export function argsToRows(args: unknown): ArgRow[] {
  if (!args || typeof args !== 'object') return [];
  return Object.entries(args as Record<string, unknown>).map(([key, value]) => {
    if (typeof value === 'number') return { key, value, type: 'number' };
    if (typeof value === 'boolean') return { key, value, type: 'boolean' };
    if (typeof value === 'object' && value !== null) return { key, value: JSON.stringify(value, null, 2), type: 'json' };
    return { key, value: String(value ?? ''), type: 'string' };
  });
}

// Throws naming the arg whose JSON doesn't parse, so a form can say which one.
export function rowsToArgs(rows: ArgRow[]): Record<string, ConfigValue> {
  const out: Record<string, ConfigValue> = {};
  for (const { key, value, type } of rows) {
    if (!key.trim()) continue;
    if (type === 'json') {
      try {
        out[key.trim()] = JSON.parse(value as string);
      } catch {
        throw new Error(`Strategy arg "${key.trim()}" is not valid JSON`);
      }
    } else {
      out[key.trim()] = value;
    }
  }
  return out;
}
