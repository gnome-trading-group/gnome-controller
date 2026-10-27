import { useEffect, useState } from 'react';
import { Alert, Button, Group, Modal, NumberInput, SegmentedControl, Stack, Text, TextInput } from '@mantine/core';
import { MarketDataAccount } from '../../../types/credentials';
import { registryApi } from '../../../utils/api';
import { errorMessage } from '../../../utils/kill-switch';

// Retires or reactivates a market-data account and changes its budget or note; its key stays as it is. A retired
// account is refused when a shard next opens a connection with it, failing only that source's markets on the shard.
export function EditMarketDataAccountModal({ account, sourceName, onClose, onSaved }: {
  account: MarketDataAccount | null;
  sourceName: string;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [status, setStatus] = useState<'ACTIVE' | 'RETIRED'>('ACTIVE');
  const [budget, setBudget] = useState<number | ''>('');
  const [note, setNote] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setStatus(account?.status ?? 'ACTIVE');
    setBudget(account?.connectionBudget ?? '');
    setNote(account?.note ?? '');
    setError(null);
  }, [account]);

  if (!account) return null;

  const save = async () => {
    setSaving(true);
    setError(null);
    try {
      await registryApi.updateMarketDataAccount(account.accountId, {
        status, connectionBudget: budget === '' ? null : budget, note,
      });
      onSaved();
      onClose();
    } catch (e) {
      setError(errorMessage(e, 'Saving the account failed'));
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal opened onClose={() => !saving && onClose()} title={`${sourceName} ${account.label}`}>
      <Stack>
        <SegmentedControl value={status} onChange={(v) => setStatus(v as 'ACTIVE' | 'RETIRED')}
          data={[{ label: 'Active', value: 'ACTIVE' }, { label: 'Retired', value: 'RETIRED' }]} />
        {status === 'RETIRED' && account.status === 'ACTIVE' && (
          <Alert color="yellow" variant="light">
            Shards bound to {account.label} stop collecting {sourceName} when they next open a connection, until they
            are bound to another account.
          </Alert>
        )}
        <NumberInput label="Connection budget" min={1} allowDecimal={false} value={budget}
          description="Leave empty for the source's own limit."
          onChange={(v) => setBudget(typeof v === 'number' ? v : '')} />
        <TextInput label="Note" value={note} onChange={(e) => setNote(e.currentTarget.value)} />
        {error && <Alert color="red">{error}</Alert>}
        <Group justify="flex-end">
          <Text size="xs" c="dimmed">The key itself is unchanged.</Text>
          <Button variant="default" onClick={onClose} disabled={saving}>Cancel</Button>
          <Button onClick={save} loading={saving}>Save</Button>
        </Group>
      </Stack>
    </Modal>
  );
}
