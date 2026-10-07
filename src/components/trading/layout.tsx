import { ReactNode } from 'react';
import { Badge, Box, Card, Group, SegmentedControl, SimpleGrid, Text, Tooltip } from '@mantine/core';
import { IconInfoCircle } from '@tabler/icons-react';
import { Mode } from '../../types';
import { MODE_COLORS } from '../../utils/mode';

// Mantine's default badge size unless told otherwise, so it matches the status badges beside it.
export function ModeBadge({ mode, size }: { mode: string; size?: 'xs' | 'sm' | 'md' | 'lg' }) {
  return <Badge color={MODE_COLORS[mode] ?? 'gray'} variant="light" size={size}>{mode}</Badge>;
}

// Sized like the page's buttons, so it reads as one of the header's controls.
export function ModeSwitch({ mode, onChange, size = 'sm' }: { mode: Mode; onChange: (mode: Mode) => void; size?: 'xs' | 'sm' }) {
  return (
    <SegmentedControl
      size={size}
      value={mode}
      onChange={value => onChange(value as Mode)}
      data={[{ value: 'live', label: 'Live' }, { value: 'paper', label: 'Paper' }]}
      color={MODE_COLORS[mode]}
    />
  );
}

// A coloured rule along the top of a page, so live and paper can't be mistaken, screenshots included.
export function ModeBand({ mode }: { mode: string }) {
  return (
    <Box
      h={4}
      mb="md"
      style={{ borderRadius: 2, background: `var(--mantine-color-${MODE_COLORS[mode] ?? 'gray'}-6)` }}
      title={`${mode} trading`}
    />
  );
}

interface KpiProps {
  label: string;
  value: ReactNode;
  hint?: ReactNode;
  footer?: ReactNode;
}

export function Kpi({ label, value, hint, footer }: KpiProps) {
  return (
    <Card withBorder p="sm" radius="md">
      <Group gap={4} mb={4} wrap="nowrap">
        <Text size="xs" c="dimmed">{label}</Text>
        {hint && (
          <Tooltip label={hint} multiline w={300} withArrow openDelay={200}>
            <IconInfoCircle size={13} color="var(--mantine-color-dimmed)" />
          </Tooltip>
        )}
      </Group>
      <Text fw={650} size="xl" component="div">{value}</Text>
      {footer && <Text size="xs" c="dimmed" mt={2} component="div">{footer}</Text>}
    </Card>
  );
}

export function KpiStrip({ children }: { children: ReactNode }) {
  return <SimpleGrid cols={{ base: 2, sm: 3, lg: 6 }} spacing="sm" mb="md">{children}</SimpleGrid>;
}
