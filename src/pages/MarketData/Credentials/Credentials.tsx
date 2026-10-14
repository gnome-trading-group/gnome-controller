import { useState } from 'react';
import { Alert, Badge, Button, Code, Container, Group, Stack, Table, Text, Title, Tooltip } from '@mantine/core';
import { useQueryClient } from '@tanstack/react-query';
import ReactTimeAgo from 'react-time-ago';
import { useGlobalState } from '../../../context/GlobalStateContext';
import { keys, useMarketDataKeys } from '../../../query/hooks';
import { MarketDataKey } from '../../../types/credentials';
import { KEY_SYNC_LABELS, keySync } from '../../../utils/credentials';
import { SetMarketDataKeyModal } from './SetMarketDataKeyModal';

function Regions({ marketDataKey }: { marketDataKey: MarketDataKey }) {
  const sync = KEY_SYNC_LABELS[keySync(marketDataKey)];
  const badge = <Badge size="sm" variant="light" color={sync.color}>{sync.label}</Badge>;
  if (!marketDataKey.exists) return badge;
  return (
    <Tooltip withArrow multiline w={300} label={
      <Stack gap={2}>
        <Text size="xs">us-east-1: primary</Text>
        {marketDataKey.replicas.map((r) => (
          <Text key={r.region} size="xs">{r.region}: {r.status}{r.message ? ` (${r.message})` : ''}</Text>
        ))}
      </Stack>
    }>
      {badge}
    </Tooltip>
  );
}

// The keys market data signs in with: one per exchange that requires one, shared by every session (paper and live)
// and every collector, in every region. Venue accounts' own keys live on the Treasury page.
function Credentials() {
  const queryClient = useQueryClient();
  const { exchanges } = useGlobalState();
  const marketDataKeys = useMarketDataKeys();
  const [target, setTarget] = useState<MarketDataKey | null>(null);
  const nameOf = (code: string) => exchanges.find((e) => e.exchangeCode === code)?.exchangeName ?? code;

  return (
    <Container size="xl" py="xl">
      <Title order={2} mb="xs">Credentials</Title>
      <Text size="sm" c="dimmed" mb="md">
        Market data keys, one per exchange that requires one. Every session and collector reads its own region&apos;s
        copy, so a key works everywhere only once all three regions hold it. Polymarket International, Hyperliquid
        and Lighter need none.
      </Text>
      {marketDataKeys.error && <Alert color="red" mb="md">{marketDataKeys.error.message}</Alert>}
      <Table striped withTableBorder withColumnBorders>
        <Table.Thead>
          <Table.Tr>
            <Table.Th>Exchange</Table.Th>
            <Table.Th>Secret</Table.Th>
            <Table.Th>Key id</Table.Th>
            <Table.Th>Regions</Table.Th>
            <Table.Th>Set by</Table.Th>
            <Table.Th />
          </Table.Tr>
        </Table.Thead>
        <Table.Tbody>
          {(marketDataKeys.data ?? []).map((k) => (
            <Table.Tr key={k.exchangeCode}>
              <Table.Td>
                <Text size="sm" fw={600}>{nameOf(k.exchangeCode)}</Text>
              </Table.Td>
              <Table.Td><Code>{k.secretName}</Code></Table.Td>
              <Table.Td>{k.apiKeyId ? <Code>{k.apiKeyId.slice(0, 8)}…</Code> : <Text size="sm" c="dimmed">—</Text>}</Table.Td>
              <Table.Td><Regions marketDataKey={k} /></Table.Td>
              <Table.Td>
                {k.exists ? (
                  <Text size="sm">
                    {k.updatedBy ?? 'unknown'}
                    {k.lastChangedAt && <> · <ReactTimeAgo date={new Date(k.lastChangedAt)} timeStyle="round" /></>}
                  </Text>
                ) : <Text size="sm" c="dimmed">—</Text>}
              </Table.Td>
              <Table.Td>
                <Group justify="flex-end">
                  <Button size="xs" variant="light" onClick={() => setTarget(k)}>{k.exists ? 'Replace key' : 'Set key'}</Button>
                </Group>
              </Table.Td>
            </Table.Tr>
          ))}
          {marketDataKeys.isLoading && (
            <Table.Tr><Table.Td colSpan={6}><Text size="sm" c="dimmed">Loading…</Text></Table.Td></Table.Tr>
          )}
        </Table.Tbody>
      </Table>
      <SetMarketDataKeyModal target={target} exchangeName={target ? nameOf(target.exchangeCode) : ''}
        onClose={() => setTarget(null)} onSaved={() => queryClient.invalidateQueries({ queryKey: keys.marketDataKeys })} />
    </Container>
  );
}

export default Credentials;
