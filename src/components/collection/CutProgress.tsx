import { Group, Text, Tooltip } from '@mantine/core';
import { CollectionTarget } from '../../types/collection';
import { cutTime, handoffStep } from '../../utils/collection';

const STEPS = ['warming', 'cut', 'settling'] as const;
const HELP = {
  warming: 'The new shard collects without writing until it has been live for the hand-off time',
  cut: 'Both shards have the cut: the old one writes the minutes before it, the new one from it',
  settling: 'Past the cut; the old shard lets the stream go once its last minute has closed',
};

// A hand-off's progress as three steps, the current one lit.
export function CutProgress({ target, nowMs }: { target: CollectionTarget; nowMs: number }) {
  const step = handoffStep(target, nowMs);
  if (!step) return <Text size="sm" c="dimmed">—</Text>;
  const at = STEPS.indexOf(step);
  return (
    <Tooltip label={HELP[step]} withArrow multiline w={260}>
      <Group gap={6} wrap="nowrap">
        {STEPS.map((s, i) => (
          <Text key={s} size="xs" fw={i === at ? 700 : 400} c={i < at ? 'dimmed' : i === at ? 'blue' : 'gray.5'}>
            {s === 'cut' && target.cutMinute ? `cut ${cutTime(target.cutMinute)}` : s}{i < STEPS.length - 1 ? ' →' : ''}
          </Text>
        ))}
      </Group>
    </Tooltip>
  );
}
