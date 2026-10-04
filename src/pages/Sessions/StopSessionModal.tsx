import { useEffect, useState } from 'react';
import { Alert, Button, Group, List, Modal, Stack, Text } from '@mantine/core';
import { StrategySession } from '../../types';
import { registryApi } from '../../utils/api';
import { errorMessage } from '../../utils/kill-switch';

interface StopSessionModalProps {
  session: StrategySession | null;
  onClose: () => void;
  onStopped: () => void;
}

export function StopSessionModal({ session, onClose, onStopped }: StopSessionModalProps) {
  const [stopping, setStopping] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (session) setError(null);
  }, [session]);

  const handleStop = async () => {
    if (!session) return;
    setStopping(true);
    setError(null);
    try {
      await registryApi.stopSession(session.sessionId);
      onClose();
      onStopped();
    } catch (e) {
      setError(errorMessage(e, 'Failed to stop session'));
    } finally {
      setStopping(false);
    }
  };

  return (
    <Modal opened={!!session} onClose={() => { if (!stopping) onClose(); }} title="Stop Session" size="md">
      <Stack>
        <Text>
          Stop session <Text span fw={500} style={{ fontFamily: 'monospace' }}>{session?.sessionId.slice(0, 8)}…</Text>
          {' '}(strategy {session?.strategyId})? This will:
        </Text>
        <List size="sm" spacing={4}>
          <List.Item>Kill the strategy — <Text span fw={500}>all</Text> of its running sessions stop trading and their open orders are cancelled.</List.Item>
          <List.Item>Wait a few seconds for the cancels to go out.</List.Item>
          <List.Item>Shut this session down.</List.Item>
        </List>
        <Text size="sm" c="dimmed">The strategy stays killed until it is resumed from the strategy page.</Text>
        {stopping && <Text size="sm" c="dimmed">Cancelling orders and stopping the session — this takes about 5 seconds…</Text>}
        {error && <Alert color="red" title="Error">{error}</Alert>}
        <Group justify="flex-end">
          <Button variant="outline" onClick={onClose} disabled={stopping}>Cancel</Button>
          <Button color="red" loading={stopping} onClick={handleStop}>Stop</Button>
        </Group>
      </Stack>
    </Modal>
  );
}
