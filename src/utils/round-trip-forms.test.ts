import { describe, expect, it } from 'vitest';
import { StrategySession } from '../types';
import { describePath } from './round-trip';
import { fillFromTemplate, templateFormFrom, templateLostFields } from './strategy-template';
import { relaunchLostFields, sessionConfigFrom, sessionFormFrom } from './session-config';
import { editable, ruleLostFields } from './rule-form';
import { SessionSimulation } from './simulation';

// Everything each form can set, in today's format. If a form starts saving a field it doesn't load back (or the
// other way round), these stop round-tripping and the form would quietly lose that field.

const SIMULATION: SessionSimulation = {
  seed: 7,
  exchanges: { KALSHI: { queue_model: { type: 'optimistic' } } },
  listings: { 48212: { network_latency: { type: 'static', latency_nanos: 1 } } },
};

const TEMPLATE = {
  mode: 'paper', strategy_type: 'python', strategy_class: 'a.b:C', instance_type: 'c7i.large',
  latency_profile: 'standard', availability_zone: 'us-east-1a', orchestrator_version: '1.2.3', gnomepy_version: '2.28.0',
  research_commit: 'abc123', region: 'us-east-1', listings: [48211, 48212],
  args: { edge: 0.05, dry: false, name: 'x', legs: [1, 2] }, overrides: { 'oms.max.orders': '5' }, simulation: SIMULATION,
};

// The registry returns a template's top-level keys camelCased.
const camel = (o: Record<string, unknown>) =>
  Object.fromEntries(Object.entries(o).map(([k, v]) => [k.replace(/_([a-z])/g, (_, c: string) => c.toUpperCase()), v]));

const paths = (lost: { path: string[] }[]) => lost.map(l => describePath(l.path));

describe('strategy templates', () => {
  it('round-trip in the current format, as stored and as the registry returns them', () => {
    expect(templateLostFields(TEMPLATE)).toEqual([]);
    expect(templateLostFields(camel(TEMPLATE))).toEqual([]);
  });

  it('catch the profile format strategies 3 and 4 had before 2026-10-16', () => {
    const old = {
      mode: 'paper', strategy_type: 'python', strategy_class: 'a.b:C',
      simulation: { 'simulation.listing.3.profile': 'default', 'simulation.profiles.default.fee.model': 'static' },
    };
    expect(paths(templateLostFields(old))).toEqual([
      'simulation › simulation.listing.3.profile', 'simulation › simulation.profiles.default.fee.model',
    ]);
  });

  it('catch settings the form only keeps for some strategies', () => {
    const java = { mode: 'paper', strategy_type: 'java', strategy_class: 'x.Y', research_commit: 'abc' };
    expect(paths(templateLostFields(java))).toEqual(['research_commit']);
  });
});

function session(config: Record<string, unknown>, mode = 'paper'): StrategySession {
  return {
    sessionId: 's1', strategyId: 5, mode, config, instanceType: 'c7i.large', orchestratorVersion: '1.2.3',
    gnomepyVersion: '2.28.0',
  } as unknown as StrategySession;
}

describe('session relaunches', () => {
  it('round-trip a session the deploy form launched, once the registry pinned its time', () => {
    const form = sessionFormFrom(session({}));
    const config = sessionConfigFrom({
      ...form, strategyId: '5', listingIds: ['48211', '48212'], simulation: SIMULATION,
      args: [{ key: 'edge', value: 0.05, type: 'number' }, { key: 'legs', value: '[1, 2]', type: 'json' }],
      overrides: { 'oms.max.orders': '5' },
      launch: { ...form.launch, strategyType: 'python', strategyClass: 'a.b:C', researchCommit: 'abc', region: 'us-east-1' },
    });
    (config.simulation as Record<string, unknown>).as_of = '2026-10-16T00:00:00.000Z';
    expect(relaunchLostFields(session(config))).toEqual([]);
  });

  it('round-trip a session a launch rule started', () => {
    const config = {
      'launcher.rule.id': 'r1', 'strategy.id': '5', mode: 'paper', listings: [11, 12], 'strategy.type': 'python',
      'strategy.class': 'a.b:C', 'latency.profile': 'standard', 'strategy.args.match_id': 2399262,
      simulation: { as_of: '2026-10-16T00:00:00.000Z' },
    };
    expect(relaunchLostFields(session(config))).toEqual([]);
  });

  it('catch a session from before simulation parameters', () => {
    const config = {
      'strategy.id': '5', mode: 'paper', listings: [6], 'strategy.type': 'java', 'strategy.class': 'x.Y',
      'latency.profile': 'standard', 'simulation.listing.6.profile': 'default',
      'simulation.profiles.default.network.latency.model': 'static',
    };
    expect(paths(relaunchLostFields(session(config)))).toEqual([
      'simulation.listing.6.profile', 'simulation.profiles.default.network.latency.model',
    ]);
  });
});

const CS2_DECLARED = ['market', 'venues', 'strategy_id', 'strategy_type', 'strategy_class', 'mode', 'research_commit',
  'instance_type', 'latency_profile', 'orchestrator_version', 'gnomepy_version', 'availability_zone', 'strategy_args',
  'simulation', 'overrides'];

describe('launch rules', () => {
  it('round-trip in the current format', () => {
    const params = {
      market: 'series', venues: ['kalshi', 'polymarket'], strategy_id: 5, strategy_type: 'python', strategy_class: 'a.b:C',
      mode: 'paper', research_commit: 'abc', instance_type: 'c7i.large', latency_profile: 'standard',
      strategy_args: { edge: 0.05 }, overrides: { 'oms.max.orders': '5' },
      simulation: { seed: 3, exchanges: { KALSHI: { queue_model: { type: 'optimistic' } } } },
    };
    expect(ruleLostFields(params, CS2_DECLARED)).toEqual([]);
  });

  it('catch the CS2 rule format from before simulation parameters', () => {
    const old = {
      strategy_id: 5, strategy_type: 'python', strategy_class: 'a.b:C', mode: 'paper',
      simulation_profiles: { kalshi: 'kalshi' },
      simulation_config: { 'simulation.profiles.kalshi.fee.model': 'registry' },
    };
    // Parameters the rule type no longer declares are reported whole: the editor has no field for any of them.
    expect(paths(ruleLostFields(old, CS2_DECLARED)).sort()).toEqual(['simulation_config', 'simulation_profiles']);
  });
});

describe('checking a stored rule', () => {
  it('sends the launcher only the fields a rule is edited with, not the ones it keeps itself', () => {
    const stored = {
      rule_id: 'r1', revision: 3, created_by: 'ui:a', modified_by: 'ui:a', date_created: 'x', date_modified: 'y',
      name: 'n', description: null, rule_type: 'cs2', status: 'active', launch_path: 'auto', shutdown_path: 'auto',
      schedule_enabled: false, max_concurrent_sessions: null, cooldown_minutes: 0, dedup_window_minutes: 60, parameters: {},
    } as const;
    expect(Object.keys(editable(stored)).sort()).toEqual([
      'cooldown_minutes', 'dedup_window_minutes', 'description', 'launch_path', 'max_concurrent_sessions', 'name',
      'parameters', 'rule_type', 'schedule_enabled', 'shutdown_path', 'status',
    ]);
  });
});

describe('picking a strategy', () => {
  it("fills in its defaults under what was already entered, never over it", () => {
    const template = templateFormFrom({
      args: { size: 1, max_position: 3 }, overrides: { 'oms.a': '1', 'oms.b': '2' },
      simulation: { seed: 1, exchanges: { HYPERLIQUID: { fee_model: { type: 'static', taker_fee: 0, maker_fee: 0 },
        queue_model: { type: 'risk_averse' } } } },
    });
    const entered = {
      args: [{ key: 'size', value: 5, type: 'number' as const }],
      overrides: { 'oms.b': '9' },
      simulation: { exchanges: { HYPERLIQUID: { queue_model: { type: 'optimistic' as const } }, KALSHI: {} } },
    };

    const filled = fillFromTemplate(entered, template);

    expect(filled.args).toEqual([{ key: 'max_position', value: 3, type: 'number' }, { key: 'size', value: 5, type: 'number' }]);
    expect(filled.overrides).toEqual({ 'oms.a': '1', 'oms.b': '9' });
    expect(filled.simulation).toEqual({
      seed: 1,
      exchanges: {
        HYPERLIQUID: { fee_model: { type: 'static', taker_fee: 0, maker_fee: 0 }, queue_model: { type: 'optimistic' } },
        KALSHI: {},
      },
      listings: {},
    });
  });
});
