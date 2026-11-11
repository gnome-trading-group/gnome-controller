import { describe, expect, it } from 'vitest';
import { Pipeline, PipelineRun } from '../../../types/pipeline';
import { isActive, isSource, liveRun } from './runs';

const run = (status: PipelineRun['status']): PipelineRun => ({
  pipelineName: 'qb', runId: 'r', status, trigger: 'manual', parameters: {}, queuedAt: '2026-11-11T00:00:00Z',
});

describe('polling source runs', () => {
  it('counts a stopping run as still active', () => {
    expect(isActive(run('STOPPING'))).toBe(true);
    expect(isActive(run('STOPPED'))).toBe(false);
  });

  it('finds the live run only when the newest run has not ended', () => {
    expect(liveRun([run('RUNNING'), run('STOPPED')])?.status).toBe('RUNNING');
    expect(liveRun([run('STOPPED'), run('RUNNING')])).toBeNull();
    expect(liveRun([null])).toBeNull();
  });

  it('tells a source from a pipeline by its kind', () => {
    expect(isSource({ kind: 'source' } as Pipeline)).toBe(true);
    expect(isSource({ kind: 'pipeline' } as Pipeline)).toBe(false);
    expect(isSource(null)).toBe(false);
  });
});
