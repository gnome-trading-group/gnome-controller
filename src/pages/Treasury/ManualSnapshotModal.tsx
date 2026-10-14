import { useEffect, useState } from 'react';
import { Alert, Button, Group, Modal, Stack, Text, TextInput } from '@mantine/core';
import { registryApi } from '../../utils/api';
import { errorMessage } from '../../utils/kill-switch';
import { dollarsToUnits } from '../../utils/treasury';
import { AccountRow } from './types';

interface ManualSnapshotModalProps {
  row: AccountRow | null;
  onClose: () => void;
  onRecorded: () => void;
}

// An operator's reading of the venue's balances, for when the poller can't read them: it keeps launches and the
// allocation check working, and is reconciled like any snapshot, but on cash only since it lists no positions.
export function ManualSnapshotModal({ row, onClose, onRecorded }: ManualSnapshotModalProps) {
  const [cashTotal, setCashTotal] = useState('');
  const [cashAvailable, setCashAvailable] = useState('');
  const [redeemable, setRedeemable] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const openFor = row?.account.accountId ?? null;
  useEffect(() => {
    setCashTotal('');
    setCashAvailable('');
    setRedeemable('');
    setError(null);
  }, [openFor]);

  const total = dollarsToUnits(cashTotal);
  const available = cashAvailable.trim() === '' ? undefined : dollarsToUnits(cashAvailable);
  const redeemableValue = redeemable.trim() === '' ? undefined : dollarsToUnits(redeemable);
  const blocker = total === null ? 'Enter the cash total'
    : available === null || redeemableValue === null ? 'Amounts must be non-negative dollars' : null;

  const save = async () => {
    if (!row || total === null || blocker) return;
    setSaving(true);
    setError(null);
    try {
      await registryApi.recordSnapshot({
        accountId: row.account.accountId,
        status: 'OK',
        cashTotal: total.toString(),
        cashAvailable: available?.toString(),
        redeemableValue: redeemableValue?.toString(),
        positions: null,
      });
      onRecorded();
      onClose();
    } catch (e) {
      setError(errorMessage(e, 'Recording the snapshot failed'));
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal opened={!!row} onClose={() => { if (!saving) onClose(); }} title={`Manual balance: ${row?.account.label ?? ''}`} size="md">
      <Stack gap="sm">
        <Text size="sm">
          Only when the venue poller can't read this account. Read the balances off the venue's own site; the reading
          is recorded under your name and reconciled on cash only.
        </Text>
        <TextInput label="Cash total ($)" description="All cash, including what resting orders hold" required
          value={cashTotal} onChange={(e) => setCashTotal(e.currentTarget.value)}
          error={cashTotal !== '' && total === null ? 'A non-negative amount' : undefined} />
        <Group grow align="flex-start">
          <TextInput label="Cash available ($)" description="What new orders may still use" placeholder="optional"
            value={cashAvailable} onChange={(e) => setCashAvailable(e.currentTarget.value)}
            error={available === null ? 'A non-negative amount' : undefined} />
          <TextInput label="Redeemable ($)" description="Resolved positions not yet redeemed" placeholder="optional"
            value={redeemable} onChange={(e) => setRedeemable(e.currentTarget.value)}
            error={redeemableValue === null ? 'A non-negative amount' : undefined} />
        </Group>
        {error && <Alert color="red">{error}</Alert>}
        <Group justify="flex-end">
          {blocker && <Text size="xs" c="dimmed">{blocker}</Text>}
          <Button variant="default" onClick={onClose} disabled={saving}>Cancel</Button>
          <Button disabled={!!blocker} loading={saving} onClick={save}>Record</Button>
        </Group>
      </Stack>
    </Modal>
  );
}
