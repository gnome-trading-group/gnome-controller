import { useCallback, useEffect, useState } from 'react';
import { ActionIcon, Alert, Badge, Card, Code, Container, Group, ScrollArea, SimpleGrid, Table, Text, Title } from '@mantine/core';
import { IconArrowLeft } from '@tabler/icons-react';
import ReactTimeAgo from 'react-time-ago';
import { useNavigate, useParams } from 'react-router-dom';
import { DatasetDetail as Detail } from '../../types/data';
import { controllerApi } from '../../utils/api';
import { errorMessage } from '../../utils/kill-switch';
import { CodeVersion, RunLink } from '../Pipelines/RunBits';

function cellText(value: unknown): string {
  if (value === null || value === undefined) return '';
  return typeof value === 'object' ? JSON.stringify(value) : String(value);
}

function DatasetDetail() {
  const navigate = useNavigate();
  const { name } = useParams<{ name: string }>();
  const [dataset, setDataset] = useState<Detail | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!name) return;
    try {
      setDataset(await controllerApi.getDataset(name));
      setError(null);
    } catch (e) {
      setError(errorMessage(e, 'Failed to load the dataset'));
    }
  }, [name]);

  useEffect(() => { load(); }, [load]);

  const sampleColumns = dataset?.sample.length ? Object.keys(dataset.sample[0]) : [];
  return (
    <Container size="xl" py="xl">
      <Group mb="md">
        <ActionIcon variant="subtle" onClick={() => navigate('/research/datasets')}><IconArrowLeft size={18} /></ActionIcon>
        <Title order={2} ff="monospace" style={{ flex: 1 }}>{name}</Title>
      </Group>
      {error && <Alert color="red" mb="md">{error}</Alert>}
      {dataset && (
        <>
          <SimpleGrid cols={{ base: 2, md: 4 }} mb="md">
            <Card withBorder p="sm"><Text size="xs" c="dimmed">Key</Text><Code>{dataset.key.join(', ')}</Code></Card>
            <Card withBorder p="sm"><Text size="xs" c="dimmed">Partitioned by</Text><Text size="sm">{dataset.partitionedBy.join(', ') || '—'}</Text></Card>
            <Card withBorder p="sm"><Text size="xs" c="dimmed">Stored rows</Text><Text size="sm">{dataset.storedRows.toLocaleString()}</Text></Card>
            <Card withBorder p="sm"><Text size="xs" c="dimmed">Publishes</Text><Text size="sm">{dataset.publishes}</Text></Card>
          </SimpleGrid>

          <Title order={4} mb="xs">Columns</Title>
          <Table withTableBorder striped mb="lg" verticalSpacing={4}>
            <Table.Tbody>
              {dataset.columns.map(c => (
                <Table.Tr key={c.name}>
                  <Table.Td w={260}>
                    <Code>{c.name}</Code>
                    {dataset.key.includes(c.name) && <Badge size="xs" ml={6} variant="light">key</Badge>}
                    {c.managed && <Badge size="xs" ml={6} variant="light" color="gray">managed</Badge>}
                  </Table.Td>
                  <Table.Td><Text size="xs" ff="monospace">{c.type}{c.required ? '' : ' (nullable)'}</Text></Table.Td>
                </Table.Tr>
              ))}
            </Table.Tbody>
          </Table>

          <Title order={4} mb="xs">Publishes</Title>
          <Table withTableBorder striped mb="lg" verticalSpacing={4}>
            <Table.Thead>
              <Table.Tr><Table.Th>When</Table.Th><Table.Th>Rows added</Table.Th><Table.Th>Code</Table.Th><Table.Th>Run</Table.Th></Table.Tr>
            </Table.Thead>
            <Table.Tbody>
              {dataset.history.map(h => (
                <Table.Tr key={h.at}>
                  <Table.Td><Text size="xs">{new Date(h.at).toLocaleString()} (<ReactTimeAgo date={new Date(h.at)} timeStyle="round" />)</Text></Table.Td>
                  <Table.Td><Text size="xs">{h.rows.toLocaleString()}</Text></Table.Td>
                  <Table.Td><CodeVersion version={h.codeVersion} /></Table.Td>
                  <Table.Td><RunLink runId={h.runId} /></Table.Td>
                </Table.Tr>
              ))}
            </Table.Tbody>
          </Table>

          <Title order={4} mb={4}>Sample</Title>
          <Text size="xs" c="dimmed" mb="xs">{dataset.sample.length} stored rows, in no particular order; not deduplicated by key.</Text>
          <ScrollArea>
            <Table withTableBorder striped verticalSpacing={2} style={{ fontSize: '0.72rem', whiteSpace: 'nowrap' }}>
              <Table.Thead>
                <Table.Tr>{sampleColumns.map(c => <Table.Th key={c}>{c}</Table.Th>)}</Table.Tr>
              </Table.Thead>
              <Table.Tbody>
                {dataset.sample.map((row, i) => (
                  <Table.Tr key={i}>{sampleColumns.map(c => <Table.Td key={c}>{cellText(row[c])}</Table.Td>)}</Table.Tr>
                ))}
              </Table.Tbody>
            </Table>
          </ScrollArea>
        </>
      )}
    </Container>
  );
}

export default DatasetDetail;
