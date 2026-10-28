import { Box, Group, Skeleton, Text, Tooltip } from '@mantine/core';
import { CoverageSegment, SegmentKind } from '../../utils/collection';
import { formatDuration } from '../../utils/format';

const COLORS: Record<SegmentKind, string> = {
  covered: 'var(--mantine-color-teal-6)',
  gap: 'var(--mantine-color-red-6)',
  uncovered: 'var(--mantine-color-orange-5)',
};
const TRACK = 'light-dark(var(--mantine-color-gray-2), var(--mantine-color-dark-5))';

// A stream's coverage over a range as one bar: covered stretches, gaps and the gap still open, on a gray track that
// is time collection didn't want it. Hover a stretch for when and why.
export function CoverageTimeline({ segments, fromMs, toMs, loading }: {
  segments: CoverageSegment[]; fromMs: number; toMs: number; loading: boolean;
}) {
  const span = Math.max(1, toMs - fromMs);
  return (
    <>
      <Skeleton visible={loading} h={28} radius="sm">
        <Box pos="relative" h={28} style={{ background: TRACK, borderRadius: 4, overflow: 'hidden' }}>
          {segments.map(s => (
            <Tooltip
              key={`${s.kind}-${s.startMs}`}
              withArrow
              label={`${s.kind === 'covered' ? `covered by ${s.label}` : s.label} · ${new Date(s.startMs).toLocaleString()} · ${formatDuration(s.endMs - s.startMs)}`}
            >
              <Box
                pos="absolute"
                top={0}
                h="100%"
                style={{
                  left: `${((s.startMs - fromMs) / span) * 100}%`,
                  // A gap of seconds would vanish at this scale; keep every stretch visible.
                  width: `max(2px, ${((s.endMs - s.startMs) / span) * 100}%)`,
                  background: COLORS[s.kind],
                }}
              />
            </Tooltip>
          ))}
        </Box>
      </Skeleton>
      <Group justify="space-between" mt={4}>
        <Text size="xs" c="dimmed">{new Date(fromMs).toLocaleString()}</Text>
        <Group gap="md">
          {(Object.keys(COLORS) as SegmentKind[]).map(kind => (
            <Group key={kind} gap={4}>
              <Box w={10} h={10} style={{ background: COLORS[kind], borderRadius: 2 }} />
              <Text size="xs" c="dimmed">{kind === 'uncovered' ? 'uncovered now' : kind}</Text>
            </Group>
          ))}
          <Group gap={4}>
            <Box w={10} h={10} style={{ background: TRACK, borderRadius: 2 }} />
            <Text size="xs" c="dimmed">not wanted</Text>
          </Group>
        </Group>
        <Text size="xs" c="dimmed">now</Text>
      </Group>
    </>
  );
}
