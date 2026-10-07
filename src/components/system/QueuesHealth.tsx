import { Badge, Table, Text } from '@mantine/core';
import { QueuesSection } from '../../types';
import { useSystemHealth } from '../../query/hooks';
import { formatSeconds } from '../../utils/system';
import { SectionCard } from './SectionCard';

// Every SQS queue; a dead-letter queue holding messages is work that failed and is waiting on someone.
export function QueuesHealth() {
  const queues = useSystemHealth<QueuesSection>('queues');
  const rows = queues.data?.queues ?? [];
  const dead = rows.filter(q => q.deadLetter && q.visible > 0).length;
  return (
    <SectionCard
      title="Queues"
      subtitle="Dead-letter queues are found from the other queues' redrive settings"
      loading={queues.isLoading}
      error={queues.error}
      regionErrors={queues.data?.errors}
      asOf={queues.data?.asOf}
      onRefresh={queues.refresh}
      refreshing={queues.refreshing}
      right={dead > 0 && <Badge color="red" variant="light">{dead} dead-letter queue{dead > 1 ? 's' : ''} holding messages</Badge>}
    >
      {rows.length === 0 ? <Text size="sm" c="dimmed">No queues in this account.</Text> : (
        <Table verticalSpacing={4} fz="sm" striped>
          <Table.Thead>
            <Table.Tr>
              <Table.Th>Queue</Table.Th>
              <Table.Th ta="right">Waiting</Table.Th>
              <Table.Th ta="right">In flight</Table.Th>
              <Table.Th ta="right">Oldest</Table.Th>
            </Table.Tr>
          </Table.Thead>
          <Table.Tbody>
            {rows.map(q => {
              const failing = q.deadLetter && q.visible > 0;
              return (
                <Table.Tr key={`${q.region}/${q.name}`}>
                  <Table.Td>
                    <Text span size="sm" ff="monospace" c={failing ? 'red' : undefined}>{q.name}</Text>{' '}
                    {q.deadLetter && <Badge size="xs" variant={failing ? 'filled' : 'outline'} color={failing ? 'red' : 'gray'}>dead-letter</Badge>}
                    <Text span size="xs" c="dimmed"> {q.region}</Text>
                  </Table.Td>
                  <Table.Td ta="right"><Text span size="sm" fw={failing ? 700 : undefined} c={failing ? 'red' : undefined}>{q.visible}</Text></Table.Td>
                  <Table.Td ta="right">{q.inFlight}</Table.Td>
                  <Table.Td ta="right">{q.visible > 0 ? formatSeconds(q.oldestAgeSeconds) : '—'}</Table.Td>
                </Table.Tr>
              );
            })}
          </Table.Tbody>
        </Table>
      )}
    </SectionCard>
  );
}
