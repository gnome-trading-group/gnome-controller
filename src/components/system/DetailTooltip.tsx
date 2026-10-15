import { ReactElement, ReactNode } from 'react';
import { Badge, Code, Group, SimpleGrid, Stack, Text, Tooltip } from '@mantine/core';

export type DetailField = [label: string, value: ReactNode];

// The whole of an alert or attention item on hover over its icon, edged in its severity's colour: the lists only have
// room for one line of the reason, and a few words of what it's about.
export function DetailTooltip({ color, badge, type, title, body, fields, footer, children }: {
  color: string;
  badge: string;
  type: string;
  title: string;
  body: string | null;
  // What it's about (strategy, listing, session, who did it…), in two columns; empty values are left out.
  fields: DetailField[];
  footer?: ReactNode;
  children: ReactElement;
}) {
  const trace = body?.includes('\n');
  const shown = fields.filter(([, value]) => value !== null && value !== undefined && value !== '' && value !== false);
  const detail = (
    <Stack gap={6}>
      <Group gap={6} wrap="nowrap">
        <Badge color={color} variant="light" size="xs">{badge}</Badge>
        <Text size="xs" c="dimmed" ff="monospace">{type}</Text>
      </Group>
      <Text size="sm" fw={600} c={`${color}.4`}>{title}</Text>
      {body && (trace ? (
        <Code block fz={11} style={{
          whiteSpace: 'pre-wrap', wordBreak: 'break-word', maxHeight: 220, overflow: 'hidden',
          background: `var(--mantine-color-${color}-light)`, color: `var(--mantine-color-${color}-1)`,
        }}>
          {body}
        </Code>
      ) : (
        <Text size="xs" style={{ whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}>{body}</Text>
      ))}
      {shown.length > 0 && (
        <SimpleGrid cols={2} spacing="sm" verticalSpacing={4} mt={2}>
          {shown.map(([label, value]) => (
            <div key={label} style={{ minWidth: 0 }}>
              <Text size="10px" c="dimmed" tt="uppercase" fw={600} style={{ letterSpacing: 0.4 }}>{label}</Text>
              <Text size="xs" style={{ wordBreak: 'break-word' }}>{value}</Text>
            </div>
          ))}
        </SimpleGrid>
      )}
      {footer && <Text size="xs" c="dimmed">{footer}</Text>}
    </Stack>
  );
  return (
    <Tooltip label={detail} multiline withArrow position="bottom-start" openDelay={150} color="dark"
      styles={{ tooltip: {
        maxWidth: 440, padding: 'var(--mantine-spacing-sm)', borderLeft: `3px solid var(--mantine-color-${color}-6)`,
        boxShadow: 'var(--mantine-shadow-md)',
      } }}>
      {children}
    </Tooltip>
  );
}
