export type Overrides = Record<string, string>;

// Strategy defaults keep overrides as a map; values are strings because they become environment variables.
export function toOverrides(raw: unknown): Overrides {
  if (!raw || typeof raw !== 'object') return {};
  return Object.fromEntries(Object.entries(raw as Record<string, unknown>).map(([k, v]) => [k, String(v)]));
}
