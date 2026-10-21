import { useCallback, useEffect, useState } from 'react';
import { Alert, Button, Code, Drawer, Group, Loader, ScrollArea, Stack, Text } from '@mantine/core';
import { PipelineRun, RunLogLine } from '../../../types/pipeline';
import { controllerApi } from '../../../utils/api';
import { errorMessage } from '../../../utils/kill-switch';
import { isActive } from './runs';

const POLL_MS = 5000;

function RunLogsDrawer({ run, onClose }: { run: PipelineRun | null; onClose: () => void }) {
  const [lines, setLines] = useState<RunLogLine[]>([]);
  const [before, setBefore] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // The page re-fetches runs while they are active, so the effects follow the run's identity, not the object.
  const pipelineName = run?.pipelineName;
  const runId = run?.runId;
  const active = run ? isActive(run) : false;

  const loadLatest = useCallback(async () => {
    if (!pipelineName || !runId) return;
    try {
      const result = await controllerApi.getRunLogs(pipelineName, runId);
      setLines(result.lines);
      setBefore(result.before);
      setError(null);
    } catch (e) {
      setError(errorMessage(e, 'Failed to load logs'));
    }
  }, [pipelineName, runId]);

  useEffect(() => {
    if (!runId) return;
    setLines([]);
    setLoading(true);
    loadLatest().finally(() => setLoading(false));
  }, [runId, loadLatest]);

  useEffect(() => {
    if (!active) return;
    const interval = setInterval(loadLatest, POLL_MS);
    return () => clearInterval(interval);
  }, [active, loadLatest]);

  const loadEarlier = async () => {
    if (!pipelineName || !runId || !before) return;
    setLoading(true);
    try {
      const result = await controllerApi.getRunLogs(pipelineName, runId, before);
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
    <Drawer opened={run !== null} onClose={onClose} position="right" size="xl"
            title={run ? `${run.pipelineName} · ${run.runId}` : ''}>
      <Stack gap="xs">
        {error && <Alert color="red">{error}</Alert>}
        <Group justify="space-between">
          <Button size="xs" variant="default" onClick={loadEarlier} disabled={!before} loading={loading}>Load earlier</Button>
          {active && <Text size="xs" c="dimmed">Following every {POLL_MS / 1000}s</Text>}
        </Group>
        {loading && lines.length === 0 ? (
          <Loader size="sm" />
        ) : lines.length === 0 ? (
          <Text size="sm" c="dimmed">No log lines yet — the task's logs appear once its container starts.</Text>
        ) : (
          <ScrollArea h="calc(100vh - 160px)">
            <Code block style={{ fontSize: '0.72rem', whiteSpace: 'pre-wrap' }}>
              {lines.map(l => `${new Date(l.at).toISOString().slice(11, 19)}  ${l.message}`).join('\n')}
            </Code>
          </ScrollArea>
        )}
      </Stack>
    </Drawer>
  );
}

export default RunLogsDrawer;
