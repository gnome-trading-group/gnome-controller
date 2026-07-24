import { useState, useEffect, useCallback } from 'react';
import {
  ActionIcon,
  Alert,
  Badge,
  Button,
  Container,
  Group,
  Select,
  Stack,
  Text,
  Textarea,
  Title,
  Tooltip,
} from '@mantine/core';
import { IconAlertCircle, IconCheck, IconRefresh } from '@tabler/icons-react';
import ReactTimeAgo from 'react-time-ago';
import { ApiError, controllerApi } from '../../utils/api';

const SERVICES = [
  { value: 'classifier', label: 'gnome-classifier' },
];

interface ConfigState {
  config: Record<string, unknown>;
  version: number;
  updatedAt: string | null;
  updatedBy: string | null;
}

function ServiceConfig() {
  const [service, setService] = useState<string>('classifier');
  const [state, setState] = useState<ConfigState | null>(null);
  const [draft, setDraft] = useState<string>('');
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  const isDirty = state !== null && draft !== JSON.stringify(state.config, null, 2);

  const load = useCallback(async (svc: string) => {
    setLoading(true);
    setError(null);
    setState(null);
    setDraft('');
    try {
      const res = await controllerApi.getServiceConfig(svc);
      const pretty = JSON.stringify(res.config, null, 2);
      setState({
        config: res.config,
        version: res.version,
        updatedAt: (res as any).updated_at ?? null,
        updatedBy: (res as any).updated_by ?? null,
      });
      setDraft(pretty);
    } catch (e) {
      if (e instanceof ApiError && e.statusCode === 404) {
        setState({ config: {}, version: 0, updatedAt: null, updatedBy: null });
        setDraft('{}');
      } else {
        setError(e instanceof Error ? e.message : 'Failed to load config');
      }
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load(service);
  }, [service, load]);

  const save = async () => {
    if (!state) return;
    let parsed: Record<string, unknown>;
    try {
      parsed = JSON.parse(draft);
    } catch {
      setError('Invalid JSON — fix syntax errors before saving');
      return;
    }

    setSaving(true);
    setError(null);
    try {
      const res = await controllerApi.updateServiceConfig(service, parsed, state.version);
      const pretty = JSON.stringify(res.config, null, 2);
      setState({
        config: res.config,
        version: res.version,
        updatedAt: (res as any).updated_at ?? null,
        updatedBy: (res as any).updated_by ?? null,
      });
      setDraft(pretty);
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
    } catch (e) {
      if (e instanceof ApiError && e.statusCode === 409) {
        setError('Config was modified by someone else — refresh to get the latest version before saving');
      } else {
        setError(e instanceof Error ? e.message : 'Failed to save config');
      }
    } finally {
      setSaving(false);
    }
  };

  return (
    <Container size="lg">
      <Stack gap="md">
        <Group justify="space-between" align="flex-end">
          <Title order={2}>Service Config</Title>
          <Group>
            <Select
              data={SERVICES}
              value={service}
              onChange={(v) => v && setService(v)}
              w={200}
            />
            <Tooltip label="Refresh">
              <ActionIcon variant="subtle" onClick={() => load(service)} loading={loading}>
                <IconRefresh size={16} />
              </ActionIcon>
            </Tooltip>
          </Group>
        </Group>

        {state && (
          <Group gap="xs">
            <Badge variant="outline" color="gray">v{state.version}</Badge>
            {state.updatedBy && (
              <Text size="sm" c="dimmed">
                {state.updatedBy === 'service' ? 'Auto-seeded by service' : `Saved by ${state.updatedBy}`}
                {state.updatedAt && (
                  <> — <ReactTimeAgo date={new Date(state.updatedAt)} /></>
                )}
              </Text>
            )}
          </Group>
        )}

        {error && (
          <Alert icon={<IconAlertCircle size={16} />} color="red" onClose={() => setError(null)} withCloseButton>
            {error}
          </Alert>
        )}

        <Textarea
          value={draft}
          onChange={(e) => setDraft(e.currentTarget.value)}
          autosize
          minRows={20}
          maxRows={50}
          styles={{
            input: {
              fontFamily: 'monospace',
              fontSize: '13px',
            },
          }}
          disabled={loading}
          placeholder={loading ? 'Loading...' : ''}
        />

        <Group justify="flex-end">
          {isDirty && (
            <Button variant="subtle" color="gray" onClick={() => state && setDraft(JSON.stringify(state.config, null, 2))}>
              Discard
            </Button>
          )}
          <Button
            onClick={save}
            loading={saving}
            disabled={!isDirty || loading}
            leftSection={saved ? <IconCheck size={16} /> : undefined}
            color={saved ? 'green' : undefined}
          >
            {saved ? 'Saved' : 'Save'}
          </Button>
        </Group>
      </Stack>
    </Container>
  );
}

export default ServiceConfig;
