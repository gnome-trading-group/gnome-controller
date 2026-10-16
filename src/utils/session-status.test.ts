import { describe, expect, it } from 'vitest';
import { stopSummary } from './session-status';

describe('stopSummary', () => {
  it('names who stopped the session and why', () => {
    expect(stopSummary({ stoppedBy: 'strategy', stopReason: 'match went live' })).toBe('Stopped by the strategy: match went live');
    expect(stopSummary({ stoppedBy: 'launcher:CS2 series', stopReason: null })).toBe('Stopped by launcher rule CS2 series');
    expect(stopSummary({ stoppedBy: 'mprey@gnometrading.group', stopReason: 'rolling config' }))
      .toBe('Stopped by mprey@gnometrading.group: rolling config');
    expect(stopSummary({ stoppedBy: null, stopReason: 'x' })).toBe('Stopped: x');
  });

  it('is null for a session nobody stopped', () => {
    expect(stopSummary({ stoppedBy: null, stopReason: null })).toBeNull();
  });
});
