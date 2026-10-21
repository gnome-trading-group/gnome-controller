import { useEffect, useState } from 'react';
import { Alert, Button, Group, Modal, Stack, Text } from '@mantine/core';
import { errorMessage } from '../../utils/kill-switch';

export function CancelRunModal({ runId, opened, onClose, onConfirm }: {
  runId: string | null;
  opened: boolean;
  onClose: () => void;
  onConfirm: () => Promise<void>;
}) {
  const [cancelling, setCancelling] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (opened) setError(null);
  }, [opened]);

  const confirm = async () => {
    setCancelling(true);
    setError(null);
    try {
      await onConfirm();
      onClose();
    } catch (e) {
      setError(errorMessage(e, 'Failed to cancel the run'));
    } finally {
      setCancelling(false);
    }
  };

  return (
    <Modal opened={opened} onClose={() => { if (!cancelling) onClose(); }} title="Cancel run?" centered>
      <Stack>
        <Text size="sm">
          Terminate every unfinished task of <Text span ff="monospace" size="sm">{runId}</Text>? Outputs already
          written stay in S3.
        </Text>
        {error && <Alert color="red">{error}</Alert>}
        <Group justify="flex-end">
          <Button variant="outline" onClick={onClose} disabled={cancelling}>Back</Button>
          <Button color="red" onClick={confirm} loading={cancelling}>Cancel run</Button>
        </Group>
      </Stack>
    </Modal>
  );
}
