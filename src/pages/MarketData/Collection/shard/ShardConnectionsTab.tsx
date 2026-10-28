import { Badge, Code, Table, Text } from '@mantine/core';
import { ShardConnection } from '../../../../types/collection';

// The venue connections the shard holds: markets are packed onto them per source, one spare kept for rolls.
export function ShardConnectionsTab({ connections }: { connections: ShardConnection[] }) {
  if (connections.length === 0) return <Text size="sm" c="dimmed">No connections open.</Text>;
  return (
    <Table striped withTableBorder verticalSpacing={6} fz="sm">
      <Table.Thead>
        <Table.Tr>
          <Table.Th>Connection</Table.Th>
          <Table.Th>Source</Table.Th>
          <Table.Th>Account</Table.Th>
          <Table.Th ta="right">Markets</Table.Th>
          <Table.Th>State</Table.Th>
        </Table.Tr>
      </Table.Thead>
      <Table.Tbody>
        {[...connections].sort((a, b) => a.name.localeCompare(b.name)).map((c) => (
          <Table.Tr key={c.name}>
            <Table.Td><Code>{c.name}</Code></Table.Td>
            <Table.Td>{c.source}</Table.Td>
            <Table.Td>{c.account ?? <Text span size="sm" c="dimmed">none needed</Text>}</Table.Td>
            <Table.Td ta="right">{c.markets}</Table.Td>
            <Table.Td>
              <Badge size="sm" variant="light" color={c.reconnecting ? 'red' : 'teal'}>{c.reconnecting ? 'reconnecting' : 'connected'}</Badge>
            </Table.Td>
          </Table.Tr>
        ))}
      </Table.Tbody>
    </Table>
  );
}
