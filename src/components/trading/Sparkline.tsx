import { Box, Tooltip } from '@mantine/core';
import { formatMoney, moneyToNumber } from '../../utils/format';

// A tiny line of a PnL series, coloured by whether it ended above or below where it began. Drawn as SVG: a table
// can hold dozens of these, far too many for a charting library each.
export function Sparkline({ values, width = 120, height = 28, label }: {
  values: string[] | undefined; width?: number; height?: number; label?: string;
}) {
  if (!values || values.length < 2) return <Box w={width} h={height} />;
  const numbers = values.map(moneyToNumber);
  const min = Math.min(...numbers);
  const max = Math.max(...numbers);
  const span = max - min || 1;
  const points = numbers
    .map((v, i) => `${((i / (numbers.length - 1)) * width).toFixed(1)},${(height - 2 - ((v - min) / span) * (height - 4)).toFixed(1)}`)
    .join(' ');
  const change = BigInt(values[values.length - 1]) - BigInt(values[0]);
  const color = change >= 0n ? 'var(--mantine-color-teal-5)' : 'var(--mantine-color-red-5)';
  return (
    <Tooltip label={`${label ?? 'Change'}: ${formatMoney(change).text}`} withArrow openDelay={300}>
      <svg width={width} height={height} style={{ display: 'block' }}>
        <polyline points={points} fill="none" stroke={color} strokeWidth={1.5} strokeLinejoin="round" />
      </svg>
    </Tooltip>
  );
}
