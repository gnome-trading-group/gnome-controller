import { useEffect, useState } from 'react';
import { Alert, Button, Code, Group, Modal, Stack, Text } from '@mantine/core';
import { DeletedSecrets } from '../../types/treasury';
import { registryApi } from '../../utils/api';
import { errorMessage } from '../../utils/kill-switch';
import { AccountRow } from './types';

// A retired account's credentials are only a liability. Secrets Manager keeps them recoverable for a week, so a
// mistake here can still be undone from the AWS console.
export function DeleteSecretsModal({ row, onClose }: { row: AccountRow | null; onClose: () => void }) {
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [deleted, setDeleted] = useState<DeletedSecrets | null>(null);

  useEffect(() => {
    setError(null);
    setDeleted(null);
  }, [row]);

  const confirm = async () => {
    if (!row) return;
    setSaving(true);
    setError(null);
    try {
      setDeleted(await registryApi.deleteAccountSecrets(row.account.accountId));
    } catch (e) {
      setError(errorMessage(e, 'Deleting the secrets failed'));
    } finally {
      setSaving(false);
    }
  };

  const account = row?.account;
  return (
    <Modal opened={row !== null} onClose={() => !saving && onClose()} title="Delete account secrets">
      {account && (
        <Stack>
          {deleted ? (
            <>
              <Text size="sm">
                Scheduled for deletion in {deleted.recoveryWindowDays} days (restorable from the Secrets Manager console until then):
              </Text>
              {deleted.deleted.map((name) => <Code key={name} block>{name}</Code>)}
              <Group justify="flex-end"><Button onClick={onClose}>Done</Button></Group>
            </>
          ) : (
            <>
              <Text size="sm">
                Deletes the credentials of retired account <b>{account.label}</b> from every region:
              </Text>
              {[account.tradingSecretName, account.readSecretName].filter(Boolean).map((name) => (
                <Code key={name} block>{name}</Code>
              ))}
              <Text size="xs" c="dimmed">
                Withdraw everything first: once the recovery window passes, nothing can sign for this account again.
              </Text>
              {error && <Alert color="red">{error}</Alert>}
              <Group justify="flex-end">
                <Button variant="default" onClick={onClose} disabled={saving}>Cancel</Button>
                <Button color="red" onClick={confirm} loading={saving}>Delete secrets</Button>
              </Group>
            </>
          )}
        </Stack>
      )}
    </Modal>
  );
}
