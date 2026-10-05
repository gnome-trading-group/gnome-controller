import { useState, useEffect } from 'react';
import {
  ActionIcon,
  Card,
  Center,
  Code,
  Divider,
  Group,
  Loader,
  ScrollArea,
  Stack,
  Tabs,
  Text,
  Title,
  Tooltip,
} from '@mantine/core';
import { IconExternalLink, IconRefresh } from '@tabler/icons-react';

interface LogEntry {
  timestamp: number;
  message: string;
}

// One log stream: an ECS task for collectors, an EC2 instance for strategy sessions.
export interface LogStream {
  id: string;
  label: string;
  logs: LogEntry[];
  consoleUrl: string;
}

interface ContainerLogsProps {
  logs: LogStream[];
  loading: boolean;
  initialLoad: boolean;
  onRefresh: () => void;
}

function LogList({ entries }: { entries: LogEntry[] }) {
  if (entries.length === 0) {
    return (
      <Center h={350}>
        <Stack align="center" gap="xs">
          <Text c="dimmed">No recent logs available</Text>
        </Stack>
      </Center>
    );
  }
  const reversed = [...entries].reverse();
  return (
    <Stack gap="xs">
      {reversed.map((logEvent, index) => (
        <div key={index}>
          <Group gap="xs" align="flex-start">
            <Text size="xs" c="dimmed" style={{ minWidth: '140px' }}>
              {new Date(logEvent.timestamp).toLocaleTimeString()}
            </Text>
            <Code block style={{ flex: 1, fontSize: '12px' }}>
              {logEvent.message}
            </Code>
          </Group>
          {index < reversed.length - 1 && <Divider size="xs" />}
        </div>
      ))}
    </Stack>
  );
}

export function ContainerLogs({ logs, loading, initialLoad, onRefresh }: ContainerLogsProps) {
  const [selectedId, setSelectedId] = useState<string>('');

  useEffect(() => {
    if (logs.length > 0 && !selectedId) {
      setSelectedId(logs[0].id);
    } else if (logs.length === 0) {
      setSelectedId('');
    }
  }, [logs]);

  const activeTaskLogs = logs.find(l => l.id === selectedId) ?? logs[0];

  return (
    <Card withBorder mt="md">
      <Group justify="space-between" mb="md">
        <Title order={4}>Container Logs</Title>
        <Group>
          {activeTaskLogs?.consoleUrl && (
            <Tooltip label="View in AWS Console" position="bottom" withArrow>
              <ActionIcon
                component="a"
                href={activeTaskLogs.consoleUrl}
                target="_blank"
                variant="light"
              >
                <IconExternalLink size={16} />
              </ActionIcon>
            </Tooltip>
          )}
          <Tooltip label="Refresh Logs" position="bottom" withArrow>
            <ActionIcon onClick={onRefresh} loading={loading} disabled={logs.length === 0}>
              <IconRefresh size={16} />
            </ActionIcon>
          </Tooltip>
        </Group>
      </Group>

      {logs.length > 1 ? (
        <Tabs value={selectedId} onChange={v => setSelectedId(v ?? '')}>
          <Tabs.List>
            {logs.map(task => (
              <Tabs.Tab key={task.id} value={task.id}>
                {task.label}
              </Tabs.Tab>
            ))}
          </Tabs.List>
          {logs.map(task => (
            <Tabs.Panel key={task.id} value={task.id} pt="md">
              <ScrollArea h={400}>
                {loading && initialLoad ? (
                  <Center h={350}>
                    <Stack align="center" gap="md">
                      <Loader size="lg" color="blue" />
                      <Text fw={500} c="dimmed">Loading Logs</Text>
                    </Stack>
                  </Center>
                ) : (
                  <LogList entries={task.logs} />
                )}
              </ScrollArea>
            </Tabs.Panel>
          ))}
        </Tabs>
      ) : (
        <ScrollArea h={400}>
          {loading && initialLoad ? (
            <Center h={350}>
              <Stack align="center" gap="md">
                <Loader size="lg" color="blue" />
                <Text fw={500} c="dimmed">Loading Logs</Text>
              </Stack>
            </Center>
          ) : (
            <LogList entries={activeTaskLogs?.logs ?? []} />
          )}
        </ScrollArea>
      )}
    </Card>
  );
}
