import { ReactNode, useEffect, useState } from 'react';
import { Alert, Button, Group, Modal, Stack, Text, TextInput } from '@mantine/core';
import { errorMessage } from '../utils/kill-switch';

interface ReasonConfirmModalProps {
  opened: boolean;
  onClose: () => void;
  title: string;
  message: ReactNode;
  confirmLabel: string;
  confirmColor?: string;
  loadingMessage?: string;
  onConfirm: (reason: string | undefined) => Promise<void>;
}

export function ReasonConfirmModal({
  opened,
  onClose,
  title,
  message,
  confirmLabel,
  confirmColor = 'red',
  loadingMessage,
  onConfirm,
}: ReasonConfirmModalProps) {
  const [reason, setReason] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (opened) {
      setReason('');
      setError(null);
    }
  }, [opened]);

  const handleConfirm = async () => {
    setSubmitting(true);
    setError(null);
    try {
      await onConfirm(reason.trim() || undefined);
      onClose();
    } catch (e) {
      setError(errorMessage(e, `${confirmLabel} failed`));
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Modal opened={opened} onClose={() => { if (!submitting) onClose(); }} title={title} size="md">
      <Stack>
        {typeof message === 'string' ? <Text>{message}</Text> : message}
        <TextInput
          label="Reason (optional)"
          description="Recorded in the risk policy audit log"
          value={reason}
          onChange={(e) => setReason(e.currentTarget.value)}
          disabled={submitting}
        />
        {submitting && loadingMessage && <Text size="sm" c="dimmed">{loadingMessage}</Text>}
        {error && <Alert color="red" title="Error">{error}</Alert>}
        <Group justify="flex-end">
          <Button variant="outline" onClick={onClose} disabled={submitting}>Cancel</Button>
          <Button color={confirmColor} loading={submitting} onClick={handleConfirm}>{confirmLabel}</Button>
        </Group>
      </Stack>
    </Modal>
  );
}
