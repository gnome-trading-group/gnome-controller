import { ReactNode, useEffect, useRef, useState } from 'react';
import { Button, Code, Group, Loader, SimpleGrid, Stack, Text } from '@mantine/core';
import { IconFileText } from '@tabler/icons-react';
import { LogLines } from '../RunLogsDrawer';
import { RunLogLine, RunLogsResponse } from '../../types/pipeline';
import { errorMessage } from '../../utils/kill-switch';
import { formatDuration } from '../../utils/format';

export const TAIL_LINES = 30;

function Fact({ label, children }: { label: string; children: ReactNode }) {
  return (
    <Stack gap={0}>
      <Text size="xs" c="dimmed" tt="uppercase" fw={600}>{label}</Text>
      <Text size="sm" component="div">{children}</Text>
    </Stack>
  );
}

// The expanded row of a task: why it ended as it did and the end of its log, which is usually where the reason is.
export function TaskDetailPanel({ task, loadTail, onOpenLogs, children }: {
  task: { statusReason?: string; exitCode?: number; attemptCount?: number; elapsedMs: number | null; hasLogs: boolean };
  loadTail: () => Promise<RunLogsResponse>;
  onOpenLogs: () => void;
  children?: ReactNode;
}) {
  const [lines, setLines] = useState<RunLogLine[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  // Fetched once per expansion: the page re-renders on every poll, handing over a new loadTail each time.
  const loadTailRef = useRef(loadTail);

  useEffect(() => {
    if (!task.hasLogs) return;
    let current = true;
    loadTailRef.current()
      .then(r => { if (current) setLines(r.lines); })
      .catch(e => { if (current) setError(errorMessage(e, 'Failed to load logs')); });
    return () => { current = false; };
  }, [task.hasLogs]);

  return (
    <Stack p="md" gap="sm" style={{ maxWidth: 1100 }}>
      <SimpleGrid cols={3} spacing="md" style={{ maxWidth: 480 }}>
        <Fact label="Duration">{formatDuration(task.elapsedMs)}</Fact>
        <Fact label="Exit code">{task.exitCode ?? '—'}</Fact>
        <Fact label="Attempts">{task.attemptCount ?? '—'}</Fact>
      </SimpleGrid>
      {task.statusReason && (
        <Fact label="Reason"><Code style={{ fontSize: '0.72rem' }}>{task.statusReason}</Code></Fact>
      )}
      {children}
      <Group justify="space-between">
        <Text size="xs" c="dimmed" tt="uppercase" fw={600}>Last {TAIL_LINES} log lines</Text>
        <Button size="compact-xs" variant="light" leftSection={<IconFileText size={12} />} onClick={onOpenLogs}
                disabled={!task.hasLogs}>
          Full logs
        </Button>
      </Group>
      {!task.hasLogs ? (
        <Text size="sm" c="dimmed">No logs yet — they appear once the container starts.</Text>
      ) : error ? (
        <Text size="sm" c="red">{error}</Text>
      ) : lines === null ? (
        <Loader size="xs" />
      ) : lines.length === 0 ? (
        <Text size="sm" c="dimmed">The log is empty.</Text>
      ) : (
        <LogLines lines={lines} />
      )}
    </Stack>
  );
}
