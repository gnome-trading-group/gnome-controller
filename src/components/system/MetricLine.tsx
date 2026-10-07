import { Box, Text, Tooltip } from '@mantine/core';
import { MetricPoints } from '../../types';

// A small line of one metric over the last day, with its latest value. Drawn as SVG: a page of these is too many
// for a charting library each.
export function MetricLine({ label, points, format, width = 160, height = 36 }: {
  label: string; points: MetricPoints; format: (value: number) => string; width?: number; height?: number;
}) {
  const values = points.v;
  const latest = values.length ? values[values.length - 1] : null;
  const min = Math.min(...values);
  const max = Math.max(...values);
  const span = max - min || 1;
  const path = values.map((v, i) =>
    `${((i / Math.max(1, values.length - 1)) * width).toFixed(1)},${(height - 2 - ((v - min) / span) * (height - 4)).toFixed(1)}`).join(' ');
  return (
    <Box>
      <Text size="xs" c="dimmed">{label}</Text>
      <Text size="sm" fw={600} style={{ fontVariantNumeric: 'tabular-nums' }}>{latest === null ? '—' : format(latest)}</Text>
      <Tooltip label={values.length ? `last 24h: ${format(min)} – ${format(max)}` : 'no data'} withArrow openDelay={300}>
        <svg width={width} height={height} style={{ display: 'block' }}>
          {values.length > 1 && <polyline points={path} fill="none" stroke="var(--mantine-color-blue-5)" strokeWidth={1.5} />}
        </svg>
      </Tooltip>
    </Box>
  );
}
