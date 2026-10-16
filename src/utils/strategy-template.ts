import { Overrides, toOverrides } from './orchestrator-overrides';
import {
  ArgRow, argsToRows, defaultLaunchSettings, LaunchSettings, launchSettingsFrom, launchSettingsToParams, rowsToArgs,
} from './launch-settings';
import { compactSimulation, SessionSimulation, toSessionSimulation } from './simulation';
import { LostField, lostFields } from './round-trip';

// A strategy's saved launch defaults (its `parameters`), as the strategy form edits them.
export interface TemplateForm {
  launch: LaunchSettings;
  args: ArgRow[];
  overrides: Overrides;
  simulation: SessionSimulation;
  listingIds: string[];
}

export function defaultTemplateLaunch(): LaunchSettings {
  return { ...defaultLaunchSettings(), strategyType: 'java' };
}

export function templateFormFrom(params: Record<string, unknown>): TemplateForm {
  return {
    launch: { ...defaultTemplateLaunch(), ...launchSettingsFrom(params) },
    args: argsToRows(params.args),
    overrides: toOverrides(params.overrides),
    simulation: toSessionSimulation(params.simulation),
    listingIds: Array.isArray(params.listings) ? (params.listings as number[]).map(String) : [],
  };
}

// The parameters the form saves. Simulation applies to paper only, so a live template carries none.
export function templateParamsFrom(form: TemplateForm): Record<string, unknown> {
  const parameters: Record<string, unknown> = launchSettingsToParams(form.launch);
  if (form.listingIds.length > 0) parameters.listings = form.listingIds.map(Number);
  const args = rowsToArgs(form.args);
  if (Object.keys(args).length > 0) parameters.args = args;
  if (Object.keys(form.overrides).length > 0) parameters.overrides = form.overrides;
  if (form.launch.mode === 'paper') {
    const simulation = compactSimulation(form.simulation);
    if (Object.keys(simulation).length > 0) parameters.simulation = simulation;
  }
  return parameters;
}

// The registry returns a template's top-level keys camelCased and saves what it is sent, so they compare by name.
function camelKeys(obj: Record<string, unknown>): Record<string, unknown> {
  return Object.fromEntries(Object.entries(obj).map(([k, v]) => [k.replace(/_([a-z])/g, (_, c: string) => c.toUpperCase()), v]));
}

// What saving this template through the strategy form would lose.
export function templateLostFields(params: Record<string, unknown>): LostField[] {
  let saved: Record<string, unknown>;
  try {
    saved = templateParamsFrom(templateFormFrom(params));
  } catch {
    return [{ path: ['args'], stored: params.args, saved: undefined }];
  }
  // Reported under the template's own key names.
  const original = Object.fromEntries(Object.keys(params).map(k => [Object.keys(camelKeys({ [k]: 0 }))[0], k]));
  return lostFields(camelKeys(params), camelKeys(saved)).map(l => ({ ...l, path: [original[l.path[0]] ?? l.path[0], ...l.path.slice(1)] }));
}

type Entered = Pick<TemplateForm, 'args' | 'overrides' | 'simulation'>;

function mergeBlocks<T extends object>(under: Record<string, T> | undefined, over: Record<string, T> | undefined) {
  const out: Record<string, T> = { ...under };
  for (const [key, blocks] of Object.entries(over ?? {})) out[key] = { ...out[key], ...blocks };
  return out;
}

/**
 * A strategy's saved args, orchestrator overrides and simulation filled in underneath what a form already holds:
 * picking a strategy never discards what was typed. Args and overrides merge by key, simulation by exchange or listing
 * and then by block, what was entered winning each time. A form's launch settings (class, compute, versions) are the
 * strategy's, so callers take those from the template as they are.
 */
export function fillFromTemplate(entered: Entered, template: Entered): Entered {
  const typed = new Set(entered.args.filter(a => a.key.trim()).map(a => a.key.trim()));
  const args = [...template.args.filter(a => !typed.has(a.key)), ...entered.args.filter(a => a.key.trim())];
  const simulation = {
    ...(template.simulation.seed !== undefined ? { seed: template.simulation.seed } : {}),
    ...(entered.simulation.seed !== undefined ? { seed: entered.simulation.seed } : {}),
    exchanges: mergeBlocks(template.simulation.exchanges, entered.simulation.exchanges),
    listings: mergeBlocks(template.simulation.listings, entered.simulation.listings),
  };
  return { args, overrides: { ...template.overrides, ...entered.overrides }, simulation };
}
