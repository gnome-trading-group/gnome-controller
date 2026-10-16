import { Anchor, Badge, Group, Stack, Table, Text } from '@mantine/core';
import { Link } from 'react-router-dom';
import { BLOCK_LABELS, describeBlock, SessionSimulation, SimulationBlocks } from '../../utils/simulation';

function Blocks({ blocks }: { blocks: SimulationBlocks }) {
  return (
    <Table withRowBorders={false} fz="sm" verticalSpacing={2}>
      <Table.Tbody>
        {(Object.keys(blocks) as (keyof SimulationBlocks)[]).map(key => (
          <Table.Tr key={key}>
            <Table.Td w={180} c="dimmed">{BLOCK_LABELS[key]}</Table.Td>
            <Table.Td>{describeBlock(key, blocks)}</Table.Td>
          </Table.Tr>
        ))}
      </Table.Tbody>
    </Table>
  );
}

// What a session, rule or strategy simulates with beyond its exchanges' recorded parameters.
export function SimulationSummary({ simulation }: { simulation: SessionSimulation }) {
  const exchanges = Object.entries(simulation.exchanges ?? {});
  const listings = Object.entries(simulation.listings ?? {});
  return (
    <Stack gap="xs">
      <Text size="sm">
        Each listing simulates as its exchange is recorded in the{' '}
        <Anchor component={Link} to="/security-master?tab=simulation" size="sm">Security Master</Anchor>
        {simulation.as_of ? <> as of <b>{new Date(simulation.as_of).toLocaleString()}</b></> : ', as of when it launches'}
        {exchanges.length || listings.length ? ', except:' : '.'}
        {simulation.seed !== undefined && <> Latency seed {simulation.seed}.</>}
      </Text>
      {exchanges.map(([code, blocks]) => (
        <Stack key={code} gap={2}>
          <Group gap={6}><Badge variant="light" size="sm">{code}</Badge></Group>
          <Blocks blocks={blocks} />
        </Stack>
      ))}
      {listings.map(([id, blocks]) => (
        <Stack key={id} gap={2}>
          <Group gap={6}><Badge variant="outline" size="sm">Listing {id}</Badge></Group>
          <Blocks blocks={blocks} />
        </Stack>
      ))}
    </Stack>
  );
}
