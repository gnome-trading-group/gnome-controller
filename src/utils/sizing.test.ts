import { describe, expect, it } from 'vitest';
import { AUTO_INSTANCE_TYPE, instanceTypeOptions, isInstanceTypeValidFor, profileForTier, tierFrom } from './sizing';

describe('sizing', () => {
  it('offers automatic sizing first, for every tier', () => {
    for (const tier of ['slow', 'standard', 'low_latency'] as const) {
      expect(instanceTypeOptions(tier)[0].value).toBe(AUTO_INSTANCE_TYPE);
      expect(isInstanceTypeValidFor(tier, AUTO_INSTANCE_TYPE)).toBe(true);
    }
  });

  it('offers low latency only the sizes that isolate cores', () => {
    const lowLatency = instanceTypeOptions('low_latency').map(o => o.value);
    expect(lowLatency).toEqual([AUTO_INSTANCE_TYPE, 'c7i.2xlarge', 'c7a.2xlarge', 'c7i.4xlarge']);
    expect(isInstanceTypeValidFor('low_latency', 't3.small')).toBe(false);
    expect(instanceTypeOptions('slow').map(o => o.value)).toEqual(expect.arrayContaining(['t3.small', 'c7a.medium', 'c7a.large']));
  });

  it('no longer offers c7a.xlarge', () => {
    expect(instanceTypeOptions('standard').map(o => o.value)).not.toContain('c7a.xlarge');
  });

  it('runs slow and standard on the standard profile', () => {
    expect(profileForTier('slow')).toBe('standard');
    expect(profileForTier('standard')).toBe('standard');
    expect(profileForTier('low_latency')).toBe('low_latency');
  });

  it('reads a tier, and a latency profile saved before tiers, as a tier', () => {
    expect(tierFrom('slow')).toBe('slow');
    expect(tierFrom('LOW_LATENCY')).toBe('low_latency');
    expect(tierFrom('standard')).toBe('standard');
    expect(tierFrom('fast')).toBeNull();
    expect(tierFrom(undefined)).toBeNull();
  });
});
