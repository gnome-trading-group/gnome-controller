import { SimpleGrid, Stack, Text } from '@mantine/core';
import { Cap, CapacityRow } from '../CapacityRow';
import { GatewayPaperLoad } from '../../types/gateways';

/**
 * How full a paper gateway is against its caps: books and distinct streams, as it counts them when it takes a session,
 * and the records per second its books take. Yellow from 80%; at a cap it refuses new sessions, which go to another of
 * the venue's paper gateways.
 */
export function PaperGatewayCapacity({ load, compact = false }: { load: GatewayPaperLoad | null | undefined; compact?: boolean }) {
  if (!load) {
    return <Text size="xs" c="dimmed">{compact ? '—' : 'No load reported: its release predates paper gateway caps.'}</Text>;
  }
  const rows: Cap[] = [
    {
      label: 'Books', used: load.books, max: load.maxBooks,
      help: 'A book per session per listing, each holding its simulated venue in the heap. A new session that would take it past the cap is refused before its books are built.',
    },
    {
      label: 'Streams', used: load.streams, max: load.maxStreams,
      help: 'Distinct streams its shard reader reads every pass; sessions on the same listing share one. A new session needing streams past the cap is refused.',
    },
    {
      label: 'Rate', used: load.recordsPerSecond, max: undefined, unit: '/s',
      help: 'Records its books took per second over the last minute. No cap: a busy market after sessions joined shows as books\' lag, and PAPER_GATEWAY_OVERLOADED after five minutes of it.',
    },
  ];
  const size = compact ? 'xs' : 'sm';
  return (
    <Stack gap={compact ? 4 : 'xs'}>
      {compact
        ? rows.slice(0, 2).map((cap) => <CapacityRow key={cap.label} cap={cap} size={size} />)
        : (
          <SimpleGrid cols={{ base: 1, sm: 3 }}>
            {rows.map((cap) => <CapacityRow key={cap.label} cap={cap} size={size} />)}
          </SimpleGrid>
        )}
    </Stack>
  );
}
