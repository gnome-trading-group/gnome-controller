import { Badge, Group, Stack, Table, Text, Tooltip } from '@mantine/core';
import ReactTimeAgo from 'react-time-ago';
import { JobsSection } from '../../types';
import { useSystemHealth } from '../../query/hooks';
import { describeSchedule } from '../../utils/system';
import { SectionCard } from './SectionCard';

// Every scheduled EventBridge rule: when it last fired, and whether it or its Lambda targets have been failing.
export function JobsHealth() {
  const jobs = useSystemHealth<JobsSection>('jobs');
  const rows = jobs.data?.jobs ?? [];
  const overdue = rows.filter(j => j.overdue).length;
  return (
    <SectionCard
      title="Scheduled jobs"
      subtitle="Overdue after missing two of its runs; a Lambda's errors count for every rule that runs it"
      loading={jobs.isLoading}
      error={jobs.error}
      regionErrors={jobs.data?.errors}
      asOf={jobs.data?.asOf}
      onRefresh={jobs.refresh}
      refreshing={jobs.refreshing}
      right={overdue > 0 && <Badge color="red" variant="light">{overdue} overdue</Badge>}
    >
      {rows.length === 0 ? <Text size="sm" c="dimmed">No scheduled jobs in this account.</Text> : (
        <Table verticalSpacing={6} fz="sm" striped>
          <Table.Thead>
            <Table.Tr>
              <Table.Th>Job</Table.Th>
              <Table.Th>Schedule</Table.Th>
              <Table.Th>Last ran</Table.Th>
              <Table.Th ta="right">Runs 24h</Table.Th>
              <Table.Th ta="right">Errors 24h</Table.Th>
            </Table.Tr>
          </Table.Thead>
          <Table.Tbody>
            {rows.map(j => (
              <Table.Tr key={`${j.region}/${j.name}`}>
                <Table.Td>
                  <Stack gap={0}>
                    <Group gap={6} wrap="nowrap">
                      <Tooltip label={j.name} withArrow openDelay={300}>
                        <Text size="sm" truncate maw={380}>{j.description || j.targets.map(t => t.name).join(', ') || j.name}</Text>
                      </Tooltip>
                      {j.overdue && <Badge size="xs" color="red">overdue</Badge>}
                      {!j.enabled && <Badge size="xs" color="gray" variant="outline">disabled</Badge>}
                    </Group>
                    <Text size="xs" c="dimmed" truncate maw={480}>
                      {j.targets.map(t => `${t.type}${t.input ? ` ${t.input}` : ''}`).join(' · ')} · {j.region}
                    </Text>
                  </Stack>
                </Table.Td>
                <Table.Td><Text size="sm">{describeSchedule(j.schedule, j.intervalSeconds)}</Text></Table.Td>
                <Table.Td>
                  {j.lastRun ? <ReactTimeAgo date={new Date(j.lastRun)} timeStyle="round" /> : <Text span size="sm" c="dimmed">not seen</Text>}
                  {j.lastError && (
                    <Text size="xs" c="red">failed <ReactTimeAgo date={new Date(j.lastError)} timeStyle="round" /></Text>
                  )}
                </Table.Td>
                <Table.Td ta="right">{j.runs24h ?? '—'}</Table.Td>
                <Table.Td ta="right"><Text span size="sm" c={j.errors24h ? 'red' : undefined}>{j.errors24h ?? '—'}</Text></Table.Td>
              </Table.Tr>
            ))}
          </Table.Tbody>
        </Table>
      )}
    </SectionCard>
  );
}
