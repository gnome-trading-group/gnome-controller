import { useState } from 'react';
import { Badge, Group, type MantineColor } from '@mantine/core';

const DEFAULT_MAX = 8;

export function CappedBadges({ values, max = DEFAULT_MAX, variant = 'light', color = 'blue' }: {
  values: string[];
  max?: number;
  variant?: 'light' | 'outline';
  color?: MantineColor;
}) {
  const [expanded, setExpanded] = useState(false);
  const capped = !expanded && values.length > max;
  const shown = capped ? values.slice(0, max) : values;
  return (
    <Group gap={4}>
      {shown.map(v => <Badge key={v} variant={variant} size="sm" color={color}>{v}</Badge>)}
      {values.length > max && (
        <Badge
          variant="transparent"
          size="sm"
          color="gray"
          style={{ cursor: 'pointer' }}
          onClick={() => setExpanded(e => !e)}
        >
          {capped ? `+${values.length - max} more` : 'show less'}
        </Badge>
      )}
    </Group>
  );
}
