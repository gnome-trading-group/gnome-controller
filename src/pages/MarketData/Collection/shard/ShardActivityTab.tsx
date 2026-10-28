import { useState } from 'react';
import { Badge, Group, ScrollArea, Select, Stack, Text, Timeline } from '@mantine/core';
import { ShardTransition } from '../../../../types/collection';
import { nsToDate, stateColor } from '../../../../utils/collection';

// The shard's latest stream state changes (it keeps the last 256), newest first, optionally for one stream.
export function ShardActivityTab({ transitions, recorded, names }: {
  transitions: ShardTransition[]; recorded: number; names: Map<number, string> | undefined;
}) {
  const [stream, setStream] = useState<string | null>(null);
  const ids = [...new Set(transitions.map(([id]) => id))].sort((a, b) => a - b);
  const shown = [...transitions].reverse().filter(([id]) => stream == null || String(id) === stream);
  return (
    <Stack gap="sm">
      <Group justify="space-between">
        <Text size="sm" c="dimmed">{recorded} state changes since the task started; the latest {transitions.length} kept.</Text>
        <Select placeholder="Every stream" clearable searchable w={320} value={stream} onChange={setStream}
          data={ids.map((id) => ({ value: String(id), label: names?.get(id) ?? String(id) }))} />
      </Group>
      {shown.length === 0 ? <Text size="sm" c="dimmed">No state changes yet.</Text> : (
        <ScrollArea.Autosize mah={600}>
          <Timeline bulletSize={12} lineWidth={2}>
            {shown.map(([id, from, to, at], i) => (
              <Timeline.Item key={i} color={stateColor(to)} title={
                <Group gap={6}>
                  <Text size="sm" fw={500} truncate maw={360}>{names?.get(id) ?? id}</Text>
                  <Badge size="xs" variant="light" color={stateColor(from)}>{from.toLowerCase()}</Badge>
                  <Text size="xs" c="dimmed">→</Text>
                  <Badge size="xs" variant="light" color={stateColor(to)}>{to.toLowerCase()}</Badge>
                </Group>
              }>
                <Text size="xs" c="dimmed">{nsToDate(at)?.toLocaleTimeString()}</Text>
              </Timeline.Item>
            ))}
          </Timeline>
        </ScrollArea.Autosize>
      )}
    </Stack>
  );
}
