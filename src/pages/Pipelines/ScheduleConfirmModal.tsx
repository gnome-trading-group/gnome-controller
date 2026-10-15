import { useEffect, useState } from 'react';
import { Alert, Button, Code, Group, Modal, Stack, Text } from '@mantine/core';
import { PipelineSchedule } from '../../types/pipeline';
import { errorMessage } from '../../utils/kill-switch';

// Switching a schedule on starts unattended runs (in prod, writing prod data), so it's confirmed with what it will do.
function ScheduleConfirmModal({ pipelineName, schedule, onClose, onConfirm }: {
  pipelineName: string;
  schedule: PipelineSchedule | null;
  onClose: () => void;
  onConfirm: (schedule: PipelineSchedule) => Promise<void>;
}) {
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (schedule) setError(null);
  }, [schedule]);

  const switchingOn = schedule ? !schedule.enabled : false;

  const confirm = async () => {
    if (!schedule) return;
    setSubmitting(true);
    setError(null);
    try {
      await onConfirm(schedule);
      onClose();
    } catch (e) {
      setError(errorMessage(e, 'Failed to switch the schedule'));
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Modal opened={schedule !== null} onClose={() => { if (!submitting) onClose(); }} size="md"
           title={schedule ? `Switch ${switchingOn ? 'on' : 'off'} ${pipelineName} · ${schedule.name}?` : ''}>
      {schedule && (
        <Stack>
          {switchingOn ? (
            <Text size="sm">
              {pipelineName} will run on its own on <Code>{schedule.expression}</Code> (UTC)
              {schedule.description ? ` — ${schedule.description}` : ''}.
            </Text>
          ) : (
            <Text size="sm">
              {pipelineName} will stop running on <Code>{schedule.expression}</Code>. A run already in progress finishes;
              you can still start runs by hand.
            </Text>
          )}
          {switchingOn && (
            <>
              <Text size="xs" c="dimmed">Each run uses these parameters:</Text>
              <Code block>{JSON.stringify(schedule.params, null, 2)}</Code>
            </>
          )}
          {error && <Alert color="red" title="Error">{error}</Alert>}
          <Group justify="flex-end">
            <Button variant="outline" onClick={onClose} disabled={submitting}>Cancel</Button>
            <Button color={switchingOn ? 'green' : 'red'} loading={submitting} onClick={confirm}>
              Switch {switchingOn ? 'on' : 'off'}
            </Button>
          </Group>
        </Stack>
      )}
    </Modal>
  );
}

export default ScheduleConfirmModal;
