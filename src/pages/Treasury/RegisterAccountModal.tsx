import { useEffect, useState } from 'react';
import { Alert, Badge, Button, Code, Group, List, Modal, Select, Stack, Text, Textarea } from '@mantine/core';
import { IconLock } from '@tabler/icons-react';
import { CredentialInputs, CredentialsFileInput } from '../../components/credentials/CredentialInputs';
import { useGlobalState } from '../../context/GlobalStateContext';
import { CreatedAccount, VenueAccount } from '../../types/treasury';
import { registryApi } from '../../utils/api';
import { errorMessage } from '../../utils/kill-switch';
import {
  CREDENTIAL_FIELDS, credentialsFromFile, missingCredentials, needsKey, SECRET_REGIONS,
} from '../../utils/treasury';

const DEFAULT_EXCHANGE = 'POLYMARKET_INTL';

interface RegisterAccountModalProps {
  opened: boolean;
  onClose: () => void;
  onCreated: () => void;
  // Given, the dialog replaces this account's credentials instead of creating an account.
  account?: VenueAccount;
}

// Creates a venue account, or gives one new credentials: they go to Secrets Manager through the registry, under the
// account's gamer-tag label (a fresh one for a new account), and come back only as the names of the secrets holding
// them. Nothing typed here is kept once the dialog closes.
export function RegisterAccountModal({ opened, onClose, onCreated, account }: RegisterAccountModalProps) {
  const { exchanges } = useGlobalState();
  const venues = exchanges.filter((e) => e.exchangeCode in CREDENTIAL_FIELDS);
  const [exchangeCode, setExchangeCode] = useState<string | null>(null);
  const [credentials, setCredentials] = useState<Record<string, string>>({});
  const [readCredentials, setReadCredentials] = useState<Record<string, string>>({});
  const [note, setNote] = useState('');
  const [fileError, setFileError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [created, setCreated] = useState<CreatedAccount | null>(null);

  const reset = () => {
    setCredentials({});
    setReadCredentials({});
    setNote('');
    setFileError(null);
    setError(null);
    setCreated(null);
  };

  useEffect(() => {
    if (!opened) {
      reset();
      return;
    }
    if (account) {
      setExchangeCode(account.exchangeCode);
      return;
    }
    setExchangeCode((code) => code ?? (venues.some((e) => e.exchangeCode === DEFAULT_EXCHANGE) ? DEFAULT_EXCHANGE : venues[0]?.exchangeCode ?? null));
  }, [opened, venues.length, account?.accountId]); // eslint-disable-line react-hooks/exhaustive-deps

  const close = () => {
    if (saving) return;
    reset();
    onClose();
  };

  const fillFromFile = async (file: File | null) => {
    if (!file || !exchangeCode) return;
    const filled = credentialsFromFile(exchangeCode, await file.text());
    if (filled === null) {
      setFileError('That file isn’t a JSON object of credentials');
      return;
    }
    setFileError(null);
    setCredentials((c) => ({ ...c, ...filled }));
  };

  const exchange = venues.find((e) => e.exchangeCode === exchangeCode);
  const readKey = exchangeCode !== null && needsKey(exchangeCode, 'read');
  const missing = exchangeCode ? missingCredentials(exchangeCode, credentials) : [];
  const missingRead = readKey && exchangeCode ? missingCredentials(exchangeCode, readCredentials) : [];
  const secretNames = ['trading', ...(readKey ? ['read'] : [])]
    .map((kind) => `gnome/accounts/${account?.label ?? '<label>'}/${kind}`);

  const save = async () => {
    if (!exchange) return;
    setSaving(true);
    setError(null);
    try {
      const readOnly = readKey ? readCredentials : undefined;
      const result = account
        ? await registryApi.updateAccountCredentials({ accountId: account.accountId, credentials, readCredentials: readOnly })
        : await registryApi.createVenueAccount({
          exchangeId: exchange.exchangeId, credentials, readCredentials: readOnly, note: note.trim() || undefined,
        });
      setCredentials({});
      setReadCredentials({});
      setCreated(result);
      onCreated();
    } catch (e) {
      setError(errorMessage(e, account ? 'Updating the credentials failed' : 'Creating the account failed'));
    } finally {
      setSaving(false);
    }
  };

  if (created && account) {
    return (
      <Modal opened={opened} onClose={close} title="Credentials updated" size="lg">
        <Stack>
          <Text size="sm"><b>{created.account.label}</b> now uses:</Text>
          {created.secrets.map((s) => (
            <Group key={s.name} gap="xs">
              <IconLock size={14} />
              <Code>{s.name}</Code>
              <Text size="xs" c="dimmed">{s.regions.join(', ')}</Text>
            </Group>
          ))}
          <Text size="sm" c="dimmed">
            The venue poller picks them up on its next run (within 5 minutes). Running sessions keep the credentials they
            started with until they are relaunched.
          </Text>
          <Group justify="flex-end"><Button onClick={close}>Done</Button></Group>
        </Stack>
      </Modal>
    );
  }

  if (created) {
    return (
      <Modal opened={opened} onClose={close} title="Account created" size="lg">
        <Stack>
          <Group gap="xs">
            <Text fw={600} size="lg">{created.account.label}</Text>
            <Badge color="gray">PROVISIONING</Badge>
            <Text size="sm" c="dimmed">account {created.account.accountId}</Text>
          </Group>
          <Stack gap={4}>
            <Text size="sm" fw={500}>Credentials are stored in Secrets Manager:</Text>
            {created.secrets.map((s) => (
              <Group key={s.name} gap="xs">
                <IconLock size={14} />
                <Code>{s.name}</Code>
                <Text size="xs" c="dimmed">{s.regions.join(', ')}</Text>
              </Group>
            ))}
          </Stack>
          <Text size="sm" fw={500}>Next</Text>
          <List size="sm" spacing={4} type="ordered">
            <List.Item>Fund it{exchangeCode === 'POLYMARKET_INTL' ? ' directly from a CEX withdrawal, never from another of our wallets' : ''}.</List.Item>
            <List.Item>Wait for the venue poller&apos;s first green balance (or enter one by hand).</List.Item>
            <List.Item>Record its OPENING transfer: the cash it holds when reconciliation starts.</List.Item>
            <List.Item>Activate it.</List.Item>
          </List>
          <Group justify="flex-end"><Button onClick={close}>Done</Button></Group>
        </Stack>
      </Modal>
    );
  }

  return (
    <Modal opened={opened} onClose={close} title={account ? `Update credentials: ${account.label}` : 'Register a venue account'} size="lg">
      <Stack>
        {account ? (
          <Text size="sm">
            Replaces the credentials {account.label} trades and is read with. They must be for the same{' '}
            {account.exchangeCode === 'POLYMARKET_INTL' ? 'wallet' : 'account'}: a different one is registered as a new
            account. Currently: <Code>{account.tradingSecretName}</Code>
            {account.readSecretName ? <> and <Code>{account.readSecretName}</Code></> : ', with no read-only secret'}.
          </Text>
        ) : (
          <Select label="Exchange" data={venues.map((e) => ({ value: e.exchangeCode, label: e.exchangeName }))}
            value={exchangeCode} onChange={(v) => { setExchangeCode(v); setCredentials({}); setReadCredentials({}); }} />
        )}
        {exchangeCode && (
          <>
            <CredentialsFileInput onFile={(file) => { void fillFromFile(file); }} error={fileError} />
            <CredentialInputs exchangeCode={exchangeCode} values={credentials} idPrefix="trading"
              onChange={(key, value) => setCredentials((c) => ({ ...c, [key]: value }))} />
            {readKey && (
              <Stack gap={4}>
                <Text size="sm" fw={500}>Key for the balance poller</Text>
                <Text size="xs" c="dimmed">
                  A separate key, so it can be revoked without breaking trading.
                  {exchangeCode === 'KALSHI' && ' Create it with only the read scope, so the poller never holds one that can trade.'}
                </Text>
                <CredentialInputs exchangeCode={exchangeCode} values={readCredentials} idPrefix="read" omit={['subaccount']}
                  onChange={(key, value) => setReadCredentials((c) => ({ ...c, [key]: value }))} />
              </Stack>
            )}
            {!account && (
              <Textarea label="Note (optional)" autosize minRows={1} value={note} onChange={(e) => setNote(e.currentTarget.value)} />
            )}
            <Alert variant="light" color="gray" icon={<IconLock size={16} />}>
              <Text size="sm">
                {account
                  ? <>The credentials are stored as:</>
                  : <>A random label (like <Code>sleepy-otter-42</Code>) is drawn when you create it, and the credentials are stored as:</>}
              </Text>
              {secretNames.map((name) => <Code key={name} block mt={4}>{name}</Code>)}
              <Text size="xs" c="dimmed" mt={4}>
                in Secrets Manager, replicated to {SECRET_REGIONS.join(', ')}. The registry keeps only these names; only live
                sessions can read the secrets.
              </Text>
            </Alert>
          </>
        )}
        {error && <Alert color="red">{error}</Alert>}
        <Group justify="flex-end">
          {(missing.length > 0 || missingRead.length > 0) && (
            <Text size="xs" c="dimmed">Missing: {[...missing, ...missingRead.map((m) => `read-only ${m}`)].join(', ')}</Text>
          )}
          <Button variant="default" onClick={close} disabled={saving}>Cancel</Button>
          <Button onClick={save} loading={saving} disabled={!exchange || missing.length > 0 || missingRead.length > 0}>
            {account ? 'Save credentials' : 'Create account'}
          </Button>
        </Group>
      </Stack>
    </Modal>
  );
}
