import { describe, expect, it } from 'vitest';
import { defaultMode } from './mode';

describe('the mode a page opens in', () => {
  it('is the only mode with data, whatever was chosen before', () => {
    expect(defaultMode(['paper'], 'live')).toBe('paper');
    expect(defaultMode(['live'], 'paper')).toBe('live');
  });

  it('is the last choice when both or neither have data, and live the first time', () => {
    expect(defaultMode(['paper', 'live'], 'paper')).toBe('paper');
    expect(defaultMode(['paper', 'live'], null)).toBe('live');
    expect(defaultMode([], null)).toBe('live');
    expect(defaultMode(undefined, 'paper')).toBe('paper');
  });
});
