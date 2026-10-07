import { Box, Group, Loader, Text, ThemeIcon, Tooltip } from '@mantine/core';
import { IconCheck, IconCircleDashed, IconHandStop, IconPlayerStop, IconX } from '@tabler/icons-react';
import { PipelineRow } from '../../types';

interface StageLook {
  color: string;
  icon: React.ReactNode;
  label: string;
}

function look(status: string | null, waiting: boolean): StageLook {
  if (waiting) return { color: 'orange', icon: <IconHandStop size={13} />, label: 'waiting for approval' };
  switch (status) {
    case 'Succeeded': return { color: 'teal', icon: <IconCheck size={13} />, label: 'succeeded' };
    case 'Failed': return { color: 'red', icon: <IconX size={13} />, label: 'failed' };
    case 'InProgress': return { color: 'blue', icon: <Loader size={11} color="blue" />, label: 'running' };
    case 'Stopped':
    case 'Stopping':
    case 'Cancelled': return { color: 'gray', icon: <IconPlayerStop size={13} />, label: status.toLowerCase() };
    default: return { color: 'gray', icon: <IconCircleDashed size={13} />, label: 'not run' };
  }
}

// A pipeline's stages left to right, joined like the run flows through them. Stages the latest run hasn't reached
// still show an earlier run's result, so they're faded and say so.
export function PipelineFlow({ pipeline }: { pipeline: PipelineRow }) {
  const waitingStages = new Set(pipeline.waitingApprovals.map(w => w.stage));
  return (
    <Group gap={0} wrap="nowrap" style={{ overflowX: 'auto' }}>
      {pipeline.stages.map((stage, i) => {
        const waiting = waitingStages.has(stage.name);
        const stale = pipeline.runId !== null && stage.executionId !== null && stage.executionId !== pipeline.runId && !waiting;
        const { color, icon, label } = look(stage.status, waiting);
        return (
          <Group key={stage.name} gap={0} wrap="nowrap">
            {i > 0 && (
              <Box w={18} h={2} style={{ background: `var(--mantine-color-${stale ? 'gray' : color}-${stale ? 4 : 5})`, opacity: stale ? 0.5 : 1 }} />
            )}
            <Tooltip label={`${stage.name}: ${label}${stale ? ' (in an earlier run)' : ''}`} withArrow openDelay={200}>
              <Group
                gap={6}
                wrap="nowrap"
                px={8}
                py={3}
                style={{
                  border: `1px solid var(--mantine-color-${color}-${stale ? 3 : 6})`,
                  borderRadius: 999,
                  opacity: stale ? 0.5 : 1,
                  background: stage.name === pipeline.failedStage ? 'var(--mantine-color-red-light)' : undefined,
                }}
              >
                <ThemeIcon size={18} radius="xl" variant="light" color={color}>{icon}</ThemeIcon>
                <Text size="xs" fw={500} style={{ whiteSpace: 'nowrap' }}>{stage.name}</Text>
              </Group>
            </Tooltip>
          </Group>
        );
      })}
    </Group>
  );
}
