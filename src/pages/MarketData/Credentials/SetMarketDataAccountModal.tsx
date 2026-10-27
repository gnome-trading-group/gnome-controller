import { useEffect, useState } from 'react';
import { Alert, Button, Code, Group, Modal, NumberInput, Stack, Text, TextInput } from '@mantine/core';
import { IconLock } from '@tabler/icons-react';
import { CredentialInputs, CredentialsFileInput } from '../../../components/credentials/CredentialInputs';
import { MarketDataAccount } from '../../../types/credentials';
import { registryApi } from '../../../utils/api';
import { labelProblem, nextLabel } from '../../../utils/credentials';
import { errorMessage } from '../../../utils/kill-switch';
import { credentialsFromFile, missingCredentials, SECRET_REGIONS } from '../../../utils/treasury';

/** Adding an account to a source, or replacing the key of one it has. */
export type AccountTarget =
  | { kind: 'add'; sourceCode: string; existingLabels: string[] }
  | { kind: 'replace'; account: MarketDataAccount };

// Writes a market-data account's key to every region and records the account. Shards already connected keep the key
// they signed in with; each uses the new one when it next opens a connection.
export function SetMarketDataAccountModal({ target, sourceName, onClose, onSaved }: {
  target: AccountTarget | null;
  sourceName: string;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [label, setLabel] = useState('');
  const [budget, setBudget] = useState<number | ''>('');
  const [note, setNote] = useState('');
  const [credentials, setCredentials] = useState<Record<string, string>>({});
  const [fileError, setFileError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState<MarketDataAccount | null>(null);

  useEffect(() => {
    setLabel(target?.kind === 'add' ? nextLabel(target.existingLabels) : target?.account.label ?? '');
    setBudget(target?.kind === 'replace' ? target.account.connectionBudget ?? '' : '');
    setNote('');
    setCredentials({});
    setFileError(null);
    setError(null);
    setSaved(null);
  }, [target]);

  if (!target) return null;
  const sourceCode = target.kind === 'add' ? target.sourceCode : target.account.sourceCode;
  const problem = target.kind === 'add' ? labelProblem(label, target.existingLabels) : null;
  const missing = missingCredentials(sourceCode, credentials);
  const secretName = `gnome/market-data/${sourceCode.toLowerCase().replace(/_/g, '-')}/${label}`;

  const close = () => {
    if (!saving) onClose();
  };

  const fillFromFile = async (file: File | null) => {
    if (!file) return;
    const filled = credentialsFromFile(sourceCode, await file.text());
    if (filled === null) {
      setFileError('That file isn’t a JSON object of credentials');
      return;
    }
    setFileError(null);
    setCredentials((c) => ({ ...c, ...filled }));
  };

  const save = async () => {
    setSaving(true);
    setError(null);
    try {
      setSaved(await registryApi.setMarketDataAccount({
        sourceCode, label, credentials, connectionBudget: budget === '' ? null : budget,
        note: note.trim() || undefined,
      }));
      setCredentials({});
      onSaved();
    } catch (e) {
      setError(errorMessage(e, 'Saving the account failed'));
    } finally {
      setSaving(false);
    }
  };

  const title = target.kind === 'add' ? `Add a ${sourceName} market data account` : `Replace ${sourceName} ${label}'s key`;
  return (
    <Modal opened onClose={close} title={title} size="lg">
      {saved ? (
        <Stack>
          <Text size="sm">
            Stored as <Code>{saved.secretName}</Code>, copying to {SECRET_REGIONS.join(', ')}.
          </Text>
          <Text size="sm" c="dimmed">
            Shards already connected keep the key they signed in with; each uses this one when it next opens a
            connection. The page shows when every region has it.
          </Text>
          <Group justify="flex-end"><Button onClick={close}>Done</Button></Group>
        </Stack>
      ) : (
        <Stack>
          <Text size="sm">
            A dedicated, unfunded account&apos;s key, used only by collection, so it never spends a trading account&apos;s
            connections.
            {sourceCode === 'KALSHI' && <> Create it with only the <b>read</b> scope.</>}
          </Text>
          {sourceCode === 'POLYMARKET_US' && (
            <Alert color="yellow" variant="light">
              Polymarket US keys have no scopes: use an account with no funds.
            </Alert>
          )}
          {target.kind === 'add' && (
            <TextInput label="Label" description="Shards bind to an account by label (SOURCE_ACCOUNTS); md-1 is the default."
              value={label} onChange={(e) => setLabel(e.currentTarget.value.trim())} error={label ? problem : null} />
          )}
          <NumberInput label="Connection budget" min={1} allowDecimal={false} value={budget}
            description="How many connections this account may hold; leave empty for the source's own limit."
            onChange={(v) => setBudget(typeof v === 'number' ? v : '')} />
          {target.kind === 'add' && (
            <TextInput label="Note" placeholder="Optional" value={note} onChange={(e) => setNote(e.currentTarget.value)} />
          )}
          {sourceCode !== 'KALSHI' && <CredentialsFileInput onFile={(file) => { void fillFromFile(file); }} error={fileError} />}
          <CredentialInputs exchangeCode={sourceCode} values={credentials} idPrefix="market-data-account" omit={['subaccount']}
            onChange={(key, value) => setCredentials((c) => ({ ...c, [key]: value }))} />
          <Alert variant="light" color="gray" icon={<IconLock size={16} />}>
            <Text size="sm">Stored in Secrets Manager as <Code>{secretName}</Code>, replicated to {SECRET_REGIONS.join(', ')}.</Text>
          </Alert>
          {error && <Alert color="red">{error}</Alert>}
          <Group justify="flex-end">
            {missing.length > 0 && <Text size="xs" c="dimmed">Missing: {missing.join(', ')}</Text>}
            <Button variant="default" onClick={close} disabled={saving}>Cancel</Button>
            <Button onClick={save} loading={saving} disabled={missing.length > 0 || problem !== null || !label}>
              Save account
            </Button>
          </Group>
        </Stack>
      )}
    </Modal>
  );
}
