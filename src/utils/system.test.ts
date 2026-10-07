import { describe, expect, it } from 'vitest';
import { describeSchedule, formatBytes, formatSeconds, untilFull } from './system';

describe('system page formatting', () => {
  it('writes sizes and durations at a readable precision', () => {
    expect([formatBytes(512), formatBytes(1536), formatBytes(8.5 * 1024 ** 3), formatBytes(null)]).toEqual(['512 B', '1.5 KB', '8.5 GB', '—']);
    expect([formatSeconds(45), formatSeconds(600), formatSeconds(7200), formatSeconds(3 * 86400)]).toEqual(['45s', '10m', '2h', '3d']);
  });

  it('says how long until storage is full in the unit worth saying', () => {
    expect([untilFull(null), untilFull(0.5), untilFull(20), untilFull(248.5), untilFull(1000)])
      .toEqual(['not growing', 'less than a day', '≈ 20 days', '≈ 8 months', '≈ 3 years']);
  });

  it('describes schedules', () => {
    expect(describeSchedule('rate(15 minutes)', 900)).toBe('every 15 minutes');
    expect(describeSchedule('cron(0 6 * * ? *)', 86400)).toBe('cron(0 6 * * ? *) (≈ every 24h)');
  });
});
