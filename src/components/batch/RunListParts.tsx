import { Anchor, Button, Card, Group, SegmentedControl, SimpleGrid, Stack, Text, TextInput } from '@mantine/core';
import { IconSearch, IconX } from '@tabler/icons-react';
import { Link } from 'react-router-dom';
import ReactTimeAgo from 'react-time-ago';
import { formatDuration } from '../../utils/format';
import { ProgressCounts, RunProgress, RunStatusBadge } from './BatchBits';
import { BatchRunStatus, RunFilter, runElapsedMs, runMatches } from './status';

const FILTERS: { value: RunFilter; label: string }[] = [
  { value: 'all', label: 'All' },
  { value: 'active', label: 'Active' },
  { value: 'COMPLETED', label: 'Completed' },
  { value: 'PARTIALLY_FAILED', label: 'Partially failed' },
  { value: 'FAILED', label: 'Failed' },
  { value: 'CANCELLED', label: 'Cancelled' },
];

export function RunFilterBar({ statuses, filter, onFilter, search, onSearch, searchPlaceholder }: {
  statuses: BatchRunStatus[];
  filter: RunFilter;
  onFilter: (filter: RunFilter) => void;
  search: string;
  onSearch: (search: string) => void;
  searchPlaceholder: string;
}) {
  return (
    <Group justify="space-between" mb="sm" gap="sm">
      <SegmentedControl
        size="xs"
        value={filter}
        onChange={v => onFilter(v as RunFilter)}
        data={FILTERS.map(f => ({ value: f.value, label: `${f.label} ${statuses.filter(s => runMatches(f.value, s)).length}` }))}
      />
      <TextInput
        size="xs"
        w={320}
        placeholder={searchPlaceholder}
        leftSection={<IconSearch size={14} />}
        rightSection={search ? <IconX size={14} style={{ cursor: 'pointer' }} onClick={() => onSearch('')} /> : null}
        value={search}
        onChange={e => onSearch(e.currentTarget.value)}
      />
    </Group>
  );
}

export interface ActiveRun {
  runId: string;
  href: string;
  title: string;
  subtitle?: string;
  status: BatchRunStatus;
  submittedAt: string;
  startedAt?: string;
  counts: ProgressCounts;
}

// Runs still going are what someone opening the list usually came to check, so they sit above the table.
export function ActiveRunCards({ runs, onCancel }: { runs: ActiveRun[]; onCancel: (runId: string) => void }) {
  if (runs.length === 0) return null;
  return (
    <SimpleGrid cols={{ base: 1, sm: 2, lg: 3 }} spacing="sm" mb="md">
      {runs.map(run => (
        <Card key={run.runId} withBorder p="sm">
          <Stack gap={6}>
            <Group justify="space-between" wrap="nowrap" gap="xs">
              <Anchor component={Link} to={run.href} fw={600} size="sm" truncate style={{ minWidth: 0 }}>{run.title}</Anchor>
              <RunStatusBadge status={run.status} size="xs" />
            </Group>
            {run.subtitle && <Text size="xs" c="dimmed" truncate>{run.subtitle}</Text>}
            <RunProgress counts={run.counts} size="sm" />
            <Group justify="space-between" wrap="nowrap">
              <Text size="xs" c="dimmed">
                {run.counts.succeeded + run.counts.failed}/{run.counts.total} done
                {run.counts.failed > 0 && <Text span size="xs" c="red"> · {run.counts.failed} failed</Text>}
                {' · '}
                {run.startedAt
                  ? `running ${formatDuration(runElapsedMs(run))}`
                  : <>submitted <ReactTimeAgo date={new Date(run.submittedAt)} timeStyle="round" /></>}
              </Text>
              <Button size="compact-xs" variant="subtle" color="red" onClick={() => onCancel(run.runId)}>Cancel</Button>
            </Group>
          </Stack>
        </Card>
      ))}
    </SimpleGrid>
  );
}
