import { Pipeline, PipelineRun, PipelineSchedule } from '../../../types/pipeline';

export function isActive(run: PipelineRun): boolean {
  return run.status === 'PENDING' || run.status === 'RUNNING' || run.status === 'STOPPING';
}

export function isSource(pipeline: Pipeline | null | undefined): boolean {
  return pipeline?.kind === 'source';
}

// A source's live run: the newest run, while it hasn't ended. Stop is offered until it is STOPPING.
export function liveRun(runs: (PipelineRun | null | undefined)[]): PipelineRun | null {
  const newest = runs.find(r => r) ?? null;
  return newest && isActive(newest) ? newest : null;
}

export function duration(run: PipelineRun): string {
  if (!run.startedAt || !run.completedAt) return '—';
  const secs = Math.round((new Date(run.completedAt).getTime() - new Date(run.startedAt).getTime()) / 1000);
  if (secs < 60) return `${secs}s`;
  if (secs < 3600) return `${Math.floor(secs / 60)}m ${secs % 60}s`;
  return `${Math.floor(secs / 3600)}h ${Math.floor((secs % 3600) / 60)}m`;
}

export function nextScheduled(schedules: PipelineSchedule[]): PipelineSchedule | null {
  const upcoming = schedules.filter(s => s.nextRun).sort((a, b) => a.nextRun!.localeCompare(b.nextRun!));
  return upcoming[0] ?? null;
}

// e.g. "Mon 19 Oct 06:00 UTC": schedules are declared in UTC, so that's the time shown.
export function utcTime(iso: string): string {
  const d = new Date(iso);
  const day = d.toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short', timeZone: 'UTC' });
  return `${day} ${d.toISOString().slice(11, 16)} UTC`;
}
