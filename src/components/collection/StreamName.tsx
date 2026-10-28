import { Badge, Group, Text, Tooltip } from '@mantine/core';

// A stream by what it collects, its source and the venue's id for it, rather than its number.
export function StreamName({ streamId, name }: { streamId: number; name: string | undefined }) {
  if (!name) return <Text size="sm">{streamId}</Text>;
  const space = name.indexOf(' ');
  const source = space < 0 ? name : name.slice(0, space);
  const subject = space < 0 ? '' : name.slice(space + 1);
  return (
    <Tooltip label={`stream ${streamId}`} withArrow openDelay={300}>
      <Group gap={6} wrap="nowrap" style={{ minWidth: 0 }}>
        <Badge size="xs" variant="outline" color="gray" style={{ flexShrink: 0 }}>{source}</Badge>
        <Text size="sm" truncate maw={320}>{subject}</Text>
      </Group>
    </Tooltip>
  );
}
