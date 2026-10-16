import { describe, expect, it } from 'vitest';
import { lostFields } from './round-trip';

describe('lostFields', () => {
  it('finds what a form drops, such as a key from an older format', () => {
    const stored = { mode: 'paper', simulation: { 'simulation.profiles.kalshi.fee.model': 'parametric' } };
    expect(lostFields(stored, { mode: 'paper', simulation: {} })).toEqual([
      { path: ['simulation', 'simulation.profiles.kalshi.fee.model'], stored: 'parametric', saved: undefined },
    ]);
  });

  it('finds what a form changes', () => {
    const lost = lostFields({ args: { legs: [1, 2] } }, { args: { legs: [1] } });
    expect(lost).toEqual([{ path: ['args', 'legs'], stored: [1, 2], saved: [1] }]);
  });

  it("doesn't count defaults the form adds, or values that only differ in how they travel", () => {
    expect(lostFields({ 'strategy.id': '5', 'recovery.inherit': 'false' },
      { 'strategy.id': 5, 'recovery.inherit': false, instance_type: 'c7i.large' })).toEqual([]);
    expect(lostFields({ overrides: {}, region: '' }, {})).toEqual([]);
  });

  it('skips what it is told to', () => {
    const stored = { simulation: { as_of: '2026-10-01T00:00:00Z', seed: 3 } };
    const lost = lostFields(stored, { simulation: { seed: 3 } }, p => p.join('.') === 'simulation.as_of');
    expect(lost).toEqual([]);
  });
});
