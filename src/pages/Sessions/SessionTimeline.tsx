import { useMemo } from 'react';
import { Box, Card, Group, Stack, Text, Tooltip } from '@mantine/core';
import { useNavigate } from 'react-router-dom';
import { StrategySession, StrategySessionStatus } from '../../types';
import { formatDuration, formatTime } from '../../utils/format';
import { timelineLanes } from '../../utils/timeline';
import { usePreferences } from '../../context/PreferencesContext';

const DAY_MS = 86_400_000;
const LABEL_WIDTH = 140;

const BAR_COLORS: Record<string, string> = {
  [StrategySessionStatus.FAILED]: 'var(--mantine-color-red-6)',
  [StrategySessionStatus.STOPPED]: 'var(--mantine-color-gray-5)',
};

// Each strategy's sessions over the last days as bars on one time axis, so overlaps, gaps, restarts and failures show
// at a glance. Running sessions reach the right edge.
export function SessionTimeline({ sessions, days, strategyName, failedReason }: {
  sessions: StrategySession[];
  days: number;
  strategyName: (strategyId: number) => string;
  failedReason: (session: StrategySession) => string | null;
}) {
  const navigate = useNavigate();
  const { timeZone } = usePreferences();
  // Re-placed whenever the sessions are re-read, which is often enough for the right edge to track now.
  const { lanes, from } = useMemo(() => {
    const end = Date.now();
    const start = end - days * DAY_MS;
    return { lanes: timelineLanes(sessions, start, end), from: start };
  }, [sessions, days]);
  const byId = useMemo(() => new Map(sessions.map(s => [s.sessionId, s])), [sessions]);
  const ticks = Array.from({ length: days + 1 }, (_, i) => from + i * DAY_MS);

  if (lanes.length === 0) return null;
  return (
    <Card withBorder padding="sm" radius="md" mb="lg">
      <Group justify="space-between" mb={6}>
        <Text size="sm" fw={600}>Last {days} days</Text>
        <Group gap="sm">
          {[['Running', 'var(--mantine-color-green-6)'], ['Stopped', BAR_COLORS.STOPPED], ['Failed', BAR_COLORS.FAILED]].map(([label, color]) => (
            <Group key={label} gap={4}>
              <Box w={10} h={6} style={{ background: color, borderRadius: 2 }} />
              <Text size="xs" c="dimmed">{label}</Text>
            </Group>
          ))}
        </Group>
      </Group>
      <Stack gap={4}>
        {lanes.map(lane => (
          <Group key={lane.strategyId} gap={0} wrap="nowrap">
            <Text size="xs" w={LABEL_WIDTH} truncate pr="xs">{strategyName(lane.strategyId)}</Text>
            <Box pos="relative" h={14} style={{ flex: 1, background: 'var(--mantine-color-default-hover)', borderRadius: 3 }}>
              {lane.bars.map(bar => {
                const session = byId.get(bar.sessionId)!;
                const ended = bar.stoppedAt ? Date.parse(bar.stoppedAt) : Date.now();
                const reason = failedReason(session);
                return (
                  <Tooltip
                    key={bar.sessionId}
                    withArrow
                    multiline
                    w={260}
                    label={
                      <Stack gap={0}>
                        <Text size="xs" fw={600}>{bar.sessionId.slice(0, 8)} · {bar.status}</Text>
                        <Text size="xs">{formatTime(bar.startedAt, timeZone, 'minute')} → {bar.stoppedAt ? formatTime(bar.stoppedAt, timeZone, 'minute') : 'now'}</Text>
                        <Text size="xs">ran {formatDuration(ended - Date.parse(bar.startedAt))}</Text>
                        {reason && <Text size="xs" c="red.3">{reason}</Text>}
                      </Stack>
                    }
                  >
                    <Box
                      pos="absolute"
                      top={2}
                      h={10}
                      onClick={() => navigate(`/sessions/${bar.sessionId}`)}
                      style={{
                        left: `${bar.leftPct}%`,
                        width: `${bar.widthPct}%`,
                        background: BAR_COLORS[bar.status] ?? 'var(--mantine-color-green-6)',
                        borderRadius: 2,
                        cursor: 'pointer',
                      }}
                    />
                  </Tooltip>
                );
              })}
            </Box>
          </Group>
        ))}
        <Group gap={0} wrap="nowrap">
          <Box w={LABEL_WIDTH} />
          <Box pos="relative" h={14} style={{ flex: 1 }}>
            {ticks.map((t, i) => (
              <Text key={t} size="10px" c="dimmed" pos="absolute"
                style={{ left: `${(i / days) * 100}%`, transform: i === 0 ? undefined : i === days ? 'translateX(-100%)' : 'translateX(-50%)' }}>
                {i === days ? 'now' : `${days - i}d ago`}
              </Text>
            ))}
          </Box>
        </Group>
      </Stack>
    </Card>
  );
}
