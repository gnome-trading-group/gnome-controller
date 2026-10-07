import { Box, Group, Paper, Stack, Text } from '@mantine/core';

export interface TooltipRow {
  label: string;
  value: string;
  color?: string;
}

export interface TooltipState {
  // Where the cursor is, in pixels within the chart.
  x: number;
  y: number;
  title: string;
  rows: TooltipRow[];
}

const OFFSET = 14;
const WIDTH = 210;

// A box of exact values that follows the cursor over a chart, flipping to the cursor's left near the right edge so it
// never covers what's being pointed at or leaves the chart.
export function ChartTooltip({ tooltip, chartWidth }: { tooltip: TooltipState | null; chartWidth: number }) {
  if (!tooltip || tooltip.rows.length === 0) return null;
  const left = tooltip.x + OFFSET + WIDTH > chartWidth ? tooltip.x - OFFSET - WIDTH : tooltip.x + OFFSET;
  return (
    <Paper
      shadow="md"
      withBorder
      p={8}
      w={WIDTH}
      style={{ position: 'absolute', left: Math.max(0, left), top: Math.max(0, tooltip.y - 10), zIndex: 3, pointerEvents: 'none' }}
    >
      <Text size="xs" c="dimmed" mb={4}>{tooltip.title}</Text>
      <Stack gap={2}>
        {tooltip.rows.map(row => (
          <Group key={row.label} justify="space-between" gap="xs" wrap="nowrap">
            <Group gap={6} wrap="nowrap">
              {row.color && <Box w={8} h={8} style={{ borderRadius: 2, background: row.color }} />}
              <Text size="xs" truncate>{row.label}</Text>
            </Group>
            <Text size="xs" fw={600} style={{ fontVariantNumeric: 'tabular-nums', whiteSpace: 'nowrap' }}>{row.value}</Text>
          </Group>
        ))}
      </Stack>
    </Paper>
  );
}
