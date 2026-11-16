import { Group, Progress, Stack, Text, Tooltip } from '@mantine/core';

// From here a process takes nothing more from merges or relief (shards), or is close to refusing (paper gateways).
const FILL_TARGET = 0.8;

function fillColor(fill: number): string {
  if (fill > 1) return 'red';
  if (fill >= FILL_TARGET) return 'yellow';
  return 'teal';
}

/** One measure against its cap; a measure with no cap shows its value and an empty bar. */
export interface Cap {
  label: string;
  used: number | null;
  max: number | undefined;
  unit?: string;
  help: string;
}

/** A measure against its cap as a labelled bar: teal, yellow from 80%, red over the cap. */
export function CapacityRow({ cap, size }: { cap: Cap; size: 'xs' | 'sm' }) {
  const fill = cap.used != null && cap.max ? cap.used / cap.max : null;
  const used = cap.used == null ? '—' : Math.round(cap.used).toLocaleString();
  const max = cap.max ? Math.round(cap.max).toLocaleString() : '—';
  return (
    <Tooltip withArrow multiline w={300} label={cap.help}>
      <Stack gap={2}>
        <Group justify="space-between" gap="xs" wrap="nowrap">
          <Text size={size} c="dimmed">{cap.label}</Text>
          <Text size={size} c={fill != null && fill > 1 ? 'red' : undefined}>
            {cap.max ? `${used}/${max}` : used}{cap.unit ?? ''}{fill != null ? ` · ${Math.round(fill * 100)}%` : ''}
          </Text>
        </Group>
        <Progress value={fill != null ? Math.min(fill, 1) * 100 : 0} color={fill != null ? fillColor(fill) : 'gray'}
          size={size === 'xs' ? 4 : 8} />
      </Stack>
    </Tooltip>
  );
}
