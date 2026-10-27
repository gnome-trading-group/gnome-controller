import { describe, expect, it } from 'vitest';
import { connectionLimitLabel, isValidLimit, limitOrNull } from './source-capacity';

describe('source capacity', () => {
  it('names the limit with its scope, or says there is none', () => {
    expect(connectionLimitLabel({ connectionsPerScope: 180, connectionScope: 'ACCOUNT' })).toBe('180 per account');
    expect(connectionLimitLabel({ connectionsPerScope: 8, connectionScope: 'IP' })).toBe('8 per IP');
    expect(connectionLimitLabel({ connectionsPerScope: null, connectionScope: 'KEY' })).toBe('No limit');
  });

  it('accepts blank or a positive whole number', () => {
    expect(isValidLimit('')).toBe(true);
    expect(isValidLimit(1)).toBe(true);
    expect(isValidLimit(0)).toBe(false);
    expect(isValidLimit(-3)).toBe(false);
    expect(isValidLimit(2.5)).toBe(false);
  });

  it('sends blank as no limit', () => {
    expect(limitOrNull('')).toBeNull();
    expect(limitOrNull(200)).toBe(200);
  });
});
