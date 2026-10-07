import { useEffect, useState } from 'react';
import { Alert, Button, Group, Modal, Stack, Text, Textarea, TextInput } from '@mantine/core';
import { PipelineRow, WaitingApproval } from '../../types';
import { controllerApi } from '../../utils/api';
import { errorMessage } from '../../utils/kill-switch';

export interface ApprovalTarget {
  pipeline: PipelineRow;
  approval: WaitingApproval;
  decision: 'Approved' | 'Rejected';
}

// Approving ships to prod, so it takes the pipeline's name typed out and a reason; both decisions are recorded on
// the approval with who made them.
export function ApprovalDialog({ target, onClose, onDecided }: {
  target: ApprovalTarget | null; onClose: () => void; onDecided: () => void;
}) {
  const [typed, setTyped] = useState('');
  const [reason, setReason] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setTyped('');
    setReason('');
    setError(null);
  }, [target]);

  if (!target) return null;
  const { pipeline, approval, decision } = target;
  const approving = decision === 'Approved';
  const ready = typed.trim() === pipeline.name && reason.trim().length > 0 && !!approval.token;

  const decide = async () => {
    setSaving(true);
    setError(null);
    try {
      await controllerApi.decideApproval({
        pipeline: pipeline.name, stage: approval.stage, action: approval.action, token: approval.token as string,
        decision, reason: reason.trim(),
      });
      onDecided();
      onClose();
    } catch (e) {
      setError(errorMessage(e, 'The approval was not recorded'));
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal opened onClose={onClose} title={`${approving ? 'Approve' : 'Reject'} ${approval.action} on ${pipeline.name}`} size="md">
      <Stack gap="sm">
        <Text size="sm">
          {approving
            ? `This lets ${pipeline.name} continue into ${approval.stage}.`
            : `This stops this run of ${pipeline.name} before ${approval.stage}.`}
          {' '}Your name and reason are recorded on the approval.
        </Text>
        {approving && !approval.earlierStagesPassed && (
          <Alert color="orange" variant="light">This run hasn't passed the stages before {approval.stage}.</Alert>
        )}
        <TextInput label={`Type ${pipeline.name} to confirm`} value={typed} onChange={e => setTyped(e.currentTarget.value)} />
        <Textarea label="Reason" required autosize minRows={2} maxLength={400} value={reason}
          onChange={e => setReason(e.currentTarget.value)} />
        {error && <Alert color="red">{error}</Alert>}
        <Group justify="flex-end">
          <Button variant="default" onClick={onClose}>Cancel</Button>
          <Button color={approving ? 'green' : 'red'} disabled={!ready} loading={saving} onClick={decide}>
            {approving ? 'Approve' : 'Reject'}
          </Button>
        </Group>
      </Stack>
    </Modal>
  );
}
