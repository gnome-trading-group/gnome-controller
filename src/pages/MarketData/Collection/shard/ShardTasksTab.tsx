import { Badge, Code, Table, Text } from '@mantine/core';
import ReactTimeAgo from 'react-time-ago';
import { ShardTaskStatus } from '../../../../types/collection';
import { nsToDate } from '../../../../utils/collection';

// Every task that has reported for the shard in the last day: one normally, more once a task was replaced.
export function ShardTasksTab({ statuses, generation }: { statuses: ShardTaskStatus[]; generation: number }) {
  return (
    <Table striped withTableBorder verticalSpacing={6} fz="sm">
      <Table.Thead>
        <Table.Tr>
          <Table.Th>Task</Table.Th>
          <Table.Th>Version</Table.Th>
          <Table.Th>Private IP</Table.Th>
          <Table.Th>Started</Table.Th>
          <Table.Th>Last status</Table.Th>
          <Table.Th>Generation</Table.Th>
        </Table.Tr>
      </Table.Thead>
      <Table.Tbody>
        {statuses.map((s, i) => (
          <Table.Tr key={s.taskId}>
            <Table.Td><Code>{s.taskId}</Code>{i === 0 && <Badge size="xs" ml="xs" variant="light">current</Badge>}</Table.Td>
            <Table.Td>{s.version}</Table.Td>
            <Table.Td>{s.privateIp ?? <Text span size="sm" c="dimmed">—</Text>}</Table.Td>
            <Table.Td>{nsToDate(s.startedAtNs) && <ReactTimeAgo date={nsToDate(s.startedAtNs)!} timeStyle="round" />}</Table.Td>
            <Table.Td>{nsToDate(s.writtenAtNs) && <ReactTimeAgo date={nsToDate(s.writtenAtNs)!} timeStyle="round" />}</Table.Td>
            <Table.Td>
              <Text size="sm" c={s.appliedGeneration < generation && i === 0 ? 'orange' : undefined}>
                {s.appliedGeneration}{s.appliedGeneration < generation ? ` of ${generation}` : ''}
              </Text>
            </Table.Td>
          </Table.Tr>
        ))}
      </Table.Tbody>
    </Table>
  );
}
