import { useEffect, useState } from 'react';
import { Alert, Button, Checkbox, Group, Modal, Stack, Text, Textarea } from '@mantine/core';
import { PipelineOperation } from '../../types';
import { controllerApi } from '../../utils/api';
import { errorMessage } from '../../utils/kill-switch';
import { shortSha } from '../../utils/deploys';

export type OperationTarget =
  | { operation: 'retry'; runId: string; stage: string; mode: 'FAILED_ACTIONS' | 'ALL_ACTIONS' }
  | { operation: 'release' }
  | { operation: 'stop'; runId: string };

function describe(pipeline: string, target: OperationTarget): { title: string; body: string; button: string } {
  switch (target.operation) {
    case 'retry': {
      const what = target.mode === 'FAILED_ACTIONS' ? 'its failed actions' : 'all of its actions';
      return {
        title: `Retry ${target.stage} on ${pipeline}`,
        body: `This runs ${what} again in run ${shortSha(target.runId)}, with the same commits. Later stages follow as usual, approvals included.`,
        button: 'Retry',
      };
    }
    case 'release':
      return {
        title: `Release a change on ${pipeline}`,
        body: 'This starts a new run from the latest commit on the source branch, as a push would.',
        button: 'Release',
      };
    case 'stop':
      return {
        title: `Stop run ${shortSha(target.runId)} of ${pipeline}`,
        body: 'Stopping lets actions already running finish, then ends the run. Abandoning ends it at once, leaving running actions (a deploy mid-way) unfinished.',
        button: 'Stop run',
      };
  }
}

// Retrying, releasing or stopping a pipeline run, after a confirmation. CodePipeline keeps a stop's reason; the
// others are recorded with who asked in the controller's approvals Lambda log.
export function PipelineOperationDialog({ pipeline, target, onClose, onDone }: {
  pipeline: string;
  target: OperationTarget | null;
  onClose: () => void;
  onDone: (runId: string) => void;
}) {
  const [reason, setReason] = useState('');
  const [abandon, setAbandon] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setReason('');
    setAbandon(false);
    setError(null);
  }, [target]);

  if (!target) return null;
  const { title, body, button } = describe(pipeline, target);
  const stopping = target.operation === 'stop';
  const ready = !stopping || reason.trim().length > 0;

  const run = async () => {
    setSaving(true);
    setError(null);
    const request: PipelineOperation = target.operation === 'stop'
      ? { ...target, abandon, reason: reason.trim() }
      : { ...target, reason: reason.trim() };
    try {
      const result = await controllerApi.operatePipeline(pipeline, request);
      onDone(result.runId);
      onClose();
    } catch (e) {
      setError(errorMessage(e, `${button} failed`));
    } finally {
      setSaving(false);
    }
  };

  return (
    // Opened from the pipeline dialog, so it stacks above it.
    <Modal opened onClose={onClose} title={title} size="md" zIndex={300}>
      <Stack gap="sm">
        <Text size="sm">{body}</Text>
        {stopping && (
          <Checkbox label="Abandon (don't wait for running actions)" checked={abandon}
            onChange={e => setAbandon(e.currentTarget.checked)} />
        )}
        <Textarea label="Reason" required={stopping} autosize minRows={2} maxLength={stopping ? 150 : 400}
          value={reason} onChange={e => setReason(e.currentTarget.value)} />
        {error && <Alert color="red">{error}</Alert>}
        <Group justify="flex-end">
          <Button variant="default" onClick={onClose}>Cancel</Button>
          <Button color={stopping ? 'red' : 'blue'} disabled={!ready} loading={saving} onClick={run}>{button}</Button>
        </Group>
      </Stack>
    </Modal>
  );
}
