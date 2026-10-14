import { useEffect, useRef, useState } from 'react';
import { Alert, Button, Checkbox, Group, Modal, NumberInput, SegmentedControl, Stack, Text, TextInput } from '@mantine/core';
import { DateTimePicker } from '@mantine/dates';
import { AccountConfigUpdate } from '../../types/treasury';
import { registryApi } from '../../utils/api';
import { errorMessage } from '../../utils/kill-switch';
import { plainDecimal } from '../../utils/format';
import { dollarsToUnits, formatPartitionThresholds, parsePartitionThresholds } from '../../utils/treasury';
import { AccountRow } from './types';

const MONEY_FIELDS = [
  { key: 'minBuffer', label: 'Minimum buffer ($)', hint: 'Kept free: live allocations on the account may not exceed its equity less this' },
  { key: 'lowBalanceThreshold', label: 'Low balance below ($)', hint: 'Available cash under this is flagged; 0 turns the check off' },
  { key: 'cashTolerance', label: 'Cash tolerance ($)', hint: 'A cash difference up to this is rounding, not a break (default $0.05)' },
  { key: 'dustThreshold', label: 'Dust below ($)', hint: 'A draining account holding less than this is ready to retire (default $0.01)' },
] as const;

type MoneyKey = typeof MONEY_FIELDS[number]['key'];

interface AccountSettingsModalProps {
  row: AccountRow | null;
  onClose: () => void;
  onSaved: () => void;
}

// The registry has no read for an account's settings beyond the two the treasury summary carries, so every other
// field starts empty and only what is filled in is changed.
export function AccountSettingsModal({ row, onClose, onSaved }: AccountSettingsModalProps) {
  const [money, setMoney] = useState<Record<MoneyKey, string>>({ minBuffer: '', lowBalanceThreshold: '', cashTolerance: '', dustThreshold: '' });
  const [maxActiveDays, setMaxActiveDays] = useState<number | string>('');
  const [noRotation, setNoRotation] = useState(false);
  const [recon, setRecon] = useState<'unchanged' | 'on' | 'off'>('unchanged');
  const [reconSince, setReconSince] = useState<Date | null>(null);
  const [snapshotMaxAge, setSnapshotMaxAge] = useState<number | string>('');
  const [settlementGrace, setSettlementGrace] = useState<number | string>('');
  const [shardThresholds, setShardThresholds] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Filled in when the dialog opens for an account, and only then: the row is re-read every few seconds, and
  // refilling on each read would wipe what's being typed.
  const openFor = row?.account.accountId ?? null;
  const latest = useRef(row);
  latest.current = row;
  useEffect(() => {
    const treasury = latest.current?.treasury;
    if (openFor === null) return;
    setMoney({
      minBuffer: treasury ? plainDecimal(treasury.minBuffer, 'price') : '',
      lowBalanceThreshold: treasury ? plainDecimal(treasury.lowBalanceThreshold, 'price') : '',
      cashTolerance: '',
      dustThreshold: '',
    });
    setMaxActiveDays('');
    setNoRotation(false);
    setRecon('unchanged');
    setReconSince(null);
    setSnapshotMaxAge('');
    setSettlementGrace('');
    setShardThresholds(treasury ? formatPartitionThresholds(treasury.partitionLowThresholds ?? {}) : '');
    setError(null);
  }, [openFor]);

  const update: AccountConfigUpdate = { accountId: openFor ?? 0 };
  const invalid: string[] = [];
  for (const field of MONEY_FIELDS) {
    const text = money[field.key].trim();
    if (text === '') continue;
    const units = dollarsToUnits(text);
    if (units === null) invalid.push(field.label);
    else update[field.key] = units.toString();
  }
  if (row?.treasury) {
    // Unchanged prefilled values aren't sent, so saving one setting doesn't rewrite the others' audit trail.
    if (update.minBuffer === row.treasury.minBuffer) delete update.minBuffer;
    if (update.lowBalanceThreshold === row.treasury.lowBalanceThreshold) delete update.lowBalanceThreshold;
  }
  if (noRotation) update.maxActiveDays = null;
  else if (maxActiveDays !== '') update.maxActiveDays = Number(maxActiveDays);
  if (recon !== 'unchanged') update.reconEnabled = recon === 'on';
  if (reconSince) update.reconSince = reconSince.toISOString();
  if (snapshotMaxAge !== '') update.snapshotMaxAgeMinutes = Number(snapshotMaxAge);
  if (settlementGrace !== '') update.settlementGraceMinutes = Number(settlementGrace);
  const isKalshi = row?.account.exchangeCode === 'KALSHI';
  const thresholds = isKalshi ? parsePartitionThresholds(shardThresholds) : {};
  if (thresholds === null) invalid.push('Shard thresholds');
  else if (isKalshi && JSON.stringify(thresholds) !== JSON.stringify(row?.treasury?.partitionLowThresholds ?? {})) {
    update.partitionLowThresholds = thresholds;
  }
  const changes = Object.keys(update).length - 1;

  const save = async () => {
    setSaving(true);
    setError(null);
    try {
      await registryApi.updateAccountConfig(update);
      onSaved();
      onClose();
    } catch (e) {
      setError(errorMessage(e, 'Saving settings failed'));
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal opened={!!row} onClose={() => { if (!saving) onClose(); }} title={`Settings: ${row?.account.label ?? ''}`} size="lg">
      <Stack gap="sm">
        <Text size="xs" c="dimmed">Only the fields filled in or changed are saved; empty ones keep their current value.</Text>
        <Group grow align="flex-start">
          {MONEY_FIELDS.slice(0, 2).map((field) => (
            <TextInput key={field.key} label={field.label} description={field.hint} value={money[field.key]} placeholder="unchanged"
              onChange={(e) => { const value = e.currentTarget.value; setMoney((m) => ({ ...m, [field.key]: value })); }}
              error={invalid.includes(field.label) ? 'A non-negative amount' : undefined} />
          ))}
        </Group>
        <Group grow align="flex-start">
          {MONEY_FIELDS.slice(2).map((field) => (
            <TextInput key={field.key} label={field.label} description={field.hint} value={money[field.key]} placeholder="unchanged"
              onChange={(e) => { const value = e.currentTarget.value; setMoney((m) => ({ ...m, [field.key]: value })); }}
              error={invalid.includes(field.label) ? 'A non-negative amount' : undefined} />
          ))}
        </Group>
        {isKalshi && (
          <TextInput label="Shard low-cash thresholds" placeholder="e.g. 0=50, 3=20"
            description="Kalshi's cash only backs orders on its own shard's markets. Shards listed as shard=dollars are flagged when their cash falls below that; leave empty for none."
            value={shardThresholds} onChange={(e) => setShardThresholds(e.currentTarget.value)}
            error={thresholds === null ? 'shard=dollars, comma separated' : undefined} />
        )}
        <Group grow align="flex-end">
          <NumberInput label="Rotate after (days active)" description="Flags the account as due for rotation" placeholder="unchanged"
            min={1} allowDecimal={false} value={maxActiveDays} onChange={setMaxActiveDays} disabled={noRotation} />
          <Checkbox label="Never due for rotation" checked={noRotation} onChange={(e) => setNoRotation(e.currentTarget.checked)} mb={8} />
        </Group>
        <Group grow align="flex-start">
          <NumberInput label="Snapshot stale after (min)" description="Older balances are flagged and block launches" placeholder="unchanged"
            min={1} allowDecimal={false} value={snapshotMaxAge} onChange={setSnapshotMaxAge} />
          <NumberInput label="Settlement grace (min)" description="How long a settled market may stay unpaid before it can break" placeholder="unchanged"
            min={1} allowDecimal={false} value={settlementGrace} onChange={setSettlementGrace} />
        </Group>
        <Group grow align="flex-end">
          <Stack gap={4}>
            <Text size="sm" fw={500}>Reconciliation</Text>
            <SegmentedControl value={recon} onChange={(v) => setRecon(v as 'unchanged' | 'on' | 'off')}
              data={[{ value: 'unchanged', label: 'Unchanged' }, { value: 'on', label: 'On' }, { value: 'off', label: 'Off' }]} />
          </Stack>
          <DateTimePicker label="Reconcile from" description="Normally set by the first OPENING transfer" placeholder="unchanged"
            value={reconSince} onChange={setReconSince} valueFormat="YYYY-MM-DD HH:mm" clearable />
        </Group>
        {error && <Alert color="red">{error}</Alert>}
        <Group justify="flex-end">
          {invalid.length > 0 && <Text size="xs" c="red">Fix {invalid.join(', ')}</Text>}
          <Button variant="default" onClick={onClose} disabled={saving}>Cancel</Button>
          <Button disabled={changes === 0 || invalid.length > 0} loading={saving} onClick={save}>
            Save {changes > 0 ? `${changes} change${changes === 1 ? '' : 's'}` : ''}
          </Button>
        </Group>
      </Stack>
    </Modal>
  );
}
