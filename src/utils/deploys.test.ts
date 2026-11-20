import { describe, expect, it } from 'vitest';
import { PipelineAction, PipelineDetail } from '../types/system';
import { canRetry, defaultStage, secondsBetween, stagePositions, stageStatus, triggerLabel } from './deploys';

const action = (stage: string, name: string, status: string): PipelineAction => ({
  stage, action: name, status, category: null, provider: null, startedAt: null, updatedAt: null, durationSeconds: null,
  summary: null, error: null, url: null, buildId: null, stackName: null, region: null,
});

const revision = (sha: string) => ({ source: 'GitHub', revision: sha, message: null, url: null });

function detail(overrides: Partial<PipelineDetail> = {}): PipelineDetail {
  return {
    name: 'RegistryPipeline',
    region: 'us-east-1',
    stages: [
      { name: 'Source', actions: [{ name: 'GitHub', category: 'Source' }] },
      { name: 'Build', actions: [{ name: 'Synth', category: 'Build' }, { name: 'Assets', category: 'Build' }] },
      { name: 'Prod', actions: [{ name: 'ApproveProd', category: 'Approval' }, { name: 'Deploy', category: 'Deploy' }] },
    ],
    runs: [],
    runId: 'r3',
    run: null,
    actions: [
      action('Source', 'GitHub', 'Succeeded'),
      action('Build', 'Synth', 'Succeeded'),
      action('Build', 'Assets', 'Failed'),
    ],
    lastSuccesses: {},
    retryable: { Build: 'r3', Prod: 'r1' },
    canOperate: true,
    ...overrides,
  };
}

describe('deploys', () => {
  it('reads a stage of the shown run from the actions that ran in it', () => {
    const d = detail();
    expect(stageStatus(d, 'Source')).toBe('Succeeded');
    expect(stageStatus(d, 'Build')).toBe('Failed');
    expect(stageStatus(d, 'Prod')).toBeNull();
    // A stage that has run only some of its actions so far is still going.
    expect(stageStatus(detail({ actions: [action('Prod', 'ApproveProd', 'Succeeded')] }), 'Prod')).toBe('InProgress');
  });

  it('offers a retry only for a stage whose latest attempt was in the shown run', () => {
    expect(canRetry(detail(), 'Build')).toBe(true);
    expect(canRetry(detail(), 'Prod')).toBe(false);
    expect(canRetry(detail({ runId: null }), 'Build')).toBe(false);
  });

  it('opens on the failed stage, else the one running, else the last one reached', () => {
    expect(defaultStage(detail())).toBe('Build');
    expect(defaultStage(detail({ actions: [action('Source', 'GitHub', 'Succeeded'), action('Build', 'Synth', 'InProgress')] })))
      .toBe('Build');
    expect(defaultStage(detail({ actions: [action('Source', 'GitHub', 'Succeeded')] }))).toBe('Source');
    expect(defaultStage(detail({ actions: [] }))).toBe('Source');
  });

  it('says which stages are behind the newest commit the pipeline picked up', () => {
    const positions = stagePositions(detail({
      lastSuccesses: {
        Source: { runId: 'r3', at: null, revisions: [revision('bbb')] },
        Build: { runId: 'r3', at: null, revisions: [revision('bbb')] },
        Prod: { runId: 'r1', at: null, revisions: [revision('aaa')] },
      },
    }));
    expect(positions.map(p => [p.stage, p.current])).toEqual([['Source', true], ['Build', true], ['Prod', false]]);
    const never = stagePositions(detail({ lastSuccesses: {} }));
    expect(never.every(p => !p.current && p.runId === null)).toBe(true);
  });

  it('names triggers and times runs', () => {
    expect(triggerLabel('Webhook')).toBe('push');
    expect(triggerLabel('SomethingNew')).toBe('SomethingNew');
    expect(triggerLabel(null)).toBe('unknown');
    expect(triggerLabel('StartPipelineExecution', 'arn:aws:sts::1:assumed-role/x/someone@gnometrading.group')).toBe('manual release');
    expect(triggerLabel('StartPipelineExecution', 'arn:aws:sts::1:assumed-role/cdk-cfn-exec-role/AWSCloudFormation'))
      .toBe('self-update restart');
    expect(secondsBetween('2026-11-20T09:00:00Z', '2026-11-20T09:14:00Z')).toBe(840);
    expect(secondsBetween(null, '2026-11-20T09:14:00Z')).toBeNull();
  });
});
