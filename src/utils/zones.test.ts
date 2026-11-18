import { describe, expect, it } from 'vitest';
import { exchangePatch, homeZoneOptions, shardZoneMeta, zoneLabel, zonePlacement } from './zones';

describe('zones', () => {
  it('names a platform zone by its name and ID, and passes anything else through', () => {
    expect(zoneLabel('use2-az2')).toBe('us-east-2b (use2-az2)');
    expect(zoneLabel('apne1-az2')).toBe('apne1-az2');
    expect(zoneLabel(null)).toBe('—');
  });

  it("offers an exchange its region's platform zones, and none in a region without the network", () => {
    expect(homeZoneOptions('eu-west-1')).toEqual([
      { value: 'euw1-az2', label: 'eu-west-1a (euw1-az2)' },
      { value: 'euw1-az3', label: 'eu-west-1b (euw1-az3)' },
    ]);
    expect(homeZoneOptions('eu-west-2')).toEqual([]);
    expect(homeZoneOptions(undefined)).toEqual([]);
  });

  it('says whether something runs in its home zone, elsewhere, says nothing, or has no home', () => {
    expect(zonePlacement('use2-az2', 'use2-az2')).toBe('home');
    expect(zonePlacement('use2-az2', 'use2-az1')).toBe('away');
    expect(zonePlacement('use2-az2', null)).toBe('unknown');
    expect(zonePlacement(null, 'use2-az1')).toBe('none');
  });

  it("tells a shard's zone against its home, and a research shard's zone alone", () => {
    expect(shardZoneMeta('use2-az2', 'us-east-2b', 'use2-az2')).toBe('us-east-2b · home zone');
    expect(shardZoneMeta('use2-az2', 'us-east-2a', 'use2-az1')).toBe('us-east-2a · away from home us-east-2b (use2-az2)');
    expect(shardZoneMeta('use2-az2', null, null)).toBe('home us-east-2b (use2-az2)');
    expect(shardZoneMeta(null, 'us-east-2a', 'use2-az1')).toBe('us-east-2a');
    expect(shardZoneMeta(null, null, null)).toBeNull();
    expect(shardZoneMeta('use2-az2', null, 'use2-az2')).toBe('us-east-2b (use2-az2) · home zone');
  });

  describe('an exchange edit', () => {
    const kalshi = { exchangeCode: 'KALSHI', exchangeName: 'Kalshi', region: 'us-east-2', homeZoneId: 'use2-az2' };

    it('sends only what changed, leaving an untouched home zone out', () => {
      expect(exchangePatch(kalshi, { exchangeName: 'Kalshi Inc' })).toEqual({ exchangeName: 'Kalshi Inc' });
      expect(exchangePatch(kalshi, { exchangeName: 'Kalshi', region: 'us-east-2' })).toEqual({});
    });

    it('changes or clears the home zone once it was touched', () => {
      expect(exchangePatch(kalshi, { homeZoneId: 'use2-az1' })).toEqual({ homeZoneId: 'use2-az1' });
      expect(exchangePatch(kalshi, { homeZoneId: null })).toEqual({ homeZoneId: null });
      expect(exchangePatch(kalshi, { homeZoneId: 'use2-az2' })).toEqual({});
    });

    it('moves the region with or without a new zone, and a region changed back is no change', () => {
      expect(exchangePatch(kalshi, { region: 'us-east-1' })).toEqual({ region: 'us-east-1' });
      expect(exchangePatch(kalshi, { region: 'us-east-1', homeZoneId: 'use1-az2' }))
        .toEqual({ region: 'us-east-1', homeZoneId: 'use1-az2' });
      expect(exchangePatch(kalshi, { region: 'us-east-2' })).toEqual({});
    });
  });
});
