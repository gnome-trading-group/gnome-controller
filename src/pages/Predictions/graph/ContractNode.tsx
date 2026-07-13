import { memo } from 'react';
import { Handle, Position } from '@xyflow/react';
import { Paper, Text, Badge } from '@mantine/core';

export interface ContractNodeData {
  symbol: string;
  outcomeLabel?: string;
  eventTitle?: string;
  resolved?: boolean;
  [key: string]: unknown;
}

interface ContractNodeProps {
  data: ContractNodeData;
  selected: boolean;
}

function ContractNode({ data, selected }: ContractNodeProps) {
  return (
    <>
      <Handle type="target" position={Position.Left} style={{ background: 'var(--mantine-color-green-6)' }} />
      <Paper
        withBorder
        p="xs"
        style={{
          minWidth: 120,
          maxWidth: 200,
          borderColor: selected
            ? 'var(--mantine-color-green-5)'
            : data.resolved
            ? 'var(--mantine-color-dimmed)'
            : 'var(--mantine-color-dark-4)',
          backgroundColor: 'var(--mantine-color-dark-7)',
          cursor: 'pointer',
        }}
      >
        <Text size="xs" fw={700} truncate>
          {data.symbol}
        </Text>
        {data.outcomeLabel && (
          <Badge size="xs" variant="light" color="blue" mt={2} style={{ maxWidth: '100%' }}>
            {data.outcomeLabel}
          </Badge>
        )}
        {data.eventTitle && (
          <Text size="xs" c="dimmed" truncate mt={2} style={{ maxWidth: 180 }}>
            {data.eventTitle}
          </Text>
        )}
      </Paper>
      <Handle type="source" position={Position.Right} style={{ background: 'var(--mantine-color-green-6)' }} />
    </>
  );
}

export default memo(ContractNode);
