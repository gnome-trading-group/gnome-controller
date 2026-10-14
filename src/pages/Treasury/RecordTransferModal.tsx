import { useEffect, useState } from 'react';
import { Alert, Button, Group, Modal, Select, Stack, Text, Textarea, TextInput } from '@mantine/core';
import { DateTimePicker } from '@mantine/dates';
import { TRANSFER_KINDS, TransferKind, VenueAccount } from '../../types/treasury';
import { registryApi } from '../../utils/api';
import { errorMessage } from '../../utils/kill-switch';
import { formatMoney } from '../../utils/format';
import { isSignedTransferKind, transferAmount } from '../../utils/treasury';

const KIND_HINTS: Record<TransferKind, string> = {
  OPENING: "The account's cash when reconciliation starts; the first one sets where it starts from",
  DEPOSIT: 'Money sent to the account',
  WITHDRAWAL: 'Money taken out; type the amount withdrawn, it is recorded as money out',
  INTEREST: 'Interest the venue paid',
  REWARD: 'A venue reward or rebate',
  FEE_ADJUSTMENT: 'A fee the ledger got wrong; negative when the venue charged more',
  CORRECTION: 'Anything else that explains a difference; negative for money out',
};

interface RecordTransferModalProps {
  // undefined while closed; null to pick the account in the dialog.
  accountId: number | null | undefined;
  accounts: VenueAccount[];
  onClose: () => void;
  onRecorded: () => void;
}

// Money moving into or out of an account other than by trading. Transfers are never edited: a mistake is undone by
// recording another one.
export function RecordTransferModal({ accountId, accounts, onClose, onRecorded }: RecordTransferModalProps) {
  const [account, setAccount] = useState<string | null>(null);
  const [kind, setKind] = useState<TransferKind>('DEPOSIT');
  const [dollars, setDollars] = useState('');
  const [occurredAt, setOccurredAt] = useState<Date | null>(null);
  const [externalRef, setExternalRef] = useState('');
  const [reason, setReason] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const opened = accountId !== undefined;
  useEffect(() => {
    if (!opened) return;
    setAccount(accountId === null ? null : String(accountId));
    setKind('DEPOSIT');
    setDollars('');
    setOccurredAt(null);
    setExternalRef('');
    setReason('');
    setError(null);
  }, [opened, accountId]);

  const amount = transferAmount(kind, dollars);
  const chosen = accounts.find((a) => String(a.accountId) === account);
  const blocker = !chosen ? 'Pick the account'
    : amount === null ? (dollars === '' ? 'Enter the amount' : 'Not a valid amount for this kind')
    : reason.trim() === '' ? 'Add a reason' : null;

  const save = async () => {
    if (!chosen || amount === null || blocker) return;
    setSaving(true);
    setError(null);
    try {
      await registryApi.recordTransfer({
        accountId: chosen.accountId,
        kind,
        amount: amount.toString(),
        occurredAt: occurredAt?.toISOString(),
        externalRef: externalRef.trim() || undefined,
        reason: reason.trim(),
      });
      onRecorded();
      onClose();
    } catch (e) {
      setError(errorMessage(e, 'Recording the transfer failed'));
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal opened={opened} onClose={() => { if (!saving) onClose(); }} title="Record transfer" size="md">
      <Stack gap="sm">
        <Select
          label="Account"
          data={accounts.filter((a) => a.status !== 'RETIRED')
            .map((a) => ({ value: String(a.accountId), label: `${a.label} (${a.exchangeCode})` }))}
          value={account}
          onChange={setAccount}
          searchable
          required
        />
        <Select
          label="Kind"
          data={TRANSFER_KINDS.map((k) => ({ value: k, label: k }))}
          value={kind}
          onChange={(v) => setKind((v ?? 'DEPOSIT') as TransferKind)}
          description={KIND_HINTS[kind]}
        />
        <Group grow align="flex-start">
          <TextInput
            label="Amount ($)"
            description={isSignedTransferKind(kind) ? 'Signed: negative is money out' : 'A positive amount'}
            value={dollars}
            onChange={(e) => setDollars(e.currentTarget.value)}
            error={dollars !== '' && amount === null ? 'Not a valid amount for this kind' : undefined}
          />
          <DateTimePicker
            label="When"
            description="Leave empty for now"
            value={occurredAt}
            onChange={setOccurredAt}
            valueFormat="YYYY-MM-DD HH:mm"
            clearable
          />
        </Group>
        <TextInput
          label="External reference"
          description="A transaction hash or the venue's transfer id"
          value={externalRef}
          onChange={(e) => setExternalRef(e.currentTarget.value)}
        />
        <Textarea label="Reason" required autosize minRows={2} value={reason} onChange={(e) => setReason(e.currentTarget.value)} />
        {chosen && amount !== null && (
          <Text size="sm">
            Records <b>{formatMoney(amount).text}</b> {amount < 0n ? 'out of' : 'into'} <b>{chosen.label}</b>.
          </Text>
        )}
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
