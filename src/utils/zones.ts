import { PLATFORM_ZONES } from '../types/regions';

/** A zone ID as people read it: its name in its region and the ID (`us-east-2b (use2-az2)`), or the ID alone. */
export function zoneLabel(zoneId: string | null | undefined): string {
  if (!zoneId) return '—';
  for (const zones of Object.values(PLATFORM_ZONES)) {
    const zone = zones.find((z) => z.id === zoneId);
    if (zone) return `${zone.name} (${zone.id})`;
  }
  return zoneId;
}

/** The home zones an exchange in `region` may have, for a picker: none when the region has no platform network. */
export function homeZoneOptions(region: string | null | undefined): { value: string; label: string }[] {
  return (region ? PLATFORM_ZONES[region] ?? [] : []).map((z) => ({ value: z.id, label: `${z.name} (${z.id})` }));
}

export type ZonePlacement = 'home' | 'away' | 'unknown' | 'none';

/**
 * Where something runs against its exchange's home zone: `home` there, `away` elsewhere (a gateway moves at its next
 * start, a production shard make-before-break), `unknown` when it doesn't say (not running, or an older release),
 * `none` when the exchange has no home zone.
 */
export function zonePlacement(homeZoneId: string | null | undefined, runningZoneId: string | null | undefined):
  ZonePlacement {
  if (!homeZoneId) return 'none';
  if (!runningZoneId) return 'unknown';
  return runningZoneId === homeZoneId ? 'home' : 'away';
}

/**
 * A shard's zone as its header shows it: where its task runs, and for a production shard held to a home zone whether
 * that is home (`us-east-2b · home zone`, `us-east-2a · away from home us-east-2b (use2-az2)`); null when nothing is
 * known (a research shard not reporting its zone).
 */
export function shardZoneMeta(
  homeZoneId: string | null | undefined, runningZone: string | null | undefined, runningZoneId: string | null | undefined,
): string | null {
  const placement = zonePlacement(homeZoneId, runningZoneId);
  const running = runningZone ?? zoneLabel(runningZoneId);
  if (placement === 'home') return `${running} · home zone`;
  if (placement === 'away') return `${running} · away from home ${zoneLabel(homeZoneId)}`;
  if (placement === 'unknown') return `home ${zoneLabel(homeZoneId)}`;
  return runningZone ?? null;
}

/** What an exchange edit changed, as a field-by-field draft keeps it (a field present only once it was touched). */
export interface ExchangeDraft {
  exchangeCode?: string;
  exchangeName?: string;
  region?: string;
  homeZoneId?: string | null;
}

/**
 * The PATCH body for an exchange edit: only what changed from `original`, so an untouched home zone isn't sent (the
 * registry then keeps it, or drops it if the region moved). A region changed and changed back is no change.
 */
export function exchangePatch(
  original: { exchangeCode: string; exchangeName: string; region: string; homeZoneId?: string | null },
  draft: ExchangeDraft,
): ExchangeDraft {
  const patch: ExchangeDraft = {};
  if (draft.exchangeCode !== undefined && draft.exchangeCode !== original.exchangeCode) patch.exchangeCode = draft.exchangeCode;
  if (draft.exchangeName !== undefined && draft.exchangeName !== original.exchangeName) patch.exchangeName = draft.exchangeName;
  if (draft.region !== undefined && draft.region !== original.region) patch.region = draft.region;
  if ('homeZoneId' in draft && (draft.homeZoneId ?? null) !== (original.homeZoneId ?? null)) {
    patch.homeZoneId = draft.homeZoneId ?? null;
  }
  return patch;
}
