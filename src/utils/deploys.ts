import { PipelineAction, PipelineDetail, Revision } from '../types/system';

// What the deploy pipelines on the System page make of a pipeline's detail.

export const shortSha = (revision: string | null | undefined) => (revision ?? '').slice(0, 7);

export const firstLine = (message: string | null | undefined) => (message ?? '').split('\n')[0];

const TRIGGERS: Record<string, string> = {
  Webhook: 'push',
  WebhookV2: 'push',
  CloudWatchEvent: 'source change',
  PutActionRevision: 'source change',
  StartPipelineExecution: 'manual release',
  CreatePipeline: 'pipeline created',
  PollForSourceChanges: 'source poll',
  AutomatedRollback: 'rollback',
};

// A CDK pipeline that updates itself restarts through CloudFormation, which shows as a manual start.
export function triggerLabel(trigger: string | null, detail?: string | null): string {
  if (!trigger) return 'unknown';
  if (trigger === 'StartPipelineExecution' && detail?.includes('AWSCloudFormation')) return 'self-update restart';
  return TRIGGERS[trigger] ?? trigger;
}

export const isActive = (status: string | null | undefined) => status === 'InProgress' || status === 'Stopping';

export function secondsBetween(start: string | null, end: string | null): number | null {
  if (!start || !end) return null;
  return (new Date(end).getTime() - new Date(start).getTime()) / 1000;
}

// A stage's state in the run on show, from the actions that ran in it: null when the run never reached it.
export function stageStatus(detail: PipelineDetail, stage: string): string | null {
  const ran = detail.actions.filter(a => a.stage === stage);
  if (ran.length === 0) return null;
  for (const status of ['Failed', 'InProgress', 'Stopping', 'Stopped', 'Abandoned']) {
    if (ran.some(a => a.status === status)) return status;
  }
  const expected = detail.stages.find(s => s.name === stage)?.actions.length ?? ran.length;
  return ran.length >= expected && ran.every(a => a.status === 'Succeeded') ? 'Succeeded' : 'InProgress';
}

export function actionsOf(detail: PipelineDetail, stage: string): PipelineAction[] {
  return detail.actions.filter(a => a.stage === stage);
}

// CodePipeline retries a stage only in the run its latest attempt belonged to.
export const canRetry = (detail: PipelineDetail, stage: string) =>
  !!detail.runId && detail.retryable[stage] === detail.runId;

// The stage the dialog opens on when none was clicked: where this run stopped or is, else the last one.
export function defaultStage(detail: PipelineDetail): string | null {
  const names = detail.stages.map(s => s.name);
  return names.find(n => stageStatus(detail, n) === 'Failed')
    ?? names.find(n => isActive(stageStatus(detail, n)))
    ?? [...names].reverse().find(n => stageStatus(detail, n) !== null)
    ?? names[0] ?? null;
}

const revisionKey = (revisions: Revision[]) => revisions.map(r => r.revision).sort().join(',');

export interface StagePosition {
  stage: string;
  runId: string | null;
  at: string | null;
  revisions: Revision[];
  // Whether the stage last succeeded with the same commits as the first stage that has succeeded (normally Source,
  // i.e. the newest commit the pipeline has picked up).
  current: boolean;
}

// What each stage last succeeded with, in pipeline order.
export function stagePositions(detail: PipelineDetail): StagePosition[] {
  const first = detail.stages.map(s => detail.lastSuccesses[s.name]).find(Boolean);
  const newest = first ? revisionKey(first.revisions) : null;
  return detail.stages.map(s => {
    const success = detail.lastSuccesses[s.name];
    return {
      stage: s.name,
      runId: success?.runId ?? null,
      at: success?.at ?? null,
      revisions: success?.revisions ?? [],
      current: !!success && revisionKey(success.revisions) === newest,
    };
  });
}
