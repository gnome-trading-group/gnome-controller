import { Group, Text } from '@mantine/core';
import { BatchTaskStatus, TASK_STATUS_COLORS } from './status';

export interface GridTask {
  index: number;
  status: BatchTaskStatus;
  label: string;
}

const MAX_CELLS = 2000;

// One cell per task so a run's shape (where the failures are, how far it has got) reads at a glance. Cells use the
// native title rather than Mantine tooltips: a run can have a thousand of them.
export function TaskGrid({ tasks, selected, onSelect }: {
  tasks: GridTask[];
  selected: number | null;
  onSelect: (index: number) => void;
}) {
  const shown = tasks.slice(0, MAX_CELLS);
  return (
    <Group gap={3}>
      {shown.map(t => (
        <button
          key={t.index}
          type="button"
          title={`#${t.index} · ${t.status}${t.label ? ` · ${t.label}` : ''}`}
          aria-label={`Task ${t.index}, ${t.status}`}
          onClick={() => onSelect(t.index)}
          style={{
            width: 12,
            height: 12,
            padding: 0,
            border: 0,
            borderRadius: 2,
            cursor: 'pointer',
            background: `var(--mantine-color-${TASK_STATUS_COLORS[t.status] ?? 'gray'}-${t.status === 'PENDING' ? 5 : 6})`,
            outline: selected === t.index ? '2px solid var(--mantine-color-text)' : undefined,
            outlineOffset: 1,
          }}
        />
      ))}
      {tasks.length > MAX_CELLS && <Text size="xs" c="dimmed">+{tasks.length - MAX_CELLS} more</Text>}
    </Group>
  );
}
