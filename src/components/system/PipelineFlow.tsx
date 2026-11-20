import { Box, Group, Text, ThemeIcon, Tooltip, UnstyledButton } from '@mantine/core';
import { PipelineRow } from '../../types';
import { look } from './stageLook';

// A pipeline's stages left to right, joined like the run flows through them. Stages the latest run hasn't reached
// still show an earlier run's result, so they're faded and say so. Clicking a stage opens it.
export function PipelineFlow({ pipeline, onStageClick }: { pipeline: PipelineRow; onStageClick?: (stage: string) => void }) {
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
              <UnstyledButton
                onClick={onStageClick && (() => onStageClick(stage.name))}
                disabled={!onStageClick}
                display="flex"
                px={8}
                py={3}
                style={{
                  gap: 6,
                  alignItems: 'center',
                  cursor: onStageClick ? 'pointer' : 'default',
                  border: `1px solid var(--mantine-color-${color}-${stale ? 3 : 6})`,
                  borderRadius: 999,
                  opacity: stale ? 0.5 : 1,
                  background: stage.name === pipeline.failedStage ? 'var(--mantine-color-red-light)' : undefined,
                }}
              >
                <ThemeIcon size={18} radius="xl" variant="light" color={color}>{icon}</ThemeIcon>
                <Text size="xs" fw={500} style={{ whiteSpace: 'nowrap' }}>{stage.name}</Text>
              </UnstyledButton>
            </Tooltip>
          </Group>
        );
      })}
    </Group>
  );
}
