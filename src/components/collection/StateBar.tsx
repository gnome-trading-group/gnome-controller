import { Group, Progress, Stack, Text, Tooltip } from '@mantine/core';
import { stateColor, stateCounts } from '../../utils/collection';

// How a set of streams is doing in one thin bar: a section per state, widest healthiest first; counts on hover.
export function StateBar({ states, height = 8 }: { states: string[]; height?: number }) {
  const counts = stateCounts(states);
  if (states.length === 0) return <Progress value={0} size={height} />;
  return (
    <Tooltip withArrow label={
      <Stack gap={2}>
        {counts.map(({ state, count }) => (
          <Group key={state} justify="space-between" gap="md">
            <Text size="xs">{state.toLowerCase()}</Text>
            <Text size="xs">{count}</Text>
          </Group>
        ))}
      </Stack>
    }>
      <Progress.Root size={height}>
        {counts.map(({ state, count }) => (
          <Progress.Section key={state} value={(count / states.length) * 100} color={stateColor(state)} />
        ))}
      </Progress.Root>
    </Tooltip>
  );
}
