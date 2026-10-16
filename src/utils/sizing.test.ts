import { describe, expect, it } from 'vitest';
import { instanceTypeOptions, isInstanceTypeValidFor, suggestInstanceType } from './sizing';

describe('instance types', () => {
  it('offers t3.small for the standard profile only: it has no cores to isolate', () => {
    expect(instanceTypeOptions('standard').map(o => o.value)).toContain('t3.small');
    expect(instanceTypeOptions('low_latency').map(o => o.value)).not.toContain('t3.small');
    expect(isInstanceTypeValidFor('low_latency', 't3.small')).toBe(false);
  });

  it('suggests t3.small on the standard profile, paper or live, up to the measured listing count', () => {
    expect(suggestInstanceType('standard', 'paper', 2)).toBe('t3.small');
    expect(suggestInstanceType('standard', 'live', 2)).toBe('t3.small');
    expect(suggestInstanceType('standard', 'paper', 6)).toBe('c7i.xlarge');
  });
});
