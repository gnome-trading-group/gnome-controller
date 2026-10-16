import { Overrides } from './orchestrator-overrides';
import { ArgRow, defaultLaunchSettings, LaunchSettings, launchSettingsToParams, rowsToArgs } from './launch-settings';
import { strategyClassError } from './strategy-class';
import { compactSimulation, SessionSimulation, simulationProblem } from './simulation';

export interface DirectLaunchForm {
  strategyId: string | null;
  launch: LaunchSettings;
  args: ArgRow[];
  overrides: Overrides;
  listingIds: string[];
  simulation: SessionSimulation;
  liveConfirm: string;
}

export function emptyDirectLaunch(): DirectLaunchForm {
  return {
    strategyId: null, launch: defaultLaunchSettings(), args: [], overrides: {}, listingIds: [], simulation: {}, liveConfirm: '',
  };
}

// The trigger a direct launch rule acts on: the session exactly as a deploy would describe it.
export function directLaunchData(form: DirectLaunchForm, strategyName: string): Record<string, unknown> {
  if (!form.strategyId) throw new Error('Choose a strategy');
  const classError = strategyClassError(form.launch.strategyType, form.launch.strategyClass.trim());
  if (classError) throw new Error(classError);
  const paper = form.launch.mode === 'paper';
  if (!form.listingIds.length) throw new Error('Add at least one listing');
  if (!paper && form.liveConfirm.trim() !== strategyName) throw new Error(`Type "${strategyName}" to confirm a live launch`);
  const data: Record<string, unknown> = {
    strategy_id: Number(form.strategyId), listings: form.listingIds.map(Number), ...launchSettingsToParams(form.launch, { region: false }),
  };
  const args = rowsToArgs(form.args);
  if (Object.keys(args).length) data.strategy_args = args;
  if (Object.keys(form.overrides).length) data.overrides = form.overrides;
  if (paper) {
    const problem = simulationProblem(form.simulation);
    if (problem) throw new Error(problem);
    const simulation = compactSimulation(form.simulation);
    if (Object.keys(simulation).length) data.simulation = simulation;
  }
  return data;
}
