import { useEffect, useState } from 'react';
import { Alert, Button, Code, Group, Modal, Stack, Text } from '@mantine/core';
import { IconLock } from '@tabler/icons-react';
import { CredentialInputs, CredentialsFileInput } from '../../../components/credentials/CredentialInputs';
import { MarketDataKey } from '../../../types/credentials';
import { registryApi } from '../../../utils/api';
import { errorMessage } from '../../../utils/kill-switch';
import { credentialsFromFile, missingCredentials, SECRET_REGIONS } from '../../../utils/treasury';

// Replaces an exchange's market-data key in every region. Running sessions and collectors keep the key they connected
// with; each picks up the new one when it next starts.
export function SetMarketDataKeyModal({ target, exchangeName, onClose, onSaved }: {
  target: MarketDataKey | null;
  exchangeName: string;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [credentials, setCredentials] = useState<Record<string, string>>({});
  const [fileError, setFileError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState<MarketDataKey | null>(null);

  useEffect(() => {
    setCredentials({});
    setFileError(null);
    setError(null);
    setSaved(null);
  }, [target]);

  if (!target) return null;
  const exchangeCode = target.exchangeCode;
  const missing = missingCredentials(exchangeCode, credentials);

  const close = () => {
    if (!saving) onClose();
  };

  const fillFromFile = async (file: File | null) => {
    if (!file) return;
    const filled = credentialsFromFile(exchangeCode, await file.text());
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
      setSaved(await registryApi.setMarketDataKey(exchangeCode, credentials));
      setCredentials({});
      onSaved();
    } catch (e) {
      setError(errorMessage(e, 'Setting the key failed'));
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal opened onClose={close} title={`${exchangeName} market data key`} size="lg">
      {saved ? (
        <Stack>
          <Text size="sm">
            Stored as <Code>{saved.secretName}</Code>, copying to {SECRET_REGIONS.join(', ')}.
          </Text>
          <Text size="sm" c="dimmed">
            Sessions and collectors already running keep the key they connected with; each uses the new one when it
            next starts. The page shows when every region has it.
          </Text>
          <Group justify="flex-end"><Button onClick={close}>Done</Button></Group>
        </Stack>
      ) : (
        <Stack>
          <Text size="sm">
            Use a key of its own, not an account&apos;s trading or poller key, so each can be revoked without breaking the
            others. Every session and collector, paper included, can read this key.
            {exchangeCode === 'KALSHI' && <> Create it with only the <b>read</b> scope.</>}
          </Text>
          {exchangeCode === 'POLYMARKET_US' && (
            <Alert color="yellow" variant="light">
              Polymarket US keys have no scopes, so this one can trade the account it was created on.
            </Alert>
          )}
          {exchangeCode !== 'KALSHI' && <CredentialsFileInput onFile={(file) => { void fillFromFile(file); }} error={fileError} />}
          <CredentialInputs exchangeCode={exchangeCode} values={credentials} idPrefix="market-data" omit={['subaccount']}
            onChange={(key, value) => setCredentials((c) => ({ ...c, [key]: value }))} />
          <Alert variant="light" color="gray" icon={<IconLock size={16} />}>
            <Text size="sm">Stored in Secrets Manager as <Code>{target.secretName}</Code>, replicated to {SECRET_REGIONS.join(', ')}.</Text>
          </Alert>
          {error && <Alert color="red">{error}</Alert>}
          <Group justify="flex-end">
            {missing.length > 0 && <Text size="xs" c="dimmed">Missing: {missing.join(', ')}</Text>}
            <Button variant="default" onClick={close} disabled={saving}>Cancel</Button>
            <Button onClick={save} loading={saving} disabled={missing.length > 0}>Save key</Button>
          </Group>
        </Stack>
      )}
    </Modal>
  );
}
