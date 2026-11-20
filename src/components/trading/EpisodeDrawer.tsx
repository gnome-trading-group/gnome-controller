import { Anchor, Divider, Drawer, Group, Loader, Stack, Table, Text, Tooltip } from '@mantine/core';
import { Link } from 'react-router-dom';
import { EpisodeRef, useEpisodeFills } from '../../query/hooks';
import { fillTimeMs, summarizeEpisode } from '../../utils/episodes';
import { formatDuration } from '../../utils/format';
import { RoleBadge } from './RoleBadge';
import { ListingLabel, Money, Price, Qty, SideLabel, Time } from './values';

function Field({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }) {
  const name = <Text size="sm" c="dimmed">{label}</Text>;
  return (
    <Group justify="space-between" wrap="nowrap" gap="md">
      {hint ? <Tooltip label={hint} withArrow multiline w={260}>{name}</Tooltip> : name}
      <Text size="sm" component="div" ta="right" style={{ minWidth: 0 }}>{children}</Text>
    </Group>
  );
}

function since(startMs: number | null, atMs: number): string {
  if (startMs === null) return '';
  const ms = atMs - startMs;
  return ms < 1000 ? `+${ms}ms` : `+${formatDuration(ms)}`;
}

// One episode: the quote fill that opened a gap, the hedges that closed it, and the other quote fills they covered.
export function EpisodeDrawer({ episode, onClose }: { episode: EpisodeRef | null; onClose: () => void }) {
  const fills = useEpisodeFills(episode);
  const rows = fills.data ?? [];
  const summary = summarizeEpisode(rows);
  const start = rows.length > 0 ? Math.min(...rows.map(fillTimeMs)) : null;
  const hedgedIn = summary.firstQuoteFillMs !== null && summary.lastHedgeFillMs !== null
    ? summary.lastHedgeFillMs - summary.firstQuoteFillMs : null;

  return (
    <Drawer opened={!!episode} onClose={onClose} position="right" size="lg"
      title={episode && <Text fw={700}>Episode {episode.episodeId}</Text>}>
      {episode && (
        <Stack gap="md">
          {fills.isLoading && <Group justify="center"><Loader size="sm" /></Group>}
          {!fills.isLoading && rows.length === 0 && <Text size="sm" c="dimmed">No fills recorded for this episode.</Text>}
          {rows.length > 0 && (
            <>
              <Stack gap={6}>
                <Field label="Session">
                  <Anchor component={Link} to={`/sessions/${episode.sessionId}`} size="sm" ff="monospace">{episode.sessionId.slice(0, 8)}</Anchor>
                </Field>
                <Field label="Started"><Time value={start === null ? null : new Date(start).toISOString()} precision="ms" size="sm" /></Field>
                <Field label="Fills">{summary.quoteFills} quote, {summary.hedgeFills} hedge</Field>
                <Field label="Hedged within"
                  hint="From the first quote fill to the last hedge fill, by the venues' clocks">
                  {hedgedIn === null ? <Text span c="dimmed">—</Text> : hedgedIn < 1000 ? `${hedgedIn}ms` : formatDuration(hedgedIn)}
                </Field>
                <Field label="Cash" hint="Sells' proceeds less buys' cost, before fees: what was paid for what it holds">
                  <Money value={summary.cash.toString()} />
                </Field>
                <Field label="Fees"><Money value={summary.fees.toString()} pnl={false} /></Field>
                <Field label="Hedges vs mark" hint="The hedge fills against the mark when each traded; positive when they beat it">
                  <Money value={summary.hedgeSlippage?.toString() ?? null} />
                </Field>
              </Stack>

              <Divider label="Left holding" labelPosition="left" />
              <Stack gap={4}>
                {summary.legs.map(leg => (
                  <Group key={leg.listingId} justify="space-between" wrap="nowrap">
                    <ListingLabel listingId={leg.listingId} symbol={leg.symbol} />
                    <Qty value={leg.netQuantity.toString()} lotSize={leg.lotSize} signed size="sm" />
                  </Group>
                ))}
              </Stack>

              <Divider label="Fills" labelPosition="left" />
              <Table striped withTableBorder fz="sm" verticalSpacing={4}>
                <Table.Thead>
                  <Table.Tr>
                    <Table.Th>After</Table.Th>
                    <Table.Th>For</Table.Th>
                    <Table.Th>Listing</Table.Th>
                    <Table.Th>Side</Table.Th>
                    <Table.Th ta="right">Qty</Table.Th>
                    <Table.Th ta="right">Price</Table.Th>
                    <Table.Th ta="right">vs mark</Table.Th>
                  </Table.Tr>
                </Table.Thead>
                <Table.Tbody>
                  {[...rows].sort((a, b) => fillTimeMs(a) - fillTimeMs(b)).map(f => (
                    <Table.Tr key={f.fillId}>
                      <Table.Td><Text span size="xs" ff="monospace">{since(start, fillTimeMs(f))}</Text></Table.Td>
                      <Table.Td><RoleBadge role={f.orderRole} /></Table.Td>
                      <Table.Td><ListingLabel listingId={f.listingId} symbol={f.symbol} /></Table.Td>
                      <Table.Td><SideLabel side={f.side} /></Table.Td>
                      <Table.Td ta="right"><Qty value={f.fillQty} lotSize={f.lotSize} size="sm" /></Table.Td>
                      <Table.Td ta="right"><Price value={f.fillPrice} exchangeId={f.exchangeId} priceBands={f.priceBands} size="sm" /></Table.Td>
                      <Table.Td ta="right"><Money value={f.slippage} size="sm" /></Table.Td>
                    </Table.Tr>
                  ))}
                </Table.Tbody>
              </Table>
            </>
          )}
        </Stack>
      )}
    </Drawer>
  );
}
