import { useCallback, useEffect, useState } from 'react';
import { Alert, Anchor, Button, Code, Drawer, Group, Loader, ScrollArea, Stack, Text } from '@mantine/core';
import { IconExternalLink } from '@tabler/icons-react';
import { RunLogLine, RunLogsResponse } from '../types/pipeline';
import { errorMessage } from '../utils/kill-switch';

const POLL_MS = 5000;

export type LoadLogs = (before?: string) => Promise<RunLogsResponse>;

// One task's CloudWatch stream, newest page first, followed while the task is active. `load` must be stable for the
// task it reads (useCallback on its ids): a new one starts the drawer over.
function RunLogsDrawer({ opened, title, active, load, consoleUrl, onClose }: {
  opened: boolean;
  title: string;
  active: boolean;
  load: LoadLogs | null;
  consoleUrl?: string;
  onClose: () => void;
}) {
  const [lines, setLines] = useState<RunLogLine[]>([]);
  const [before, setBefore] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const loadLatest = useCallback(async () => {
    if (!load) return;
    try {
      const result = await load();
      setLines(result.lines);
      setBefore(result.before);
      setError(null);
    } catch (e) {
      setError(errorMessage(e, 'Failed to load logs'));
    }
  }, [load]);

  useEffect(() => {
    if (!load) return;
    setLines([]);
    setLoading(true);
    loadLatest().finally(() => setLoading(false));
  }, [load, loadLatest]);

  useEffect(() => {
    if (!active || !load) return;
    const interval = setInterval(loadLatest, POLL_MS);
    return () => clearInterval(interval);
  }, [active, load, loadLatest]);

  const loadEarlier = async () => {
    if (!load || !before) return;
    setLoading(true);
    try {
      const result = await load(before);
      setLines(current => [...result.lines, ...current]);
      // CloudWatch hands back the same token once there is nothing earlier.
      setBefore(result.lines.length ? result.before : null);
    } catch (e) {
      setError(errorMessage(e, 'Failed to load earlier logs'));
    } finally {
      setLoading(false);
    }
  };

  return (
    <Drawer opened={opened} onClose={onClose} position="right" size="xl" title={title}>
      <Stack gap="xs">
        {error && <Alert color="red">{error}</Alert>}
        <Group justify="space-between">
          <Button size="xs" variant="default" onClick={loadEarlier} disabled={!before} loading={loading}>Load earlier</Button>
          <Group gap="sm">
            {active && <Text size="xs" c="dimmed">Following every {POLL_MS / 1000}s</Text>}
            {consoleUrl && (
              <Anchor href={consoleUrl} target="_blank" size="xs">
                <Group gap={4}>CloudWatch <IconExternalLink size={12} /></Group>
              </Anchor>
            )}
          </Group>
        </Group>
        {loading && lines.length === 0 ? (
          <Loader size="sm" />
        ) : lines.length === 0 ? (
          <Text size="sm" c="dimmed">No log lines yet — they appear once the container starts.</Text>
        ) : (
          <ScrollArea h="calc(100vh - 160px)">
            <LogLines lines={lines} />
          </ScrollArea>
        )}
      </Stack>
    </Drawer>
  );
}

export function LogLines({ lines }: { lines: RunLogLine[] }) {
  return (
    <Code block style={{ fontSize: '0.72rem', whiteSpace: 'pre-wrap' }}>
      {lines.map(l => `${new Date(l.at).toISOString().slice(11, 19)}  ${l.message}`).join('\n')}
    </Code>
  );
}

export default RunLogsDrawer;
