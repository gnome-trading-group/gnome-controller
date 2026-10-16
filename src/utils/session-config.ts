import { ConfigValue, StrategySession } from '../types';
import { Overrides } from './orchestrator-overrides';
import { ArgRow, argsToRows, defaultLaunchSettings, LaunchSettings, launchSettingsFrom, rowsToArgs } from './launch-settings';
import { compactSimulation, SessionSimulation, toSessionSimulation } from './simulation';
import { LostField, lostFields } from './round-trip';

// A session's config as the deploy form edits it.
export interface SessionForm {
  strategyId: string;
  inherit: boolean;
  launch: LaunchSettings;
  args: ArgRow[];
  overrides: Overrides;
  accountPins: Record<string, string>;
  listingIds: string[];
  // Without as_of: a relaunch reads the parameters recorded by then unless asked to reuse the original's.
  simulation: SessionSimulation;
  originalAsOf: string | null;
}

export function sessionConfigFrom(form: SessionForm, asOf?: string | null): Record<string, ConfigValue> {
  const { launch } = form;
  const config: Record<string, ConfigValue> = {
    'strategy.id': form.strategyId,
    mode: launch.mode,
    listings: form.listingIds.map(Number),
    'recovery.inherit': form.inherit,
  };
  if (launch.strategyType) {
    config['strategy.type'] = launch.strategyType;
    if (launch.strategyClass.trim()) config['strategy.class'] = launch.strategyClass.trim();
  }
  if (launch.researchCommit.trim()) config['research_commit'] = launch.researchCommit.trim();
  if (launch.region.trim()) config['region'] = launch.region.trim();
  config['latency.profile'] = launch.latencyProfile;
  if (launch.mode === 'live' && Object.keys(form.accountPins).length > 0) config.accounts = form.accountPins;
  for (const [property, value] of Object.entries(form.overrides)) {
    config[`overrides.${property}`] = value;
  }
  for (const [key, value] of Object.entries(rowsToArgs(form.args))) {
    config[`strategy.args.${key}`] = value;
  }
  // Each listing simulates as its exchange is recorded unless overridden; the registry pins as_of at launch.
  if (launch.mode === 'paper') {
    const simulation = compactSimulation(asOf ? { ...form.simulation, as_of: asOf } : form.simulation);
    config.simulation = simulation as unknown as ConfigValue;
  }
  return config;
}

// Relaunching reruns the exact versions the previous session ran; clearing a field takes the latest.
export function sessionFormFrom(session: StrategySession): SessionForm {
  const config = session.config;
  const pinned = config['accounts'];
  const rawListings = config['listings'];
  const { as_of: asOf, ...simulation } = toSessionSimulation(config['simulation']);
  return {
    strategyId: String(session.strategyId),
    inherit: config['recovery.inherit'] !== false && config['recovery.inherit'] !== 'false',
    launch: {
      ...defaultLaunchSettings(),
      ...launchSettingsFrom({
        mode: session.mode,
        strategyType: config['strategy.type'],
        strategyClass: config['strategy.class'],
        researchCommit: config['research_commit'],
        region: config['region'],
        latencyProfile: config['latency.profile'],
        instanceType: session.instanceType,
        orchestratorVersion: session.orchestratorVersion,
        gnomepyVersion: session.gnomepyVersion,
      }),
    },
    args: argsToRows(Object.fromEntries(Object.entries(config)
      .filter(([key]) => key.startsWith('strategy.args.'))
      .map(([key, value]) => [key.substring('strategy.args.'.length), value]))),
    overrides: Object.fromEntries(Object.entries(config)
      .filter(([k]) => k.startsWith('overrides.'))
      .map(([k, v]) => [k.slice('overrides.'.length), String(v)])),
    accountPins: pinned && typeof pinned === 'object' && !Array.isArray(pinned)
      ? Object.fromEntries(Object.entries(pinned).map(([code, label]) => [code, String(label)])) : {},
    listingIds: Array.isArray(rawListings) ? (rawListings as number[]).map(String) : [],
    simulation: session.mode === 'paper' ? simulation : {},
    originalAsOf: session.mode === 'paper' ? asOf ?? null : null,
  };
}

// Written when a session launches rather than chosen in the form: the pinned time (offered separately) and the rule
// that launched it.
const WRITTEN_AT_LAUNCH = ['simulation.as_of', 'launcher.rule.id'];

// What relaunching this session through the deploy form would lose.
export function relaunchLostFields(session: StrategySession): LostField[] {
  let saved: Record<string, ConfigValue>;
  try {
    saved = sessionConfigFrom(sessionFormFrom(session));
  } catch {
    return [{ path: ['strategy.args'], stored: undefined, saved: undefined }];
  }
  return lostFields(session.config, saved, path => WRITTEN_AT_LAUNCH.includes(path.join('.')));
}
