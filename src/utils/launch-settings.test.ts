import { describe, expect, it } from 'vitest';
import { argsToRows, defaultLaunchSettings, launchSettingsFrom, launchSettingsToParams, rowsToArgs } from './launch-settings';
import { directLaunchData, emptyDirectLaunch } from './direct-launch';

describe('launch settings', () => {
  it('reads a strategy template and a rule alike', () => {
    const fromTemplate = launchSettingsFrom({ strategyType: 'python', strategyClass: 'a.b:C', researchCommit: 'abc', instanceType: 'c7i.large' });
    const fromRule = launchSettingsFrom({ strategy_type: 'python', strategy_class: 'a.b:C', research_commit: 'abc', instance_type: 'c7i.large' });
    expect(fromRule).toEqual(fromTemplate);
    expect(fromRule.instanceTypeChosen).toBe(true);
    expect(fromRule.latencyProfileChosen).toBeUndefined();
  });

  it('round-trips through rule parameters', () => {
    const settings = { ...defaultLaunchSettings(), ...launchSettingsFrom({
      mode: 'paper', strategy_type: 'python', strategy_class: 'a.b:C', research_commit: 'abc', latency_profile: 'standard',
      instance_type: 'c7i.large', gnomepy_version: '1.2.3',
    }) };
    expect(launchSettingsToParams(settings, { region: false })).toEqual({
      mode: 'paper', strategy_type: 'python', strategy_class: 'a.b:C', research_commit: 'abc', latency_profile: 'standard',
      instance_type: 'c7i.large', gnomepy_version: '1.2.3',
    });
  });

  it('drops python-only settings from a java strategy', () => {
    const params = launchSettingsToParams({ ...defaultLaunchSettings(), strategyType: 'java', strategyClass: 'x.Y', researchCommit: 'abc' });
    expect(params.research_commit).toBeUndefined();
  });

  it('keeps arg types', () => {
    const args = { edge: 0.05, dry: false, name: 'x', legs: [1, 2] };
    expect(rowsToArgs(argsToRows(args))).toEqual(args);
    expect(() => rowsToArgs([{ key: 'bad', value: '{', type: 'json' }])).toThrow('"bad"');
  });
});

describe('direct launch trigger', () => {
  it('describes the session as a deploy would', () => {
    const form = emptyDirectLaunch();
    form.strategyId = '5';
    form.launch = { ...form.launch, strategyType: 'python', strategyClass: 'a.b:C' };
    form.listingIds = ['7'];
    form.args = [{ key: 'edge', value: 0.05, type: 'number' }];
    form.overrides = { 'oms.max.orders': '5' };
    form.simulation = { exchanges: { KALSHI: { queue_model: { type: 'optimistic' } }, POLYMARKET_US: {} } };
    const data = directLaunchData(form, 'cs2_series');
    expect(data).toMatchObject({ strategy_id: 5, listings: [7], strategy_args: { edge: 0.05 }, overrides: { 'oms.max.orders': '5' } });
    // An exchange added without overriding anything carries nothing.
    expect(data.simulation).toEqual({ exchanges: { KALSHI: { queue_model: { type: 'optimistic' } } } });
  });

  it('sends no simulation when nothing is overridden, and refuses a block left half-filled', () => {
    const form = { ...emptyDirectLaunch(), strategyId: '5', listingIds: ['7'] };
    form.launch = { ...form.launch, strategyType: 'java', strategyClass: 'x.Y' };
    expect(directLaunchData(form, 's').simulation).toBeUndefined();
    form.simulation = { listings: { 7: { network_latency: { type: 'static', latency_nanos: '' } } } };
    expect(() => directLaunchData(form, 's')).toThrow('Listing 7: Network latency latency must be a whole number of nanoseconds');
  });

  it('refuses a live launch until the strategy name is typed', () => {
    const form = { ...emptyDirectLaunch(), strategyId: '5', listingIds: ['7'] };
    form.launch = { ...form.launch, mode: 'live', strategyType: 'java', strategyClass: 'x.Y' };
    expect(() => directLaunchData(form, 'cs2_series')).toThrow('confirm');
    expect(directLaunchData({ ...form, liveConfirm: 'cs2_series' }, 'cs2_series').listings).toEqual([7]);
  });
});
