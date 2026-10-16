// Whether a form can edit a stored config without silently losing part of it. A form loads a stored object into its
// own state and saves that state back; anything it doesn't understand (a key from an older format, a value it can't
// parse) vanishes on the way. Loading and immediately re-saving shows exactly what would vanish, with no version
// numbers to keep up to date.

export interface LostField {
  path: string[];
  stored: unknown;
  // What saving the form would write instead; undefined when the form drops the field.
  saved: unknown;
}

function absent(v: unknown): boolean {
  return v === undefined || v === null || v === ''
    || (typeof v === 'object' && !Array.isArray(v) && Object.keys(v as object).length === 0);
}

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}

// Configs travel as env vars and JSON, so 5 and "5", or false and "false", are the same setting.
function same(a: unknown, b: unknown): boolean {
  if (Array.isArray(a) || Array.isArray(b)) {
    return Array.isArray(a) && Array.isArray(b) && a.length === b.length && a.every((x, i) => same(x, b[i]));
  }
  if (isRecord(a) || isRecord(b)) {
    if (!isRecord(a) || !isRecord(b)) return false;
    const keys = new Set([...Object.keys(a), ...Object.keys(b)]);
    return [...keys].every(k => (absent(a[k]) && absent(b[k])) || same(a[k], b[k]));
  }
  return String(a) === String(b);
}

/**
 * The fields of `stored` that `saved` (the same object loaded into a form and saved straight back) drops or changes.
 * Fields the form adds, such as defaults it fills in, don't count. `ignore` skips paths the form deliberately leaves to
 * someone else, like values the registry writes at launch.
 */
export function lostFields(
  stored: Record<string, unknown>,
  saved: Record<string, unknown>,
  ignore: (path: string[]) => boolean = () => false,
): LostField[] {
  const lost: LostField[] = [];
  const walk = (a: unknown, b: unknown, path: string[]) => {
    if (ignore(path) || absent(a)) return;
    // A dropped block is reported field by field, so the list says exactly what would go.
    if (isRecord(a) && (isRecord(b) || absent(b))) {
      for (const key of Object.keys(a)) walk(a[key], isRecord(b) ? b[key] : undefined, [...path, key]);
      return;
    }
    if (!same(a, b)) lost.push({ path, stored: a, saved: absent(b) ? undefined : b });
  };
  for (const key of Object.keys(stored)) walk(stored[key], saved[key], [key]);
  return lost;
}

export function describePath(path: string[]): string {
  return path.join(' › ');
}
