import { describe, expect, it } from 'vitest';
import { LaunchRequest } from '../types/launcher';
import { isPending, showsExpiry } from './launch-status';

const request = (fields: Partial<LaunchRequest>) => ({ status: 'PENDING_APPROVAL', expires_at: null, ...fields }) as LaunchRequest;
const inMinutes = (minutes: number) => new Date(Date.now() + minutes * 60_000).toISOString();

describe('isPending', () => {
  it('can be approved until its deadline, before the sweeper marks it expired', () => {
    expect(isPending(request({ expires_at: inMinutes(10) }))).toBe(true);
    expect(isPending(request({ expires_at: inMinutes(-1) }))).toBe(false);
  });

  it('never runs out without a deadline', () => {
    expect(isPending(request({}))).toBe(true);
    expect(isPending(request({ status: 'EXPIRED' }))).toBe(false);
  });
});

describe('showsExpiry', () => {
  it('shows the deadline while it matters, not once the request launched', () => {
    expect(showsExpiry(request({ expires_at: inMinutes(10) }))).toBe(true);
    expect(showsExpiry(request({ status: 'EXPIRED', expires_at: inMinutes(-10) }))).toBe(true);
    expect(showsExpiry(request({ status: 'LAUNCHED', expires_at: inMinutes(-10) }))).toBe(false);
    expect(showsExpiry(request({}))).toBe(false);
  });
});
