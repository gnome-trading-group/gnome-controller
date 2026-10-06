import { useState, useEffect, useCallback } from 'react';
import {
  ActionIcon,
  Alert,
  Badge,
  Button,
  Container,
  Center,
  Group,
  Loader,
  Modal,
  Select,
  Stack,
  Table,
  Text,
  Textarea,
  Title,
  Tooltip,
} from '@mantine/core';
import { IconAlertCircle, IconCheck, IconHistory, IconRefresh } from '@tabler/icons-react';
import ReactTimeAgo from 'react-time-ago';
import { ApiError, controllerApi, ServiceConfigVersion } from '../../utils/api';

function sortKeys(obj: unknown): unknown {
  if (Array.isArray(obj)) return obj.map(sortKeys);
  if (obj !== null && typeof obj === 'object') {
    return Object.fromEntries(
      Object.entries(obj as Record<string, unknown>)
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([k, v]) => [k, sortKeys(v)])
    );
  }
  return obj;
}

interface ConfigChange {
  path: string;
  before?: string;
  after?: string;
}

function flattenConfig(value: unknown, prefix: string, out: Record<string, string>): Record<string, string> {
  if (value !== null && typeof value === 'object' && !Array.isArray(value) && Object.keys(value).length > 0) {
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
      flattenConfig(v, prefix ? `${prefix}.${k}` : k, out);
    }
  } else if (prefix) {
    out[prefix] = JSON.stringify(value);
  }
  return out;
}

function diffConfigs(before: Record<string, unknown>, after: Record<string, unknown>): ConfigChange[] {
  const a = flattenConfig(before, '', {});
  const b = flattenConfig(after, '', {});
  return [...new Set([...Object.keys(a), ...Object.keys(b)])]
    .sort()
    .filter((path) => a[path] !== b[path])
    .map((path) => ({ path, before: a[path], after: b[path] }));
}

function ConfigDiffTable({ changes, beforeLabel, afterLabel }: { changes: ConfigChange[]; beforeLabel: string; afterLabel: string }) {
  return (
    <Table withTableBorder withColumnBorders fz="xs" style={{ fontFamily: 'monospace' }}>
      <Table.Thead>
        <Table.Tr>
          <Table.Th>Setting</Table.Th>
          <Table.Th>{beforeLabel}</Table.Th>
          <Table.Th>{afterLabel}</Table.Th>
        </Table.Tr>
      </Table.Thead>
      <Table.Tbody>
        {changes.map((c) => (
          <Table.Tr key={c.path}>
            <Table.Td>{c.path}</Table.Td>
            <Table.Td c="red">{c.before ?? <Text span size="xs" c="dimmed">(not set)</Text>}</Table.Td>
            <Table.Td c="green">{c.after ?? <Text span size="xs" c="dimmed">(removed)</Text>}</Table.Td>
          </Table.Tr>
        ))}
      </Table.Tbody>
    </Table>
  );
}

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
  const [pendingSave, setPendingSave] = useState<{ config: Record<string, unknown>; changes: ConfigChange[] } | null>(null);
  const [pendingNavigation, setPendingNavigation] = useState<{ service: string } | null>(null);
  const [historyOpen, setHistoryOpen] = useState(false);
  const [history, setHistory] = useState<ServiceConfigVersion[] | null>(null);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [historyError, setHistoryError] = useState<string | null>(null);
  const [selectedVersion, setSelectedVersion] = useState<ServiceConfigVersion | null>(null);
  const [pendingRestore, setPendingRestore] = useState<ServiceConfigVersion | null>(null);

  const isDirty = state !== null && draft !== JSON.stringify(sortKeys(state.config), null, 2);

  const load = useCallback(async (svc: string) => {
    setLoading(true);
    setError(null);
    setState(null);
    setDraft('');
    try {
      const res = await controllerApi.getServiceConfig(svc);
      const pretty = JSON.stringify(sortKeys(res.config), null, 2);
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

  const reviewSave = () => {
    if (!state) return;
    let parsed: unknown;
    try {
      parsed = JSON.parse(draft);
    } catch {
      setError('Invalid JSON — fix syntax errors before saving');
      return;
    }
    if (parsed === null || typeof parsed !== 'object' || Array.isArray(parsed)) {
      setError('Config must be a JSON object');
      return;
    }
    const config = parsed as Record<string, unknown>;
    setError(null);
    setPendingSave({ config, changes: diffConfigs(state.config, config) });
  };

  // Switching service or refreshing replaces the draft, so unsaved edits need an explicit discard.
  const requestLoad = (svc: string) => {
    if (isDirty) {
      setPendingNavigation({ service: svc });
      return;
    }
    if (svc === service) load(svc);
    else setService(svc);
  };

  const confirmDiscardAndLoad = () => {
    if (!pendingNavigation) return;
    const svc = pendingNavigation.service;
    setPendingNavigation(null);
    if (svc === service) load(svc);
    else setService(svc);
  };

  const openHistory = async () => {
    setHistoryOpen(true);
    setHistory(null);
    setSelectedVersion(null);
    setHistoryError(null);
    setHistoryLoading(true);
    try {
      const res = await controllerApi.getServiceConfigHistory(service);
      setHistory(res.versions);
    } catch (e) {
      setHistoryError(e instanceof Error ? e.message : 'Failed to load config history');
    } finally {
      setHistoryLoading(false);
    }
  };

  const restoreVersion = (v: ServiceConfigVersion) => {
    setDraft(JSON.stringify(sortKeys(v.config), null, 2));
    setPendingRestore(null);
    setHistoryOpen(false);
  };

  const requestRestore = (v: ServiceConfigVersion) => {
    if (isDirty) setPendingRestore(v);
    else restoreVersion(v);
  };

  const save = async () => {
    if (!state || !pendingSave) return;
    const parsed = pendingSave.config;

    setSaving(true);
    setError(null);
    try {
      const res = await controllerApi.updateServiceConfig(service, parsed, state.version);
      const pretty = JSON.stringify(sortKeys(res.config), null, 2);
      setState({
        config: res.config,
        version: res.version,
        updatedAt: (res as any).updated_at ?? null,
        updatedBy: (res as any).updated_by ?? null,
      });
      setDraft(pretty);
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
      setPendingSave(null);
    } catch (e) {
      setPendingSave(null);
      if (e instanceof ApiError && e.statusCode === 409) {
        // Take the newer version as the base but keep the draft, so the user re-reviews their edits against what
        // the other person saved instead of losing them to a refresh.
        try {
          const latest = await controllerApi.getServiceConfig(service);
          const audit = latest as unknown as { updated_at?: string; updated_by?: string };
          setState({
            config: latest.config,
            version: latest.version,
            updatedAt: audit.updated_at ?? null,
            updatedBy: audit.updated_by ?? null,
          });
          setError(`Someone else saved v${latest.version} first. Your edits are kept — review the changes against it and save again.`);
        } catch {
          setError('Config was modified by someone else, and loading the latest version failed. Copy your edits before refreshing.');
        }
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
              onChange={(v) => v && v !== service && requestLoad(v)}
              w={200}
            />
            <Tooltip label="Refresh">
              <ActionIcon variant="subtle" onClick={() => requestLoad(service)} loading={loading}>
                <IconRefresh size={16} />
              </ActionIcon>
            </Tooltip>
            <Button variant="default" leftSection={<IconHistory size={16} />} onClick={openHistory} disabled={!state}>
              History
            </Button>
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
            <Button variant="subtle" color="gray" onClick={() => state && setDraft(JSON.stringify(sortKeys(state.config), null, 2))}>
              Discard
            </Button>
          )}
          <Button
            onClick={reviewSave}
            loading={saving}
            disabled={!isDirty || loading}
            leftSection={saved ? <IconCheck size={16} /> : undefined}
            color={saved ? 'green' : undefined}
          >
            {saved ? 'Saved' : 'Review & Save'}
          </Button>
        </Group>
      </Stack>

      <Modal
        opened={pendingSave !== null}
        onClose={() => { if (!saving) setPendingSave(null); }}
        title={`Save ${SERVICES.find((s) => s.value === service)?.label ?? service} config`}
        size="xl"
      >
        <Stack>
          <Text size="sm">
            This goes live for the running service as soon as it's saved (v{state?.version ?? 0} → v{(state?.version ?? 0) + 1}).
          </Text>
          {pendingSave && pendingSave.changes.length === 0 ? (
            <Text size="sm" c="dimmed">No effective changes (only formatting differs).</Text>
          ) : (
            <ConfigDiffTable changes={pendingSave?.changes ?? []} beforeLabel="Current" afterLabel="New" />
          )}
          <Group justify="flex-end">
            <Button variant="outline" onClick={() => setPendingSave(null)} disabled={saving}>Cancel</Button>
            <Button onClick={save} loading={saving} disabled={pendingSave?.changes.length === 0}>Save</Button>
          </Group>
        </Stack>
      </Modal>

      <Modal
        opened={historyOpen}
        onClose={() => setHistoryOpen(false)}
        title={`${SERVICES.find((s) => s.value === service)?.label ?? service} config history`}
        size="xl"
      >
        <Stack>
          <Text size="sm" c="dimmed">
            History only includes saves made since version history was deployed. Restoring loads a version into the
            editor; it goes live only after you Review &amp; Save it.
          </Text>
          {historyLoading && (
            <Center py="md"><Loader size="sm" /></Center>
          )}
          {historyError && (
            <Alert icon={<IconAlertCircle size={16} />} color="red">{historyError}</Alert>
          )}
          {history && history.length === 0 && (
            <Text size="sm" c="dimmed">No saved versions yet.</Text>
          )}
          {history && history.length > 0 && (
            <Table highlightOnHover fz="sm">
              <Table.Thead>
                <Table.Tr>
                  <Table.Th>Version</Table.Th>
                  <Table.Th>Saved by</Table.Th>
                  <Table.Th>When</Table.Th>
                </Table.Tr>
              </Table.Thead>
              <Table.Tbody>
                {history.map((v) => (
                  <Table.Tr
                    key={v.version}
                    onClick={() => setSelectedVersion(v)}
                    bg={selectedVersion?.version === v.version ? 'var(--mantine-primary-color-light)' : undefined}
                    style={{ cursor: 'pointer' }}
                  >
                    <Table.Td>
                      <Group gap="xs">
                        <Badge variant="outline" color="gray">v{v.version}</Badge>
                        {v.version === state?.version && <Badge variant="light" size="sm">current</Badge>}
                      </Group>
                    </Table.Td>
                    <Table.Td>{v.updated_by}</Table.Td>
                    <Table.Td><ReactTimeAgo date={new Date(v.updated_at)} /></Table.Td>
                  </Table.Tr>
                ))}
              </Table.Tbody>
            </Table>
          )}
          {selectedVersion && state && (() => {
            const changes = diffConfigs(state.config, selectedVersion.config);
            return (
              <Stack gap="xs">
                <Text size="sm" fw={500}>
                  Changes from current saved config (v{state.version}) to v{selectedVersion.version}
                </Text>
                {changes.length === 0 ? (
                  <Text size="sm" c="dimmed">Identical to the current saved config.</Text>
                ) : (
                  <ConfigDiffTable changes={changes} beforeLabel={`Current (v${state.version})`} afterLabel={`v${selectedVersion.version}`} />
                )}
                <Group justify="flex-end">
                  <Button onClick={() => requestRestore(selectedVersion)}>Restore into editor</Button>
                </Group>
              </Stack>
            );
          })()}
        </Stack>
      </Modal>

      <Modal opened={pendingRestore !== null} onClose={() => setPendingRestore(null)} title="Discard unsaved changes?">
        <Stack>
          <Text size="sm">You have unsaved edits to this config. Restoring v{pendingRestore?.version} into the editor will discard them.</Text>
          <Group justify="flex-end">
            <Button variant="outline" onClick={() => setPendingRestore(null)}>Keep editing</Button>
            <Button color="red" onClick={() => pendingRestore && restoreVersion(pendingRestore)}>Discard</Button>
          </Group>
        </Stack>
      </Modal>

      <Modal opened={pendingNavigation !== null} onClose={() => setPendingNavigation(null)} title="Discard unsaved changes?">
        <Stack>
          <Text size="sm">You have unsaved edits to this config. Loading {pendingNavigation?.service === service ? 'the latest version' : 'another service'} will discard them.</Text>
          <Group justify="flex-end">
            <Button variant="outline" onClick={() => setPendingNavigation(null)}>Keep editing</Button>
            <Button color="red" onClick={confirmDiscardAndLoad}>Discard</Button>
          </Group>
        </Stack>
      </Modal>
    </Container>
  );
}

export default ServiceConfig;
