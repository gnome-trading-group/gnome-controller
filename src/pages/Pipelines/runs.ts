import { PipelineRun } from '../../types/pipeline';

export function isActive(run: PipelineRun): boolean {
  return run.status === 'PENDING' || run.status === 'RUNNING';
}

export function duration(run: PipelineRun): string {
  if (!run.startedAt || !run.completedAt) return '—';
  const secs = Math.round((new Date(run.completedAt).getTime() - new Date(run.startedAt).getTime()) / 1000);
  if (secs < 60) return `${secs}s`;
  if (secs < 3600) return `${Math.floor(secs / 60)}m ${secs % 60}s`;
  return `${Math.floor(secs / 3600)}h ${Math.floor((secs % 3600) / 60)}m`;
}
