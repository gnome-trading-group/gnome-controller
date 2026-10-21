import { ReactNode } from 'react';
import { ActionIcon, Badge, Code, CopyButton, Group, Progress, Text, Tooltip } from '@mantine/core';
import { IconCheck, IconCopy } from '@tabler/icons-react';
import { BatchRunStatus, BatchTaskStatus, RUN_STATUS_COLORS, TASK_STATUS_COLORS } from './status';

export function RunStatusBadge({ status, size = 'sm' }: { status: BatchRunStatus; size?: string }) {
  return <Badge color={RUN_STATUS_COLORS[status] ?? 'gray'} variant="light" size={size}>{status.replace('_', ' ')}</Badge>;
}

export function TaskStatusBadge({ status, reason }: { status: BatchTaskStatus; reason?: string }) {
  return (
    <Tooltip label={reason} disabled={!reason} withArrow multiline w={320}>
      <Badge color={TASK_STATUS_COLORS[status] ?? 'gray'} variant="light" size="sm">{status}</Badge>
    </Tooltip>
  );
}

export function CopyIcon({ value, label = 'Copy' }: { value: string; label?: string }) {
  return (
    <CopyButton value={value} timeout={2000}>
      {({ copied, copy }) => (
        <Tooltip label={copied ? 'Copied!' : label} withArrow>
          <ActionIcon size="sm" variant="subtle" color={copied ? 'teal' : 'gray'} style={{ flexShrink: 0 }}
                      onClick={e => { e.stopPropagation(); copy(); }}>
            {copied ? <IconCheck size={13} /> : <IconCopy size={13} />}
          </ActionIcon>
        </Tooltip>
      )}
    </CopyButton>
  );
}

export function CopyableCode({ value }: { value: string }) {
  return (
    <Group gap={6} wrap="nowrap" align="center">
      <Code style={{ fontSize: '0.72rem', padding: '3px 6px', wordBreak: 'break-all' }}>{value}</Code>
      <CopyIcon value={value} />
    </Group>
  );
}

export function InfoRow({ label, children }: { label: string; children: ReactNode }) {
  return (
    <Group gap="xs" wrap="nowrap" align="flex-start">
      <Text size="sm" c="dimmed" w={110} style={{ flexShrink: 0 }}>{label}</Text>
      <Text size="sm" component="div" style={{ minWidth: 0 }}>{children}</Text>
    </Group>
  );
}

export interface ProgressCounts {
  total: number;
  succeeded: number;
  failed: number;
  // Only a run's detail knows how many of its unfinished tasks are running rather than waiting.
  running?: number;
}

export function RunProgress({ counts, size = 'md' }: { counts: ProgressCounts; size?: string }) {
  const { total, succeeded, failed, running = 0 } = counts;
  const pct = (n: number) => (total > 0 ? (n / total) * 100 : 0);
  const waiting = Math.max(0, total - succeeded - failed - running);
  const label = `${succeeded} succeeded · ${failed} failed`
    + (counts.running !== undefined ? ` · ${running} running · ${waiting} waiting` : ` · ${waiting + running} unfinished`);
  return (
    <Tooltip label={label} withArrow>
      <Progress.Root size={size}>
        <Progress.Section value={pct(succeeded)} color="green" />
        <Progress.Section value={pct(failed)} color="red" />
        <Progress.Section value={pct(running)} color="yellow" />
      </Progress.Root>
    </Tooltip>
  );
}
