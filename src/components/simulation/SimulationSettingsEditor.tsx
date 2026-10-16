import { useMemo } from 'react';
import { Accordion, ActionIcon, Anchor, Badge, Group, NumberInput, Select, Stack, Text, Title } from '@mantine/core';
import { IconTrash } from '@tabler/icons-react';
import { useQuery } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import { useGlobalState } from '../../context/GlobalStateContext';
import { useSimulationParameters } from '../../query/hooks';
import { registryApi } from '../../utils/api';
import { BLOCK_LABELS, SessionSimulation, SimulationBlocks } from '../../utils/simulation';
import { SimulationBlocksForm } from './SimulationBlocksForm';

interface Props {
  value: SessionSimulation;
  onChange: (value: SessionSimulation) => void;
  // The session's listings, when known, so a single listing can be overridden too; a rule or a strategy template
  // doesn't know its listings, so it overrides by exchange only.
  listingIds?: number[];
}

function overriddenSummary(blocks: SimulationBlocks): string {
  const keys = Object.keys(blocks) as (keyof SimulationBlocks)[];
  return keys.length ? keys.map(k => BLOCK_LABELS[k].toLowerCase()).join(', ') : 'nothing yet';
}

// A paper run's simulation: each listing simulates as its exchange's parameters are recorded in the registry, unless
// overridden here for its exchange or for the listing itself.
export function SimulationSettingsEditor({ value, onChange, listingIds }: Props) {
  const { exchanges } = useGlobalState();
  const recorded = useSimulationParameters();
  const listings = useQuery({
    queryKey: ['listingsByIds', listingIds],
    queryFn: () => registryApi.listListingsByIds(listingIds ?? []),
    enabled: !!listingIds?.length,
    staleTime: 300_000,
  });
  const byCode = useMemo(() => new Map(exchanges.map(e => [e.exchangeCode, e])), [exchanges]);
  const recordedFor = (code: string): SimulationBlocks =>
    recorded.data?.get(byCode.get(code)?.exchangeId ?? -1)?.definition ?? {};
  const exchangeOverrides = value.exchanges ?? {};
  const listingOverrides = value.listings ?? {};
  const exchangeOfListing = (id: string) => exchanges.find(e => e.exchangeId === listings.data?.find(l => String(l.listingId) === id)?.exchangeId);

  const setExchange = (code: string, blocks: SimulationBlocks | undefined) => {
    const next = { ...exchangeOverrides };
    if (blocks === undefined) delete next[code]; else next[code] = blocks;
    onChange({ ...value, exchanges: next });
  };
  const setListing = (id: string, blocks: SimulationBlocks | undefined) => {
    const next = { ...listingOverrides };
    if (blocks === undefined) delete next[id]; else next[id] = blocks;
    onChange({ ...value, listings: next });
  };

  const exchangeOptions = exchanges
    .filter(e => !(e.exchangeCode in exchangeOverrides))
    .map(e => ({
      value: e.exchangeCode,
      label: recorded.data?.has(e.exchangeId) ? e.exchangeCode : `${e.exchangeCode} (no parameters recorded)`,
    }));
  const listingOptions = (listingIds ?? []).map(String).filter(id => !(id in listingOverrides))
    .map(id => ({ value: id, label: `${id}${exchangeOfListing(id) ? ` (${exchangeOfListing(id)!.exchangeCode})` : ''}` }));

  return (
    <Stack gap="xs">
      <Title order={6} c="dimmed">Simulation</Title>
      <Text size="xs" c="dimmed">
        Each listing simulates as its exchange is recorded in the{' '}
        <Anchor component={Link} to="/security-master?tab=simulation" size="xs">Security Master</Anchor>, as of when the
        session launches. Override an exchange or a listing only to simulate it differently.
      </Text>
      <NumberInput label="Latency seed (optional)" placeholder="Default" allowDecimal={false} w={220}
        value={value.seed ?? ''} onChange={v => onChange({ ...value, seed: v === '' ? undefined : Number(v) })} />

      <Accordion variant="separated" multiple>
        {Object.entries(exchangeOverrides).map(([code, blocks]) => (
          <Accordion.Item key={`e-${code}`} value={`e-${code}`}>
            <Accordion.Control>
              <Group gap="xs">
                <Badge variant="light">{code}</Badge>
                <Text size="sm" c="dimmed">overrides {overriddenSummary(blocks)}</Text>
              </Group>
            </Accordion.Control>
            <Accordion.Panel>
              <SimulationBlocksForm value={blocks} inherited={recordedFor(code)} onChange={b => setExchange(code, b)} />
              <Group justify="flex-end" mt="xs">
                <ActionIcon variant="subtle" color="red" onClick={() => setExchange(code, undefined)}><IconTrash size={14} /></ActionIcon>
              </Group>
            </Accordion.Panel>
          </Accordion.Item>
        ))}
        {Object.entries(listingOverrides).map(([id, blocks]) => {
          const code = exchangeOfListing(id)?.exchangeCode;
          const inherited = code ? { ...recordedFor(code), ...exchangeOverrides[code] } : {};
          return (
            <Accordion.Item key={`l-${id}`} value={`l-${id}`}>
              <Accordion.Control>
                <Group gap="xs">
                  <Badge variant="outline">Listing {id}</Badge>
                  <Text size="sm" c="dimmed">overrides {overriddenSummary(blocks)}</Text>
                </Group>
              </Accordion.Control>
              <Accordion.Panel>
                <SimulationBlocksForm value={blocks} inherited={inherited} onChange={b => setListing(id, b)} />
                <Group justify="flex-end" mt="xs">
                  <ActionIcon variant="subtle" color="red" onClick={() => setListing(id, undefined)}><IconTrash size={14} /></ActionIcon>
                </Group>
              </Accordion.Panel>
            </Accordion.Item>
          );
        })}
      </Accordion>

      <Group grow>
        <Select placeholder="Override an exchange…" data={exchangeOptions} value={null} searchable
          onChange={code => code && setExchange(code, {})} />
        {listingIds !== undefined && (
          <Select placeholder={listingOptions.length ? 'Override a listing…' : 'Add listings to override one'}
            data={listingOptions} value={null} disabled={!listingOptions.length}
            onChange={id => id && setListing(id, {})} />
        )}
      </Group>
    </Stack>
  );
}
