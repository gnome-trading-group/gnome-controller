// Formatting shared by the System page's sections.

export function formatBytes(bytes: number | string | null | undefined): string {
  if (bytes === null || bytes === undefined) return '—';
  let value = Number(bytes);
  const units = ['B', 'KB', 'MB', 'GB', 'TB'];
  let unit = 0;
  while (value >= 1024 && unit < units.length - 1) {
    value /= 1024;
    unit++;
  }
  return `${value >= 100 || unit === 0 ? Math.round(value) : value.toFixed(1)} ${units[unit]}`;
}

export function formatSeconds(seconds: number | null | undefined): string {
  if (seconds === null || seconds === undefined) return '—';
  if (seconds < 90) return `${Math.round(seconds)}s`;
  if (seconds < 5400) return `${Math.round(seconds / 60)}m`;
  if (seconds < 172800) return `${Math.round(seconds / 3600)}h`;
  return `${Math.round(seconds / 86400)}d`;
}

// "≈ 8 months" from a number of days, rounded to what's worth saying.
export function untilFull(days: number | null): string {
  if (days === null) return 'not growing';
  if (days < 1) return 'less than a day';
  if (days < 60) return `≈ ${Math.round(days)} days`;
  if (days < 730) return `≈ ${Math.round(days / 30)} months`;
  return `≈ ${Math.round(days / 365)} years`;
}

// A schedule expression in words, for the common shapes.
export function describeSchedule(expression: string | null, intervalSeconds: number | null): string {
  if (!expression) return '—';
  if (expression.startsWith('rate(')) return `every ${expression.slice(5, -1)}`;
  if (intervalSeconds) return `${expression} (≈ every ${formatSeconds(intervalSeconds)})`;
  return expression;
}
