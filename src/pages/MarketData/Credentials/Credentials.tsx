import { useState } from 'react';
import { Alert, Badge, Button, Code, Container, Group, Stack, Table, Text, Title, Tooltip } from '@mantine/core';
import { useQueryClient } from '@tanstack/react-query';
import ReactTimeAgo from 'react-time-ago';
import { useGlobalState } from '../../../context/GlobalStateContext';
import { keys, useMarketDataAccounts, useMarketDataKeys } from '../../../query/hooks';
import { MarketDataAccount, MarketDataKey, SecretStatus } from '../../../types/credentials';
import { KEY_SYNC_LABELS, keySync, SIGNED_SOURCES } from '../../../utils/credentials';
import { SetMarketDataKeyModal } from './SetMarketDataKeyModal';
import { AccountTarget, SetMarketDataAccountModal } from './SetMarketDataAccountModal';
import { EditMarketDataAccountModal } from './EditMarketDataAccountModal';
import { SkeletonRows } from '../../../components/SkeletonRows';

function Regions({ marketDataKey }: { marketDataKey: SecretStatus }) {
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

function SetBy({ secret }: { secret: SecretStatus }) {
  if (!secret.exists) return <Text size="sm" c="dimmed">—</Text>;
  return (
    <Text size="sm">
      {secret.updatedBy ?? 'unknown'}
      {secret.lastChangedAt && <> · <ReactTimeAgo date={new Date(secret.lastChangedAt)} timeStyle="round" /></>}
    </Text>
  );
}

// Collection's own accounts: dedicated, unfunded accounts per signed source, which shards bind to by label
// (SOURCE_ACCOUNTS, md-1 by default), so collection never spends a trading account's connections.
function CollectionAccounts({ nameOf }: { nameOf: (code: string) => string }) {
  const queryClient = useQueryClient();
  const accounts = useMarketDataAccounts();
  const [target, setTarget] = useState<AccountTarget | null>(null);
  const [editing, setEditing] = useState<MarketDataAccount | null>(null);
  const refresh = () => queryClient.invalidateQueries({ queryKey: keys.marketDataAccounts });
  const of = (source: string) => (accounts.data ?? []).filter((a) => a.sourceCode === source);
  const targetSource = target ? (target.kind === 'add' ? target.sourceCode : target.account.sourceCode) : '';

  return (
    <>
      <Title order={3} mb="xs">Collection accounts</Title>
      <Text size="sm" c="dimmed" mb="md">
        Dedicated, unfunded accounts that shards collect with. A shard uses each source&apos;s <Code>md-1</Code> unless
        it is bound to another label; a retired account is refused when a shard next connects with it.
      </Text>
      {accounts.error && <Alert color="red" mb="md">{accounts.error.message}</Alert>}
      <Table striped withTableBorder withColumnBorders mb="xl">
        <Table.Thead>
          <Table.Tr>
            <Table.Th>Source</Table.Th>
            <Table.Th>Label</Table.Th>
            <Table.Th>Status</Table.Th>
            <Table.Th>Budget</Table.Th>
            <Table.Th>Key id</Table.Th>
            <Table.Th>Regions</Table.Th>
            <Table.Th>Set by</Table.Th>
            <Table.Th />
          </Table.Tr>
        </Table.Thead>
        <Table.Tbody>
          {SIGNED_SOURCES.flatMap((source) => [
            ...of(source).map((a) => (
              <Table.Tr key={a.accountId}>
                <Table.Td><Text size="sm" fw={600}>{nameOf(source)}</Text></Table.Td>
                <Table.Td><Code>{a.label}</Code>{a.note && <Text size="xs" c="dimmed">{a.note}</Text>}</Table.Td>
                <Table.Td>
                  <Badge size="sm" variant="light" color={a.status === 'ACTIVE' ? 'teal' : 'gray'}>{a.status.toLowerCase()}</Badge>
                </Table.Td>
                <Table.Td>{a.connectionBudget ?? <Text size="sm" c="dimmed">source limit</Text>}</Table.Td>
                <Table.Td>{a.key.apiKeyId ? <Code>{a.key.apiKeyId.slice(0, 8)}…</Code> : <Text size="sm" c="dimmed">—</Text>}</Table.Td>
                <Table.Td><Regions marketDataKey={a.key} /></Table.Td>
                <Table.Td><SetBy secret={a.key} /></Table.Td>
                <Table.Td>
                  <Group justify="flex-end" gap="xs">
                    <Button size="xs" variant="light" onClick={() => setTarget({ kind: 'replace', account: a })}>Replace key</Button>
                    <Button size="xs" variant="default" onClick={() => setEditing(a)}>Edit</Button>
                  </Group>
                </Table.Td>
              </Table.Tr>
            )),
            <Table.Tr key={`${source}-add`}>
              <Table.Td><Text size="sm" fw={600}>{nameOf(source)}</Text></Table.Td>
              <Table.Td colSpan={6}>
                {of(source).length === 0 && !accounts.isLoading
                  ? <Text size="sm" c="orange">No account yet: shards can&apos;t collect {nameOf(source)} until md-1 is added.</Text>
                  : null}
              </Table.Td>
              <Table.Td>
                <Group justify="flex-end">
                  <Button size="xs" variant="light"
                    onClick={() => setTarget({ kind: 'add', sourceCode: source, existingLabels: of(source).map((a) => a.label) })}>
                    Add account
                  </Button>
                </Group>
              </Table.Td>
            </Table.Tr>,
          ])}
          {accounts.isLoading && <SkeletonRows cols={8} />}
        </Table.Tbody>
      </Table>
      <SetMarketDataAccountModal target={target} sourceName={nameOf(targetSource)}
        onClose={() => setTarget(null)} onSaved={refresh} />
      <EditMarketDataAccountModal account={editing} sourceName={editing ? nameOf(editing.sourceCode) : ''}
        onClose={() => setEditing(null)} onSaved={refresh} />
    </>
  );
}

// The keys market data signs in with. Shards use collection's own accounts; sessions still use one key per exchange
// that requires one, in every region, until they read their data from shards. Venue accounts' own keys live on the
// Treasury page.
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
        Every shard and session reads its own region&apos;s copy of a key, so a key works everywhere only once all
        three regions hold it. Polymarket International, Hyperliquid and Lighter need none.
      </Text>
      <CollectionAccounts nameOf={nameOf} />
      <Title order={3} mb="xs">Session keys</Title>
      <Text size="sm" c="dimmed" mb="md">
        One per exchange, used by every session (paper and live) for its market data until sessions read it from shards.
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
              <Table.Td><SetBy secret={k} /></Table.Td>
              <Table.Td>
                <Group justify="flex-end">
                  <Button size="xs" variant="light" onClick={() => setTarget(k)}>{k.exists ? 'Replace key' : 'Set key'}</Button>
                </Group>
              </Table.Td>
            </Table.Tr>
          ))}
          {marketDataKeys.isLoading && <SkeletonRows cols={6} />}
        </Table.Tbody>
      </Table>
      <SetMarketDataKeyModal target={target} exchangeName={target ? nameOf(target.exchangeCode) : ''}
        onClose={() => setTarget(null)} onSaved={() => queryClient.invalidateQueries({ queryKey: keys.marketDataKeys })} />
    </Container>
  );
}

export default Credentials;
