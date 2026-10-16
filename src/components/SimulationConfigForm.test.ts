import { describe, expect, it } from 'vitest';
import { defaultSimulationState, simulationStateFromConfig, simulationStateToConfig } from './SimulationConfigForm';

describe('simulation fee config', () => {
  it("defaults to the venue's fees from the registry, with no rates to send", () => {
    const cfg = simulationStateToConfig(defaultSimulationState());
    expect(cfg['fee.model']).toBe('registry');
    expect(cfg['fee.taker']).toBeUndefined();
    expect(cfg['fee.taker.rate']).toBeUndefined();
  });

  it('reads a profile with no fee model as the registry, and keeps fixed rates when given', () => {
    expect(simulationStateFromConfig({}).feeModel).toBe('registry');
    const fixed = simulationStateFromConfig({ 'fee.model': 'static', 'fee.taker': 0.001, 'fee.maker': 0 });
    expect(fixed.feeModel).toBe('static');
    expect(simulationStateToConfig(fixed)['fee.taker']).toBe(0.001);
  });
});
